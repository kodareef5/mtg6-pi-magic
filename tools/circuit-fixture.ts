/** Offline experiment: authored strategy and classifier doubles, real table and circuits.
 * Past 150 lines to keep the two model doubles beside the scenario they exercise.
 */
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { editWork } from "../src/core/work-tools.ts";
import type { WorkCommand } from "../src/core/work-language.ts";
import { brokenReserves } from "../src/core/draft.ts";
import type { Frame } from "../src/core/types.ts";
import { aiSeat } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import type { Packet } from "../src/context/packet.ts";
import { planWork } from "../src/context/strategy.ts";
import { tally } from "../src/context/spend.ts";
import type { Reasoner } from "../src/context/reason.ts";

export async function exercise(lostReservation = false) {
	const table = start(standard, [
		{ name: "A", deck: deck("Green Stompy") },
		{ name: "B", deck: deck("Dimir Control") },
	], "circuit-experiment");
	const trace: { clock: number; turn: number; step: string; event: string; equipment?: unknown }[] = [];
	const counted = tally();
	let plans = 0, batches = 0, concernQuestions = 0;
	let reserve: { id: string; incarnation: number } | undefined;
	const note = (event: string, equipment?: unknown) => trace.push({ clock: table.cursor.clock, turn: table.cursor.turn, step: table.cursor.steps[0]!, event, ...(equipment ? { equipment: structuredClone(equipment) } : {}) });
	const initial = (frame: Frame): WorkCommand[] => {
		const hand = frame.view.objects!.filter((object) => object.zone === "hand");
		reserve = { id: hand[0]!.id, incarnation: hand[0]!.incarnation };
		const selectable = hand.slice(1).map(({ id, incarnation }) => ({ id, incarnation }));
		return [
			{ do: "recipe.put", recipe: {
				id: "develop-and-wait", label: "Develop, preserve a card, revisit on turn six",
				guidance: "Play one land. Keep the reserved card through turn six. Wait for the named opponent end step; if the reserve disappears, ask for a revised line.",
				steps: [
					{ label: "Play the selected land", when: { active: "self", step: "precombat-main", throughTurn: 1 }, action: { prefix: "land:", objects: { refs: selectable } } },
					{ label: "Finish the turn-six end-step checkpoint", when: { active: "opponent", step: "end", fromTurn: 6, throughTurn: 6 }, action: { option: "pass" } },
				], reserves: [{ object: reserve, purpose: "Keep this card for the following turn" }],
			} },
			{ do: "label.put", object: reserve, role: "reserved", purpose: "Keep for the following turn; notice if maintenance spends it." },
			{ do: "task.put", task: {
				id: "main-review", label: "Review before leaving my main phase", when: { active: "self", step: "precombat-main", throughTurn: 7 },
				scope: { zones: ["hand", "battlefield"] }, concepts: ["position"], concerns: ["threat", "opportunity", "maintenance"],
				guidance: "Nominate develop-and-wait once. Later, assess changes and preserve its reserve. A waiting sequence is accounted for.", recipes: ["develop-and-wait"],
			} },
			{ do: "task.put", task: {
				id: "monitor", label: "Monitor development for three of my upkeeps", when: { active: "self", step: "upkeep", fromTurn: 3, throughTurn: 7 }, times: 3,
				scope: { zones: ["battlefield"] }, concepts: ["development"], concerns: ["progress"], guidance: "Inspect whether the development remains useful. This is a check, not an instruction to act.", recipes: [],
			} },
			{ do: "task.put", task: {
				id: "reassess", label: "Reassess after the third upkeep review", after: { task: "monitor", runs: 3 },
				when: { active: "self", step: "precombat-main", throughTurn: 7 }, times: 1,
				scope: { zones: [] }, concepts: ["investment in development"], concerns: ["reassessment"], guidance: "Request strategy after the monitoring period, then retire this appointment.", recipes: [],
			} },
			{ do: "plan.accept", objective: "Develop once, preserve the card, and revisit the line after three upkeeps." },
		];
	};
	const thinking: Pick<Reasoner, "work"> = {
		async work(_about, prompt, { submit }) {
			plans += 1;
			const frame = JSON.parse(prompt.user) as { view: Frame["view"]; seat: number; request: string };
			let tools: WorkCommand[];
			if (!frame.view.work?.objective) tools = initial({ seat: frame.seat, view: frame.view, version: table.cursor.clock });
			else if (frame.request.includes("Reconsider")) tools = [
				{ do: "draft.edit", steps: [{ label: "Finish the turn-six checkpoint with the revised reserve", when: { active: "opponent", step: "end", fromTurn: 6, throughTurn: 6 }, action: { option: "pass" } }], reserves: [], guidance: "The reserved card was spent. Preserve the completed land play and release that reservation; continue to the scheduled checkpoint." },
				{ do: "label.remove", object: reserve!, role: "reserved" },
				{ do: "plan.accept", objective: "Reservation lost; the remaining sequence was revised without repeating its completed play." },
			];
			else tools = [
				{ do: "task.cancel", id: "reassess" },
				{ do: "plan.accept", objective: "Three upkeep checks reviewed. Retire the monitoring appointment and continue ordinary play." },
			];
			note(`Strategy ${plans}: ${frame.request}`, tools);
			const problem = submit.check({ commands: tools });
		if (problem) throw new Error(problem);
		return { commands: tools };
		},
	};
	const classify: Classify = async (_model, request) => {
		const packet = request.state as unknown as Packet;
		const answers: Record<string, unknown> = {};
		for (const [key, question] of Object.entries(request.questions)) {
			if (question.type !== "choice") throw new Error("The experiment expects choices.");
			const ids = Object.keys(question.criteria);
			let choice: string;
			if (key.startsWith("concern-")) {
				concernQuestions += 1;
				const due = packet.reviews![0]!;
				choice = due.task === "reassess" ? "rethink" : due.task === "main-review" && !packet.work?.draft ? "recipe:develop-and-wait" : "no-action";
			} else if (ids.includes("work:rethink") && packet.work?.draft && brokenReserves(packet.work.draft, { seat: 0, version: table.cursor.clock, view: { window: packet.window, table: packet.known, yours: packet.resources, since: [], objects: packet.objects } }).length) choice = "work:rethink";
			else if (ids.some((id) => id.startsWith("work:adopt:"))) choice = ids.find((id) => id.startsWith("work:adopt:"))!;
			else if (ids.includes("work:execute")) choice = "work:execute";
			else if (ids.includes("work:ready")) choice = "work:ready";
			else if (ids.some((id) => id.startsWith("work:bind:"))) choice = ids.find((id) => id.startsWith("work:bind:"))!;
			else if (ids.some((id) => id.startsWith("work:expire:"))) choice = ids.find((id) => id.startsWith("work:expire:"))!;
			else if (ids.some((id) => id.startsWith("discard:"))) {
				choice = lostReservation && ids.includes(`discard:${reserve?.id}`) ? `discard:${reserve!.id}` : ids.find((id) => id.startsWith("discard:") && id !== `discard:${reserve?.id}`) ?? ids[0]!;
				if (choice === `discard:${reserve?.id}` && table.cursor.turn <= 7) note("The fixture spent the reserved card during cleanup.");
			} else if (packet.work?.draft && packet.work.draft.next < packet.work.draft.steps.length && ids.includes("pass")) choice = "pass";
			else choice = ids.find((id) => id.startsWith("land:")) ?? ids[0]!;
			answers[key] = { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 };
		}
		if (packet.reviews?.length) { batches += 1; note(`Review ${packet.reviews[0]!.task}: ${Object.keys(request.questions).length} independent concerns in one call`); }
		else if (table.cursor.turn <= 7 && "pick" in answers && String((answers.pick as { choice: string }).choice).startsWith("work:")) note(`Circuit ${(answers.pick as { choice: string }).choice}`, packet.work?.draft);
		return { api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", answers, stopReason: "stop", timestamp: 0 } as never;
	};
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const player = aiSeat({ name: "A", api: decisionApi(classify, model, { tally: counted }), intent: startingIntent(0), dials: 0,
		plan: (frame) => planWork(frame, {}, thinking), onGap: (gap) => table.gaps.push(gap) });
	const opponent: Player = { name: "B", observe() {}, close() {}, async answer(frame) {
		const option = frame.decision!.options.find((option) => option.id.startsWith("land:")) ?? frame.decision!.options[0]!;
		return { kind: "pick", option: option.id, actionId: `B-${table.ledger.length}` };
	} };
	editWork(table, 0, [{ do: "plan.request", reason: "Prepare the experiment's opening line and future reviews." }], "experiment-start");
	const outcome = await play(table, { 0: player, 1: opponent }, {});
	return { table, outcome, trace, plans, batches, concernQuestions, calls: counted.spent().length, reserve };
}
