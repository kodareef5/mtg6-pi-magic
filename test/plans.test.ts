/**
 * Planned. A seat's plan is accepted whole and atomically. The pilot chooses
 * each action and pass. The table marks fitting options, raises a stop the
 * plan named, and records each step on the ledger row that
 * carried it out, so replay and clones read progress without equipment edits.
 * The pilot sees the plan's marks on its options; nothing is removed.
 * Past 150 lines because each invariant plays a real position.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { play } from "../src/core/loop.ts";
import { fork, open, reopen, replay, rollback, save, type Header } from "../src/core/journal.ts";
import { annotate, execution, planDue, planReason, planState } from "../src/core/planning.ts";
import { checklist } from "../src/core/review.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { editWork, planProblems, prepareWork, workFrame } from "../src/core/work-tools.ts";
import { afterUntap, budget, manaBudget, paymentForecast } from "../src/core/budget.ts";
import { activate, printedCast, procedureOptions } from "../src/core/procedures.ts";
import { select, reached } from "../src/core/query.ts";
import { project } from "../src/core/view.ts";
import { holds as conditionHolds, players, viewWorld } from "../src/core/selectors.ts";
import { checkPlan, checkPosition } from "../tools/benchmark-checks.ts";
import { matchTable } from "../tools/matchup-fixture.ts";
import { planningFrame } from "../src/context/strategy-facts.ts";
import { permissionForecasts } from "../src/context/strategy-permissions.ts";
import { odds } from "../src/core/odds.ts";
import type { Answer, Player } from "../src/core/player.ts";
import { lifted, type Plan, type PlanOption } from "../src/core/language.ts";
import { NOTEBOOK_LIMIT } from "../src/core/work-language.ts";
import type { Frame } from "../src/core/types.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { seat as seatTable, run } from "../src/context/sit.ts";
import { CEILING, tally } from "../src/context/spend.ts";
import { focus } from "../src/context/packet.ts";
import { emptyBrief } from "../src/context/brief.ts";
import { initialPlan, manaLines } from "../src/context/strategy-facts.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork, prepareTurn, syntaxReference } from "../src/context/strategy.ts";
import { aiSeat, changes, question, settled, coveredDraw, installable, type Prepared, type Planned } from "../src/context/seat.ts";
import { actions, basePlan, changedPlan, conditionProblems, equipment, responseChanges, selectionFields } from "../src/context/plan-edit.ts";
import { actionFacts, bindingFacts, choiceProblems, movementActions, planFacts, planningChoices } from "../src/context/strategy-actions.ts";
import { asState } from "../src/context/model.ts";
import { dossier } from "../src/context/dossier.ts";
import { perspectiveReports, reportsSection } from "../src/context/perspectives.ts";
import { surveyPosition } from "../src/context/survey.ts";
import { announce, cardTexts, establish, example, finish, main, matchup, pack, passBoth, place, quiet, readDossier } from "./play.ts";

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
	const observedThing = [...table.things.values()][0]!, after = [{ id: observedThing.id, zone: observedThing.zone, incarnation: observedThing.incarnation }];
	assert.equal(checkPosition(table.things.values(), after, true).passed, true);
	assert.equal(checkPosition(table.things.values(), after, false).passed, false, "an observation stop before the requested boundary cannot establish survival");
	assert.equal(checkPosition(table.things.values(), [{ ...after[0]!, zone: "another zone" }], true).passed, false, "plan acceptance cannot establish the object's final zone");
	assert.equal(checkPosition(table.things.values(), [{ ...after[0]!, incarnation: observedThing.incarnation + 1 }], true).passed, false, "retention must preserve the specified incarnation");
	assert.equal(checkPosition(table.things.values(), [{ id: "absent", zone: "battlefield" }], true).passed, false);
	const checked = checkPlan(prose, { forbidProse: ["keep[^.]*Veil"] }, workFrame(table, 0));
	assert.ok(checked.structure && !checked.passed, "a valid action line can fail the fixture's prose property");
	assert.deepEqual(checked.prose[0]!.matches, ["Keep one Forest for Veil"]);
	assert.equal(checkPlan({ ...line, guidance: "No reserve." }, { forbidProse: ["keep[^.]*Veil"] }, workFrame(table, 0)).passed, true);
	const required = { require: [{ prefix: "land:", source: "Forest" }, { prefix: "attack:", source: "Sazh's Chocobo" }] };
	assert.equal(checkPlan(line, required, workFrame(table, 0)).passed, true);
	assert.equal(checkPlan({ ...line, steps: [line.steps[0]!] }, required, workFrame(table, 0)).passed, false, "the first named action alone cannot satisfy the whole commitment");
	assert.equal(checkPlan({ ...line, steps: [...line.steps].reverse() }, required, workFrame(table, 0)).passed, true, "required actions do not invent an ordering constraint");
	const alternatives = { anyOrder: [required.require, [{ id: "missing" }]] };
	assert.equal(checkPlan(line, alternatives, workFrame(table, 0)).passed, true, "one complete ordered alternative suffices");
	assert.equal(checkPlan({ ...line, steps: [...line.steps].reverse() }, alternatives, workFrame(table, 0)).passed, false, "unordered pieces do not establish a sequence");
	assert.equal(checkPlan({ ...line, steps: [line.steps[0]!] }, alternatives, workFrame(table, 0)).passed, false, "partial alternatives do not establish the initial line");
	assert.equal(checkPlan(line, { expect: { ...required.require[0], step: "postcombat-main" } }, workFrame(table, 0)).passed, false, "a postcombat step cannot satisfy a precombat growth check");
	assert.equal(checkPlan(line, { expect: { ...required.require[0], mana: "{2}{G}" } }, workFrame(table, 0)).passed, false, "movement does not establish a priced cast");
	const growth = JSON.parse(readFileSync("test/fixtures/benchmarks/good-hydra-growth.json", "utf8")).results[0].answer.plan as Plan;
	const warp = { source: "Mightform Harmonizer", timing: "spell", mana: "{2}{G}", step: "precombat-main" };
	assert.equal(checkPlan(growth, { expect: warp }, workFrame(table, 0)).passed, true, "the saved witness establishes the affordable precombat warp choice");
	assert.equal(checkPlan(growth, { expect: { ...warp, mana: "{3}{G}" } }, workFrame(table, 0)).passed, false, "a different spell payment cannot satisfy that choice");
	const laterGrowth = structuredClone(growth);
	for (const step of laterGrowth.steps) step.when.fromTurn = 99;
	assert.equal(checkPlan(laterGrowth, { expect: warp }, workFrame(table, 0)).passed, false, "a later-turn proposal cannot establish this turn's resource choice");
	assert.equal(checkPlan(line, { requireHold: true }, workFrame(table, 0)).passed, false, "payment prose does not establish a held resource");
	assert.equal(checkPlan({ ...line, holds: [{ objects: { card: "Forest" }, purpose: "Keep the cast payment." }] }, { requireHold: true }, workFrame(table, 0)).passed, true);
	const response = { ...line, phases: [{ when: { active: "opponent" as const }, guidance: "Respond when the target appears." }] };
	assert.equal(checkPlan(response, { requireOpponentResponse: true }, workFrame(table, 0)).passed, true);
	for (const when of [{ active: "self" as const }, { active: "opponent" as const, step: "declare-blockers" as const }, { active: "opponent" as const, phase: "combat" as const },
		{ active: "opponent" as const, fromTurn: 7 }, { active: "opponent" as const, throughTurn: 0 }])
		assert.equal(checkPlan({ ...response, phases: [{ ...response.phases[0]!, when }] }, { requireOpponentResponse: true }, workFrame(table, 0)).passed, false, "a restricted phase does not cover the opponent's whole turn");
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
	assert.ok(asked.some((frame) => frame.decision!.options.some((one) => one.id === "attack:done") && !frame.decision!.options.some((one) => one.id.startsWith("attack:") && one.id !== "attack:done")),
		"the pilot ends the declaration when no further attacker can be selected, even with withdrawal offered");
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

test("a branch and a held resource are marked on the options they touch, and nothing is removed", async () => {
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
	const choices = planningChoices(frame), written = dossier({ frame });
	assert.equal(readDossier(written).mine, false, "answering priority does not make it this seat's turn");
	assert.deepEqual(choices.options.map((one) => one.id), decision.options.filter((one) => !one.use).map((one) => one.id), "direct decisions remain selectable by the planner");
	assert.equal(choices.uses.reduce((n, use) => n + use.offeredCombinations, 0), decision.options.filter((one) => one.use).length, "every offered spell and activation is represented without asking the planner to select a payment");
	for (const object of frame.view.objects!) {
		const row = written.split("\n").find((line) => line.startsWith(`| ${object.id}@${object.incarnation} |`));
		if (object.zone === "battlefield" && object.traits) assert.ok(row!.includes(`| ${object.traits.words.join(", ") || "-"} |`), "battlefield rows carry current abilities from the layer walk");
		else if (object.zone === "hand" && object.card) assert.ok(row!.includes(`| ${frame.view.printed![object.card]!.type} |`), "a card in hand shows its printed type, not uninstalled battlefield abilities");
		if (object.ability) assert.ok(written.split("## Stack")[1]!.split("\n## ")[0]!.includes(object.ability.claim), "an unresolved spell keeps its accepted claim on the stack");
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
	frame.view.work.plan!.holds!.push({ objects: { refs: [{ id: chocobo.id, incarnation: chocobo.incarnation }] }, purpose: "Keep the Chocobo" });
	const protectedTarget = annotate(frame.decision!.options, planState(frame)!);
	assert.ok(protectedTarget.some((option) => option.use?.targets.flat().some((ref) => "id" in ref && ref.id === chocobo.id)));
	assert.ok(protectedTarget.every((option) => !option.shows?.includes("Uses Sazh's Chocobo, held:")), "protecting a held target does not spend it");
	const scratch = mkdtempSync(join(tmpdir(), "held-vigilance-"));
	try {
		const path = join(scratch, "game.jsonl");
		writeFileSync(path, gunzipSync(readFileSync("test/fixtures/benchmarks/held-vigilance.jsonl.gz")));
		const saved = replay(path, (header) => matchTable(header.seed), 592).table;
		const attack = workFrame(saved, 1), before = structuredClone(saved);
		const due = planState(attack)!.due.find((one) => one.candidates.length)!;
		assert.deepEqual(due.candidates.map((one) => one.id), ["attack:1-50"]);
		const candidate = annotate(attack.decision!.options, planState(attack)!).find((one) => one.id === "attack:1-50")!;
		assert.ok(!candidate.shows?.includes("held:"), "the saved vigilant attacker stays available to block");
		assert.deepEqual(saved, before, "resource annotations move nothing");
		apply(saved, candidate.id, "model", "chosen");
		apply(saved, "attack:done", "model", "chosen");
		assert.equal(saved.things.get("1-50")!.tapped, false);
		assert.equal(saved.things.get("1-49")!.tapped, true, "the nonvigilant attacker does tap when the declaration finishes");
		const earlier = workFrame(replay(path, (header) => matchTable(header.seed), 591).table, 1);
		const attackMarks = annotate(earlier.decision!.options, planState(earlier)!);
		assert.ok(attackMarks.filter((one) => one.id.startsWith("attack:") && one.id !== "attack:done").every((one) => !one.shows?.includes("out of order")), "one declaration does not order its attackers");
		assert.ok(checklist(earlier).filter((one) => one.kind === "step" && one.options.some((id) => id.startsWith("attack:") && id !== "attack:done")).every((one) => one.status === "available"), "the checklist treats those attackers as available together");
		earlier.view.work!.plan!.holds!.push({ objects: { card: "Smaug the Magnificent", zones: ["battlefield"] }, purpose: "Keep this blocker untapped" });
		assert.match(annotate(earlier.decision!.options, planState(earlier)!).find((one) => one.id === "attack:1-49")!.shows!, /Uses Smaug the Magnificent, held:/);
		writeFileSync(path, gunzipSync(readFileSync("test/fixtures/benchmarks/red-treasure-lethal.jsonl.gz")));
		const tokens = workFrame(replay(path, (header) => matchTable(header.seed), 236).table, 1);
		const treasure = tokens.view.objects!.find((one) => one.token?.name === "Treasure")!;
		assert.ok(treasure);
		tokens.view.work!.plan!.holds = [{ objects: { refs: [{ id: treasure.id, incarnation: treasure.incarnation }] }, purpose: "Keep Treasure for Smaug." }];
		const markedTokens = annotate(tokens.decision!.options, planState(tokens)!);
		assert.ok(markedTokens.some((one) => one.shows?.includes("Uses Treasure, held: Keep Treasure for Smaug.")), "token hold warnings use the payment's name");
		assert.match(focus(tokens, startingIntent(1)).plan!.held[0]!, /^Treasure \(token-/, "the hold retains both its name and exact identity");

		writeFileSync(path, gunzipSync(readFileSync("test/fixtures/benchmarks/ready-before-help.jsonl.gz")));
		const partial = replay(path, (header) => matchTable(header.seed)).table, partialFrame = workFrame(partial, 1);
		const finishMark = (frame: Frame) => annotate(frame.decision!.options, planState(frame)!).find((one) => one.id === "attack:done")?.notes?.find((note) => note.startsWith("Finishing now"));
		const untouched = structuredClone(partial);
		assert.match(finishMark(partialFrame)!, /step 2 \(Attack with Soulstone Sanctuary.*step 3 \(Attack with Zhao/);
		assert.ok(!finishMark(partialFrame)!.includes("Kellan"), "an already selected attacker is not listed as unfinished");
		assert.deepEqual(annotate(partialFrame.decision!.options, planState(partialFrame)!).map((one) => one.id), partialFrame.decision!.options.map((one) => one.id), "completion marks preserve every option and its canonical order");
		assert.deepEqual(partial, untouched, "completion marks change no physical or private state");
		const conditional = structuredClone(partialFrame);
		conditional.view.work!.plan!.steps[1]!.if = { amount: { life: "opponent" }, atMost: 0 };
		assert.ok(!finishMark(conditional)!.includes("Sanctuary"), "false commitments do not create completion marks");
		const tapped = structuredClone(partial);
		commit(tapped, [{ do: "tap", what: "1-50" }], "resolve");
		assert.ok(!finishMark(workFrame(tapped, 1))!.includes("Sanctuary"), "an unavailable attack is not described as available");
		const optional = structuredClone(partialFrame);
		optional.view.work!.plan!.may = optional.view.work!.plan!.steps.slice(1, 3);
		optional.view.work!.plan!.steps = [];
		assert.equal(finishMark(optional), undefined, "optional branches create no unfinished ordered commitment");
		const broad = structuredClone(partialFrame);
		broad.view.work!.plan!.steps = [{ label: "Choose an attack action", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:" } }];
		assert.equal(finishMark(broad), undefined, "finishing can itself fulfill a broad structured match");
		const early = structuredClone(partial), earlyState = planState(workFrame(early, 1))!;
		apply(early, "attack:done", "model", "chosen", execution(earlyState, "attack:done"));
		assert.equal(early.ledger.at(-1)!.execution?.step, 3, "an early finish keeps honest execution credit");
		assert.deepEqual(workFrame(early, 1).view.done, [4, 0, 3], "finishing never completes the omitted attacks");
		const cloned = join(scratch, "partial-clone.jsonl"), header = fork(path, 365, "partial-clone", cloned);
		const journal = reopen(cloned, header, partial);
		apply(partial, "attack:1-58", "model", "chosen", execution(planState(workFrame(partial, 1))!, "attack:1-58"));
		save(journal, partial);
		assert.match(finishMark(workFrame(partial, 1))!, /Sanctuary/);
		assert.ok(!finishMark(workFrame(partial, 1))!.includes("Zhao"), "either attacker may go first, and its warning disappears");
		assert.equal(finishMark(workFrame(replay(cloned, (header) => matchTable(header.seed)).table, 1)), finishMark(workFrame(partial, 1)), "a cloned prefix and replay reconstruct the same remaining commitment");
		apply(partial, "attack:1-50", "model", "chosen", execution(planState(workFrame(partial, 1))!, "attack:1-50"));
		assert.equal(finishMark(workFrame(partial, 1)), undefined, "all selected attackers permit completion without an unfinished-step mark");
		const selectedRows = structuredClone(partial.ledger);
		assert.equal(execution(planState(workFrame(partial, 1))!, "unattack:1-58"), undefined, "withdrawing is not an attack commitment");
		apply(partial, "unattack:1-58", "model", "chosen");
		assert.deepEqual(partial.ledger.slice(0, selectedRows.length), selectedRows, "withdrawal preserves historical execution rows");
		assert.ok(!workFrame(partial, 1).view.done!.includes(2));
		assert.match(finishMark(workFrame(partial, 1))!, /Zhao/, "withdrawn steps become due again");
		const rewound = structuredClone(partial);
		rollback(rewound, { case: { row: selectedRows.length, raisedBy: 0, claim: "Test rewinding a provisional withdrawal." }, ruling: { legal: false, rule: "508.1", remedy: "rollback", because: "Restore the earlier prefix." } }, () => matchTable(partial.rng.seed));
		assert.ok(workFrame(rewound, 1).view.done!.includes(2));
		assert.ok(rewound.combat!.choosing.some((one) => one.attacker.id === "1-58"), "rollback derives both pending selection and progress from its retained rows");
		save(journal, partial);
		const child = join(scratch, "withdrawn-clone.jsonl"); fork(cloned, partial.ledger.length, "withdrawn", child);
		for (const file of [cloned, child]) assert.deepEqual(workFrame(replay(file, (header) => matchTable(header.seed)).table, 1), workFrame(partial, 1), "replay and clone recover pending choices and effective progress");
		const bounded = replay(child, (header) => matchTable(header.seed)).table, from = bounded.ledger.length, logSize = bounded.log.length;
		const boundedJournal = reopen(child, replay(child, (header) => matchTable(header.seed)).header, bounded);
		const withdrawer: Player = { name: "Withdraw", observe() {}, close() {}, async answer() { return { kind: "pick", option: "unattack:1-50", actionId: "withdraw" }; } };
		await assert.rejects(play(bounded, { 1: withdrawer }, {}, { checkpoint: () => { if (bounded.ledger.length - from === 1) throw stop; } }), (error) => error === stop);
		assert.equal(bounded.ledger.length, from + 1, "the host pauses before another decision");
		assert.equal(bounded.log.length, logSize, "a boundary observes even unlogged declaration bookkeeping");
		assert.equal(bounded.outcome, null); assert.deepEqual(bounded.gaps, []);
		assert.ok(nextDecision(bounded)!.options.some((one) => one.id === "attack:1-50"), "external pause leaves the declaration pending");
		const finisher: Player = { ...withdrawer, async answer() { return { kind: "pick", option: "attack:done", actionId: "finish" }; } };
		await assert.rejects(play(bounded, { 1: finisher }, {}, { checkpoint: () => { if (bounded.ledger.length - from === 2) throw stop; } }), (error) => error === stop);
		assert.equal(bounded.cursor.stepDone, true, "a host stop after finish precedes the next control transition");
		assert.equal(nextDecision(bounded), null);
		save(boundedJournal, bounded);
		const stoppedClone = join(scratch, "stopped-clone.jsonl"); fork(child, bounded.ledger.length, "stopped", stoppedClone);
		const normalized = structuredClone(bounded);
		while (!nextDecision(normalized)) advance(normalized);
		for (const file of [child, stoppedClone]) assert.deepEqual(workFrame(replay(file, (header) => matchTable(header.seed)).table, 1), workFrame(normalized, 1));
		assert.equal(bounded.cursor.stepDone, true, "comparison normalization never advances the paused table");
		apply(partial, "attack:1-58", "model", "chosen", execution(planState(workFrame(partial, 1))!, "attack:1-58"));
		assert.equal(workFrame(partial, 1).view.done!.filter((step) => step === 2).length, 1, "reselection credits only its new row");
		apply(partial, "unattack:1-15", "model", "chosen");
		assert.ok(!workFrame(partial, 1).view.done!.includes(0), "an original prefix selection can also be withdrawn");
		const amended = structuredClone(partial), plan = structuredClone(amended.work[1]!.plan!);
		plan.steps = plan.steps.filter((one) => one.label !== "Attack with Soulstone Sanctuary");
		editWork(amended, 1, [{ do: "plan.put", plan }], "amend declaration");
		apply(amended, "unattack:1-50", "model", "chosen");
		assert.ok(!workFrame(amended, 1).view.work!.plan!.steps.some((one) => one.label === "Attack with Soulstone Sanctuary"), "withdrawal across an amendment resurrects no deleted commitment");
		apply(partial, "attack:done", "model", "chosen", execution(planState(workFrame(partial, 1))!, "attack:done"));
		assert.ok(!workFrame(partial, 1).view.done!.includes(0), "finishing does not restore withdrawn credit");
		save(journal, partial);
		while (!nextDecision(partial)) advance(partial);
		assert.deepEqual(workFrame(replay(cloned, (header) => matchTable(header.seed)).table, 1), workFrame(partial, 1));

		writeFileSync(path, gunzipSync(readFileSync("test/fixtures/benchmarks/menace-partial-block.jsonl.gz")));
		const blocks = replay(path, (header) => matchTable(header.seed), 284).table;
		editWork(blocks, 0, [{ do: "plan.put", plan: { objective: "Exercise declaration credit.", guidance: "Test matching, not block legality.", steps: [{ label: "Select a block", when: { active: "opponent", step: "declare-blockers" }, action: { prefix: "block:" } }] } }], "block credit");
		const choose = () => apply(blocks, "block:0-25:1-58", "model", "chosen", execution(planState(workFrame(blocks, 0))!, "block:0-25:1-58"));
		choose();
		assert.deepEqual(workFrame(blocks, 0).view.done, [0]);
		assert.equal(execution(planState(workFrame(blocks, 0))!, "unblock:0-25:1-58"), undefined);
		editWork(blocks, 0, [{ do: "plan.put", plan: { ...blocks.work[0]!.plan!, guidance: "Amended while the block is pending." } }], "amend pending block");
		apply(blocks, "unblock:0-25:1-58", "model", "chosen");
		assert.deepEqual(workFrame(blocks, 0).view.done, []);
		assert.ok(!workFrame(blocks, 0).view.worked!.some((one) => one.label === "Select a block"), "withdrawn work is excluded before history deduplication");
		choose(); assert.deepEqual(workFrame(blocks, 0).view.done, [0]);
	} finally { rmSync(scratch, { recursive: true, force: true }); }
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
	assert.deepEqual(tools, [{ do: "plan.put", plan: { ...line, throughTurn: 2 } }]);
	assert.match(seen[1]!, /\d problems: steps\[0\] \(Attack in the end step\): attack: options are listed only in declare-attackers.*steps\[1\] \(Nothing\): name an option id.*Hired Claw.*is an activated ability/, "every problem in one refusal");
	assert.match(seen[1]!, /is not an option id; use prefix/, "an invented action shorthand is refused before it bypasses the resource forecast");
	assert.match(seen[0]!, /## Your request\\nPlan the turn\./, "the request comes last and names the task");
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
 editWork(table, 0, [{ do: "package.put", package: { card: "Snakeskin Veil", registers: [], procedures: [example("Cast Snakeskin Veil")] } },
	{ do: "package.put", package: { card: "Shock", registers: [], procedures: [example("Cast Shock")] } }], "other-equipment");
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
 const veilKey = Object.keys(available).find((key) => available[key]!.label === "Cast Snakeskin Veil")!;
 assert.ok(veilKey && !frame.view.objects!.some((one) => one.card === "Snakeskin Veil"));
 assert.deepEqual(JSON.parse(equipment(frame, available).answer({ card: "Snakeskin Veil" })).actions[veilKey], available[veilKey], "absent card equipment keeps its exact reusable key and accepted terms");
 assert.ok(!Object.values(available).some((one) => one.label === "Cast Shock"), "a card off this seat's list and out of its control offers no reusable action");
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
  const [dossierText, work] = (request.messages as { content: string }[]).map((one) => one.content);
  const catalog = work!.split("## Actions you can reuse")[1]!.split("\n## ")[0]!;
  assert.ok(!catalog.includes(`### ${veilKey}\n`), "an absent card's procedure is fetched when needed, not sent with every repair");
  assert.ok(!catalog.includes('"instructions"'), "ordinary strategy reads accepted claims and costs; equipment retains executable instructions");
  assert.ok(dossierText!.includes(`Steps left this turn, in order: ${table.cursor.steps.map((one) => one.replace(/-/g, " ")).join(", ")}.`), "the writer sees the real remaining turn windows");
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
	const namedCondition = { ...line.steps[0]!, if: { amount: { count: { zones: ["hand"], card: "Forest" } }, atLeast: 1 } };
	const sourceUnchanged = structuredClone(namedCondition);
	const namedPlan = changedPlan(base, { steps: [namedCondition] }, available);
	assert.deepEqual(namedPlan.steps[0]!.if, { amount: { count: { zones: ["hand"], name: "Forest" } }, atLeast: 1 });
	assert.deepEqual(namedPlan.steps[0]!.action, namedCondition.action, "condition aliases never rename the action's card query");
	assert.deepEqual(namedCondition, sourceUnchanged);
	assert.throws(() => changedPlan(base, { steps: [{ ...namedCondition, if: { amount: { count: { card: "Forest", name: "Mountain" } }, atLeast: 1 } }] }, available), /schema/, "conflicting names remain an error");
	assert.throws(() => changedPlan(base, { phases: [{ when: { step: "combat", phase: "beginning" }, guidance: "Contradictory." }] }, available), /schema/);
	assert.throws(() => changedPlan(base, { may: [{ ...aliases.may[0], if: { amount: { count: { types: ["creature"] }, atLeast: 3 }, atLeast: 1 } }] }, available), /schema/, "two stated bounds are not silently reconciled");
	const legacy: Plan = { ...base, holds: [{ objects: { card: "Forest" }, purpose: "Keep it until the stated condition", releaseWhen: { any: [{ amount: { life: "opponent" } }] } }] };
	assert.doesNotThrow(() => prepareWork(frame, [{ do: "plan.put", plan: legacy }]), "old accepted terms remain replayable");
	assert.match(conditionProblems(legacy).join(" "), /holds\[0\].releaseWhen.any\[0\].*needs atLeast or atMost/, "an inherited unbounded release is reported among the plan's known problems");
	assert.doesNotThrow(() => changedPlan(legacy, {}, available), "an answer is not refused for a condition it did not write");
	assert.throws(() => changedPlan(legacy, { holds: legacy.holds }, available), /holds\[0\].releaseWhen.any\[0\].*needs atLeast or atMost/, "resubmitting the hold makes its condition the answer's own");
	assert.throws(() => changedPlan(base, { steps: [{ ...line.steps[0], if: { not: { all: [{ amount: { count: { zones: ["stack"] } } }] } } }] }, available), /steps\[0\].if.not.all\[0\].*needs atLeast or atMost/);
	const bounded = changedPlan(legacy, { holds: [{ ...legacy.holds![0], releaseWhen: { amount: { life: "opponent" }, atMost: 0 } }] }, available);
	assert.equal(conditionHolds({ world: viewWorld(frame.view), controller: frame.seat }, bounded.holds![0]!.releaseWhen!), false, "an explicit zero is a comparison, not a missing bound");
 // Core sees ordinary terms, so replay and execution need no new language.
	assert.doesNotThrow(() => prepareWork(frame, [{ do: "plan.put", plan: reused }]));
	assert.ok(!JSON.stringify(reused).includes('"reuse"'));
	const pending = changedPlan(line, { packages: [{ card: "Forest", registers: [] }] }, available);
	assert.deepEqual(pending.packages!.map((one) => one.card), ["Sazh's Chocobo", "Forest"], "a new draw's package keeps the preparation's pending registrations");
	assert.deepEqual(changedPlan(pending, { packages: [] }, available).packages, pending.packages, "empty package edits remove neither pending nor accepted work");
	const brief = { ...emptyBrief(0), role: "Develop.", route: "Grow the Chocobo.", matchup: "Keep Veil mana.", steps: { "precombat-main": { own: "Creature before land; keep protection." } } };
	const defaults = initialPlan(brief);
	assert.equal(defaults.phases, undefined, "pregame step notes stay pilot guidance, not inherited phase scripts");
	assert.equal(changedPlan(defaults, { steps: [line.steps[0]] }, {}).objective, "Develop. Grow the Chocobo.", "turn one builds on pregame instead of rewriting its decisions");
	assert.equal(initialPlan({ ...brief, objective: "Grow the Chocobo, keep protection." }).objective, "Grow the Chocobo, keep protection.", "the pilot receives the pregame's short objective, not all its reasoning");
});

test("strategy accepts scoped work before upkeep and reviews after draw, with no extra opening call", async () => {
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
	const seated = await seatTable(table, roster, inference, universe, { format: standard.name, survey: false });
	assert.equal(prompts.length, 0, "seating spends no strategy before a decision");
	assert.ok(table.work[0]!.eachTurn && table.work[1]!.eachTurn, "both a prepared seat and a fresh seat plan each turn");
	assert.deepEqual(table.work[0]!.packages, [{ card: "Forest", registers: [] }], "enabling strategy preserves carried card equipment");
	assert.equal(table.ledger.length, 0, "enabling strategy makes no physical decision");
	assert.ok(await run(table, seated, inference, undefined));
	assert.equal(table.gaps.length, 0);
	// Turn plans, not the background preparation of a later turn.
	const sessions = prompts.filter((prompt) => !/Prepare your next turn/.test(prompt.task ?? "")).map((prompt) => {
		const read = readDossier(prompt.user);
		return { seat: read.seat, view: { window: read.opening ? { kind: "opening", turn: 0, active: -1, step: "" } : { kind: "turn", turn: read.turn!, active: read.mine ? read.seat : 1 - read.seat, step: read.step! } } };
	});
	for (const seat of [0, 1]) {
		const own = sessions.filter((session) => session.seat === seat && session.view.window.kind === "turn" && session.view.window.active === seat);
		assert.notEqual(own[0]!.view.window.step, "upkeep", "the opening plan still waits for the draw boundary");
		assert.ok(own.some((session) => session.view.window.step === "upkeep"), "later scoped turns accept before upkeep choices");
		for (const turn of new Set(own.map((session) => session.view.window.turn))) {
			const windows = own.filter((session) => session.view.window.turn === turn).map((session) => session.view.window.step);
			assert.equal(windows.length, new Set(windows).size, "each deadline is acknowledged once");
			assert.ok(windows.length <= 2, "upkeep acceptance and draw review are the only scheduled sessions");
		}
	}
	assert.equal(sessions.filter((session) => session.view.window.kind === "opening").length, 0, "no plan during the mulligan: the brief's opening policy decides it");
	for (const seat of [0, 1]) assert.ok(sessions.find((session) => session.seat === seat), `seat ${seat} planned once the game began`);
	assert.ok(prompts.every((prompt) => prompt.ceiling === CEILING.strategy));
	assert.equal(new Set(prompts.map((prompt) => prompt.system)).size, 1, "every call sends the same system prompt, so it can be cached");
	assert.ok(!prompts[0]!.system!.includes(syntaxReference()), "card procedure semantics stay behind the syntax lookup until needed");
	for (const prompt of prompts) {
		assert.ok(!/^## .+'s hand/m.test(prompt.user), "only the seat's own hand is listed; the opponent's is a count");
		const texts = [...cardTexts(prompt.user)].filter(([name]) => universe.cards.has(name));
		assert.ok(texts.length > 0 && texts.every(([name, oracle]) => oracle === (universe.cards.get(name)!.oracle || "No rules text.")), "the dossier quotes the actual card text");
	}
	// An upkeep escalation has no revealed draw to plan from yet.
	const early = matchup("upkeep-planning"); main(early, 0, 3, "upkeep");
	editWork(early, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "Hold.", guidance: "Await the draw.", steps: [] } }], "upkeep");
	assert.equal(planDue(workFrame(early, 0)), false);
	main(early, 0, 3);
	assert.equal(planDue(workFrame(early, 0)), true, "a plan accepted in upkeep does not suppress the post-draw update");
	editWork(early, 0, [{ do: "plan.put", plan: { objective: "Hold.", guidance: "The draw is covered.", steps: [] } }], "after-draw");
	assert.equal(planDue(workFrame(early, 0)), false);

	const scheduled = structuredClone(workFrame(early, 0));
	scheduled.view.work!.plan!.throughTurn = 4;
	scheduled.view.work!.accepted = 0;
	assert.equal(planDue(scheduled), true);
	const drawAgain = structuredClone(scheduled);
	drawAgain.decision = { ...drawAgain.decision!, situation: "turn-based", options: [{ id: "draw", label: "Draw" }] };
	assert.equal(planDue(drawAgain), false, "even a repeated compulsory draw precedes scheduled review");
	const losing = structuredClone(scheduled);
	losing.decision = { ...losing.decision!, situation: "state-based", options: [{ id: "lose:0", label: "Lose after drawing empty" }] };
	assert.equal(planDue(losing), false, "compulsory state checks precede scheduled work");
	losing.decision.options = [{ id: "keep:a", label: "Keep first legend" }, { id: "keep:b", label: "Keep second legend" }];
	assert.equal(planDue(losing), true, "a state-based choice can require policy");
	const skipped = structuredClone(scheduled); delete skipped.view.drawnAt; delete skipped.view.turnDraw;
	assert.equal(planDue(skipped), true, "the opening skipped-draw boundary still requests first acceptance");
	skipped.view.work!.accepted = skipped.version;
	assert.equal(planDue(skipped), false, "no actual draw introduces no second review after acceptance");
	const future = matchup("future-plan"); main(future, 1, 2);
	const futurePlan: Plan = { ...line, throughTurn: 4 };
	editWork(future, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: futurePlan }], "future-turn");
	main(future, 0, 3, "upkeep");
	assert.equal(planDue(workFrame(future, 0)), true);
	const futureBase = basePlan(workFrame(future, 0));
	assert.deepEqual(futureBase.steps, futurePlan.steps, "an explicitly accepted future scope survives the turn boundary");
	assert.equal(futureBase.throughTurn, futurePlan.throughTurn);

	const response = matchup("first-turn-response"); main(response, 0, 1);
	editWork(response, 1, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "Respond", guidance: "Wait", throughTurn: 1, steps: [] } }], "response");
	main(response, 1, 2, "upkeep");
	assert.ok(planDue(workFrame(response, 1)), "prior scoped response work establishes early acceptance even on this seat's first own turn");

	const setup = () => { const table = matchup("upkeep-deadline"); establish(table, 1, "Smaug the Magnificent"); return table; };
	const lifecycle = setup(); main(lifecycle, 1, 2);
	editWork(lifecycle, 1, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "Old", guidance: "Expired", throughTurn: 3, steps: [] } }], "prior-scope");
	main(lifecycle, 0, 3);
	const policy: Plan = { objective: "Wait", guidance: "Keep resources", throughTurn: 5,
		steps: [{ label: "Pass for the Treasure trigger", when: { active: "self", step: "upkeep" }, action: { option: "pass" } },
			{ label: "Finish main", when: { active: "self", step: "precombat-main" }, waitFor: "empty-stack", action: { option: "pass" } }],
		holds: [{ objects: { card: "Smaug the Magnificent" }, purpose: "Keep the Dragon" }],
		phases: [{ when: { active: "self", step: "upkeep" }, guidance: "Create the Treasure, then pass to draw." },
			{ when: { active: "opponent" }, guidance: "Keep Smaug to block." }] };
	const deadlines: Frame[] = [], captures: { version: number; frame: Frame }[] = [];
	const red: Player = { ...pilot([]), async answer(frame) {
		if (planDue(frame)) {
			deadlines.push(frame); const at = frame.view.window; assert.equal(at.kind, "turn");
			if (at.kind === "turn" && at.step === "upkeep") {
				assert.equal(frame.decision!.situation, "trigger-order", "attention intercepts the compulsory announcement");
				assert.equal(frame.decision!.options.length, 1);
				assert.equal(planState(frame), null, "the expired recorded scope still raises the deadline");
				const legacy = structuredClone(frame); delete legacy.view.work!.plan!.throughTurn;
				assert.equal(planDue(legacy), false, "unscoped legacy work keeps its old schedule");
				const kept = structuredClone(frame); kept.view.work = prepareWork(frame, [{ do: "plan.keep", reason: "Retain the standing policy." }]);
				assert.equal(planDue(kept), false, "keep acknowledges this deadline without installing policy");
				return { kind: "work", tools: [{ do: "plan.put", plan: policy }], revision: frame.view.work!.revision, actionId: "upkeep-accept" };
			}
			assert.ok(frame.view.drawnAt, "the compulsory draw precedes its review");
			assert.equal(frame.view.turnDraw!.length, 1);
			const drawn = frame.view.turnDraw![0]!;
			assert.equal(drawn.card, lifecycle.things.get(drawn.id)!.card);
			assert.ok(!project(lifecycle, 0).turnDraw?.some((one) => one.id === drawn.id), "opponents do not receive this private draw");
			assert.equal(project(lifecycle, "spectator").turnDraw, undefined);
			assert.match(dossier({ frame }), new RegExp(`^- Drawn this turn: ${drawn.card}\\.$`, "m"), "the dossier names the card this seat drew");
			assert.match(planReason(frame)!, /unfinished line/);
			const late = structuredClone(frame); late.view.work!.accepted = 0;
			assert.match(planReason(late)!, /your matchup plan/, "a late first acceptance does not claim an existing turn line");
			assert.deepEqual(frame.view.done, [0]);
			const remainder = basePlan(frame);
			assert.equal(remainder.throughTurn, 5);
			assert.deepEqual(remainder.steps, policy.steps.slice(1), "completed upkeep work is not installed again");
			assert.deepEqual(remainder.holds, policy.holds);
			assert.deepEqual(remainder.phases, policy.phases);
			const announcement = structuredClone(frame); announcement.decision!.situation = "trigger-order";
			assert.ok(planDue(announcement), "post-draw announcement choices also require review");
			return { kind: "work", tools: [{ do: "plan.put", plan: remainder }], revision: frame.view.work!.revision, actionId: "draw-amend" };
		}
		if (frame.decision!.situation === "resolution")
			assert.match(JSON.stringify(frame.view.purposes), /Create the Treasure/, "resolution recovers the accepted upkeep announcement policy");
		captures.push({ version: lifecycle.ledger.length, frame });
		return pilot([]).answer(frame);
	} };
	await playUntil(lifecycle, { 0: opponent, 1: red }, 4);
	assert.deepEqual(lifecycle.gaps, []);
	assert.deepEqual(deadlines.map((frame) => frame.view.window.kind === "turn" && frame.view.window.step), ["upkeep", "draw"]);
	const directory = mkdtempSync(join(tmpdir(), "magic-upkeep-"));
	try {
		const journal = open(join(directory, "parent.jsonl"), { id: "upkeep", format: standard.name, seed: lifecycle.rng.seed,
			seats: lifecycle.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: "cards/standard.tsv", generated: "fixture" },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" });
		save(journal, lifecycle);
		assert.deepEqual(replay(journal.path, setup).table.ledger, lifecycle.ledger);
		for (const captured of captures.filter(({ frame }) => frame.decision!.situation === "resolution" || frame.view.window.kind === "turn" && frame.view.window.step === "draw")) {
			const path = join(directory, `clone-${captured.version}.jsonl`); fork(journal.path, captured.version, "clone", path);
			const restored = workFrame(replay(path, setup).table, 1);
			assert.equal(planDue(restored), planDue(captured.frame));
			assert.deepEqual(basePlan(restored), basePlan(captured.frame));
			assert.deepEqual(restored.view.purposes, captured.frame.view.purposes);
			assert.deepEqual(restored.view.turnDraw, captured.frame.view.turnDraw);
		}
	} finally { rmSync(directory, { recursive: true, force: true }); }
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
	const outcome = await run(table, await seatTable(table, roster, inference, universe, { format: standard.name, survey: false }), inference, undefined);
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
	assert.match(seen[0]!, /Mana now: Forest \(0-\d+@\d+\) makes G; Forest \(0-\d+@\d+\) makes G/);
	assert.match(seen[0]!, /Land plays left this turn: 1\. In hand: .*Forest: enters untapped, makes G/);
	assert.match(seen[0]!, /Ba Sing Se: no package, so how it enters and what it makes are unknown/, "a land with no package is not guessed at");
	const grave = cardsIn(table, "hand", 0).find((one) => one.card === "Forest")!;
	commit(table, [{ do: "move", what: grave.id, to: "graveyard", reason: "game-setup" }], "game-setup");
	assert.doesNotMatch(manaLines(workFrame(table, 0)).join(" "), /Permitted from graveyard/, "a visible land still needs permission");
	establish(table, 0, "Icetill Explorer");
	assert.match(manaLines(workFrame(table, 0)).join(" "), /Permitted from graveyard: [^.]*Forest: enters untapped, makes G/, "resource context includes a currently permitted graveyard land");
	const snapshot = structuredClone(table), frame = workFrame(table, 0), stated = dossier({ frame });
	const rows = (section: string) => [...section.matchAll(/^\| (\S+)@\d+ \|/gm)].map((match) => match[1]!).sort();
	const yours = stated.split("### Yours")[1]!.split("\n### ")[0]!;
	assert.deepEqual(rows(yours), frame.view.objects!.filter((one) => one.controller === 0 && one.zone === "battlefield").map((one) => one.id).sort(), "the battlefield lists current permanents, never a spell in hand");
	assert.deepEqual(rows(stated.split("## Your hand")[1]!.split("\n## ")[0]!), frame.view.objects!.filter((one) => one.controller === 0 && one.zone === "hand").map((one) => one.id).sort());
	assert.match(stated, /Land plays left this turn: 2\./);
	assert.match(stated, new RegExp(`Forest \\(${grave.id}@\\d+\\), you may play it`), "a permitted graveyard land is marked where it lies");
	assert.deepEqual(table, snapshot, "building decision facts neither moves a card nor applies a future ability");
	const elf = establish(table, 0, "Llanowar Elves");
	commit(table, [{ do: "tap", what: elf.id }], "resolve");
	main(table, 1, 4);
	assert.match(manaLines(afterUntap(workFrame(table, 0))).join(" "), /Llanowar Elves \(0-\d+@\d+\) makes G/, "next-turn preparation sees mana after an ordinary untap and sickness ends, as a forecast");
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
	const reserved = matchup("scheduled-hold");
	main(reserved, 1, 4);
	place(reserved, 1, "battlefield", "Mountain");
	place(reserved, 1, "hand", "Mountain", "Zhao, the Moon Slayer");
	const afterCombat: Plan = { objective: "Cast Zhao after combat", guidance: "Save the existing Mountain", steps: [land(reserved, "Mountain"),
		{ ...cast(reserved, "Zhao, the Moon Slayer"), when: { active: "self", step: "postcombat-main" } }],
		holds: [{ objects: { zones: ["battlefield"], types: ["land"], controller: "self" }, purpose: "Pay for Zhao", releaseAt: { active: "self", step: "postcombat-main" } }] };
	const heldFrame = workFrame(reserved, 1), heldBefore = structuredClone(heldFrame);
	assert.deepEqual(paymentForecast(heldFrame, afterCombat).conflicts, [], "the scheduled release lets the later cast spend the held source");
	for (const releaseAt of [{ active: "self" as const, step: "end" as const }, { active: "opponent" as const, step: "precombat-main" as const }])
		assert.match(paymentForecast(heldFrame, { ...afterCombat, holds: [{ ...afterCombat.holds![0]!, releaseAt }] }).conflicts.join(" "), /plan holds Mountain/, "later and other-seat windows keep the resource reserved");
	assert.match(paymentForecast(heldFrame, { ...afterCombat, steps: [afterCombat.steps[0]!, cast(reserved, "Zhao, the Moon Slayer")] }).conflicts.join(" "), /plan holds Mountain/, "an earlier cast cannot spend a later release");
	assert.deepEqual(paymentForecast(heldFrame, { ...afterCombat, steps: [afterCombat.steps[0]!, { ...afterCombat.steps[1]!, when: { active: "self", phase: "postcombat-main" } }] }).conflicts, [], "phase timing also releases a reached window");
	const preceding = structuredClone(heldFrame);
	if (preceding.view.window.kind === "turn") Object.assign(preceding.view.window, { active: 0, turn: 3 });
	assert.deepEqual(paymentForecast(preceding, afterCombat).conflicts, [], "next-turn forecasts test releases in the planned seat's turn");
	assert.deepEqual(heldFrame, heldBefore, "forecasting release windows moves nothing");

	// Three Forests: Hydra spends them all, so Veil cannot also be kept.
	const tappedSource = matchup("activation-tap-cost");
	establish(tappedSource, 0, "Ba Sing Se");
	place(tappedSource, 0, "battlefield", "Forest", "Forest");
	main(tappedSource, 0, 3);
	const earthbend = { label: "Earthbend", when: now(tappedSource), action: { procedure: example("Earthbend 2 with Ba Sing Se") } };
	assert.match(problems(tappedSource, { steps: [earthbend] }), /costs \{2\}\{G\}/, "the source cannot tap once for mana and again for its activation cost");
	assert.equal(procedureOptions(earthbend.action.procedure, workFrame(tappedSource, 0), "check").length, 0);
	place(tappedSource, 0, "battlefield", "Forest");
	assert.equal(problems(tappedSource, { steps: [earthbend] }), "", "three other sources pay the mana");
	const paidAbility = procedureOptions(earthbend.action.procedure, workFrame(tappedSource, 0), "check")[0]!;
	assert.ok(paidAbility);
	place(tappedSource, 0, "hand", "Llanowar Elves");
	assert.match(problems(tappedSource, { steps: [earthbend, cast(tappedSource, "Llanowar Elves")] }), /Cast Llanowar Elves.*no untapped source/, "the tap-cost source stays spent for later steps");
	assert.match(paymentForecast(workFrame(tappedSource, 0), { objective: "Earthbend", guidance: "Activate once", steps: [earthbend], may: [{ ...earthbend, when: { active: "opponent" } }] }).responses.join(" "), /may\[0\].*tap cost/, "the opponent-turn branch cannot reuse a spent tap-cost source");
	const exactFrame = workFrame(tappedSource, 0);
	exactFrame.decision!.options.push(paidAbility.option);
	assert.match(budget(exactFrame, { objective: "Sequence", guidance: "Use the chosen payment", steps: [{ ...earthbend, action: { option: paidAbility.option.id } }, cast(tappedSource, "Llanowar Elves")] }).join(" "), /Cast Llanowar Elves.*no untapped source/, "an exact activation also carries its tap cost");

	const restricted = matchup("activation-spending-zone");
	establish(restricted, 1, "Rockface Village"); establish(restricted, 1, "Rockface Village");
	establish(restricted, 1, "Kellan, Planar Trailblazer", []);
	main(restricted, 1, 2);
	const detective = { label: "Become a Detective", when: now(restricted), action: { procedure: example("Kellan becomes a Detective") } };
	const originalRestricted = structuredClone(restricted);
	assert.equal(procedureOptions(detective.action.procedure, workFrame(restricted, 1), "check").length, 0);
	assert.match(budget(workFrame(restricted, 1), { objective: "Develop", guidance: "Activate", steps: [detective] }).join(" "), /costs \{1\}\{R\}/, "creature-cast-only red cannot pay an activation on that creature");
	assert.match(paymentForecast(workFrame(restricted, 1), { objective: "Wait", guidance: "Activate later", steps: [], may: [{ ...detective, when: { active: "opponent" } }] }).responses.join(" "), /may\[0\].*costs \{1\}\{R\}/);
	assert.deepEqual(restricted, originalRestricted, "activation forecasting moves no source or mana");
	place(restricted, 1, "battlefield", "Mountain");
	assert.deepEqual(budget(workFrame(restricted, 1), { objective: "Develop", guidance: "Use unrestricted red", steps: [detective] }), []);
	assert.ok(procedureOptions(detective.action.procedure, workFrame(restricted, 1), "check").length, "Village colorless and Mountain red really pay the activation");

	// A creature's mana and attack cannot both be spent in the same line.
	const attacking = matchup("payment-witness");
	const elf = establish(attacking, 0, "Llanowar Elves");
	place(attacking, 0, "battlefield", "Forest", "Forest");
	main(attacking, 0, 3);
	place(attacking, 0, "hand", "Mossborn Hydra");
	const attack = { label: "Attack with the Elf", when: { active: "self" as const, step: "declare-attackers" as const },
		action: { prefix: "attack:", objects: { refs: [{ id: elf.id, incarnation: elf.incarnation }] } } };
	const commitment: Plan = { objective: "Develop and attack", guidance: "Keep the attacker available", steps: [cast(attacking, "Mossborn Hydra"), attack] };
	assert.match(paymentForecast(workFrame(attacking, 0), commitment).conflicts.join(" "), /later attacks also need/, "the forecast cannot pay with its planned attacker");
	const afterAttack = { ...commitment, steps: [attack, { ...commitment.steps[0]!, when: { active: "self" as const, step: "postcombat-main" as const } }] };
	assert.match(paymentForecast(workFrame(attacking, 0), afterAttack).conflicts.join(" "), /costs \{2\}\{G\}/, "a normal attack spends the source before a later cast");
	const vigilant = workFrame(attacking, 0);
	vigilant.view.objects!.find((one) => one.id === elf.id)!.traits!.words.push("vigilance");
	assert.match(paymentForecast(vigilant, commitment).conflicts.join(" "), /later attacks also need/, "vigilance cannot rescue an attacker already tapped for mana");
	const laterWitness = paymentForecast(vigilant, afterAttack);
	assert.deepEqual(laterWitness.conflicts, []);
	assert.ok(laterWitness.payments[0]!.funding.taps.some((tap) => tap.source.id === elf.id), "vigilance allows paying after the declaration");
	place(attacking, 0, "battlefield", "Forest");
	editWork(attacking, 0, [{ do: "plan.put", plan: commitment }], "attack-commitment");
	const paymentFrame = workFrame(attacking, 0), paymentState = planState(paymentFrame)!;
	const markedPayments = annotate(paymentFrame.decision!.options, paymentState);
	assert.equal(markedPayments.length, paymentFrame.decision!.options.length + paymentState.procedures.length, "a payment conflict adds guidance without removing a move");
	const usesElf = (one: (typeof markedPayments)[number]) => one.use?.funding?.some((tap) => tap.source.id === elf.id);
	assert.ok(markedPayments.some((one) => usesElf(one) && one.shows?.includes('remaining attack step "Attack with the Elf"')));
	assert.ok(markedPayments.some((one) => one.use && !usesElf(one) && !one.shows?.includes("This payment taps")), "the payment preserving the attacker stays unmarked");
	const conditionalFrame = structuredClone(paymentFrame);
	conditionalFrame.view.work!.plan!.steps[1]!.if = { amount: { life: "opponent" }, atMost: 0 };
	assert.ok(annotate(conditionalFrame.decision!.options, planState(conditionalFrame)!).every((one) => !one.shows?.includes("This payment taps")), "a false attack condition creates no commitment mark");
	const beforeWitness = structuredClone(attacking), witness = paymentForecast(workFrame(attacking, 0), commitment);
	assert.deepEqual(witness.conflicts, []);
	assert.deepEqual(witness.unchecked, []);
	assert.equal(witness.payments.length, 1);
	assert.ok(witness.payments[0]!.untappedManaSourcesAfter.some((one) => one.id === elf.id));
	assert.ok(witness.payments[0]!.funding.taps.every((tap) => tap.source.id !== elf.id));
	assert.deepEqual(attacking, beforeWitness, "the receipt leaves both physical and private state unchanged");
	const receipt = witness.payments[0]!;
	announce(attacking, printedCast("Mossborn Hydra", attacking.printed["Mossborn Hydra"]!), (one) => JSON.stringify(one.option.use!.funding) === JSON.stringify(receipt.funding.taps));
	assert.ok(receipt.funding.taps.every((tap) => attacking.things.get(tap.source.id)!.tapped), "the witnessed payment exists in real physical options");
	assert.equal(attacking.things.get(elf.id)!.tapped, false);
	const unknown = paymentForecast(workFrame(beforeWitness, 0), { ...commitment, steps: [{ ...commitment.steps[0]!, action: { procedure: {
		...printedCast("Mossborn Hydra", beforeWitness.printed["Mossborn Hydra"]!), cost: { mana: "{X}{G}" } } } }] });
	assert.equal(unknown.payments.length, 0);
	assert.ok(unknown.unchecked.length, "an unpriced line is explicit, never a successful empty witness");
	const response = { label: "Variable response", when: { active: "opponent" as const }, action: { procedure: {
		...printedCast("Mossborn Hydra", beforeWitness.printed["Mossborn Hydra"]!), cost: { mana: "{X}{G}" } } } };
	const responseForecast = (branch: PlanOption) => paymentForecast(workFrame(beforeWitness, 0), { objective: "Wait", guidance: "Reserve the response", steps: [], may: [branch] });
	assert.match(responseForecast(response).unchecked.join(" "), /may\[0\].*priced cost/, "variable response costs cannot disappear as a completed check");
	assert.match(responseForecast(veil(beforeWitness)![0]!).unchecked.join(" "), /may\[0\].*known source/, "a missing response source remains unchecked");
	assert.match(responseForecast({ ...response, when: { active: "self" } }).unchecked.join(" "), /own-turn alternative not priced/);
	assert.match(responseForecast({ ...response, action: { procedure: { ...response.action.procedure, cost: { mana: "{0}" }, instructions: [{ do: "mana", who: "you", colors: ["G"] }] } } }).unchecked.join(" "), /mana-producing instructions/, "response readers can also invalidate the payment forecast");
	const unpricedResponse = paymentForecast(workFrame(beforeWitness, 0), { ...commitment, may: veil(beforeWitness) });
	assert.equal(unpricedResponse.payments.length, 1, "an unchecked response does not discard the ordered-line witness");
	assert.deepEqual(responseForecast({ label: "Optional pass", when: { active: "self" }, action: { option: "pass" } }).unchecked, [], "costless alternatives add no resource-warning noise");

	const three = matchup("arithmetic");
	place(three, 0, "battlefield", "Forest", "Forest", "Forest");
	main(three, 0, 3);
	place(three, 0, "hand", "Mossborn Hydra", "Snakeskin Veil");
	const unfunded: Plan = { objective: "Develop", guidance: "Use Veil if available", steps: [cast(three, "Mossborn Hydra")], may: veil(three) };
	assert.match(paymentForecast(workFrame(three, 0), unfunded).responses.join(" "), /may\[0\] \(Veil a targeted creature\): costs \{G\} but the steps before it leave no untapped source/);
	assert.deepEqual(budget(workFrame(three, 0), unfunded), [], "an unfunded optional response never refuses the payable ordered line");
	const mixed = structuredClone(three);
	const tunnel = establish(mixed, 0, "Escape Tunnel", [{ kind: "mana", basis: "{T}: Add {C}.", cost: { tap: true }, colors: ["C"] }]);
	const preserving = paymentForecast(workFrame(mixed, 0), unfunded);
	assert.deepEqual(preserving.responses, [], "prefer a Hydra payment that leaves green for Veil over one leaving only colorless");
	assert.ok(preserving.payments[0]!.funding.taps.some((tap) => tap.source.id === tunnel.id));
	assert.ok(preserving.payments[0]!.untappedManaSourcesAfter.some((ref) => mixed.things.get(ref.id)?.card === "Forest"));
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
	assert.match(paymentForecast(workFrame(three, 0), { ...unfunded, steps: [{ label: "Exact Hydra", when: now(three), action: { option: exact.id } }] }).responses.join(" "), /may\[0\].*costs \{G\}/);
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
	// A source played earlier in the line exists for its later activation.
	const passage = matchup("land-then-activate");
	main(passage, 0, 3);
	place(passage, 0, "hand", "Fabled Passage");
	editWork(passage, 0, [{ do: "package.put", package: { card: "Fabled Passage", registers: [] } }], "passage-package");
	const fetch: Plan = { objective: "Fetch a Forest", guidance: "Play the Passage, then activate it", steps: [land(passage, "Fabled Passage"),
		{ label: "Activate Fabled Passage", when: now(passage), action: { procedure: example("Crack Fabled Passage for a basic land") } }] };
	const passageBefore = structuredClone(passage), fetchForecast = paymentForecast(workFrame(passage, 0), fetch);
	assert.deepEqual(fetchForecast.conflicts, [], "the earlier land play supplies the activation source");
	assert.ok(fetchForecast.unchecked.length, "the sacrifice and resolved search remain outside the mana-only witness");
	assert.deepEqual(passage, passageBefore, "forecasting the entry changes no physical or private state");
	apply(passage, nextDecision(passage)!.options.find((one) => one.id.startsWith("land:") && one.objects?.some((ref) => passage.things.get(ref.id)?.card === "Fabled Passage"))!.id, "model", "chosen");
	assert.ok(procedureOptions(example("Crack Fabled Passage for a basic land"), workFrame(passage, 0), "check").length, "the forecasted fetch source really becomes available after the land play");
	const developing = matchup("cast-then-activate");
	place(developing, 1, "battlefield", "Mountain", "Mountain", "Mountain");
	main(developing, 1, 2);
	place(developing, 1, "hand", "Kellan, Planar Trailblazer");
	editWork(developing, 1, [{ do: "package.put", package: { card: "Kellan, Planar Trailblazer", printedCast: true, registers: [] } }], "kellan-package");
	const upgrade: Plan = { objective: "Cast and develop Kellan", guidance: "Pay for the cast before its activation", steps: [
		cast(developing, "Kellan, Planar Trailblazer"), { ...detective, when: now(developing) }] };
	const inHand = workFrame(developing, 1).view.objects!.find((one) => one.card === "Kellan, Planar Trailblazer" && one.zone === "hand")!;
	const followCard = { zones: ["battlefield"], ids: [inHand.id] };
	const futureAttack: Plan = { ...upgrade, steps: [...upgrade.steps, { label: "Attack with this card when eligible", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:", objects: followCard } }] };
	assert.deepEqual(planProblems(workFrame(developing, 1), futureAttack), [], "a visible card can be named before its future entry without inventing an incarnation");
	assert.deepEqual(select(followCard, workFrame(developing, 1)), [], "a future battlefield query does not treat the card in hand as entered");
	assert.match(planProblems(workFrame(developing, 1), { ...futureAttack, steps: [{ ...futureAttack.steps.at(-1)!, action: { prefix: "attack:", objects: { ids: ["unknown-card"] } } }] }).join(" "), /not identified/);
	const upgradeForecast = paymentForecast(workFrame(developing, 1), upgrade);
	assert.deepEqual(upgradeForecast.conflicts, []);
	assert.equal(upgradeForecast.payments.length, 2, "both the cast and the newly entered source's activation are priced");
	assert.equal(upgradeForecast.payments[1]!.source.incarnation, upgradeForecast.payments[0]!.source.incarnation + 2, "casting and resolution each change identity");
	assert.match(paymentForecast(workFrame(developing, 1), { ...upgrade, steps: [upgrade.steps[0]!, upgrade.steps[0]!] }).conflicts.join(" "), /already taken|hold no Kellan/, "entry cannot make the same card castable twice");
	announce(developing, printedCast("Kellan, Planar Trailblazer", developing.printed["Kellan, Planar Trailblazer"]!));
	passBoth(developing); finish(developing);
	const followed = select(followCard, workFrame(developing, 1));
	assert.deepEqual(followed.map((one) => [one.id, one.incarnation]), [[inHand.id, inHand.incarnation + 2]], "the intention follows the chosen card through cast and resolution");
	assert.deepEqual(select({ zones: ["battlefield"], refs: [{ id: inHand.id, incarnation: inHand.incarnation }] }, workFrame(developing, 1)), [], "an exact old incarnation still expires");
	assert.equal(followed[0]!.summoningSick, true, "binding a future card does not grant attack eligibility");
	const realUpgrade = procedureOptions(detective.action.procedure, workFrame(developing, 1), "check")[0]!;
	assert.ok(realUpgrade, "the actual cast leaves enough mana for the newly entered creature's activation");
	assert.deepEqual(realUpgrade.activation.source, upgradeForecast.payments[1]!.source);
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

test("a held payment still carries out its matching step or branch and preserves its policy", () => {
	const table = matchup("sparing");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	const [kept] = cardsIn(table, "battlefield", 0).filter((one) => one.card === "Forest");
	const step: PlanOption = { label: "Cast Llanowar Elves", purpose: "Resolve the chosen Elf cast.", when: { ...turn3, step: "precombat-main" }, action: { prefix: "cast:", objects: { card: "Llanowar Elves" } } };
	for (const branch of [false, true]) {
		const position = structuredClone(table);
		editWork(position, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", holds: [{ objects: { refs: [{ id: kept!.id, incarnation: kept!.incarnation }] }, purpose: "Snakeskin Veil" }],
			steps: branch ? [] : [step], ...(branch ? { may: [step] } : {}) } }], "plan");
		const frame = workFrame(position, 0), state = planState(frame)!, fit = (branch ? state.branches : state.due)[0]!;
		const physical = frame.decision!.options.filter((one) => one.use?.timing === "spell");
		assert.equal(fit.candidates.length, 2, "both matching payments carry out the commitment");
		assert.deepEqual(fit.candidates.map((one) => one.id), physical.map((one) => one.id), "holds preserve canonical payment order");
		const marked = annotate(physical, state);
		assert.ok(marked.every((one) => one.shows?.includes(branch ? "Plan branch:" : "Plan step 1") && one.shows.includes(step.purpose!)));
		assert.equal(marked.filter((one) => one.shows?.includes("Uses Forest, held:")).length, 1);
		const packet = focus(frame, startingIntent(0));
		assert.deepEqual(packet.options.filter((one) => one.use).map((one) => one.id), physical.map((one) => one.id));
		assert.deepEqual(new Set(packet.options.map((one) => one.id)), new Set(frame.decision!.options.map((one) => one.id)), "every original option remains reachable");
		for (const pick of fit.candidates) {
			const chosen = structuredClone(position), carried = execution(state, pick.id);
			assert.deepEqual(carried, branch ? { plan: state.revision, branch: 0 } : { plan: state.revision, step: 0 });
			apply(chosen, pick.id, "model", "chosen", carried);
			assert.deepEqual(workFrame(chosen, 0).view.done, branch ? [] : [0], "either payment records the actual commitment");
			assert.equal(project(chosen, 0).purposes![0]!.use, step.purpose, "resolution retains the step or branch policy");
		}
		frame.view.work!.plan!.holds![0]!.releaseWhen = { amount: { life: "you" }, atLeast: 0 };
		const released = planState(frame)!;
		assert.deepEqual((branch ? released.branches : released.due)[0]!.candidates, fit.candidates);
		assert.ok(annotate(physical, released).every((one) => !one.shows?.includes("held:")), "release removes only the hold warning");
	}
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
	assert.deepEqual(plain.plan!.script!.steps, ["Now: Play a Forest", "Then: Crack Fabled Passage"], "steps supply order without authored narrative");
	assert.equal(plain.plan!.script!.completion, undefined, "an absent completion policy grants no pass");
	assert.deepEqual(plain.guidance, ["Develop before combat."]);
	const scoped = { ...line, throughTurn: 4, objective: "Yesterday's objective", guidance: "Yesterday's tactical story",
		phases: [{ when: { active: "any" as const }, guidance: "Yesterday's phase policy", complete: "pass" as const }],
		holds: [{ objects: { card: "Forest" }, purpose: "Yesterday's reserve" }] };
	editWork(table, 0, [{ do: "plan.put", plan: scoped }], "finite-plan");
	const live = focus(workFrame(table, 0), startingIntent(0));
	assert.doesNotMatch(JSON.stringify(live), /Yesterday's (objective|tactical story)/, "audit rationale never instructs the pilot");
	assert.ok(live.plan!.script!.completion!.some((one) => one.includes("choose its pass")));
	const repair = basePlan(workFrame(table, 0));
	assert.equal(repair.throughTurn, 4);
	assert.deepEqual(repair.steps[0]!.when, line.steps[0]!.when, "repairs preserve original window bounds");
	main(table, 1, 4);
	const next = basePlan(workFrame(table, 0), undefined, true, initialPlan(brief));
	assert.equal(next.throughTurn, 6);
	assert.doesNotMatch(JSON.stringify(next), /Yesterday/, "fresh preparation carries the playbook, never tactical work");
	assert.deepEqual(next.steps, []);
	main(table, 0, 5, "upkeep");
	const expired = workFrame(table, 0), upkeep = focus(expired, startingIntent(0), { brief: { ...brief, steps: { upkeep: { own: "Apply the standing upkeep response policy." } } } });
	assert.equal(planState(expired), null, "expiry covers holds, stops, steps and unbounded phase policies before draw replanning");
	assert.equal(upkeep.plan, undefined);
	assert.deepEqual(upkeep.guidance, ["Apply the standing upkeep response policy."]);
	assert.doesNotMatch(JSON.stringify(upkeep), /Yesterday/);
	assert.doesNotMatch(JSON.stringify(basePlan(expired)), /Yesterday/);
	assert.ok(expired.view.work!.packages!.some((one) => one.card === "Sazh's Chocobo"), "package corrections outlive their tactical plan");
	assert.equal(table.work[0]!.plan!.guidance, scoped.guidance, "expiry changes no recorded work");
	const legacy = structuredClone(expired); delete legacy.view.work!.plan!.throughTurn;
	assert.ok(planState(legacy), "legacy journals retain their unbounded semantics");
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
	assert.match(seen[0]!, /Prepare your next turn: turn 5 on the table counter, your own turn 3, while the opponent plays turn 4/);
	assert.match(seen[1]!, /This turn has no ordered actions/, "a preparation must choose a line or an explicit pass");
	const [sent, work] = (JSON.parse(seen[0]!) as { content: string }[]).map((one) => one.content);
	const read = readDossier(sent!);
	assert.ok(read.forecast && /^- Observed now: .+'s turn 4, /m.test(sent!), "the forecast is labelled before anything else, with the observed window");
	assert.deepEqual([read.turn, read.mine, read.step], [5, true, "upkeep"]);
	assert.ok(!/Drawn this turn/.test(sent!), "the prior own-turn draw does not enter the forecast");
	assert.match(sent!, /Steps left this turn, in order: upkeep, draw, /);
	const yours = sent!.split("### Yours")[1]!.split("\n### ")[0]!;
	assert.match(yours, new RegExp(`\\| ${forest.id}@\\d+ \\|[^\\n]*\\| untapped`), "the forecast untaps your permanents without touching the table");
	assert.ok(!yours.includes("summoning-sick"), "the roster uses the labelled forecast, not the observed opponent-turn restriction");
	assert.match(sent!.split("## Mana")[1]!, new RegExp(`\\(${forest.id}@${forest.incarnation}\\) makes`));
	assert.ok(!work!.includes("## Choices offered now"), "current opponent-turn choices do not masquerade as next-turn offers");
	assert.ok(!/### Turn 5/.test(sent!), "events on this turn are observations, not events on the forecast turn");
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
	const fetch = example("Crack Fabled Passage for a basic land"), futureTable = matchup("future-fetch");
	main(futureTable, 0, 3); place(futureTable, 0, "hand", "Fabled Passage");
	editWork(futureTable, 0, [{ do: "package.put", package: { card: "Fabled Passage", registers: [], procedures: [fetch] } }], "fetch-use");
	const future = workFrame(futureTable, 0), beforeFuture = structuredClone(future), futureActions = actions(future);
	const fetchKey = Object.keys(futureActions).find((key) => futureActions[key]!.label === fetch.claim)!;
	const futureUse = actionFacts(future, futureActions)[fetchKey] as { sourcesNow: unknown[]; visibleSources: { zone: string }[]; availability: string; cost: unknown };
	assert.deepEqual(futureUse.sourcesNow, [], "accepted uses of a hand card are not offered battlefield activations");
	assert.ok(futureUse.visibleSources.every((one) => one.zone === "hand"));
	assert.match(futureUse.availability, /No permitted source now/);
	assert.deepEqual(futureUse.cost, { ...fetch.cost, mana: "{0}" });
	assert.ok(!future.decision!.options.some((one) => one.use?.claim === fetch.claim), "describing future equipment creates no move");
	const concealed = structuredClone(future);
	concealed.view.objects = concealed.view.objects!.filter((one) => one.card !== "Fabled Passage");
	assert.equal(actionFacts(concealed, futureActions)[fetchKey], undefined, "registered equipment alone does not invent a visible future source");
	const dead = structuredClone(future);
	for (const one of dead.view.objects!.filter((one) => one.card === "Fabled Passage")) one.zone = "graveyard";
	assert.equal(actionFacts(dead, futureActions)[fetchKey], undefined, "a graveyard copy without a return or play permission is not a future battlefield source");
	const graveUse = { ...fetch, source: { ...fetch.source, zones: ["graveyard" as const] } };
	assert.ok(actionFacts(dead, { grave: { label: "Accepted graveyard use", action: { procedure: graveUse } } }).grave, "uses accepted from the graveyard stay visible");
	establish(futureTable, 0, "Icetill Explorer");
	const permitted = workFrame(futureTable, 0);
	for (const one of permitted.view.objects!.filter((one) => one.card === "Fabled Passage")) one.zone = "graveyard";
	assert.ok(actionFacts(permitted, futureActions)[fetchKey], "a permitted graveyard land can supply a future battlefield activation");
	assert.deepEqual(future, beforeFuture, "describing future sources preserves the projected frame");
	const warped = frame.decision!.options.find((one) => one.use?.claim === warp.claim)!;
	assert.ok(warped?.use);
	const planningOffers = planningChoices(frame).uses as { claim: string; notes: string[] }[];
	assert.ok(planningOffers.find((one) => one.claim === warp.claim)!.notes.some((note) => note.includes("Flying, haste")), "grouped casting modes preserve the accepted entry abilities, not just empty casting instructions");
	const stale: Plan = { objective: "o", guidance: "g", steps: [{ label: "Old payment", when: now, action: { option: `${warped.id}-obsolete` } }] };
	assert.equal(bindingFacts(frame, stale).unoffered[0]!.option, `${warped.id}-obsolete`);
	assert.deepEqual(bindingFacts(frame, { ...stale, steps: [{ ...stale.steps[0]!, when: { active: "opponent", step: "end" } }] }).unoffered, [], "future windows are not diagnosed as current failures");

	assert.deepEqual(budget(frame, { objective: "o", guidance: "g", steps: [{ label: "Warp", when: now, action: { option: warped.id } }] }), [], "a locked warp costs three, not the printed five");
	const sheet = dossier({ frame });
	const handTable = sheet.split("## Your hand")[1]!.split("\n## ")[0]!, fieldTable = sheet.split("## Battlefield")[1]!.split("\n## ")[0]!;
	assert.match(handTable, /\| Emberheart Challenger \|/);
	assert.doesNotMatch(fieldTable.split("### ")[1]!, /Emberheart Challenger/, "a card available to cast is not already a battlefield attacker");
	const texts = cardTexts(sheet);
	assert.equal(texts.get("Nova Hellkite"), frame.view.printed!["Nova Hellkite"]!.oracle);
	assert.match(texts.get("Nova Hellkite")!, /Flying, haste/);
	assert.equal(sheet.split("\n#### Nova Hellkite\n").length, 2, "each card's text appears once");
	for (const name of new Set(frame.view.objects!.flatMap((one) => one.card ? [one.card] : []))) assert.ok(texts.has(name), `every visible identity keeps its complete printed definition: ${name}`);
	assert.match(sheet, new RegExp(`^- Life: you ${frame.view.players!.find((one) => one.id === frame.seat)!.life}, `, "m"));
	const warpFacts = planningChoices(frame).uses.find((one: { claim: string }) => one.claim === warp.claim)!;
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
	// Without the Village, both Mountains pay for the creature and Shock is unfunded.
	commit(table, [{ do: "move", what: cardsIn(table, "battlefield", 1).find((one) => one.card === "Rockface Village")!.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.match(paymentForecast(workFrame(table, 1), plan).responses.join(" "), /may\[0\] \(Shock a blocker\): costs \{R\} but the steps before it leave no untapped source/);
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

test("one unfinished preparation is awaited at upkeep or draw without a second planner or note race", async () => {
 for (const deadline of ["upkeep", "precombat-main"]) {
 const table = position(); main(table, 0, 3);
 editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", ...(deadline === "upkeep" ? { throughTurn: 4 } : {}), steps: [] } }], "planned");
 main(table, 1, 4);
 let finish: (value: Prepared) => void = () => {};
 let amended = 0, resolved = false, prepared = 0;
 const waits: Planned[] = [];
 const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
  prepare: () => { prepared++; return new Promise((resolve) => { finish = resolve; }); },
  plan: async (_frame, made, changed) => {
   amended++;
   if (deadline === "upkeep") { assert.equal(made, undefined, "the installed line is the base"); assert.match(changed!.join(" "), /Emberheart Challenger.*you drew/, "the one review reads the opponent's turn and the draw together"); return { tools: [{ do: "plan.keep", reason: "Still fits." }] }; }
   assert.equal(made!.plan.objective, "Ready."); return { tools: [{ do: "plan.put", plan: made!.plan }] };
  },
  onPlanned: (one) => waits.push(one) });
 seat.observe(workFrame(table, 0));
 await new Promise((resolve) => setImmediate(resolve));
 if (deadline === "upkeep") place(table, 1, "battlefield", "Emberheart Challenger");
 // A response repair on the opponent's turn changes the standing plan, not the preparation.
 editWork(table, 0, [{ do: "plan.put", plan: { objective: "Respond.", guidance: "g", ...(deadline === "upkeep" ? { throughTurn: 4 } : {}), steps: [] } }], `repair-${deadline}`);
 seat.observe(workFrame(table, 0));
 assert.equal(prepared, 1, "the background preparation survives a response repair");
 main(table, 0, 5, deadline);
 const answer = seat.answer(workFrame(table, 0)).then((value) => { resolved = true; return value; });
 await new Promise((resolve) => setImmediate(resolve));
 assert.equal(resolved, false); assert.equal(amended, 0, "unfinished work does not start a competing writer");
 finish({ plan: { objective: "Ready.", guidance: "Pass", steps: [] } });
 const first = await answer;
 assert.equal(first.kind, "work");
 if (deadline === "upkeep") {
  assert.equal(amended, 0, "a sound preparation stands through a plain upkeep without a writer call");
  assert.equal(waits[0]!.how, "prepared");
  if (first.kind === "work") editWork(table, 0, first.tools, first.actionId, first.revision);
  main(table, 0, 5, "precombat-main");
  const review = await seat.answer(workFrame(table, 0));
  assert.equal(review.kind, "work");
  assert.equal(amended, 1, "the changed blocker and the draw get one review after the draw");
  assert.ok(installable(workFrame(table, 0), { objective: "o", guidance: "g", steps: [] }) === false, "only a plain upkeep installs without review");
 } else assert.equal(amended, 1, "a changed blocker or uncovered draw gets one amendment");
 assert.equal(waits[0]!.ready, false); assert.ok(waits[0]!.waitedMs >= 0);
 const timing = waits[0]!.preparation!;
 assert.equal(timing.fromTurn, 4);
 assert.ok(timing.queuedAt <= timing.startedAt! && timing.startedAt! <= timing.neededAt! && timing.neededAt! <= timing.finishedAt!, "queue, background work and acceptance wait are separately measured");
 await seat.close();
 // A resumed scoped turn has no process-local job; the same writer uses current facts.
 if (deadline === "upkeep") {
  let written = 0;
  const resumed = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
   plan: async (frame, made) => { written++; assert.equal(made, undefined); assert.ok(frame.view.objects!.some((one) => one.card === "Emberheart Challenger")); return { tools: [{ do: "plan.keep", reason: "Retain the standing policy." }] }; } });
  const reply = await resumed.answer(workFrame(table, 0)); assert.equal(reply.kind, "work");
  if (reply.kind === "work") editWork(table, 0, reply.tools, reply.actionId, reply.revision);
  assert.equal(written, 1); assert.equal(planDue(workFrame(table, 0)), false);
  await resumed.close();
 }
 }
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
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: { assessment: "Opponent at 20; no attackers; develop.", ...plan } }], stopReason: "toolUse" }) }; };
	const { tools } = await planWork(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.equal(seen.length, 2, "refused once, then accepted");
	assert.match(seen[1]!, /costs \{2\}\{G\}/);
	assert.deepEqual(tools, [{ do: "plan.put", plan: { ...plan, throughTurn: 4 } }])
	assert.ok(!JSON.stringify(tools).includes("assessment"), "the written assessment never enters the plan or the pilot's packet");
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

	// Without unrestricted red, Shock is an unfunded response, not a failed Smaug cast.
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
	assert.match(paymentForecast(workFrame(red, 1), plan).responses.join(" "), /may\[0\] \(Shock a blocker\): costs \{R\}/);
	assert.deepEqual(budget(workFrame(red, 1), plan), []);
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

	// An instant-speed continuation can explicitly wait for landfall, across amendments.
	const green = position(); main(green, 0, 3);
	const fetch: PlanOption = { ...line.steps[1]!, waitFor: "empty-stack", purpose: "Find a Forest after landfall resolves." };
	const { waitFor: _wait, ...stackedFetch } = fetch;
	const end: PlanOption = { label: "Pass after the fetch", when: window, action: { option: "pass" } };
	editWork(green, 0, [{ do: "plan.put", plan: { ...line, steps: [line.steps[0]!, fetch, end],
		may: [{ ...stackedFetch, label: "Fetch in response", if: { amount: { count: { zones: ["stack"], controller: "you" } }, atLeast: 1 } }] } }], "wait-line");
	const landState = planState(workFrame(green, 0))!, land = landState.due[0]!.candidates[0]!;
	apply(green, land.id, "model", "chosen", execution(landState, land.id));
	assert.equal(nextDecision(green)!.situation, "trigger-order");
	apply(green, nextDecision(green)!.options[0]!.id, "model", "chosen");
	const pending = workFrame(green, 0), pendingState = planState(pending)!;
	assert.equal(pendingState.due[0]!.waiting, true);
	assert.ok(pendingState.due[0]!.candidates.length, "waiting leaves the physical activation available");
	assert.equal(checklist(pending).find((one) => one.id === "step:1")!.status, "waiting");
	assert.equal(checklist(pending).find((one) => one.id === "step:2")!.status, "later", "waiting cannot promote a later commitment");
	assert.equal(checklist(pending).find((one) => one.id === "branch:0")!.status, "available", "a branch can deliberately respond to our own stack");
	const waitingBranch = structuredClone(pending); waitingBranch.view.work!.plan!.may![0]!.waitFor = "empty-stack";
	assert.equal(checklist(waitingBranch).find((one) => one.id === "branch:0")!.status, "waiting", "branches can also choose a prerequisite");
	const waitingPacket = focus(pending, startingIntent(0));
	assert.equal(waitingPacket.plan!.due, undefined);
	assert.ok(waitingPacket.plan!.script!.steps.some((one) => one.startsWith("Waiting for the stack to empty: Crack")));
	assert.equal(waitingPacket.plan!.script!.completion, undefined, "waiting grants no pass");
	const marked = annotate(pending.decision!.options, pendingState);
	assert.ok(marked.some((one) => one.shows?.includes("Plan step 2") && one.shows.includes("Waiting for the stack to empty") && one.shows.includes(fetch.purpose!)));
	assert.ok(pending.decision!.options.every((one) => marked.some((listed) => listed.id === one.id)), "every physical option remains reachable");
	const early = structuredClone(green), use = pendingState.procedures.find((one) => pendingState.due[0]!.candidates.some((pick) => pick.id === one.option.id))!;
	activate(early, use.activation, { picked: use.option.id, offered: marked.map((one) => one.id), by: "model", why: "chosen", execution: execution(pendingState, use.option.id) });
	assert.deepEqual(workFrame(early, 0).view.done, [0, 1], "an early choice still records the actual activation");
	assert.ok(project(early, 0).purposes!.some((one) => one.use === fetch.purpose));
	const amended = basePlan(pending);
	assert.equal(amended.steps[0]!.waitFor, "empty-stack");
	editWork(green, 0, [{ do: "plan.put", plan: amended }], "amend-wait");
	assert.equal(planState(workFrame(green, 0))!.due[0]!.waiting, true, "the first retained step waits after a revision reset");
	const response = responseChanges(pending, amended, { current: [{ label: "Fetch later", action: { prefix: "use:" }, waitFor: "empty-stack" }] });
	assert.equal(response.steps[0]!.waitFor, "empty-stack", "response replacements can choose the same prerequisite");
	const stacked = structuredClone(green);
	place(stacked, 0, "hand", "Snakeskin Veil");
	editWork(stacked, 0, [{ do: "plan.put", plan: { objective: "Respond in order", guidance: "Announce both above the pending landfall.", steps: [
		{ label: "Veil the Chocobo", when: window, action: { procedure: example("Cast Snakeskin Veil") } }, stackedFetch] } }], "stacked-response");
	const responseState = planState(workFrame(stacked, 0))!;
	assert.equal(responseState.due[0]!.waiting, undefined, "a fresh response can act on a preexisting stack");
	const veil = responseState.procedures.find((one) => responseState.due[0]!.candidates.some((pick) => pick.id === one.option.id))!;
	activate(stacked, veil.activation, { picked: veil.option.id, offered: [veil.option.id], by: "model", why: "chosen", execution: execution(responseState, veil.option.id) });
	assert.equal(checklist(workFrame(stacked, 0)).find((one) => one.id === "step:1")!.status, "available", "a second ordered response can go above the first without an empty-stack prerequisite");
	const scratch = mkdtempSync(join(tmpdir(), "stack-wait-"));
	try {
		const header: Header = { id: "stack-wait", format: standard.name, seed: green.rng.seed, seats: green.seats.map(({ id, name, deck }) => ({ id, name, deck })),
			cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(scratch, "parent.jsonl"), header); save(journal, green);
		const child = join(scratch, "child.jsonl"); fork(journal.path, green.ledger.length, "child", child);
		for (const path of [journal.path, child]) assert.deepEqual(planState(workFrame(replay(path, () => position()).table, 0)), planState(workFrame(green, 0)), "replay and cloning derive the same wait");
	} finally { rmSync(scratch, { recursive: true, force: true }); }
	passBoth(green); finish(green);
	const resolved = workFrame(green, 0);
	assert.equal(checklist(resolved).find((one) => one.id === "step:0")!.status, "available");
	assert.ok(focus(resolved, startingIntent(0)).plan!.script!.steps[0]!.startsWith("Now:"), "the same commitment becomes Now after resolution");

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

test("a counter on a permanent is a change, and a draw is covered only by a step or branch that takes it", async () => {
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
	const covered = position(); main(covered, 0, 3, "upkeep");
	const [opposing] = place(covered, 1, "battlefield", "Mountain");
	commit(covered, [{ do: "tap", what: opposing!.id }], "resolve");
	const policy: Plan = { objective: "Use a covered draw", guidance: "Keep the accepted line", throughTurn: 4,
		steps: [{ label: "Finish main", when: { active: "self", step: "precombat-main" }, action: { option: "pass" } }],
		may: Object.keys(covered.seats[0]!.deck.main).map((card) => ({ label: `Use ${card} if drawn`, when: { active: "self", step: "precombat-main" },
			if: { amount: { count: { zones: ["hand"], name: card } }, atLeast: 1 }, action: { objects: { zones: ["hand"], card } } })) };
	editWork(covered, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: policy }], "upkeep-policy");
	const accepted = workFrame(covered, 0);
	main(covered, 0, 3, "draw");
	const current = workFrame(covered, 0);
	assert.equal(coveredDraw(accepted, current), true, "an opponent's already-tapped permanent is unchanged across our draw");
	for (const change of [
		(one: Frame) => { one.view.work!.request = "Changed line"; },
		(one: Frame) => { one.view.work!.plan!.may = []; },
		(one: Frame) => { one.view.work!.plan!.may!.forEach((branch) => { branch.when.step = "upkeep"; }); },
		(one: Frame) => { one.view.objects!.find((card) => card.zone === "battlefield")!.tapped = true; },
		(one: Frame) => { one.view.objects!.find((card) => card.zone === "battlefield")!.counters.extra = 1; },
		(one: Frame) => { one.view.players![1]!.hand!++; },
		(one: Frame) => { one.view.objects!.push({ ...one.view.objects![0]!, id: "new-blocker" }); },
		(one: Frame) => { one.decision!.situation = "trigger-order"; },
	]) {
		const changed = structuredClone(current); change(changed);
		assert.equal(coveredDraw(accepted, changed), false, "a changed position or uncovered draw retains the writer");
	}
	let calls = 0;
	const pilot = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
		plan: async () => { calls++; return { tools: [{ do: "plan.put", plan: policy }] }; } });
	pilot.observe(accepted);
	const before = structuredClone(covered), answer = await pilot.answer(current);
	assert.equal(calls, 0);
	assert.equal(answer.kind, "work");
	if (answer.kind !== "work") throw new Error("Expected retained work");
	assert.equal(answer.tools[0]!.do, "plan.keep");
	assert.deepEqual(covered, before, "the seat returns work without changing the table");
	const kept = prepareWork(current, answer.tools);
	assert.equal(kept.planned, current.view.work!.planned, "keeping the plan preserves ledger credit");
	assert.equal(planDue({ ...current, view: { ...current.view, work: kept } }), false);
	pilot.reset!();
	await pilot.answer(current);
	assert.equal(calls, 1, "without the acceptance observation, resume or reset asks the writer");
	await pilot.close();
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
	const invalid = structuredClone(responding), object = invalid.view.objects![0]!;
	invalid.view.done = [];
	invalid.view.work!.request = "Repair this response.";
	invalid.view.work!.plan = { ...preserved, throughTurn: 6, steps: [{ label: "Old incarnation", when: { active: "self", step: "declare-attackers" },
		action: { prefix: "attack:", objects: { refs: [{ id: object.id, incarnation: object.incarnation + 100 }] } } }] };
	const beforeRepair = structuredClone(invalid);
	const stream: Stream = (_model, request) => {
		const submit = request.tools!.find((one) => one.name === "submit")!.parameters as { properties: Record<string, unknown> };
		assert.ok("steps" in submit.properties && !("current" in submit.properties), "an invalid inherited step needs the full editor, even during an opponent response");
		assert.match(JSON.stringify(request.messages), /outside this window/);
		assert.match(JSON.stringify(request.messages), /assessment first, then the full plan fields/);
		assert.doesNotMatch(JSON.stringify(request.messages), /assessment first, then current/);
		return { result: async () => ({ content: [{ type: "toolCall", id: "repair", name: "submit", arguments: { assessment: {},
			steps: [{ label: "Pass now", when: { active: "opponent", step: "precombat-main", fromTurn: 6, throughTurn: 6 }, action: { option: "pass" } }] } }], stopReason: "toolUse" }) };
	};
	const repaired = await planWork(invalid, {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally() }));
	assert.doesNotThrow(() => prepareWork(invalid, repaired.tools), "the seat can explicitly remove stale work outside the current window");
	assert.deepEqual(invalid, beforeRepair, "offering full edits never repairs or rebinds a source on the seat's behalf");
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 const closing = seat.close(); assert.equal(signals[1]!.aborted, true);
 finishes[1]!({ plan: line }); await closing;
 seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
 assert.equal(signals.length, 2, "closed seats start nothing more");

	// Exercise the real preparation pipeline with a provider that never finishes.
	// Cancellation must stop the focused questions or the branches before the coordinator starts.
	for (const stage of ["survey", "branch"] as const) {
		const pending: AbortSignal[] = [], calls = tally();
		let coordinated = 0;
		const stream: Stream = (_model, request, options) => {
			const schema = request.tools!.find((one) => one.name === "submit")!.parameters as { properties: Record<string, unknown> };
			const survey = "findings" in schema.properties;
			if (stage === "branch" && survey) return { result: async () => ({ content: [{ type: "toolCall", id: "finding", name: "submit", arguments: { findings: [] } }], stopReason: "toolUse" }) };
			if (!survey && !("line" in schema.properties) && !("ledger" in schema.properties)) coordinated++;
			pending.push(options!.signal!);
			return { result: () => new Promise(() => {}) };
		};
		const planner = reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: calls });
		const pilot = aiSeat({ name: "Cancellation", api: {} as never, intent: startingIntent(0), onGap: assert.fail,
			prepare: (frame, signal) => prepareTurn(frame, { survey: true }, planner, signal) });
		pilot.observe(workFrame(table, 0));
		await new Promise((resolve) => setImmediate(resolve));
		assert.ok(pending.length > (stage === "survey" ? 1 : 0), `${stage} calls began`);
		await pilot.close();
		assert.ok(pending.every((signal) => signal.aborted), `closing cancels every ${stage} request`);
		assert.equal(coordinated, 0, "a canceled round cannot launch the coordinator");
		assert.ok(calls.spent().every((call) => !call.pending), "canceled attempts settle in the bill");
	}
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
	assert.match((JSON.parse(seen[0]!) as { content: string }[])[0]!.content, /## Your notebook\n[\s\S]*?> opponent: /, "the notebook is part of the dossier");
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
 assert.match(seen[0]!.messages, /Your next turn is prepared separately, so do not write its line/);
 assert.deepEqual(seen[0]!.tools.sort(), ["card", "combat", "equipment", "example", "matchup_examples", "odds", "rule", "submit", "syntax"]);
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

test("a hold can end at a window, and object queries accept the writer's you", () => {
	const base: Plan = { objective: "o", guidance: "g", steps: [] };
	const changed = changedPlan(base, { holds: [{ objects: { zones: ["battlefield"], controller: "you", card: "Mountain" }, purpose: "Burst after blocks", releaseWhen: { active: "self", step: "declare-blockers" } }],
		steps: [{ label: "Attack", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:", objects: { zones: ["battlefield"], controller: "you" } } }] }, {});
	assert.deepEqual(changed.holds![0]!.releaseAt, { active: "self", step: "declare-blockers" }, "a window under releaseWhen becomes releaseAt");
	assert.equal(changed.holds![0]!.releaseWhen, undefined);
	assert.equal(changed.holds![0]!.objects.controller, "self");
	assert.equal("action" in changed.steps[0]! && "objects" in changed.steps[0]!.action ? changed.steps[0]!.action.objects!.controller : undefined, "self");
	const moves = changedPlan(base, { steps: [
		{ label: "Block the Hydra", when: { active: "opponent" }, action: { prefix: "block:", objects: { zones: ["battlefield"], controller: "self" }, purpose: "Chump only if lethal." } },
		{ label: "Attack", when: { active: "self", phase: "combat" }, action: { prefix: "attack:", objects: { zones: ["battlefield"], controller: "self" } } },
		{ label: "Land", when: { active: "self" }, action: { prefix: "land:", objects: { zones: ["hand"], card: "Mountain" } } }] }, {});
	assert.equal(moves.steps[0]!.when.step, "declare-blockers", "a block has one step it can happen in");
	assert.equal(moves.steps[0]!.purpose, "Chump only if lethal.", "purpose written inside the action belongs to the step");
	assert.deepEqual(moves.steps[1]!.when, { active: "self", step: "declare-attackers" });
	assert.equal(moves.steps[2]!.when.step, undefined, "a land play has two possible windows and keeps the one written");
	const at = (active: number, step: string) => ({ seat: 0, view: { window: { kind: "turn" as const, turn: 3, active, step: step as never, phase: "combat" as never } } });
	assert.equal(reached({ active: "self", step: "declare-blockers" }, at(0, "declare-attackers")), false, "before its step the hold stands");
	assert.equal(reached({ active: "self", step: "declare-blockers" }, at(0, "declare-blockers")), true);
	assert.equal(reached({ active: "self", step: "declare-blockers" }, at(0, "end")), true, "any later step this turn has reached it");
	assert.equal(reached({ active: "self", step: "declare-blockers" }, at(1, "end")), false, "the other seat's turn is not the named window");
	assert.equal(reached({ active: "self", phase: "combat" }, at(0, "begin-combat")), true, "a phase begins at its first step");
});

test("focused questions rate findings, branches follow each first action in parallel, and the coordinator weighs them", async () => {
	const table = matchup("survey");
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Mossborn Hydra", "Forest");
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "Prior tactical conclusion", guidance: "Prior payment assumption", steps: [] } },
		{ do: "plan.request", reason: "Plan the turn." }], "request");
	const before = structuredClone(table);
	const questions: string[] = [], outlooks: string[] = [], branches: string[] = [], writer: string[] = [], coordinated: string[] = [];
	const stream: Stream = (_model, request) => {
		const submit = request.tools?.find((one) => one.name === "submit")?.parameters as { properties: Record<string, unknown> } | undefined;
		const reply = (args: Record<string, unknown>) => ({ result: async () => ({ content: [{ type: "toolCall", id: "c", name: "submit", arguments: args }], stopReason: "toolUse" }) });
		if (submit && "findings" in submit.properties) { questions.push(JSON.stringify(request.messages)); return reply({ findings: [{ kind: "opportunity", what: "Hydra: 2 + 1 = 3 sources pay {2}{G}.", relevance: questions.length % 5 + 1, when: "now" }] }); }
		if (submit && "line" in submit.properties) { outlooks.push(JSON.stringify(request.messages)); return reply({ line: ["Play Forest", "Cast Mossborn Hydra"], hold: "none", opponentTurn: "Block with Hydra", risks: "none", outcome: "20 to 20", confidence: 3 }); }
		if (submit && "ledger" in submit.properties) { branches.push(JSON.stringify(request.messages)); return reply({ ledger: ["Play Forest: one land entry."], attackers: "None.", damage: branches.length, theirLife: 20 - branches.length }); }
		writer.push(JSON.stringify(request.messages)); coordinated.push(JSON.stringify(submit));
		return reply({ assessment: { corrections: "none", adopted: "planner", win: "No attackers.", priorities: ["Develop"] },
			...(submit && "current" in submit.properties ? { current: [{ label: "Pass now", action: { option: "pass" } }] }
				: { steps: [{ label: "Pass", when: { active: "self", step: "precombat-main" }, action: { option: "pass" } }] }) });
	};
	const brief = { ...emptyBrief(0), route: "Pregame growth expertise" };
	await planWork(workFrame(table, 0), { survey: true, brief }, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	const hand = new Set(cardsIn(table, "hand", 0).map((one) => one.card));
	for (const card of hand) assert.ok(questions.some((one) => one.includes(`Your card ${card}.`)), `a focused question for ${card}`);
	for (const kind of ["The opponent.", "Their next attack.", "Removal."]) assert.ok(questions.some((one) => one.includes(kind)), kind);
	for (const kind of ["Your whole attack this turn,", "Orders of operations", "Your other resources."]) assert.ok(!questions.some((one) => one.includes(kind)), `branches replace ${kind}`);
	assert.equal(outlooks.length, 0, "an own turn branches on first actions instead of asking six outlooks");
	assert.ok(branches.some((one) => one.includes("Commit to this first action this turn: Play Forest from hand.")), "each land play is a first action");
	const [doc, work] = (JSON.parse(writer[0]!) as { content: string }[]).map((one) => one.content);
	const facts = dossier({ frame: planningFrame(workFrame(table, 0), "turn"), brief }, "analyst");
	for (const asked of [...questions, ...branches]) {
		const seen = (JSON.parse(asked) as { content: string }[])[0]!.content;
		assert.equal(seen, facts, "every analyst reads the same projected facts");
		assert.ok(seen.includes("Pregame growth expertise") && !seen.includes("## Your standing plan") && !seen.includes("Prior tactical conclusion"), "analysts receive matchup advice without earlier tactical conclusions");
	}
	assert.ok(doc!.startsWith(facts) && doc!.includes("Prior tactical conclusion"), "the coordinator keeps the same facts and the prior intent it must reconcile");
	assert.ok(work!.indexOf("## Branches from each first action") < work!.indexOf("## Findings from focused questions") && work!.indexOf("## Findings from focused questions") < work!.indexOf("## Your request"), "analysts' work comes before the request, which comes last");
	const claimed = [...work!.matchAll(/Claims (\d+) damage/g)].map((match) => Number(match[1]));
	assert.deepEqual(claimed, [...claimed].sort((a, b) => b - a), "branches arrive ordered by the damage they claim");
	const ranks = [...work!.matchAll(/^\d+\. Relevance (\d)/gm)].map((match) => Number(match[1]));
	assert.deepEqual(ranks, [...ranks].sort((a, b) => b - a), "findings arrive ranked by relevance");
	assert.match(coordinated[0]!, /adopted/, "the coordinator records which reports it adopts");
	assert.deepEqual(table, before, "asking questions changes nothing on the table");
	const missingFields: Stream = (_model, request) => {
		assert.equal(request.tools?.[0]?.name, "submit");
		return { result: async () => ({ content: [{ type: "toolCall", id: "missing", name: "submit", arguments: { line: ["Pass", "hold", "none"] } }], stopReason: "toolUse" }) };
	};
	const malformed = await perspectiveReports(facts, { findings: [] }, reasoner({ role: "strategy", stream: missingFields,
		model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.equal(Object.keys(malformed.reports).length, 0, "a partial line list is not a complete outlook report");
	assert.equal(malformed.failed?.length, 6, "every unanswered outlook reaches the coordinator as a failure");
	assert.doesNotMatch(reportsSection(malformed), /Hold: undefined|Outcome: undefined/, "missing report fields never become invented advice");
	let findingAttempts = 0;
	const invalidRank: Stream = (_model, request) => {
		findingAttempts++;
		if (findingAttempts === 2) assert.match(JSON.stringify(request.messages), /relevance/, "the repair names the malformed ranking field");
		return { result: async () => ({ content: [{ type: "toolCall", id: `rank-${findingAttempts}`, name: "submit", arguments: {
			findings: [{ kind: "opportunity", what: "No cast required.", relevance: findingAttempts === 1 ? ":4" : 4, when: "now" }],
		} }], stopReason: "toolUse" }) };
	};
	const repairedFindings = await surveyPosition(workFrame(table, 0), facts, reasoner({ role: "strategy", stream: invalidRank,
		model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }), undefined, ["attack"]);
	assert.equal(findingAttempts, 2); assert.equal(repairedFindings.findings[0]!.relevance, 4);
	const invalidFinding = await surveyPosition(workFrame(table, 0), facts, { work: async (_about, _prompt, tools) => {
		const valid = { kind: "resource", what: "An untapped source.", relevance: 3, when: "now", ordering: "Before combat." };
		assert.equal(tools.submit.check({ findings: [valid] }), null);
		for (const invalid of [null, { ...valid, kind: "unknown" }, { ...valid, what: "" }, { ...valid, relevance: 6 },
			{ ...valid, when: "yesterday" }, { ...valid, ordering: 7 }, { ...valid, extra: true }]) assert.ok(tools.submit.check({ findings: [invalid] }), "malformed fields cannot reach ranking");
		throw new Error("No valid finding after repair.");
	} }, undefined, ["attack"]);
	assert.equal(invalidFinding.findings.length, 0); assert.equal(invalidFinding.failed?.length, 1, "an unrepaired question reaches later rounds as a failure");
	const response = structuredClone(workFrame(table, 0));
	if (response.view.window.kind === "turn") Object.assign(response.view.window, { active: 1, turn: 4 });
	response.view.work!.request = "Review this opponent response.";
	for (const invalid of [false, true]) {
		if (invalid) response.view.work!.plan!.steps = [{ label: "Stale attacker", when: { active: "self", step: "declare-attackers" },
			action: { prefix: "attack:", objects: { refs: [{ id: "absent", incarnation: 1 }] } } }];
		const unchanged = structuredClone(response);
		questions.length = 0; outlooks.length = 0; coordinated.length = 0;
		await planWork(response, { survey: true, brief }, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
		if (invalid) {
			assert.ok(questions.length > 3 && outlooks.length === 6, "invalid inherited work keeps full analysis for the broader repair");
			assert.doesNotMatch(coordinated[0]!, /"current"/, "the full editor can remove invalid work outside this window");
		} else {
			assert.equal(questions.length, 3); assert.equal(outlooks.length, 0);
			for (const kind of ["The opponent.", "Their next attack.", "Removal."]) assert.ok(questions.some((one) => one.includes(kind)));
			assert.match(coordinated[0]!, /"current"/, "a valid response edits only the current decision and its policies");
		}
		assert.deepEqual(response, unchanged, "shorter analysis neither changes the projected frame nor repairs it for the player");
	}
});

test("the dossier lays out what the seat knows in fixed sections, with recent turns only and no request inside it", () => {
	const table = matchup("dossier");
	main(table, 0, 9);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Mossborn Hydra");
	const frame = workFrame(table, 0), before = structuredClone(frame);
	const policy = { when: "w", priorities: ["Develop | then attack"], reserve: "r", reconsider: "c", example: { position: "p", line: ["l"], exception: "e" } };
	const written = dossier({ frame, brief: { ...emptyBrief(0), route: "Race | then hold.", policies: { sequencing: policy, resources: policy, responses: policy, combat: policy, recovery: policy } } });
	assert.equal(dossier({ frame }), dossier({ frame }), "the same frame gives the same bytes, so a session shares one prefix");
	const headings = [...written.matchAll(/^## (.+)$/gm)].map((match) => match[1]!.replace(/ \(\d+\)$/, ""));
	assert.deepEqual(headings, ["Situation", "Your matchup plan", "Battlefield", "Your hand", "Stack", "Graveyards and exile", "Mana", "Triggers on the battlefield", "Decks and odds", "Card text", "Recent turns", "Your notebook", "Your standing plan"]);
	const turns = [...written.matchAll(/^### Turn (\d+),/gm)].map((match) => Number(match[1]));
	assert.ok(turns.length <= 5 && turns.every((turn) => turn > 9 - 5), "recent turns reach back five turns, never to the start of the game");
	assert.match(written, /### Your library: \d+ cards/);
	assert.match(written, /### .+'s unseen cards: \d+ in hand and \d+ in library/);
	assert.match(written, /^> 1\. Develop \| then attack$/m, "model-written policy text is quoted under its author, and a pipe cannot break a table");
	assert.match(written, /^> Race \| then hold\.$/m);
	assert.ok(!written.includes("## Your request"), "the request is a separate final message");
	assert.deepEqual(frame, before, "rendering moves nothing");
});

test("phases replace by window, an empty list cannot wipe inherited windows, theirTurn covers the opponent's whole turn, and a stop that already holds is refused", async () => {
	const base: Plan = { objective: "o", guidance: "g", steps: [], phases: [
		{ when: { active: "opponent", step: "declare-blockers" }, guidance: "Block with the Elf.", complete: "pass" },
		{ when: { active: "self", step: "postcombat-main" }, guidance: "Cast Zhao.", complete: "pass" }] };
	const merged = changedPlan(base, { phases: [{ when: { step: "declare-blockers", active: "opponent" }, guidance: "Do not block.", complete: "pass" }] }, {});
	assert.deepEqual(merged.phases!.map((one) => one.guidance), ["Do not block.", "Cast Zhao."], "a written window replaces its inherited phase and keeps the rest");
	assert.throws(() => changedPlan(base, { phases: [] }, {}), /would remove every window policy/);

	const table = position();
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "o", guidance: "g", steps: [] } }], "planned");
	main(table, 1, 4);
	const seen: string[] = [];
	const line = { label: "Wait under the response policy", when: { active: "self", step: "precombat-main" }, action: { option: "pass" } };
	const replies: Record<string, unknown>[] = [
		{ assessment: { corrections: "none", adopted: "none", win: "No win.", priorities: ["Develop."] }, steps: [line], theirTurn: { guidance: "Nothing in hand answers anything; pass.", complete: "pass" },
			askWhen: [{ label: "No creature in hand", if: { amount: { count: { zones: ["hand"], controller: "you", types: ["planeswalker"] } }, atMost: 0 } }] },
		{ assessment: { corrections: "none", adopted: "none", win: "No win.", priorities: ["Develop."] }, steps: [line], theirTurn: { guidance: "Nothing in hand answers anything; pass.", complete: "pass" } }];
	const stream: Stream = (_model, request) => { seen.push(JSON.stringify(request.messages)); return { result: async () => ({ content: [{ type: "toolCall", id: `c${seen.length}`, name: "submit", arguments: replies.shift()! }], stopReason: "toolUse" }) }; };
	const prepared = await prepareTurn(workFrame(table, 0), {}, reasoner({ role: "strategy", stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 }));
	assert.match(seen[1]!, /askWhen\[0\] \\"No creature in hand\\" is already true in the planned position/, "a stop that already holds would fire at once");
	assert.deepEqual(prepared.plan.phases!.find((one) => one.when.active === "opponent" && !one.when.step && !one.when.phase), { when: { active: "opponent" }, guidance: "Nothing in hand answers anything; pass.", complete: "pass" });
	assert.equal(prepared.plan.objective, "Develop.", "the assessment fills the audit objective the writer no longer writes");
});

test("a repair during the opponent's turn leaves the next turn's preparation running", async () => {
	const table = position(); main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.each-turn" }, { do: "plan.put", plan: { objective: "old", guidance: "g", steps: [] } }], "planned");
	main(table, 1, 4);
	const signals: AbortSignal[] = [], finishes: ((value: Prepared) => void)[] = [];
	let repairs = 0;
	const seat = aiSeat({ name: "Green", api: {} as never, intent: startingIntent(0), onGap() {},
		prepare: (_frame, signal) => { signals.push(signal); return new Promise((resolve) => { finishes.push(resolve); }); },
		plan: async () => { repairs++; return { tools: [{ do: "plan.put", plan: line }] }; } });
	seat.observe(workFrame(table, 0)); await new Promise((resolve) => setImmediate(resolve));
	assert.equal(signals.length, 1, "the opponent's turn starts the next turn's preparation");
	apply(table, "pass", "engine", "forced");
	while (!nextDecision(table)) advance(table);
	assert.equal(nextDecision(table)!.seat, 0, "Green now holds priority during Red's turn");
	editWork(table, 0, [{ do: "plan.request", reason: "Repair this response." }], "help");
	await seat.answer(workFrame(table, 0));
	assert.equal(repairs, 1);
	assert.equal(signals[0]!.aborted, false, "the repair does not discard the preparation for turn 5");
	const closing = seat.close(); assert.equal(signals[0]!.aborted, true);
	finishes[0]!({ plan: line }); await closing;
});

test("a planned cast the table already lists is offered once, under the table's id, and carries the step", () => {
	const table = position();
	place(table, 0, "hand", "Sazh's Chocobo");
	main(table, 0, 3);
	const frame = workFrame(table, 0);
	frame.view.work = prepareWork(frame, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [{ label: "Cast the Chocobo", when: { active: "self", step: "precombat-main" },
		action: { procedure: printedCast("Sazh's Chocobo", frame.view.printed!["Sazh's Chocobo"]!) } }] } }]);
	const state = planState(frame)!, listed = frame.decision!.options.filter((one) => one.use?.timing === "spell" && /Sazh's Chocobo/.test(one.label));
	assert.ok(listed.length > 0, "the table lists the ordinary cast");
	const marked = annotate(frame.decision!.options, state);
	assert.equal(marked.length, frame.decision!.options.length, "no second id for the same physical action");
	assert.ok(marked.filter((one) => listed.some((cast) => cast.id === one.id)).every((one) => one.notes?.some((note) => note.startsWith("Plan step 1: Cast the Chocobo"))));
	assert.deepEqual(execution(state, listed[0]!.id), { plan: state.revision, step: 0 }, "the listed option carries out the step");
});
