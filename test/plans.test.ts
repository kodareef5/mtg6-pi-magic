/**
 * Planned. A seat's plan is accepted whole and atomically. The pilot chooses
 * each action and pass. The table marks fitting options, raises a stop the
 * plan named, and records each step on the ledger row that
 * carried it out, so replay and clones read progress without equipment edits.
 * The pilot sees the plan's marks on its options; nothing is removed.
 * Past 150 lines because each invariant plays a real position.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { play } from "../src/core/loop.ts";
import { fork, open, replay, save, type Header } from "../src/core/journal.ts";
import { annotate, execution, planDue, planState } from "../src/core/planning.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { editWork, planProblems, prepareWork, workFrame } from "../src/core/work-tools.ts";
import { budget, manaBudget } from "../src/core/budget.ts";
import { printedCast } from "../src/core/procedures.ts";
import { select } from "../src/core/query.ts";
import { holds as conditionHolds, players, viewWorld } from "../src/core/selectors.ts";
import { checkPlan } from "../tools/benchmark-checks.ts";
import { permissionForecasts } from "../src/context/strategy-permissions.ts";
import { odds } from "../src/core/odds.ts";
import type { Answer, Player } from "../src/core/player.ts";
import { lifted, type Plan } from "../src/core/language.ts";
import { NOTEBOOK_LIMIT } from "../src/core/work-language.ts";
import type { Frame } from "../src/core/types.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { seat as seatTable, run } from "../src/context/sit.ts";
import { CEILING, tally } from "../src/context/spend.ts";
import { focus } from "../src/context/packet.ts";
import { emptyBrief } from "../src/context/brief.ts";
import { facts, initialPlan, nextMana } from "../src/context/strategy-facts.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork, prepareTurn, syntaxReference } from "../src/context/strategy.ts";
import { aiSeat, changes, question, settled, type Prepared, type Planned } from "../src/context/seat.ts";
import { actions, basePlan, changedPlan, equipment, responseChanges, selectionFields } from "../src/context/plan-edit.ts";
import { actionFacts, bindingFacts, choiceProblems, movementActions, planFacts } from "../src/context/strategy-actions.ts";
import { asState } from "../src/context/model.ts";
import { announce, establish, example, main, matchup, pack, place, quiet } from "./play.ts";

const physical = (table: Table) => { const { work: _work, workLog: _history, ...state } = structuredClone(table); return state; };
const turn3 = { active: "self" as const, fromTurn: 3, throughTurn: 3 };
/** Green's third turn: a land, Fabled Passage, an attack with the Chocobo. */
const line: Plan = { objective: "Grow the Chocobo with two land drops and attack.", guidance: "Land first, then the Passage, so the Chocobo sees both.",
	steps: [
		{ label: "Play a Forest", when: { ...turn3, step: "precombat-main" }, action: { prefix: "land:", objects: { zones: ["hand"], card: "Forest" } } },
		{ label: "Crack Fabled Passage", when: { ...turn3, step: "precombat-main" }, action: { procedure: example("Crack Fabled Passage for a basic land") } },
		{ label: "Attack with the Chocobo", when: { ...turn3, step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Sazh's Chocobo" } } },
		{ label: "Finish attacking", when: { ...turn3, step: "declare-attackers" }, action: { option: "attack:done" } },
	], packages: [{ card: "Sazh's Chocobo", registers: [{ basis: "Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.", kind: "watch",
		event: { on: "enters", of: { types: ["land"], controller: "you" } }, effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }] }],
};
/** Green with the Chocobo, Fabled Passage and two Forests in play, a Forest in hand. Physical setup only. */
function position() {
	const table = matchup("plans");
	establish(table, 0, "Sazh's Chocobo", line.packages![0]!.registers);
	establish(table, 0, "Fabled Passage", []);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Forest");
	return table;
}
/** An offline pilot that follows due steps, chooses Forest for searches, then passes. */
function pilot(asked: Frame[]): Player {
	return { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		asked.push(frame);
		const options = frame.decision!.options;
		const due = planState(frame)?.due.find((one) => one.candidates.length)?.candidates[0];
		const pick = frame.decision!.situation === "pregame" ? options.find((option) => option.id === "keep")
			: due ?? options.find((option) => /Choose Forest/.test(option.label)) ?? quiet(options);
		return { kind: "pick", option: pick!.id, actionId: `green-${asked.length}` };
	} };
}
const opponent: Player = { name: "Red", observe() {}, close() {}, async answer(frame) {
	const options = frame.decision!.options;
	return { kind: "pick", option: (options.find((option) => option.id === "keep") ?? quiet(options)).id, actionId: `red-${frame.version}` };
} };
const stopAfter = (table: Table, turn: number) => () => { if (table.cursor.turn > turn) throw stop; };
const stop = new Error("stop");
async function playUntil(table: Table, players: Record<number, Player>, turn: number) {
	try { await play(table, players, { 0: startingIntent(0), 1: startingIntent(1) }, { watch: stopAfter(table, turn) }); } catch (error) { if (error !== stop) throw error; }
}

test("a plan is accepted whole and atomically, and every problem with it is named at once", () => {
	const table = position();
	main(table, 0);
	const before = physical(table);
	assert.equal(editWork(table, 0, [{ do: "plan.put", plan: line }], "plan"), true);
	assert.deepEqual(physical(table), before, "accepting a plan moves nothing");
	assert.equal(editWork(table, 0, [{ do: "plan.put", plan: line }], "plan"), false, "a redelivery does not edit twice");
	assert.throws(() => editWork(table, 0, [{ do: "plan.request", reason: "different" }], "plan"), /different seat tools/);
	assert.deepEqual(table.work[0]!.packages!.map((one) => one.card), ["Sazh's Chocobo"], "the plan's packages join the seat's");
	const accepted = structuredClone(table);
	const broken: Plan = { ...line, steps: [
		{ label: "Untap", when: { step: "untap" }, action: { option: "pass" } },
		{ label: "Nothing named", when: {}, action: {} },
		{ label: "A land play with a cost", when: {}, action: { procedure: { source: { zones: ["hand"], card: "Forest" }, claim: "Land", basis: "Forest", timing: "land", cost: { tap: true }, instructions: [] } } },
	], packages: [{ card: "Lightning Bolt", registers: [] }] };
	assert.throws(() => editWork(table, 0, [{ do: "plan.put", plan: broken }], "broken"),
		(error: Error) => /4 problems/.test(error.message) && /untap has no priority/.test(error.message) && /name an option id/.test(error.message) && /Lightning Bolt/.test(error.message));
	assert.deepEqual(table, accepted, "a refused plan changes nothing");
	assert.throws(() => editWork(table, 0, [{ do: "plan.put", plan: line }], "stale", 0), /equipment changed/);
	assert.deepEqual(planProblems(workFrame(table, 0), { ...line, phases: [{ when: { step: "cleanup" }, guidance: "Discard the redundant land." }] }), [], "phase guidance can cover mandatory choices without offering an action there");
	assert.match(planProblems(workFrame(table, 0), { ...line, phases: [{ when: { step: "precombat-main", phase: "combat" }, guidance: "Wrong window." }] }).join(" "), /phases\[0\]/);
	for (const ref of ["this", "target:0", "event:object", "bound:card"]) {
		const wrong = planProblems(workFrame(table, 0), { ...line, may: [{ ...line.steps[0]!, if: { is: ref, matches: { types: ["creature"] } } }] });
		assert.match(wrong.join("; "), /has no binding in a plan condition/, "a plan cannot silently wait on a reference that only exists during an effect");
	}
	const conditional = { ...line, steps: [{ ...line.steps[0]!, if: { amount: { history: "cast" as const, of: { name: "Llanowar Elves" } }, atLeast: 1 } }] };
	assert.match(planProblems(workFrame(table, 0), conditional).join("; "), /cast history selectors need zones/);
	assert.match(planProblems(workFrame(table, 0), { ...line, steps: [{ ...line.steps[0]!, if: { not: { any: [{ bound: "x" }] } } }] }).join("; "), /bound x has no binding/);
	for (const zones of [["hand"], ["battlefield"]] as const) {
		const guarded = { ...line, steps: [{ ...line.steps[0]!, if: { is: { top: 1, of: "you" }, matches: { zones: [...zones], name: "Forest" } } }] };
		assert.match(planProblems(workFrame(table, 0), guarded).join("; "), /top always names a library object/);
		const counted = { ...line, steps: [{ ...line.steps[0]!, if: { amount: { count: { zones: [...zones], name: "Forest", controller: "you" } }, atLeast: 1 } }] };
		assert.deepEqual(planProblems(workFrame(table, 0), counted), [], "visible presence has a condition whose meaning agrees with its zone");
		const self = structuredClone(counted);
		self.steps[0]!.if.amount.count.controller = "self";
		assert.deepEqual(planProblems(workFrame(table, 0), self), [], "a condition accepts the same self spelling as an action query");
		for (const controller of [0, 1]) {
			const scope = { world: viewWorld(workFrame(table, controller).view), controller };
			assert.deepEqual(players(scope, "self"), [controller]);
			assert.equal(conditionHolds(scope, self.steps[0]!.if), conditionHolds(scope, counted.steps[0]!.if), "self and you are relative to this seat, not the active seat");
		}
	}
	assert.deepEqual(planProblems(workFrame(table, 0), { ...line, steps: [{ ...line.steps[0]!, if: { is: { top: 1, of: "you" }, matches: { zones: ["library"], name: "Forest" } } }] }), [], "a library test remains a library test, subject to projected knowledge");
	const prose = { ...line, guidance: "Keep one Forest for Veil." };
	const checked = checkPlan(prose, { forbidProse: ["keep[^.]*Veil"] }, workFrame(table, 0));
	assert.ok(checked.structure && !checked.passed, "a valid action line can fail the fixture's prose property");
	assert.deepEqual(checked.prose[0]!.matches, ["Keep one Forest for Veil"]);
	assert.equal(checkPlan({ ...line, guidance: "No reserve." }, { forbidProse: ["keep[^.]*Veil"] }, workFrame(table, 0)).passed, true);
	const required = { require: [{ prefix: "land:", source: "Forest" }, { prefix: "attack:", source: "Sazh's Chocobo" }] };
	assert.equal(checkPlan(line, required, workFrame(table, 0)).passed, true);
	assert.equal(checkPlan({ ...line, steps: [line.steps[0]!] }, required, workFrame(table, 0)).passed, false, "the first named action alone cannot satisfy the whole commitment");
	assert.equal(checkPlan({ ...line, steps: [...line.steps].reverse() }, required, workFrame(table, 0)).passed, true, "required actions do not invent an ordering constraint");
	const typed = { ...line, steps: [{ ...line.steps[2]!, action: { prefix: "attack:", objects: { zones: ["battlefield" as const], controller: "self" as const, types: ["creature" as const] } } }] };
	assert.deepEqual(planProblems(workFrame(table, 0), typed), []);
	assert.deepEqual(select(typed.steps[0]!.action.objects, workFrame(table, 0)).map((one) => one.card), ["Sazh's Chocobo"]);
	assert.ok(select({ types: ["land", "creature"] }, workFrame(table, 0)).length > 1, "type lists match any listed type, like condition selectors");
	assert.equal(select({ zones: ["hand"], controller: "opponent", types: ["land"] }, workFrame(table, 0)).length, 0, "a type query cannot inspect the opponent's hidden hand");
});

test("the pilot flies the plan: actions and passes are chosen, and progress lives on the ledger", async () => {
	const table = position();
	editWork(table, 0, [{ do: "plan.put", plan: line }], "plan");
	const asked: Frame[] = [];
	await playUntil(table, { 0: pilot(asked), 1: opponent }, 5);
	const carried = table.ledger.filter((row) => row.seat === 0 && row.execution);
	assert.deepEqual(carried.map((row) => row.execution!.step), [0, 1, 2, 3], "every step, in order");
	assert.ok(carried.every((row) => row.by === "model" && row.why === "chosen"), "the pilot answers even when one option fits the plan");
	assert.deepEqual(workFrame(table, 0).view.done, [0, 1, 2, 3]);
	assert.deepEqual(workFrame(table, 0).view.worked!.map((one) => one.label), line.steps.map((step) => step.label), "what was carried out, with its syntax, for the writer to reuse");
	assert.deepEqual(workFrame(table, 0).view.worked![1]!.action, line.steps[1]!.action);
	const kinds = new Set(asked.map((frame) => frame.decision!.options.some((option) => option.id.startsWith("discard:")) ? "discard" : frame.decision!.situation));
	assert.deepEqual([...kinds].sort(), ["discard", "pregame", "priority", "resolution", "turn-based"]);
	assert.ok(asked.some((frame) => frame.decision!.options.length === 1 && frame.decision!.options[0]!.id === "attack:done"),
		"the pilot ends the declaration even when there is nobody to attack with");
	assert.ok(table.ledger.filter((row) => row.situation === "priority").every((row) => row.why === "chosen"), "both seats answer every priority window");
	assert.equal(cardsIn(table, "battlefield", 0).find((one) => one.card === "Sazh's Chocobo")!.counters["+1/+1"], 2, "both land entries triggered");

	// Replay rebuilds progress from the rows; a clone continues from where it stood.
	const directory = mkdtempSync(join(tmpdir(), "magic-plans-"));
	const header: Header = { id: "plans", format: standard.name, seed: table.rng.seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(directory, "parent.jsonl"), header);
	save(journal, table);
	const restored = replay(journal.path, () => position()).table;
	assert.deepEqual(restored.ledger, table.ledger);
	assert.deepEqual(restored.work, table.work);
	assert.deepEqual(workFrame(restored, 0).view.done, [0, 1, 2, 3]);
	const after = carried[1]!.seq + 1;
	const childPath = join(directory, "child.jsonl");
	fork(journal.path, after, "child", childPath);
	assert.deepEqual(workFrame(replay(childPath, () => position()).table, 0).view.done, [0, 1], "a clone holds exactly the progress of its prefix");
});

test("a stop asks for a new plan once, a stop that already holds waits for a change, and help past the turn's budget is refused", async () => {
	const table = position();
	const lands = (atLeast: number) => ({ amount: { count: { types: ["land" as const], controller: "you" } }, atLeast });
	// A stop that already holds waits until it has been false: it names a change, not a state.
	const already: Plan = { objective: "Hold.", guidance: "Pass.", steps: [], askWhen: [{ label: "three lands", if: lands(3) }] };
	editWork(table, 0, [{ do: "plan.put", plan: already }], "already");
	assert.deepEqual(table.work[0]!.unarmed, ["three lands"]);
	const growing: Plan = { objective: "Play the Forest.", guidance: "Then reconsider.", askWhen: [{ label: "four lands", if: lands(4) }],
		steps: [{ label: "Play a Forest", when: { ...turn3, step: "precombat-main" }, action: { prefix: "land:", objects: { zones: ["hand"], card: "Forest" } } }] };
	// A standing branch keeps the pilot consulted, so it can ask for help.
	const quiet_: Plan = { objective: "Hold.", guidance: "Pass.", steps: [], may: [{ label: "Consider passing", when: { active: "self" }, action: { option: "pass" } }] };
	editWork(table, 0, [{ do: "plan.put", plan: growing }], "plan");
	main(table, 0, 3);
	const requests: string[] = [];
	let refusal = "";
	const planner: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const work = frame.view.work!;
		if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: quiet_ }], revision: work.revision, actionId: `plan-${requests.length}` }; }
		if (frame.refused?.length) { refusal ||= frame.refused[0]!; return { kind: "pick", option: quiet(frame.decision!.options).id, actionId: `pick-${frame.version}` }; }
		const due = planState(frame)?.due.find((one) => one.candidates.length)?.candidates[0];
		if (due) return { kind: "pick", option: due.id, actionId: `pick-${frame.version}` };
		return { kind: "work", tools: [{ do: "plan.request", reason: "The pilot asked for help." }], revision: work.revision, actionId: `help-${frame.version}-${work.revision}` };
	} };
	await playUntil(table, { 0: planner, 1: opponent }, 3);
	assert.deepEqual(requests.slice(0, 2), ["Stop: four lands", "The pilot asked for help."], "the stop once its land arrives, then the pilot's request");
	assert.match(refusal, /requests for a new plan are spent/, "a third request in the turn is refused");
});

test("a branch and a held resource are marked on the options they touch, and nothing is removed", () => {
	const table = matchup("branches");
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Snakeskin Veil");
	place(table, 1, "battlefield", "Mountain");
	place(table, 1, "hand", "Shock");
	main(table, 1, 2);
	announce(table, example("Cast Shock"), (option) => option.activation.targets[0]!.some((one) => "id" in one && one.id === chocobo.id));
	apply(table, "pass", "model", "chosen");
	const decision = nextDecision(table)!;
	assert.equal(decision.seat, 0);
	const frame = workFrame(table, 0);
	const supplied = JSON.parse(facts(frame, {})) as { objects: Record<string, { you: { id: string; traits?: unknown; ability?: unknown }[]; others: { id: string; traits?: unknown; ability?: unknown }[] }>; choices: { options: { id: string }[]; uses: { offeredCombinations: number }[] } };
	assert.deepEqual(JSON.parse(facts(frame, {})).currentWindow, { active: "opponent", step: "precombat-main" }, "answering priority does not make it this seat's turn");
	assert.deepEqual(supplied.choices.options.map((one) => one.id), decision.options.filter((one) => !one.use).map((one) => one.id), "direct decisions remain selectable by the planner");
	assert.equal(supplied.choices.uses.reduce((n, use) => n + use.offeredCombinations, 0), decision.options.filter((one) => one.use).length, "every offered spell and activation is represented without asking the planner to select a payment");
	const visibleObjects = Object.values(supplied.objects).flatMap((zone) => [...zone.you, ...zone.others]);
	for (const object of frame.view.objects!) {
		assert.deepEqual(visibleObjects.find((one) => one.id === object.id)?.traits, object.traits, "the writer keeps current types and active registrations, including changes from the layer walk");
		if (object.ability) assert.deepEqual(visibleObjects.find((one) => one.id === object.id)?.ability, object.ability, "an unresolved spell keeps its accepted cost, targets and effect");
	}
	frame.view.work = prepareWork(frame, [{ do: "plan.put", plan: { objective: "Keep the Chocobo.", guidance: "Veil it if it is targeted.", steps: [],
		may: [{ label: "Veil a targeted creature", when: { active: "opponent" }, if: { amount: { count: { zones: ["stack"], controller: "opponent", targeting: { types: ["creature"], controller: "you" } } }, atLeast: 1 },
			action: { procedure: example("Cast Snakeskin Veil") } }],
		holds: [{ objects: { zones: ["battlefield"], controller: "self", card: "Forest" }, purpose: "green for Veil" }] } }]);
	const state = planState(frame)!;
	assert.deepEqual(state.branches.map((one) => one.label), ["Veil a targeted creature"]);
	const marked = annotate(frame.decision!.options, state);
	assert.ok(marked.some((option) => option.id === "pass" && !option.shows?.includes("Plan")), "pass stays without a plan mark");
	const veil = marked.filter((option) => option.id.startsWith(`plan:${frame.view.work!.planned}:b0:`));
	assert.ok(veil.length > 0 && veil.every((option) => /Plan branch: Veil a targeted creature/.test(option.shows!)));
	assert.ok(veil.some((option) => /Uses Forest, held: green for Veil/.test(option.shows!)), "spending the held Forest is marked, not refused");
	assert.equal(marked.length, frame.decision!.options.length + state.procedures.length);
});

test("the writer's check names every problem at once, and a corrected plan is accepted", async () => {
	const table = position();
	main(table, 0);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const frame = workFrame(table, 0);
	const broken = { ...line, steps: [{ label: "Attack in the end step", when: { step: "end" }, action: { prefix: "attack:" } }, { label: "Nothing", when: {}, action: {} },
		{ label: "A shorthand is not an id", when: { step: "precombat-main" }, action: { option: "land", objects: { card: "Forest" } } }],
		packages: [{ card: "Hired Claw", registers: [{ basis: "{1}{R}: Put a +1/+1 counter on this creature.", kind: "watch", event: { on: "step", step: "end" },
			effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } }] }] };
	const replies = [broken, line];
	const seen: string[] = [];
	const stream: Stream = (_model, context) => {
		seen.push(JSON.stringify(context.messages));
		const args = replies.shift()!;
		return { result: async () => ({ content: [{ type: "toolCall", id: `call-${seen.length}`, name: "submit", arguments: args }], stopReason: "toolUse" }) };
	};
	const writer = reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 });
	const { tools } = await planWork(frame, {}, writer);
	assert.deepEqual(tools, [{ do: "plan.put", plan: line }]);
	assert.match(seen[1]!, /\d problems: steps\[0\] \(Attack in the end step\): attack: options are listed only in declare-attackers.*steps\[1\] \(Nothing\): name an option id.*Hired Claw.*is an activated ability/, "every problem in one refusal");
	assert.match(seen[1]!, /is not an option id; use prefix/, "an invented action shorthand is refused before it bypasses the resource forecast");
	assert.match(seen[0]!, /YOUR TASK: Plan the turn\./);
	assert.match(choiceProblems(frame, { steps: [{ action: { option: "land:Forest" } }] }).join(" "), /not a listed option id/, "a card name cannot masquerade as a future button");
	assert.match(choiceProblems(frame, { current: [{ action: { option: "cast:stale-payment" } }] }).join(" "), /not a listed option id/, "response repair uses the same boundary");
	assert.deepEqual(choiceProblems(frame, { steps: frame.decision!.options.map((one) => ({ action: { option: one.id } })) }), [], "every actual listed id remains usable");
	assert.match(choiceProblems(frame, { steps: [{ action: { prefix: "activate:" } }] }).join(" "), /names no table move family/, "invented activation prefixes cannot silently become unusable plan steps");
	assert.deepEqual(choiceProblems(frame, { steps: [{ action: { prefix: "use:" } }, { action: { prefix: "land:" } }] }, true), [], "known future move families remain usable before their sources enter");
	assert.deepEqual(choiceProblems({ ...frame, decision: { ...frame.decision!, options: [{ id: "custom:move", label: "A currently listed move" }] } }, { steps: [{ action: { prefix: "custom:" } }] }), [], "a currently listed move need not be in the future-family vocabulary");
	const currentLand = frame.decision!.options.find((one) => one.id.startsWith("land:"))!;
	assert.ok(currentLand);
	assert.match(choiceProblems(frame, { steps: [{ action: { option: currentLand.id } }] }, true).join(" "), /not a listed option id/, "a preparation cannot bind the other turn's listed picks");
	assert.deepEqual(choiceProblems(frame, { steps: ["pass", "attack:done", "block:done"].map((option) => ({ action: { option } })) }), [], "stable continuation ids can name later windows");
});

test("a short amendment retains phase guidance and packages, reuses accepted syntax and never repeats a completed step", async () => {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "package.put", package: { card: "Shock", registers: [], procedures: [example("Cast Shock")] } }], "other-equipment");
 editWork(table, 0, [{ do: "plan.put", plan: line }], "line");
 const first = planState(workFrame(table, 0))!.due[0]!.candidates[0]!;
 apply(table, first.id, "engine", "delegated", { plan: table.work[0]!.planned!, step: 0 });
 editWork(table, 0, [{ do: "plan.request", reason: "The pilot asked for a changed combat line." }], "request");
 const frame = workFrame(table, 0), base = basePlan(frame), available = actions(frame);
	const candidates = movementActions(frame);
	assert.ok(Object.keys(candidates).some((key) => key.startsWith("land ")), "a visible land already has a reusable selector");
	for (const candidate of Object.values(candidates)) {
		const action = candidate.action;
		assert.ok(!("procedure" in action));
		assert.equal(action.option, undefined, "future movement binds by objects rather than an invented id");
		assert.ok(select(action.objects!, frame).every((one) => one.card || one.token), "a reusable movement never exposes an unknown identity");
	}
 assert.deepEqual(changedPlan(base, planFacts(base), actions(frame, base)), base, "the displayed plan uses exact reusable references instead of repeating executable bodies");
 const pastPick = { ...frame, view: { ...frame.view, worked: [{ label: "Old physical pick", action: { option: "cast:past-incarnation-and-payment" } }] } };
 assert.ok(!Object.keys(actions(pastPick)).some((key) => key.startsWith("worked:")), "past physical picks are history, not reusable equipment");
 const shockKey = Object.keys(available).find((key) => available[key]!.label === "Cast Shock")!;
 assert.ok(shockKey && !frame.view.objects!.some((one) => one.card === "Shock"));
 assert.deepEqual(JSON.parse(equipment(frame, available).answer({ card: "Shock" })).actions[shockKey], available[shockKey], "absent card equipment keeps its exact reusable key and accepted terms");
	const described = actionFacts(frame, available);
	const forest = frame.view.objects!.find((one) => one.zone === "battlefield" && one.card === "Forest")!;
	const stale: Plan = { objective: "Keep the old attack.", guidance: "An old label is not a current type.", steps: [{
		label: "Attack with the animated land", when: { active: "self", step: "declare-attackers" },
		action: { prefix: "attack:", objects: { refs: [{ id: forest.id, incarnation: forest.incarnation }] } },
	}], holds: [{ objects: { refs: [{ id: forest.id, incarnation: forest.incarnation }] }, purpose: "Save a source for a response no longer in hand.",
		releaseWhen: { amount: { count: { zones: ["hand"], name: "Shock", controller: "you" } }, atMost: 0 } }] };
	const before = structuredClone(frame);
	const bound = actionFacts(frame, actions(frame, stale)) as Record<string, { selectedNow?: { types: string[]; obstaclesNow: string[] }[] }>;
	assert.deepEqual(bound["step:0 Attack with the animated land"]!.selectedNow![0]!.types, ["land"]);
	assert.ok(bound["step:0 Attack with the animated land"]!.selectedNow![0]!.obstaclesNow.includes("not a creature"));
	assert.equal(bindingFacts(frame, stale).holds[0]!.releasedNow, true, "a conditional hold can already be released despite its stale purpose");
	assert.deepEqual(frame, before, "source diagnostics never apply the intended transformation or release an equipment hold");
	const original = Object.entries(available).find(([key, one]) => "procedure" in one.action && described[key])!;
	assert.ok(original);
	const twins = { ...available, twin: structuredClone(original[1]) };
	const twin = actionFacts(frame, twins).twin;
	assert.ok(twin && "sameAs" in twin, "identical accepted terms and display facts have one description");
	const distinct = structuredClone(original[1]);
	assert.ok("procedure" in distinct.action);
	distinct.action.procedure.instructions = [{ do: "draw", who: "you", count: 1 }];
	const separate = actionFacts(frame, { ...twins, distinct }).distinct;
	assert.ok(separate && !("sameAs" in separate), "matching claims do not merge different executable terms");
 assert.equal(base.steps[0]!.label, "Crack Fabled Passage", "the played land is already omitted");
 assert.equal(base.packages, undefined, "accepted packages need no repetition");
 const seen: { messages: string; tools: string[] }[] = [];
 const stream: Stream = (_model, request) => {
  const sent = JSON.parse((request.messages[0] as { content: string }).content);
  assert.equal(sent.actions[shockKey], undefined, "an absent card's procedure is fetched when needed, not sent with every repair");
  assert.ok(Object.values(sent.actions).every((one) => !("instructions" in (one as object))), "ordinary strategy reads accepted claims and costs; equipment retains executable instructions");
  assert.deepEqual(sent.view.remainingSteps, table.cursor.steps, "the writer sees the real remaining turn windows");
  seen.push({ messages: JSON.stringify(request.messages), tools: request.tools!.map((one) => one.name) });
  return { result: async () => ({ content: [{ type: "toolCall", id: "one", name: "submit", arguments: { guidance: "Hold the Chocobo back." } }], stopReason: "toolUse" }) };
 };
 const result = await planWork(frame, {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
 assert.equal(seen.length, 1, "no note-only or full-plan rewrite round");
 const work = prepareWork(frame, result.tools);
 assert.equal(work.plan!.guidance, "Hold the Chocobo back.");
 assert.deepEqual(work.plan!.steps, base.steps);
 assert.deepEqual(work.packages, table.work[0]!.packages);
 assert.ok(!seen[0]!.tools.includes("note"));
 const reused = changedPlan(base, { steps: [{ ...line.steps[1], action: { reuse: `step:1 ${line.steps[1]!.label}` } }] }, available);
 assert.deepEqual(reused.steps[0]!.action, line.steps[1]!.action);
 assert.throws(() => changedPlan(base, { steps: [{ ...line.steps[1], action: { reuse: "step:999" } }] }, available), /No reusable action/);
	assert.throws(() => changedPlan(base, { steps: [{ ...line.steps[1], action: { reuse: "step:999" } }], may: [{ ...line.steps[1], action: { reuse: "may:999" } }] }, available), /step:999.*may:999/, "all unknown keys are named in one refusal");
	const advertised = JSON.stringify(selectionFields(available));
	assert.ok(advertised.includes(JSON.stringify(Object.keys(available))), "the submission schema enumerates the exact reusable equipment keys");
	const aliases = { phases: [{ when: { active: "self", step: "combat" }, guidance: "Keep the planned attack." }],
		may: [{ label: "Wait for the response window", when: { active: "opponent", step: "any" }, action: { option: "pass" },
			if: { amount: { count: { zones: ["hand"], controller: "you", types: ["instant"] }, atLeast: 1 } } }] };
	const untouched = structuredClone(aliases), canonical = changedPlan(base, aliases, available);
	assert.deepEqual(canonical.phases![0]!.when, { active: "self", phase: "combat" });
	assert.deepEqual(canonical.may![0]!.when, { active: "opponent" });
	assert.deepEqual(canonical.may![0]!.if, { amount: { count: { zones: ["hand"], controller: "you", types: ["instant"] } }, atLeast: 1 });
	assert.deepEqual(aliases, untouched, "writer aliases neither mutate the submitted answer nor enter the stored plan");
	assert.throws(() => changedPlan(base, { phases: [{ when: { step: "combat", phase: "beginning" }, guidance: "Contradictory." }] }, available), /schema/);
	assert.throws(() => changedPlan(base, { may: [{ ...aliases.may[0], if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } }] }, available), /schema/, "two stated bounds are not silently reconciled");
 // Core sees ordinary terms, so replay and execution need no new language.
	assert.doesNotThrow(() => prepareWork(frame, [{ do: "plan.put", plan: reused }]));
	assert.ok(!JSON.stringify(reused).includes('"reuse"'));
	const pending = changedPlan(line, { packages: [{ card: "Forest", registers: [] }] }, available);
	assert.deepEqual(pending.packages!.map((one) => one.card), ["Sazh's Chocobo", "Forest"], "a new draw's package keeps the preparation's pending registrations");
	assert.deepEqual(changedPlan(pending, { packages: [] }, available).packages, pending.packages, "empty package edits remove neither pending nor accepted work");
	const brief = { ...emptyBrief(0), role: "Develop.", route: "Grow the Chocobo.", matchup: "Keep Veil mana.", steps: { "precombat-main": { own: "Creature before land; keep protection." } } };
	const defaults = initialPlan(brief);
	assert.equal(defaults.phases![0]!.guidance, "Creature before land; keep protection.");
	assert.equal(changedPlan(defaults, { steps: [line.steps[0]] }, {}).objective, "Develop. Grow the Chocobo.", "turn one builds on pregame instead of rewriting its decisions");
	assert.equal(initialPlan({ ...brief, objective: "Grow the Chocobo, keep protection." }).objective, "Grow the Chocobo, keep protection.", "the pilot receives the pregame's short objective, not all its reasoning");
});

test("strategy plans after the draw, with no extra opening strategy call, with one cached prompt", async () => {
	const universe = loadCards("cards/standard.tsv");
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const chat = { id: "fixture", provider: "offline", type: "chat" } as never;
	const roster = async () => [
		{ role: "decide" as const, pattern: "fixture", model },
		{ role: "pregame" as const, pattern: "off", off: true },
		{ role: "strategy" as const, pattern: "fixture", model: chat },
	];
	const prompts: { user: string; task?: string; system?: string; ceiling?: number }[] = [];
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => ({
			api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", stopReason: "stop", timestamp: 0,
			answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
				const ids = Object.keys(question.criteria);
				const choice = ids.find((id) => id === "keep") ?? ids.find((id) => id.startsWith("land:")) ?? ids.find((id) => id !== "ask:help")!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
			})),
		})) as never,
		stream: ((_model: unknown, context: { systemPrompt?: string; messages: { content: string }[] }, options: { maxTokens?: number }) => {
			prompts.push({ user: context.messages[0]!.content, task: context.messages[1]?.content, system: context.systemPrompt, ceiling: options.maxTokens });
			return { result: async () => ({ content: [{ type: "toolCall", id: "call", name: "submit", arguments: { objective: "Develop.", guidance: "Play lands.",
				steps: [{ label: "Pass the turn", when: { active: "self" }, action: { option: "pass" } }] } }], stopReason: "toolUse" }) };
		}) as never,
	};
	const table = start(standard, [{ name: "A", deck: deck("Forest turns") }, { name: "B", deck: deck("Island turns") }], "work");
	// A prepared version-zero position can hold card equipment without a planning policy.
	editWork(table, 0, [{ do: "package.put", package: { card: "Forest", registers: [] } }], "carried-equipment");
	const seated = await seatTable(table, roster, inference, universe, { format: standard.name });
	assert.equal(prompts.length, 0, "seating spends no strategy before a decision");
	assert.ok(table.work[0]!.eachTurn && table.work[1]!.eachTurn, "both a prepared seat and a fresh seat plan each turn");
	assert.deepEqual(table.work[0]!.packages, [{ card: "Forest", registers: [] }], "enabling strategy preserves carried card equipment");
	assert.equal(table.ledger.length, 0, "enabling strategy makes no physical decision");
	assert.ok(await run(table, seated, inference, undefined));
	assert.equal(table.gaps.length, 0);
	// Turn plans, not the background preparation of a later turn.
	const sessions = prompts.filter((prompt) => !/PREPARE YOUR NEXT TURN/.test(prompt.task ?? ""))
		.map((prompt) => JSON.parse(prompt.user) as { seat: number; view: { window: { kind: string; turn: number; active: number; step: string } } });
	for (const seat of [0, 1]) {
		const own = sessions.filter((session) => session.seat === seat && session.view.window.kind === "turn" && session.view.window.active === seat);
		assert.deepEqual(own.map((session) => session.view.window.turn), [...new Set(own.map((session) => session.view.window.turn))], "at most one plan per own turn");
		assert.ok(own.every((session) => session.view.window.step !== "upkeep"), "even the first plan waits for the draw window");
	}
	assert.equal(sessions.filter((session) => session.view.window.kind === "opening").length, 0, "no plan during the mulligan: the brief's opening policy decides it");
	for (const seat of [0, 1]) assert.ok(sessions.find((session) => session.seat === seat), `seat ${seat} planned once the game began`);
	assert.ok(prompts.every((prompt) => prompt.ceiling === CEILING.strategy));
	assert.equal(new Set(prompts.map((prompt) => prompt.system)).size, 1, "every call sends the same system prompt, so it can be cached");
	assert.ok(!prompts[0]!.system!.includes(syntaxReference()), "card procedure semantics stay behind the syntax lookup until needed");
	for (const prompt of prompts) {
		const sent = JSON.parse(prompt.user) as { seat: number; objects: Record<string, { you: { zone: string; controller: number }[]; others: { zone: string; controller: number }[] }>; cards: { name: string; oracle: string }[] };
		assert.ok(Object.values(sent.objects).flatMap((zone) => [...zone.you, ...zone.others]).every((object) => object.zone !== "library" && (object.zone !== "hand" || object.controller === sent.seat)), "nothing hidden from the seat");
		assert.ok(sent.cards.length > 0 && sent.cards.every((fact) => fact.oracle === universe.cards.get(fact.name)!.oracle), "the writer reads the actual card text");
	}
	// An upkeep escalation has no revealed draw to plan from yet.
	const early = matchup("upkeep-planning"); main(early, 0, 3, "upkeep");
	editWork(early, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "Hold.", guidance: "Await the draw.", steps: [] } }], "upkeep");
	assert.equal(planDue(workFrame(early, 0)), false);
	main(early, 0, 3);
	assert.equal(planDue(workFrame(early, 0)), true, "a plan accepted in upkeep does not suppress the post-draw update");
	editWork(early, 0, [{ do: "plan.put", plan: { objective: "Hold.", guidance: "The draw is covered.", steps: [] } }], "after-draw");
	assert.equal(planDue(workFrame(early, 0)), false);
});

test("the pilot's packet stays small: the plan, the options and the public position", () => {
	const table = position();
	editWork(table, 0, [{ do: "plan.put", plan: line }], "plan");
	main(table, 0, 3);
	const frame = workFrame(table, 0);
	const state = planState(frame)!;
	const decision = { ...frame.decision!, options: annotate(frame.decision!.options, state) };
	const packet = focus({ ...frame, decision }, startingIntent(0));
	const size = JSON.stringify(asState(packet)).length + question(packet, true).instructions.length + JSON.stringify(question(packet, true).criteria).length;
	// The checklist also carries printed text for hand cards with no affordable use yet.
	assert.ok(size < 12000, `a pilot request is ${size} characters`);
	assert.equal(packet.plan?.due, "Play a Forest");
	assert.equal(JSON.stringify(packet).includes("registers"), false);
});

test("a step means playing what it names: never a discard, a token by its name, and a public hand count", async () => {
	// A card the step means to cast, still in hand at cleanup with eight cards: the pilot discards, not the table.
	const table = matchup("discard");
	main(table, 0, 3);
	const spell = cardsIn(table, "hand", 0).find((one) => !/Forest|Passage/.test(one.card ?? ""))!;
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [{ label: `Cast ${spell.card} when able`, when: turn3,
		action: { objects: { zones: ["hand"], refs: [{ id: spell.id, incarnation: spell.incarnation }] } } }] } }], "plan");
	const asked: Frame[] = [];
	await playUntil(table, { 0: pilot(asked), 1: opponent }, 3);
	assert.equal(table.ledger.some((row) => row.seat === 0 && row.picked.startsWith("discard:") && row.why === "delegated"), false, "the table discards nothing for the seat");

	// A token is named as the writer sees it, and its attack is taken.
	const tokens = matchup("token");
	commit(tokens, [{ do: "token", id: "soldier", controller: 0, spec: { name: "Soldier", types: ["creature"], subtypes: ["Soldier"], colors: ["white"], power: 2, toughness: 2 } }], "game-setup");
	main(tokens, 0, 3);
	editWork(tokens, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [
		{ label: "Attack with the Soldier", when: { ...turn3, step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Soldier" } } },
		{ label: "Finish attacking", when: { ...turn3, step: "declare-attackers" }, action: { option: "attack:done" } }] } }], "plan");
	await playUntil(tokens, { 0: pilot([]), 1: opponent }, 3);
	assert.ok(tokens.ledger.some((row) => row.picked === "attack:soldier"), "the Soldier attacks");

	// Hand sizes are public, so a plan can count the opponent's.
	const hand = matchup("hand");
	main(hand, 0, 3);
	const count = (bound: object) => ({ amount: { count: { zones: ["hand" as const], controller: "opponent" as const } }, ...bound });
	editWork(hand, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [], may: [{ label: "Pass while they hold three cards", when: {}, if: count({ atLeast: 3 }), action: { option: "pass" } }],
		askWhen: [{ label: "They are hellbent", if: count({ atMost: 0 }) }] } }], "plan");
	assert.deepEqual(planState(workFrame(hand, 0))!.branches.map((one) => one.label), ["Pass while they hold three cards"], "Red holds seven");
	assert.equal(hand.work[0]!.unarmed, undefined, "and is not hellbent, so the stop is armed");
	assert.equal(JSON.stringify(workFrame(hand, 0).view.objects).includes("hidden-"), false, "nothing stands in for those cards in what the seat is shown");
});

test("a strategy session that gives nothing usable leaves a gap, and the game goes on under the standing plan", async () => {
	const universe = loadCards("cards/standard.tsv");
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const chat = { id: "fixture", provider: "offline", type: "chat" } as never;
	const roster = async () => [{ role: "decide" as const, pattern: "fixture", model }, { role: "pregame" as const, pattern: "off", off: true }, { role: "strategy" as const, pattern: "fixture", model: chat }];
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => ({ api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", stopReason: "stop", timestamp: 0,
			answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => { const ids = Object.keys(question.criteria); const choice = ids.find((id) => id === "keep") ?? ids[0]!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }]; })) })) as never,
		// Every answer is malformed: steps that are not a list.
		stream: (() => ({ result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { objective: "o", guidance: "g", steps: null } }], stopReason: "toolUse" }) })) as never,
	};
	const table = start(standard, [{ name: "A", deck: deck("Forest turns") }, { name: "B", deck: deck("Island turns") }], "unplanned");
	const outcome = await run(table, await seatTable(table, roster, inference, universe, { format: standard.name }), inference, undefined);
	assert.ok(outcome, "the game reaches an outcome");
	assert.ok(table.gaps.some((gap) => gap.includes("/steps must be array") && gap.endsWith("The standing plan is kept. Play goes on.")), "each failed session is a gap that names why");

	// An initial request and an essential stop can both fail before a card moves.
	// Recovery must use distinct work ids and leave the physical choice to Jev.
	const retry = matchup("failed-twice"); main(retry, 0, 3);
	for (const card of cardsIn(retry, "hand", 0)) commit(retry, [{ do: "move", what: card.id, to: "library", reason: "game-setup" }], "game-setup");
	editWork(retry, 0, [{ do: "plan.put", plan: { objective: "Cast Hydra.", guidance: "Cast it first.", steps: [{ label: "Cast Hydra", essential: true,
		when: { active: "self", step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Mossborn Hydra", zones: ["hand"] } } }] } },
		{ do: "plan.request", reason: "Review the turn." }], "setup");
	let failures = 0;
	const failing: Player = { ...opponent, async answer(frame) {
		if (frame.view.work?.request) { failures++; throw new Error("offline planner unavailable"); }
		return opponent.answer(frame);
	} };
	await playUntil(retry, { 0: failing, 1: opponent }, 3);
	assert.equal(failures, 4, "both requests retry once");
	const kept = retry.workLog.filter((entry) => entry.tools?.some((tool) => tool.do === "plan.keep"));
	assert.equal(kept.length, 2);
	assert.equal(kept[0]!.clock, kept[1]!.clock, "no physical action was needed for recovery");
	assert.notEqual(kept[0]!.actionId, kept[1]!.actionId);
	assert.equal(retry.gaps.filter((gap) => gap.includes("standing plan is kept")).length, 2);
});

test("a stop is watched in its window, and its window and bounds are read as written", async () => {
	// Accepted in the main phase, a stop for combat that already holds there is armed: it fires in its window.
	const table = position();
	main(table, 0, 3);
	const lands = { amount: { count: { types: ["land" as const], controller: "you" as const } }, atLeast: 1 };
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [], askWhen: [{ label: "In combat with a land", when: { active: "self", step: "declare-attackers" }, if: lands }] } }], "plan");
	assert.equal(table.work[0]!.unarmed, undefined, "outside its window it waits for nothing");
	const requests: string[] = [];
	const replanner: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const work = frame.view.work!;
		if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], revision: work.revision, actionId: `plan-${requests.length}` }; }
		return { kind: "pick", option: (frame.decision!.options.find((option) => option.id === "keep") ?? quiet(frame.decision!.options)).id, actionId: `green-${frame.version}` };
	} };
	await playUntil(table, { 0: replanner, 1: opponent }, 3);
	assert.deepEqual(requests, ["Stop: In combat with a land"]);
	// The first turn's budget is counted from when it begins, not from seating.
	const fresh = matchup("began");
	main(fresh, 0, 1);
	assert.ok(fresh.cursor.began[0]! > 0, "turn 1 begins when the hands are settled");
	// A stop in a step nobody acts in is refused, and a bound written twice is not quietly dropped.
	assert.match(planProblems(workFrame(table, 0), { objective: "o", guidance: "g", steps: [], askWhen: [{ label: "At untap", when: { step: "untap" }, if: lands }] }).join(" "), /untap has no priority/);
	assert.deepEqual(lifted({ if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } }), { if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } });
});

test("the writer is told its mana source by source, and what a land in hand would add by its package", async () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }, { do: "package.put", package: { card: "Forest", registers: [] } }], "request");
	const seen: string[] = [];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: line }], stopReason: "toolUse" }) }; };
	await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.match(seen[0]!, /Mana now: Forest \(0-\d+\) makes G; Forest \(0-\d+\) makes G/);
	assert.match(seen[0]!, /Land plays left this turn: 1\. In hand: .*Forest: enters untapped, makes G/);
	assert.match(seen[0]!, /Ba Sing Se: no package, so how it enters and what it makes are unknown/, "a land with no package is not guessed at");
	const grave = cardsIn(table, "hand", 0).find((one) => one.card === "Forest")!;
	commit(table, [{ do: "move", what: grave.id, to: "graveyard", reason: "game-setup" }], "game-setup");
	assert.doesNotMatch(JSON.parse(facts(workFrame(table, 0), {})).mana, /Permitted from graveyard/, "a visible land still needs permission");
	establish(table, 0, "Icetill Explorer");
	assert.match(JSON.parse(facts(workFrame(table, 0), {})).mana, /Permitted from graveyard: [^.]*Forest: enters untapped, makes G/, "resource context includes a currently permitted graveyard land");
	const snapshot = structuredClone(table), frame = workFrame(table, 0), stated = JSON.parse(facts(frame, {})).decisionFacts;
	assert.deepEqual(stated.yourCreatures.map((one: { id: string }) => one.id), frame.view.objects!.filter((one) => one.controller === 0 && one.zone === "battlefield" && one.traits?.types.includes("creature")).map((one) => one.id), "the roster contains current creatures, never a spell in hand or a potential animated land");
	assert.deepEqual(stated.yourHand.map((one: { id: string }) => one.id), frame.view.objects!.filter((one) => one.controller === 0 && one.zone === "hand").map((one) => one.id));
	assert.equal(stated.landPlays.remaining, 2);
	assert.ok(stated.landPlays.visibleCandidates.some((one: { id: string; zone: string }) => one.id === grave.id && one.zone === "graveyard"));
	assert.deepEqual(table, snapshot, "building decision facts neither moves a card nor applies a future ability");
	const elf = establish(table, 0, "Llanowar Elves");
	commit(table, [{ do: "tap", what: elf.id }], "resolve");
	main(table, 1, 4);
	assert.match(nextMana(workFrame(table, 0)), /Llanowar Elves \(0-\d+\) makes G/, "next-turn preparation sees mana after an ordinary untap and sickness ends, as a forecast");
});

test("the plan's arithmetic: costs from what the steps before leave, holds kept, land plays counted with what the plan permits", () => {
	const turn = (table: Table) => table.cursor.turn;
	const problems = (table: Table, plan: Omit<Plan, "objective" | "guidance">) => { const whole = { objective: "o", guidance: "g", ...plan }; return [...planProblems(workFrame(table, 0), whole), ...budget(workFrame(table, 0), whole)].join(" | "); };
	const now = (table: Table) => ({ active: "self" as const, step: "precombat-main" as const, fromTurn: turn(table), throughTurn: turn(table) });
	const cast = (table: Table, card: string, label = `Cast ${card}`) => ({ label, when: now(table), action: { prefix: "cast:", objects: { card, zones: ["hand" as const] } } });
	const land = (table: Table, card: string) => ({ label: `Play ${card}`, when: now(table), action: { prefix: "land:", objects: { card, zones: ["hand" as const] } } });
	const veil = (table: Table): Plan["may"] => [{ label: "Veil a targeted creature", when: { active: "opponent" as const, fromTurn: turn(table) + 1, throughTurn: turn(table) + 1 },
		action: { procedure: { claim: "Cast Snakeskin Veil", basis: "Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.", source: { zones: ["hand"], controller: "self", card: "Snakeskin Veil" },
			timing: "spell", targets: [{ object: { types: ["creature"], controller: "you" } }], instructions: [] } } }];

	// Three Forests: Hydra spends them all, so Veil cannot also be kept.
	const three = matchup("arithmetic");
	place(three, 0, "battlefield", "Forest", "Forest", "Forest");
	main(three, 0, 3);
	place(three, 0, "hand", "Mossborn Hydra", "Snakeskin Veil");
	assert.match(problems(three, { steps: [cast(three, "Mossborn Hydra")], may: veil(three) }), /may\[0\] \(Veil a targeted creature\): costs \{G\} but the steps before it leave no untapped source/);
	const forest = cardsIn(three, "battlefield", 0).find((one) => one.card === "Forest")!;
	assert.match(problems(three, { steps: [cast(three, "Mossborn Hydra")], may: veil(three), holds: [{ objects: { refs: [{ id: forest.id, incarnation: forest.incarnation }] }, purpose: "Veil" }] }),
		/steps\[\d\] \(Cast Mossborn Hydra\): costs \{2\}\{G\} but the steps before it leave Forest \(G\), Forest \(G\), and the plan holds Forest/);
	const released = structuredClone(three), releasePlan: Plan = { objective: "Develop after the response is gone.", guidance: "Spend the released source.",
		steps: [cast(released, "Mossborn Hydra")], holds: [{ objects: { refs: [{ id: forest.id, incarnation: forest.incarnation }] }, purpose: "Veil while it is in hand.",
			releaseWhen: { amount: { count: { zones: ["hand"], name: "Snakeskin Veil", controller: "you" } }, atMost: 0 } }] };
	assert.match(budget(workFrame(released, 0), releasePlan).join(" "), /plan holds Forest/, "a live response still reserves its source");
	commit(released, [{ do: "move", what: cardsIn(released, "hand", 0).find((one) => one.card === "Snakeskin Veil")!.id, to: "graveyard", reason: "game-setup" }], "game-setup");
	editWork(released, 0, [{ do: "plan.put", plan: releasePlan }], "released-hold");
	const releasedFrame = workFrame(released, 0), beforeRelease = structuredClone(releasedFrame);
	assert.deepEqual(planState(releasedFrame)!.held, []);
	assert.deepEqual(budget(releasedFrame, releasePlan), [], "the budget agrees with execution when the hold's release condition is already true");
	assert.deepEqual(releasedFrame, beforeRelease, "evaluating a released hold changes neither the plan nor the position");

	// Exact cast ids are opaque. Read their structured source, locked cost and payment.
	editWork(three, 0, [{ do: "package.put", package: { card: "Mossborn Hydra", assessed: true, registers: pack("Mossborn Hydra"), procedures: [{ ...printedCast("Mossborn Hydra", three.printed["Mossborn Hydra"]!), basis: "Trample" }] } }], "hydra-cast");
	const exact = nextDecision(three)!.options.find((one) => one.use && three.things.get(one.use.source.id)?.card === "Mossborn Hydra")!;
	assert.ok(exact.use);
	assert.match(problems(three, { steps: [{ label: "Exact Hydra", when: now(three), action: { option: exact.id } }], may: veil(three) }), /may\[0\].*costs \{G\}/);
	const four = matchup("fixed-payment");
	place(four, 0, "battlefield", "Forest", "Forest", "Forest", "Forest");
	main(four, 0, 3);
	place(four, 0, "hand", "Mossborn Hydra");
	const picked = nextDecision(four)!.options.find((one) => one.use && four.things.get(one.use.source.id)?.card === "Mossborn Hydra")!;
	const spentSource = picked.use!.funding![0]!.source;
	assert.match(problems(four, { steps: [{ label: "Fixed Hydra", when: now(four), action: { option: picked.id } }],
		holds: [{ objects: { refs: [spentSource] }, purpose: "Keep this exact Forest" }] }), /steps\[0\].*costs \{2\}\{G\}/,
		"a fixed payment cannot silently switch to the spare Forest to satisfy a hold");
	assert.equal(problems(four, { steps: [cast(four, "Mossborn Hydra")], holds: [{ objects: { refs: [spentSource] }, purpose: "Keep this exact Forest" }] }), "", "a generic cast can choose the other payment");

	// The land first pays for the Hydra; the Hydra first does not.
	const two = matchup("order");
	place(two, 0, "battlefield", "Forest", "Forest");
	main(two, 0, 3);
	place(two, 0, "hand", "Mossborn Hydra", "Forest");
	editWork(two, 0, [{ do: "package.put", package: { card: "Forest", registers: [] } }], "forest");
	assert.match(problems(two, { steps: [cast(two, "Mossborn Hydra"), land(two, "Forest")] }), /Cast Mossborn Hydra\): costs \{2\}\{G\}/);
	assert.equal(problems(two, { steps: [land(two, "Forest"), cast(two, "Mossborn Hydra")] }), "");
	// A card the seat does not hold is named, and a window on the wrong seat's turn never opens.
	assert.match(problems(two, { steps: [cast(two, "Icetill Explorer")] }), /you hold no Icetill Explorer now/);
	assert.match(problems(two, { steps: [], askWhen: [{ label: "Never", when: { active: "opponent", fromTurn: turn(two), throughTurn: turn(two) }, if: { amount: { life: "you" }, atMost: 5 } }] }), /is your turn, so a window for the opponent's turn on it never opens/);

	// A land that enters tapped makes nothing this turn.
	// A Forest never says so, so the table refuses that package; the walk alone is shown one.
	const tapped: Plan["packages"] = [{ card: "Forest", registers: [{ basis: "This land enters tapped.", kind: "enters", tapped: true }] }];
	assert.match(problems(two, { steps: [], packages: tapped }), /package Forest: "This land enters tapped\." is not on Forest/);
	assert.match(budget(workFrame(two, 0), { objective: "o", guidance: "g", packages: tapped, steps: [land(two, "Forest"), cast(two, "Mossborn Hydra")] }).join(" "), /costs \{2\}\{G\}/);

	// Icetill Explorer cast first permits the second land.
	const icetill = matchup("icetill-plan");
	place(icetill, 0, "battlefield", "Forest", "Forest", "Forest", "Forest");
	main(icetill, 0, 3);
	place(icetill, 0, "hand", "Icetill Explorer", "Forest", "Forest");
	editWork(icetill, 0, [{ do: "package.put", package: { card: "Icetill Explorer", printedCast: true, registers: pack("Icetill Explorer") } }, { do: "package.put", package: { card: "Forest", registers: [] } }], "icetill");
	assert.equal(problems(icetill, { steps: [cast(icetill, "Icetill Explorer"), land(icetill, "Forest"), land(icetill, "Forest")] }), "");
	assert.match(problems(icetill, { steps: [land(icetill, "Forest"), land(icetill, "Forest")] }), /no land play is left for it this turn/);
	place(icetill, 0, "graveyard", "Promising Vein");
	place(icetill, 1, "graveyard", "Mountain");
	const frame = workFrame(icetill, 0), before = structuredClone(frame);
	const available = actions(frame, { objective: "o", guidance: "g", steps: [cast(icetill, "Icetill Explorer")] });
	const forecast = permissionForecasts(frame, available)[0]!;
	assert.deepEqual(JSON.parse(equipment(frame, available).answer({ card: "Icetill Explorer" })).permissionForecasts, [forecast], "the named lookup carries the conditional candidates");
	assert.deepEqual(JSON.parse(equipment(frame, available).answer({ card: "Forest" })).permissionForecasts, [], "an unrelated lookup does not carry another card's forecast");
	assert.deepEqual(forecast.landsPerTurn, { now: 1, after: 2 });
	assert.deepEqual(forecast.openedZones, ["graveyard"]);
	assert.deepEqual(forecast.candidates.map((one) => one.card), ["Promising Vein"], "only visible owned lands in newly opened zones are forecast");
	assert.ok(!movementActions(frame)["land Promising Vein from graveyard"], "a future candidate does not become a current offer");
	assert.equal(problems(icetill, { steps: [cast(icetill, "Icetill Explorer"), { label: "Play the enabled Vein", when: now(icetill), action: forecast.candidates[0]!.action as Plan["steps"][number]["action"] }] }), "", "the forecast's candidate can enter an ordinary checked plan after its prerequisite");
	assert.deepEqual(frame, before, "forecasting neither resolves the spell nor mutates projected facts");
	establish(icetill, 0, "Icetill Explorer");
	const already = permissionForecasts(workFrame(icetill, 0), available)[0]!;
	assert.deepEqual(already.landsPerTurn, { now: 2, after: 3 });
	assert.deepEqual(already.openedZones, [], "an existing permission is not described as a new zone");
	assert.deepEqual(already.candidates, []);
});

test("an essential step that cannot be taken where it belongs asks for a new plan; a plain one is passed over", async () => {
	for (const essential of [true, false]) {
		const table = position();
		main(table, 0, 3);
		// The Passage is already on the battlefield, so no cast option ever names it.
		const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Fabled Passage")!;
		editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [{ label: "Cast the Passage", when: { ...turn3, step: "precombat-main" },
			...(essential ? { essential: true as const } : {}), action: { prefix: "cast:", objects: { refs: [{ id: passage.id, incarnation: passage.incarnation }] } } }] } }], "plan");
		const requests: string[] = [];
		const writer: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
			const work = frame.view.work!;
			if (work.request) { requests.push(work.request); return { kind: "work", tools: [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], revision: work.revision, actionId: `plan-${requests.length}` }; }
			return { kind: "pick", option: quiet(frame.decision!.options).id, actionId: `g-${frame.version}` };
		} };
		await playUntil(table, { 0: writer, 1: opponent }, 3);
		assert.deepEqual(requests, essential ? ["Stop: Step 1 cannot be taken now: Cast the Passage"] : []);
	}
});

test("the pilot can select the payment that spares what the plan holds", async () => {
	const table = matchup("sparing");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	const [kept] = cardsIn(table, "battlefield", 0).filter((one) => one.card === "Forest");
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", holds: [{ objects: { refs: [{ id: kept!.id, incarnation: kept!.incarnation }] }, purpose: "Snakeskin Veil" }],
		steps: [{ label: "Cast Llanowar Elves", when: { ...turn3, step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Llanowar Elves" } } }] } }], "plan");
	const due = planState(workFrame(table, 0))!.due[0]!;
	assert.equal(due.candidates.length, 1, "of the two Forests, only the free one fits the step");
	assert.ok(!due.candidates[0]!.objects!.some((ref) => ref.id === kept!.id));
	await playUntil(table, { 0: pilot([]), 1: opponent }, 3);
	assert.equal(table.things.get(kept!.id)!.tapped, false, "the held Forest is still untapped");
	assert.ok(table.ledger.some((row) => row.picked.startsWith("cast:") && row.why === "chosen"), "the pilot selected the marked cast");
});

test("in a scripted window the pilot reads the script and nothing else of the plan, and asks only for what the script names", () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.put", plan: { ...line, phases: [
		{ when: { active: "self", step: "precombat-main" }, goal: "Grow the Chocobo twice.", guidance: "Land first, then the Passage.", reevaluate: ["Red flashes in a blocker"] },
		{ when: { active: "self", step: "declare-attackers" }, guidance: "Attack with the Chocobo." }] } }], "plan");
	const brief = { ...emptyBrief(0), steps: { "precombat-main": { own: "Develop before combat." } } };
	const packet = focus(workFrame(table, 0), startingIntent(0), { brief, recaps: [{ turn: 2, active: "Red", line: "Red cast a Challenger.", from: 0, to: 1 }] });
	assert.deepEqual(packet.plan!.script, { goal: ["Grow the Chocobo twice."], guidance: ["Land first, then the Passage."],
		steps: ["Now: Play a Forest", "Then: Crack Fabled Passage"], reevaluate: ["Red flashes in a blocker"] }, "this window's script, its steps in order");
	assert.equal(packet.plan!.guidance, undefined, "the whole plan's guidance is not repeated");
	assert.deepEqual([packet.guidance, packet.lately], [[], []], "nor the brief's notes or the recaps");
	const asked = question(packet, true).instructions;
	assert.equal(asked.includes("Land first, then the Passage."), false, "the script is carried once in state, not repeated in instructions");
	assert.deepEqual(packet.plan!.script!.reevaluate, ["Red flashes in a blocker"]);
	assert.match(asked, /position contradicts the line/);
	// A window without a script keeps today's view of the plan.
	editWork(table, 0, [{ do: "plan.put", plan: line }], "unscripted");
	const plain = focus(workFrame(table, 0), startingIntent(0), { brief });
	assert.equal(plain.plan!.script, undefined);
	assert.deepEqual(plain.guidance, ["Develop before combat."]);
});

test("the turn before ours prepares our next one; a quiet turn offers it as it is, a changed one uses the same planner for a short amendment", async () => {
	for (const changed of [false, true]) {
		const table = position();
		main(table, 0, 3);
		editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
		main(table, 1, 4);
		// Every card Green could draw is named by a branch, so any draw is covered.
		// Red has passed without playing cards; keep its hand below cleanup size
		// so a public discard does not turn the quiet case into new information.
		commit(table, cardsIn(table, "hand", 1).slice(6).map((one) => ({ do: "move" as const, what: one.id, to: "library" as const, reason: "game-setup" })), "game-setup");
		const names = [...new Set(cardsIn(table, "library", 0).map((one) => one.card!))];
		const prepared: Plan = { objective: "Prepared.", guidance: "g", steps: [], may: names.map((name) => ({ label: `If I draw ${name}`, when: { active: "self", step: "precombat-main" },
			if: { amount: { count: { zones: ["hand"], controller: "you", name } }, atLeast: 1 }, action: { objects: { zones: ["hand"], card: name } } })) };
		const calls = { prepare: 0, amendments: [] as string[][] };
		const seat = aiSeat({ name: "Green", api: { named: "none", ask: async () => { throw new Error("no pilot call expected"); } } as never, intent: startingIntent(0), onGap() {},
			plan: async (_frame, made, lines) => { calls.amendments.push(lines ?? []); return { tools: [{ do: "plan.put", plan: made!.plan }] }; },
			prepare: async () => { calls.prepare += 1; return { plan: prepared }; }, });
		seat.observe(workFrame(table, 0));
		seat.observe(workFrame(table, 0));
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(calls.prepare, 1, "one preparation for the turn ahead");
		if (changed) commit(table, [{ do: "change-life", who: 0, amount: -3, reason: "resolve" }], "resolve");
		main(table, 0, 5);
		const answer = await seat.answer(workFrame(table, 0));
		assert.equal(answer.kind, "work");
		assert.deepEqual((answer as Extract<Answer, { kind: "work" }>).tools, [{ do: "plan.put", plan: prepared }]);
		if (changed) assert.ok(calls.amendments.length === 1 && calls.amendments[0]!.includes("your life went from 20 to 17"), "a change is reviewed, and named");
		else assert.equal(calls.amendments.length, 0, "nothing changed but the draw: no call");
	}
});

test("every seat sees each turn begin, even a turn of only forced play", async () => {
	const table = position();
	const seen: string[] = [];
	const watcher: Player = { ...pilot([]), observe(frame) { if (frame.view.window.kind === "turn") seen.push(`${frame.view.window.turn}:${frame.view.window.step}`); } };
	await playUntil(table, { 0: watcher, 1: opponent }, 2);
	assert.ok(seen.includes("2:untap"), `Green saw Red's turn begin: ${seen.slice(0, 6).join(", ")}`);
});

test("preparation makes a turn plan, and the same writer can keep it with an empty update", async () => {
	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
	main(table, 1, 4);
	const seen: string[] = [];
	const forest = cardsIn(table, "battlefield", 0).find((one) => one.card === "Forest")!;
	commit(table, [{ do: "tap", what: forest.id }], "resolve");
	const before = structuredClone(table);
	const replies: Record<string, unknown>[] = [{ steps: [] }, { objective: "Next turn.", guidance: "g",
		steps: [{ label: "Wait under the response policy", when: { active: "self", step: "precombat-main" }, action: { option: "pass" } }],
		phases: [{ when: { active: "self", fromTurn: 5, throughTurn: 5, step: "precombat-main" }, guidance: "Develop." }] }];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: replies.shift()! }], stopReason: "toolUse" }) }; };
	const writer = reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 });
	const prepared = await prepareTurn(workFrame(table, 0), {}, writer);
	assert.deepEqual(table, before, "next-turn facts do not untap the live position");
	assert.match(seen[0]!, /PREPARE YOUR NEXT TURN, 5 on the table's alternating counter \(your own turn 3\), during the opponent's turn 4/);
	assert.match(seen[1]!, /This turn has no ordered actions/, "a preparation must choose a line or an explicit pass");
	const sent = JSON.parse(JSON.parse(seen[0]!)[0].content);
	assert.equal(sent.positionBasis.kind, "forecast");
	assert.equal(sent.positionBasis.observedWindow.turn, 4);
	assert.deepEqual(sent.view.window, { kind: "turn", turn: 5, active: 0, step: "precombat-main", phase: "precombat-main" });
	assert.equal(sent.objects.battlefield.you.find((one: { id: string }) => one.id === forest.id).tapped, undefined);
	assert.ok(sent.objects.battlefield.you.filter((one: { traits: { types: string[] } }) => one.traits.types.includes("creature")).every((one: { summoningSick: boolean }) => !one.summoningSick));
	assert.ok(sent.decisionFacts.yourCreatures.every((one: { summoningSick: boolean }) => !one.summoningSick), "the roster uses the labelled forecast, not the observed opponent-turn restriction");
	assert.ok(sent.decisionFacts.mana.untappedSources.some((one: { id: string }) => one.id === forest.id));
	assert.deepEqual(sent.choices, { options: [], uses: [] }, "current opponent-turn choices do not masquerade as next-turn offers");
	assert.deepEqual(sent.view.history, [], "events on this turn are observations, not events on the forecast turn");
	assert.match(budget(workFrame(table, 0), { objective: "o", guidance: "g", steps: [{ label: "Cast absent Explorer", when: { active: "self", step: "precombat-main" },
		action: { prefix: "cast:", objects: { card: "Icetill Explorer", zones: ["hand"] } } }] }).join(" "), /you hold no Icetill Explorer/, "an unknown future draw is not an unconditional source");
	assert.equal(prepared.plan.objective, "Next turn.");

	main(table, 0, 5);
	replies.push({});
	const kept = await planWork(workFrame(table, 0), {}, writer, prepared, ["you drew Forest"]);
	assert.match(seen[2]!, /you drew Forest/);
	assert.deepEqual(kept.tools, [{ do: "plan.put", plan: prepared.plan }]);
});

test("an essential step waits for the steps before it, and nothing is taken for the seat past it", () => {
	const table = position();
	main(table, 0, 3);
	const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Fabled Passage")!;
	const window = { ...turn3, step: "precombat-main" as const };
	const blocked = { label: "Cast the Passage", when: window, essential: true as const, action: { prefix: "cast:", objects: { refs: [{ id: passage.id, incarnation: passage.incarnation }] } } };
	const land = { label: "Play a Forest", when: window, action: { prefix: "land:", objects: { zones: ["hand" as const], card: "Forest" } } };
	// The land comes first, so it may yet pay: no stop, and the table plays it.
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [land, blocked] } }], "land-first");
	let state = planState(workFrame(table, 0))!;
	assert.deepEqual([state.stops, state.unmet], [[], undefined]);
	// The essential step comes first: it is the stop, and the land is not taken past it.
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [blocked, land] } }], "blocked-first");
	state = planState(workFrame(table, 0))!;
	assert.deepEqual([state.stops, state.unmet], [["Step 1 cannot be taken now: Cast the Passage"], 0]);
});

test("payments are tried together: the creature takes the Village's red so a Mountain stays free for Shock", () => {
	const table = matchup("village");
	main(table, 1, 2);
	establish(table, 1, "Rockface Village", pack("Rockface Village"));
	place(table, 1, "battlefield", "Mountain", "Mountain");
	place(table, 1, "hand", "Emberheart Challenger", "Shock");
	const now = { active: "self" as const, step: "precombat-main" as const, fromTurn: 2, throughTurn: 2 };
	const plan: Plan = { objective: "o", guidance: "g",
		steps: [{ label: "Cast Emberheart Challenger", when: now, action: { prefix: "cast:", objects: { zones: ["hand"], card: "Emberheart Challenger" } } }],
		may: [{ label: "Shock a blocker", when: { active: "any" }, action: { procedure: { claim: "Cast Shock", basis: "Shock deals 2 damage to any target.", source: { zones: ["hand"], controller: "self", card: "Shock" },
			timing: "spell", targets: [{ object: { types: ["creature"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] } } }] };
	assert.deepEqual(budget(workFrame(table, 1), plan), []);
	const normal = { ...printedCast("Nova Hellkite", table.printed["Nova Hellkite"]!), basis: "Flying, haste" };
	const warp = { ...example("Cast Knight Luminary for its warp cost"), source: { zones: ["hand" as const], controller: "self" as const, card: "Nova Hellkite" },
		claim: "Cast Nova Hellkite for its warp cost", basis: "Warp {2}{R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)", cost: { mana: "{2}{R}" } };
	place(table, 1, "hand", "Nova Hellkite");
	editWork(table, 1, [{ do: "package.put", package: { card: "Nova Hellkite", assessed: true, registers: [
		{ basis: "Flying, haste", kind: "continuous", affects: { is: "this" }, change: { words: ["flying", "haste"] } },
		{ basis: "When this creature enters, it deals 1 damage to target creature an opponent controls.", kind: "watch", event: { on: "enters", of: { is: "this" } },
			effect: { targets: [{ object: { types: ["creature"], controller: "opponent" } }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] } },
	], procedures: [normal, warp] } }], "nova-modes");
	const frame = workFrame(table, 1), available = actions(frame), descriptions = actionFacts(frame, available);
	const normalKey = Object.keys(available).find((key) => available[key]!.label === normal.claim)!;
	const warpKey = Object.keys(available).find((key) => available[key]!.label === warp.claim)!;
	assert.equal((descriptions[normalKey] as { cost: { mana: string } }).cost.mana, "{3}{R}{R}");
	assert.equal((descriptions[warpKey] as { cost: { mana: string } }).cost.mana, "{2}{R}");
	const warped = frame.decision!.options.find((one) => one.use?.claim === warp.claim)!;
	assert.ok(warped?.use);
	const planningOffers = JSON.parse(facts(frame, {})).choices.uses as { claim: string; notes: string[] }[];
	assert.ok(planningOffers.find((one) => one.claim === warp.claim)!.notes.some((note) => note.includes("Flying, haste")), "grouped casting modes preserve the accepted entry abilities, not just empty casting instructions");
	const stale: Plan = { objective: "o", guidance: "g", steps: [{ label: "Old payment", when: now, action: { option: `${warped.id}-obsolete` } }] };
	assert.equal(bindingFacts(frame, stale).unoffered[0]!.option, `${warped.id}-obsolete`);
	assert.deepEqual(bindingFacts(frame, { ...stale, steps: [{ ...stale.steps[0]!, when: { active: "opponent", step: "end" } }] }).unoffered, [], "future windows are not diagnosed as current failures");

	assert.deepEqual(budget(frame, { objective: "o", guidance: "g", steps: [{ label: "Warp", when: now, action: { option: warped.id } }] }), [], "a locked warp costs three, not the printed five");
	const located = JSON.parse(facts(frame, {})).objects;
	assert.ok(located.hand.you.some((one: { name: string }) => one.name === "Emberheart Challenger"));
	assert.ok(!located.battlefield.you.some((one: { name: string }) => one.name === "Emberheart Challenger"), "a card available to cast is not already a battlefield attacker");
	const warpFacts = JSON.parse(facts(frame, {})).choices.uses.find((one: { claim: string }) => one.claim === warp.claim);
	assert.equal(warpFacts.manaRequired, 3);
	assert.deepEqual([warpFacts.untappedSourcesAfterPayment.minimum, warpFacts.untappedSourcesAfterPayment.maximum], [0, 0], "three available sources pay the three-mana warp with none retained");
	const equivalent = structuredClone(table);
	place(equivalent, 1, "battlefield", "Mountain", "Mountain");
	editWork(equivalent, 1, [{ do: "plan.put", plan: { objective: "Warp Nova", guidance: "Use the alternate cost.", steps: [
		{ label: "Warp Nova", when: now, essential: true, purpose: "Prepare the flying attack.", action: { procedure: warp } },
	] } }], "equivalent-cast");
	const sameFrame = workFrame(equivalent, 1), sameState = planState(sameFrame)!;
	const ordinaryWarp = sameFrame.decision!.options.find((one) => one.use?.claim === warp.claim)!;
	const ordinaryNormal = sameFrame.decision!.options.find((one) => one.use?.claim === normal.claim)!;
	assert.ok(ordinaryWarp && ordinaryNormal);
	assert.equal(execution(sameState, ordinaryNormal.id), undefined, "a different casting mode does not finish the planned mode");
	assert.deepEqual(execution(sameState, ordinaryWarp.id), { plan: sameState.revision, step: 0 }, "an identical ordinary announcement carries out the step too");
	assert.match(annotate(sameFrame.decision!.options, sameState).find((one) => one.id === ordinaryWarp.id)!.shows!, /Plan step 1/);
	apply(equivalent, ordinaryWarp.id, "model", "chosen", execution(sameState, ordinaryWarp.id));
	assert.deepEqual(workFrame(equivalent, 1).view.done, [0], "progress is journaled on the actual chosen row, without a second plan edit");
	assert.deepEqual(planState(workFrame(equivalent, 1))!.due, [], "the executed cast is not reintroduced as a missing essential step");
	// Without the Village, both Mountains pay for the creature and Shock is named as the conflict.
	commit(table, [{ do: "move", what: cardsIn(table, "battlefield", 1).find((one) => one.card === "Rockface Village")!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.match(budget(workFrame(table, 1), plan).join(" "), /may\[0\] \(Shock a blocker\): costs \{R\} but the steps before it leave no untapped source/);
	// The same card name in play or exile is not a source for every accepted cast.
	const nova = cardsIn(table, "hand", 1).find((one) => one.card === "Nova Hellkite")!;
	commit(table, [{ do: "move", what: nova.id, to: "battlefield", reason: "resolve" }], "resolve");
	const read = (seat = 1, turn?: number) => { const frame = workFrame(table, seat); return actionFacts(frame, available, turn); };
	const boundSources = (described: ReturnType<typeof actionFacts>[string] | undefined) => { assert.ok(described && "sourcesNow" in described); return described.sourcesNow; };
	assert.equal(read()[normalKey], undefined, "an existing permanent does not advertise another cast");
	const prior = { "step:0 Cast Nova": available[normalKey]! };
	assert.deepEqual(boundSources(actionFacts(workFrame(table, 1), prior)["step:0 Cast Nova"]), [], "unbound prior intent remains visible to repair");
	place(table, 1, "hand", "Nova Hellkite");
	assert.equal(boundSources(read()[normalKey]).length, 1, "a second copy really in hand restores the casting candidate even without enough mana");
	const second = cardsIn(table, "hand", 1).find((one) => one.card === "Nova Hellkite")!;
	commit(table, [{ do: "move", what: second.id, to: "exile", reason: "resolve" }], "resolve");
	assert.equal(read()[normalKey], undefined, "visible exile alone grants no permission");
	const exiled = table.things.get(second.id)!;
	commit(table, [{ do: "note", note: { kind: "permit", by: 1, who: 1, on: { id: exiled.id, incarnation: exiled.incarnation }, fromTurn: 4, until: "indefinite" } }], "resolve");
	assert.equal(read()[normalKey], undefined, "a later permission is not available now");
	assert.equal(boundSources(read(1, 4)[normalKey])[0]!.zone, "exile", "next-turn preparation can see a permission that opens then");
	assert.equal(read(1, 4)[warpKey], undefined, "a hand-only alternate cast stays unavailable from exile");
	assert.equal(read(0, 4)[normalKey], undefined, "one seat's permission does not authorize the other seat");
	const preview = matchup("future-payment"); main(preview, 1, 6);
	establish(preview, 1, "Zhao, the Moon Slayer", pack("Zhao, the Moon Slayer"));
	place(preview, 1, "battlefield", "Mountain", "Mountain", "Mountain");
	place(preview, 1, "hand", "Smaug the Magnificent", "Soulstone Sanctuary");
	editWork(preview, 1, [{ do: "package.put", package: { card: "Soulstone Sanctuary", registers: [{ kind: "mana", basis: "{T}: Add {C}.", cost: { tap: true }, colors: ["C"] }] } }], "sanctuary");
	const smaug = cardsIn(preview, "hand", 1).find((one) => one.card === "Smaug the Magnificent")!;
	const price = () => manaBudget(workFrame(preview, 1), printedCast(smaug.card!, preview.printed[smaug.card!]!), workFrame(preview, 1).view.objects!.find((one) => one.id === smaug.id)!);
	assert.equal(price().payableBeforeNewResources, false, "a four-mana cast cannot use three sources");
	assert.deepEqual(price().afterOneLand?.find((one) => one.card === "Soulstone Sanctuary"), { card: "Soulstone Sanctuary", entry: "tapped", payable: false }, "an entry replacement stops the prospective land funding this cast");
	commit(preview, [{ do: "move", what: cardsIn(preview, "battlefield", 1).find((one) => one.card === "Zhao, the Moon Slayer")!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.deepEqual(price().afterOneLand?.find((one) => one.card === "Soulstone Sanctuary"), { card: "Soulstone Sanctuary", entry: "untapped", payable: true }, "the same land enables the cast when that entry restriction leaves");
});

test("one unfinished preparation is awaited at the draw without a second planner or note race", async () => {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
 main(table, 1, 4);
 let finish: (value: Prepared) => void = () => {};
 let amended = 0, resolved = false;
 const waits: Planned[] = [];
 const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
  prepare: () => new Promise((resolve) => { finish = resolve; }),
  plan: async (_frame, made) => { amended++; assert.equal(made!.plan.objective, "Ready."); return { tools: [{ do: "plan.put", plan: made!.plan }] }; },
  onPlanned: (one) => waits.push(one) });
 seat.observe(workFrame(table, 0));
 await new Promise((resolve) => setImmediate(resolve));
 main(table, 0, 5);
 const answer = seat.answer(workFrame(table, 0)).then((value) => { resolved = true; return value; });
 await new Promise((resolve) => setImmediate(resolve));
 assert.equal(resolved, false); assert.equal(amended, 0, "unfinished work does not start a competing writer");
 finish({ plan: { objective: "Ready.", guidance: "Pass", steps: [] } });
 assert.equal((await answer).kind, "work");
 assert.equal(amended, 1, "the uncovered draw gets one amendment");
 assert.equal(waits[0]!.ready, false); assert.ok(waits[0]!.waitedMs >= 0);
 const timing = waits[0]!.preparation!;
 assert.equal(timing.fromTurn, 4);
 assert.ok(timing.queuedAt <= timing.startedAt! && timing.startedAt! <= timing.neededAt! && timing.neededAt! <= timing.finishedAt!, "queue, background work and draw wait are separately measured");
 await seat.close();
});

test("the arithmetic is refused once and then left to the pilot, and a conditional step is not counted", async () => {
	const table = matchup("once");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Mossborn Hydra");
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const window = { active: "self" as const, step: "precombat-main" as const, fromTurn: 3, throughTurn: 3 };
	const hydra = { label: "Cast Mossborn Hydra", when: window, action: { prefix: "cast:", objects: { zones: ["hand" as const], card: "Mossborn Hydra" } } };
	const conditional = { ...hydra, label: "Cast Mossborn Hydra if a third land arrives", if: { amount: { count: { types: ["land" as const], controller: "you" as const } }, atLeast: 3 } };
	assert.deepEqual(budget(workFrame(table, 0), { objective: "o", guidance: "g", steps: [conditional] }), [], "a step that may not happen is not counted");
	const seen: string[] = [];
	const plan = { objective: "o", guidance: "g", steps: [hydra], packages: [{ card: "Mossborn Hydra", registers: pack("Mossborn Hydra") }] };
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: plan }], stopReason: "toolUse" }) }; };
	const { tools } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.equal(seen.length, 2, "refused once, then accepted");
	assert.match(seen[1]!, /costs \{2\}\{G\}/);
	assert.deepEqual(tools, [{ do: "plan.put", plan }]);
});

test("the arithmetic counts each card once, lets floating mana go when its step ends, and tries every payment", () => {
	const refs = (...things: { id: string; incarnation: number }[]) => ({ refs: things.map(({ id, incarnation }) => ({ id, incarnation })) });
	const at = (step: "precombat-main" | "postcombat-main") => ({ active: "self" as const, step, fromTurn: 3, throughTurn: 3 });
	const cast = (label: string, objects: object, step: "precombat-main" | "postcombat-main" = "precombat-main") => ({ label, when: at(step), action: { prefix: "cast:", objects } });
	// Icetill Explorer's second land: two Forests are two cards, each paying for its own Elves.
	const two = matchup("distinct");
	main(two, 0, 3);
	establish(two, 0, "Icetill Explorer");
	const [first, second, elf, other] = place(two, 0, "hand", "Forest", "Forest", "Llanowar Elves", "Llanowar Elves");
	editWork(two, 0, [{ do: "package.put", package: { card: "Forest", registers: [] } }], "forest");
	const forests = [first!, second!].map((forest, n) => ({ label: `Play Forest ${n + 1}`, when: at("precombat-main"), action: { prefix: "land:", objects: { zones: ["hand" as const], card: "Forest" } } }));
	assert.deepEqual(budget(workFrame(two, 0), { objective: "o", guidance: "g", steps: [...forests, cast("Cast an Elf", { zones: ["hand"], card: "Llanowar Elves" }), cast("Cast another Elf", { zones: ["hand"], card: "Llanowar Elves" })] }), []);
	// One Elf is not cast twice.
	assert.match(budget(workFrame(two, 0), { objective: "o", guidance: "g", steps: [...forests, cast("Cast the Elf", refs(elf!)), cast("Cast the Elf again", refs(elf!))] }).join(" "),
		/steps\[3\] \(Cast the Elf again\): every card it names is already taken by an earlier step/);
	void other;

	// Green mana floating in the first main phase is gone by the second.
	const floating = matchup("floating");
	main(floating, 0, 3);
	const [lone] = place(floating, 0, "hand", "Llanowar Elves");
	commit(floating, [{ do: "add-mana", who: 0, colors: ["G"] }], "resolve");
	assert.deepEqual(budget(workFrame(floating, 0), { objective: "o", guidance: "g", steps: [cast("Cast the Elf now", refs(lone!))] }), []);
	assert.match(budget(workFrame(floating, 0), { objective: "o", guidance: "g", steps: [cast("Cast the Elf after combat", refs(lone!), "postcombat-main")] }).join(" "), /costs \{G\}/);

	// Smaug takes the Villages' creature-only red and the Sanctuaries' colorless, so the Mountain stays for Shock; without it, Shock is named.
	const red = matchup("smaug");
	main(red, 1, 2);
	const colorless: Plan["packages"] = [{ card: "Soulstone Sanctuary", registers: [{ basis: "{T}: Add {C}.", kind: "mana", cost: { tap: true }, colors: ["C"] }] }];
	for (const card of ["Rockface Village", "Rockface Village"]) establish(red, 1, card);
	for (const card of ["Soulstone Sanctuary", "Soulstone Sanctuary"]) establish(red, 1, card, colorless![0]!.registers);
	const [mountain] = place(red, 1, "battlefield", "Mountain");
	const [smaug, shock] = place(red, 1, "hand", "Smaug the Magnificent", "Shock");
	const now = { active: "self" as const, step: "precombat-main" as const, fromTurn: 2, throughTurn: 2 };
	const plan: Plan = { objective: "o", guidance: "g", steps: [{ label: "Cast Smaug", when: now, action: { prefix: "cast:", objects: refs(smaug!) } }],
		may: [{ label: "Shock a blocker", when: { active: "any" }, action: { procedure: { claim: "Cast Shock", basis: "Shock deals 2 damage to any target.", source: { zones: ["hand"], controller: "self", card: "Shock", refs: refs(shock!).refs },
			timing: "spell", targets: [{ object: { types: ["creature"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] } } }] };
	assert.deepEqual(budget(workFrame(red, 1), plan), []);
	commit(red, [{ do: "move", what: mountain!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.match(budget(workFrame(red, 1), plan).join(" "), /may\[0\] \(Shock a blocker\): costs \{R\}/);
});

test("a plan the writer was told about once goes through the table, and a schema refusal does not use up the arithmetic's", async () => {
	const table = matchup("through");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Mossborn Hydra");
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const plan = { objective: "o", guidance: "g", packages: [{ card: "Mossborn Hydra", registers: pack("Mossborn Hydra") }], steps: [{ label: "Cast Mossborn Hydra", when: { active: "self" as const, step: "precombat-main" as const, fromTurn: 3, throughTurn: 3 },
		action: { prefix: "cast:", objects: { zones: ["hand" as const], card: "Mossborn Hydra" } } }] };
	const replies: Record<string, unknown>[] = [{ objective: "o" }, plan, plan];
	const seen: string[] = [];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: replies.shift()! }], stopReason: "toolUse" }) }; };
	const { tools } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.equal(seen.length, 3, "the schema refused, then the arithmetic once, then accepted");
	assert.match(seen[2]!, /costs \{2\}\{G\}/);
	assert.doesNotThrow(() => prepareWork(workFrame(table, 0), tools), "the table takes what the writer let through");
});

test("an essential step waits while a spell resolves; an impossible line returns to the pilot after one stop", async () => {
	const table = matchup("waiting");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest", "Forest", "Forest");
	place(table, 0, "hand", "Llanowar Elves", "Mossborn Hydra");
	// The table lists one option for identical cards, so the plan names the Elf the option names.
	const cast = nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && table.things.get(option.objects![0]!.id)!.card === "Llanowar Elves")!;
	const elf = table.things.get(cast.objects![0]!.id), hydra = cardsIn(table, "hand", 0).find((one) => one.card === "Mossborn Hydra");
	const window = { ...turn3, step: "precombat-main" as const };
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [
		{ label: "Cast the Elf", when: window, action: { prefix: "cast:", objects: { refs: [{ id: elf!.id, incarnation: elf!.incarnation }] } } },
		{ label: "Cast the Hydra", when: window, essential: true, action: { prefix: "cast:", objects: { refs: [{ id: hydra!.id, incarnation: hydra!.incarnation }] } } }] } }], "plan");
	apply(table, cast.id, "model", "chosen");
	assert.ok(cardsIn(table, "stack").length, "the Elf is on the stack");
	const state = planState(workFrame(table, 0))!;
	assert.deepEqual([state.stops, state.unmet], [[], undefined], "passing so the Elf resolves is the procedure, not a failed line");

	// Nothing in hand and nothing in play: pass is the only option, and the replanned line still needs a card Green does not hold.
	const bare = matchup("forced");
	main(bare, 0, 3);
	for (const card of cardsIn(bare, "hand", 0)) commit(bare, [{ do: "move", what: card.id, to: "library", reason: "game-setup" }], "game-setup");
	const impossible: Plan = { objective: "o", guidance: "g", steps: [{ label: "Cast the Hydra", when: window, essential: true, action: { prefix: "cast:", objects: { zones: ["hand"], card: "Mossborn Hydra" } } }] };
	editWork(bare, 0, [{ do: "plan.put", plan: impossible }], "plan");
	const from = bare.ledger.length;
	let asked = 0;
	const writer: Player = { name: "Green", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const work = frame.view.work!;
		if (work.request) return { kind: "work", tools: [{ do: "plan.put", plan: impossible }], revision: work.revision, actionId: `again-${++asked}` };
		return { kind: "pick", option: quiet(frame.decision!.options).id, actionId: `g-${frame.version}` };
	} };
	await playUntil(bare, { 0: writer, 1: opponent }, 3);
	assert.equal(asked, 1, "the stop is raised once");
	assert.ok(bare.ledger.slice(from).filter((row) => row.situation === "priority").every((row) => row.why === "chosen"), "the seat can pass after seeing the unfinished line");
	assert.equal(bare.gaps.length, 0);
});

test("a counter on a permanent is a change, and a draw is covered only by a step or branch that takes it", () => {
	const table = matchup("zhao");
	main(table, 1, 2);
	const zhao = establish(table, 1, "Zhao, the Moon Slayer");
	const from = workFrame(table, 1);
	commit(table, [{ do: "counters", what: zhao.id, kind: "conqueror", amount: 1 }], "resolve");
	const changed = changes(from, workFrame(table, 1));
	assert.equal(changed.quiet, false);
	assert.ok(changed.lines.includes("your Zhao, the Moon Slayer changed"), changed.lines.join("; "));

	const [drawn] = place(table, 1, "hand", "Shock");
	const frame = workFrame(table, 1), draw = { lines: [], drawn: [frame.view.objects!.find((one) => one.id === drawn!.id)!], quiet: true };
	const named: Plan = { objective: "o", guidance: "g", steps: [], packages: [{ card: "Shock", registers: [] }] };
	assert.equal(settled(frame, named, draw), false, "a package that names the card does not handle drawing it");
	const taken: Plan = { ...named, may: [{ label: "Shock a blocker", when: { active: "self", step: "declare-blockers" }, if: { amount: { count: { zones: ["hand"], controller: "you", name: "Shock" } }, atLeast: 1 },
		action: { objects: { zones: ["hand"], card: "Shock" } } }] };
	assert.equal(settled(frame, taken, draw), true, "a branch that takes it does");
	taken.may![0]!.when.phase = "combat";
	assert.equal(settled(frame, taken, draw), true, "the future step is checked in its own phase, rather than the current main phase");
});

test("reset and close cancel preparation; superseded notes and plans never arrive", async () => {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "old", guidance: "g", steps: [] } }], "planned");
 main(table, 1, 4);
 const signals: AbortSignal[] = [];
 const finishes: ((value: Prepared) => void)[] = [];
 let amended = 0;
 const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
  prepare: (_frame, signal) => { signals.push(signal); return new Promise((resolve) => { finishes.push(resolve); }); },
  plan: async (_frame, made) => { amended++; assert.equal(made, undefined); return { tools: [{ do: "plan.put", plan: line }] }; } });
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 seat.reset!(); assert.equal(signals[0]!.aborted, true);
 finishes[0]!({ plan: line, edits: [{ topic: "stale", note: "superseded" }] });
 await new Promise((resolve) => setImmediate(resolve));
 main(table, 0, 5);
 const answer = await seat.answer(workFrame(table, 0)) as Extract<Answer, { kind: "work" }>;
 assert.equal(amended, 1); assert.ok(!JSON.stringify(answer.tools).includes("stale"));
 main(table, 1, 6);
 const responding = workFrame(table, 0), preserved = { objective: "o", guidance: "g", steps: [{ label: "Later", when: { active: "self" as const, step: "precombat-main" as const }, action: { option: "pass" } }] };
 const response = responseChanges(responding, preserved, { current: [{ label: "Pass now", action: { option: "pass" } }] });
 assert.deepEqual(response.steps[0]!.when, { active: "opponent", step: "precombat-main", fromTurn: 6, throughTurn: 6 });
 assert.deepEqual(response.steps[1], preserved.steps[0], "unaffected windows stay in the unfinished line");
 assert.throws(() => responseChanges(responding, preserved, { current: [{ label: "Wrong window", when: { active: "self" }, action: { option: "pass" } }] }), /response does not match/, "a model cannot override the current window");
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 const closing = seat.close(); assert.equal(signals[1]!.aborted, true);
 finishes[1]!({ plan: line }); await closing;
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 assert.equal(signals.length, 2, "closed seats start nothing more");
});

test("a package registers only what its card says: Elven Passage is refused Ba Sing Se's mana ability", () => {
	const table = matchup("quotes");
	main(table, 0, 3);
	place(table, 0, "hand", "Elven Passage", "Ba Sing Se");
	const mana = { basis: "{T}: Add {G}.", kind: "mana" as const, cost: { tap: true as const }, colors: ["G" as const] };
	assert.throws(() => editWork(table, 0, [{ do: "package.put", package: { card: "Elven Passage", registers: [mana] } }], "passage"), /"\{T\}: Add \{G\}\." is not on Elven Passage/);
	assert.equal(editWork(table, 0, [{ do: "package.put", package: { card: "Ba Sing Se", registers: [mana, { basis: "This land enters tapped unless you control a basic land.", kind: "enters", tapped: true,
		if: { amount: { count: { types: ["land"], supertypes: ["basic"], controller: "you" } }, atMost: 0 } }] } }], "ba-sing-se"), true, "its own text, line breaks and all");
});

test("the notebook is kept across plans, merged edit by edit, journaled, replayed and cloned, and included in the same strategy answer", async () => {
	const table = position();
	main(table, 0, 3);
	const opponent = { topic: "opponent", note: "Red is the beatdown: haste threats and burn for blockers." };
	editWork(table, 0, [{ do: "plan.put", plan: line }, { do: "notebook.edit", edits: [opponent] }], "noted");
	editWork(table, 0, [{ do: "plan.put", plan: { ...line, objective: "Next." } }], "replanned");
	assert.deepEqual(table.work[0]!.notebook, [{ ...opponent, since: 3 }], "a plan without edits keeps the notebook");
	// A new conclusion can be retired later without replacing unrelated topics.
	editWork(table, 0, [{ do: "notebook.edit", edits: [{ topic: "combat", note: "The Chocobo attacks into an untapped blocker." }] }], "combat-note");
	editWork(table, 0, [{ do: "notebook.edit", edits: [{ topic: "watching", note: "Shock for the Chocobo." }, { topic: "combat", note: "" }] }], "changed-notes");
	assert.deepEqual(table.work[0]!.notebook!.map((one) => one.topic), ["opponent", "watching"], "a topic retired, another joined, the first kept");
	assert.throws(() => editWork(table, 0, [{ do: "notebook.edit", edits: [{ topic: "everything", note: "x".repeat(NOTEBOOK_LIMIT) }] }], "full"), /over its 200000; compact it/);

	const directory = mkdtempSync(join(tmpdir(), "magic-notebook-"));
	const header: Header = { id: "notebook", format: standard.name, seed: table.rng.seed, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(directory, "parent.jsonl"), header);
	save(journal, table);
	const notebook = table.work[0]!.notebook;
	assert.deepEqual(replay(journal.path, () => position()).table.work[0]!.notebook, notebook, "replayed");
	const childPath = join(directory, "child.jsonl");
	fork(journal.path, table.ledger.length, "child", childPath);
	assert.deepEqual(replay(childPath, () => position()).table.work[0]!.notebook, notebook, "cloned");

	// Useful notes go in with the plan, with no separate tool round.
	const seen: string[] = [];
	const replies: { name: string; arguments: Record<string, unknown> }[][] = [
		[{ name: "submit", arguments: { ...line, notes: [{ topic: "lessons", note: "The Passage before the land lost a landfall." }, { topic: "watching", note: "" }] } }]];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); const calls = replies.shift()!;
		return { result: async () => ({ content: calls.map((one, at) => ({ type: "toolCall", id: `c${seen.length}-${at}`, ...one })), stopReason: "toolUse" }) }; };
	main(table, 0, 5);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const { tools } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.match(seen[0]!, /\\"notebook\\":\[\{\\"topic\\":\\"opponent\\"/);
 assert.equal(seen.length, 1, "notes do not cost another model round");
	editWork(table, 0, tools, "planned-with-notes");
	assert.deepEqual(table.work[0]!.notebook, [{ ...opponent, since: 3 }, { topic: "lessons", note: "The Passage before the land lost a landfall.", since: 5 }]);
});

test("preparation starts on the opponent's turn, not before our line has played, and stops use the same short writer", async () => {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
 main(table, 0, 5);
 const started: Frame[] = [];
 const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
  plan: async () => ({ tools: [{ do: "plan.put", plan: line }] }),
  prepare: async (frame) => { started.push(frame); return { plan: line }; } });
 await seat.answer(workFrame(table, 0));
 assert.equal(started.length, 0, "no forecast from before our own actions");
 main(table, 1, 6);
 seat.observe(workFrame(table, 0)); seat.observe(workFrame(table, 0));
 await new Promise((resolve) => setImmediate(resolve));
 assert.equal(started.length, 1);
 await seat.close();
 editWork(table, 0, [{ do: "notebook.edit", edits: [{ topic: "opponent", note: "Red holds burn." }] }, { do: "plan.request", reason: "Stop: The Hydra died" }], "stop");
 const seen: { messages: string; tools: string[] }[] = [];
 const stream: Stream = (_model, request) => { seen.push({ messages: JSON.stringify(request.messages), tools: request.tools!.map((tool) => tool.name) });
  return { result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: { current: [{ label: "Pass", action: { option: "pass" } }], guidance: "Recover." } }], stopReason: "toolUse" }) };
 };
 await planWork(workFrame(table, 0), { cards: loadCards("cards/standard.tsv"), rules: loadRules("rules/cr.tsv") }, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
 assert.match(seen[0]!.messages, /Repair this response or combat decision/);
 assert.match(seen[0]!.messages, /Do not write the next own turn's line/);
 assert.deepEqual(seen[0]!.tools.sort(), ["card", "combat", "equipment", "example", "odds", "rule", "submit", "syntax"]);
});

test("odds count from what the seat can name: our library exactly, the opponent's hand and library together", () => {
	const table = matchup("odds");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	const frame = workFrame(table, 0);
	const ours = odds(frame, 0), library = cardsIn(table, "library", 0);
	assert.equal(ours.Forest!.pool, library.length);
	assert.equal(ours.Forest!.remaining, library.filter((one) => one.card === "Forest").length, "every copy we cannot name is in our library");
	assert.equal(ours.Forest!.draw, ours.Forest!.remaining / library.length);
	const theirs = odds(frame, 1), unknown = [...cardsIn(table, "hand", 1), ...cardsIn(table, "library", 1)];
	assert.equal(theirs.Shock!.pool, unknown.length);
	assert.equal(theirs.Shock!.remaining, unknown.filter((one) => one.card === "Shock").length);
	const choose = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - i + 1)) / i; return r; };
	const hand = cardsIn(table, "hand", 1).length;
	assert.ok(Math.abs(theirs.Shock!.inHand - (1 - choose(unknown.length - theirs.Shock!.remaining, hand) / choose(unknown.length, hand))) < 1e-12);
	assert.match(theirs.Shock!.basis, /library order is not tracked/);
});

test("a failed preparation falls back once to current information and failed planning still records its wait", async () => {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
 main(table, 1, 4);
 let written = 0;
 const waited: { failed?: boolean; waitedMs: number }[] = [];
 const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
  prepare: async () => { throw new Error("preparation failed"); },
  plan: async () => { written++; throw new Error("writer failed"); }, onPlanned: (one) => waited.push(one) });
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 main(table, 0, 5);
 await assert.rejects(seat.answer(workFrame(table, 0)), /writer failed/);
 assert.equal(written, 1); assert.equal(waited[0]!.failed, true);
 await seat.close();
});
