/** Two established Merchants activate across one priority exchange. Authored models,
 * real circuits, payments, stack, resolution and game loop. Setup is a fixture,
 * not a claim that these permanents were cast through the unfinished spell path.
 */
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { card, checkDeck, load } from "../src/core/cards.ts";
import { cardsIn } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { editWork } from "../src/core/work-tools.ts";
import { play } from "../src/core/loop.ts";
import type { Frame } from "../src/core/types.ts";
import type { Procedure, WorkCommand } from "../src/core/work-language.ts";
import { aiSeat } from "../src/context/seat.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import type { Packet } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork } from "../src/context/strategy.ts";
import type { Reasoner } from "../src/context/reason.ts";
import { tally } from "../src/context/spend.ts";

export function abilityTable(seed = "ability-experiment") {
	const table = start(standard, [
		{ name: "A", deck: ["Qiqirn Merchant", ...Array(59).fill("Forest")] },
		{ name: "B", deck: ["Qiqirn Merchant", ...Array(59).fill("Island")] },
	], seed);
	commit(table, ["0-0", "0-1", "1-0", "1-1"].map((what) => ({ do: "move", what, to: "battlefield", reason: "game-setup" })), "game-setup");
	return table;
}

export function manaProcedure(card: string, color: "G" | "U"): Procedure {
	return { source: { zones: ["battlefield"], controller: "self", card }, claim: `Tap ${card} for ${color}`,
		basis: `Basic land type ${card}; CR 305.6.`, timing: "mana", cost: { tap: true, generic: 0, colors: [] },
		instructions: [{ do: "mana", who: "self", colors: [color] }], delegate: true };
}

export function lootProcedure(basis = "{1}, {T}: Draw a card, then discard a card."): Procedure {
	return { source: { zones: ["battlefield"], controller: "self", card: "Qiqirn Merchant" }, claim: "Qiqirn Merchant: draw, then discard",
		basis, timing: "stack", cost: { tap: true, generic: 1, colors: [] }, delegate: true,
		instructions: [{ do: "draw", who: "self", count: 1 }, { do: "choose-move", who: "self", from: "hand", to: "graveyard", reason: "discard", count: 1 }] };
}

export async function abilityExercise() {
	const table = abilityTable(), universe = load("cards/standard.tsv"), counted = tally();
	for (const seat of table.seats) if (checkDeck(universe, seat.deck, standard).length) throw new Error("The fixture needs legal Standard decks.");
	const basis = card(universe, "Qiqirn Merchant").oracle.split("\n")[0]!;
	let plans = 0, batches = 0, concernQuestions = 0, exchangeCalls = 0;
	const paused: { version: number; seat: number; frame: Frame }[] = [];
	const history: unknown[] = [], trace: { clock: number; turn: number; step: string; event: string }[] = [];
	const checkpoint = (event: string, seat = table.cursor.active) => {
		if (table.cursor.turn > 3 || exchangeCalls) return;
		trace.push({ clock: table.cursor.clock, turn: table.cursor.turn, step: table.cursor.steps[0]!, event });
		history.push({ clock: table.cursor.clock, seat, note: event, workspace: structuredClone(table.work[seat]), table: project(table, "spectator").table });
		if (table.work[0]?.draft?.next === 2 && table.work[1]?.draft?.next === 2 && !cardsIn(table, "stack").length) exchangeCalls = counted.spent().length;
	};
	const thinking: Reasoner = { named: "offline/authored-ability-strategy", broken: () => null, async think(_about, prompt) {
		plans += 1;
		const { seat } = JSON.parse(prompt.user) as { seat: number };
		const tools: WorkCommand[] = [
			{ do: "recipe.put", recipe: { id: "loot", label: "Fund and activate the Merchant", guidance: "Make one mana, then pay and tap the Merchant. The draw is delegated; choose the discard after seeing it.", reserves: [], steps: [
				{ label: "Make one mana", when: { step: "upkeep", fromTurn: 3, throughTurn: 3 }, action: { procedure: manaProcedure(seat === 0 ? "Forest" : "Island", seat === 0 ? "G" : "U") } },
				{ label: "Pay and announce the draw/discard ability", when: { step: "upkeep", fromTurn: 3, throughTurn: 3 }, action: { procedure: lootProcedure(basis) } },
			] } },
			{ do: "task.put", task: { id: "opening-exchange", label: "Consider the prepared activation", when: { step: "upkeep", fromTurn: 3, throughTurn: 3 }, times: 1,
				scope: { zones: [] }, concepts: ["prepared activation"], concerns: ["opportunity"], guidance: "Adopt loot once. B responds while A's ability is on the stack. Once the draft is adopted, finish it and pass.", recipes: ["loot"] } },
			{ do: "plan.accept", objective: seat === 0 ? "Activate, then allow the opponent to respond." : "Respond with our own activation before theirs resolves." },
		];
		return JSON.stringify(tools);
	} };
	const classify: Classify = async (_model, request) => {
		const packet = request.state as unknown as Packet;
		const answers = Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
			if (question.type !== "choice") throw new Error("The fixture expects choices.");
			const ids = Object.keys(question.criteria);
			let choice: string;
			if (key.startsWith("concern-")) { concernQuestions += 1; choice = packet.work?.draft ? "no-action" : "recipe:loot"; }
			else choice = ids.find((id) => id === "work:execute") ?? ids.find((id) => id === "work:ready") ?? ids.find((id) => id.startsWith("work:bind:")) ?? ids.find((id) => id.startsWith("work:adopt:")) ?? ids.find((id) => id.startsWith("land:")) ?? ids[0]!;
			return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
		}));
		if (packet.reviews?.length) batches += 1;
		checkpoint(`Seat ${packet.actor}: ${Object.values(answers).map((answer) => answer.choice).join(", ")}`, packet.actor);
		return { api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", answers, stopReason: "stop", timestamp: 0 } as never;
	};
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const players = Object.fromEntries(table.seats.map((seat) => {
		editWork(table, seat.id, [{ do: "plan.request", reason: "Prepare the fixture's one activation and response." }], `prepare-${seat.id}`);
		const player = aiSeat({ name: seat.name, api: decisionApi(classify, model, { tally: counted }), intent: startingIntent(seat.id), dials: 0,
			plan: (frame) => planWork(frame, { cards: universe }, thinking), onGap: (gap) => table.gaps.push(gap) });
		return [seat.id, { ...player, async answer(frame: Frame) {
			if (frame.decision?.situation === "resolution") paused.push({ version: table.ledger.length, seat: seat.id, frame: structuredClone(frame) });
			return player.answer(frame);
		} }];
	}));
	const outcome = await play(table, players, {}, (event) => checkpoint(event));
	return { table, outcome, paused, plans, batches, concernQuestions, exchangeCalls, calls: counted.spent().length, history, trace };
}
