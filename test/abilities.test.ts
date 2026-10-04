/** Physical procedure invariants. These test declared meaning, not card interpretation.
 * Past 150 lines because the same exchange is exercised through choices and journals.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { abilityExercise, abilityTable, lootProcedure, manaProcedure } from "../tools/ability-fixture.ts";
import { activate, activationChanges, payments, procedureOptions } from "../src/core/procedures.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { prepareWork, workFrame } from "../src/core/work-tools.ts";
import { workMenu } from "../src/core/work-menu.ts";
import { refuseExecution } from "../src/core/draft.ts";
import { fork, open, read, replay, save, linesOf, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Procedure } from "../src/core/work-language.ts";
import type { Draft } from "../src/core/work.ts";
import type { Player } from "../src/core/player.ts";
import { aiSeat } from "../src/context/seat.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import { focus, type Packet } from "../src/context/packet.ts";

function position(table = abilityTable()) {
	for (;;) {
		const decision = nextDecision(table);
		if (!decision) advance(table);
		else if (decision.situation === "priority" && table.cursor.turn === 3) return table;
		else apply(table, decision.options[0]!.id, "engine", "forced");
	}
}
const draft = (procedure: Procedure): Draft => ({ id: "test", recipe: "test", label: "Test", guidance: "Test", next: 0, status: "editing", reserves: [],
	steps: [{ label: "Activate", when: {}, action: { procedure } }] });
function proposed(table: Table, procedure: Procedure) {
	return procedureOptions(draft(procedure), workFrame(table, table.cursor.priority!))[0]!;
}
function fire(table: Table, procedure: Procedure) {
	const choice = proposed(table, procedure);
	assert.ok(choice, "the declared operation has an available source and payment");
	activate(table, choice.activation, { picked: choice.option.id, offered: [choice.option.id], by: "model", why: "declared" });
	return choice.activation;
}
const pass = (table: Table) => { while (!nextDecision(table)) advance(table); apply(table, "pass", "engine", "forced"); };
const settle = (table: Table, why: "chosen" | "delegated" = "delegated") => apply(table, nextDecision(table)!.options[0]!.id, "model", why);

test("a prepared activation spends existing resources once and refuses a bad payment atomically", async () => {
	const table = position();
	assert.equal(proposed(table, lootProcedure()), undefined);
	const before = structuredClone(table);
	const mana = proposed(table, manaProcedure("Forest", "G"));
	assert.ok(mana);
	assert.deepEqual(table, before, "enumerating a source and payment moves nothing");
	fire(table, manaProcedure("Forest", "G"));
	assert.equal(table.seats[0]!.pool.length, 1);
	assert.equal(table.things.get("0-1")!.tapped, true);
	assert.equal(cardsIn(table, "stack").length, 0, "a mana procedure does not open a response window");
	assert.equal(table.cursor.priority, 0);
	const paid = proposed(table, lootProcedure()).activation;
	const funded = structuredClone(table);
	assert.throws(() => activationChanges(table, { ...paid, cost: { ...paid.cost, generic: 2 }, paid: [paid.paid[0]!, paid.paid[0]!] }), /duplicated/);
	assert.throws(() => activationChanges(table, { ...paid, cost: { ...paid.cost, generic: 0, colors: ["U"] } }), /stated cost/);
	assert.deepEqual(table, funded, "a failed payment did not tap the source or remove mana");
	assert.throws(() => commit(table, [{ do: "tap", what: "0-0" }, { do: "spend-mana", who: 0, ids: [paid.paid[0]!, paid.paid[0]!] }], "cost-payment"), /not available/);
	assert.deepEqual(table, funded, "even the writer refuses a duplicate spend before earlier changes");
	fire(table, lootProcedure());
	assert.equal(table.seats[0]!.pool.length, 0);
	assert.equal(table.things.get("0-0")!.tapped, true);
	assert.equal(cardsIn(table, "stack").length, 1);
	const committed = structuredClone(table);
	assert.throws(() => activationChanges(table, paid), /already tapped/);
	assert.deepEqual(table, committed);
	assert.deepEqual(payments([{ id: "a", color: "U", spendOnly: "creatures" }], { tap: false, generic: 1, colors: [] }), []);
	assert.equal(payments([{ id: "a", color: "U" }, { id: "b", color: "U" }], { tap: false, generic: 1, colors: [] }).length, 1, "identical unrestricted units do not multiply a menu");
	assert.equal(payments([{ id: "a", color: "U" }, { id: "b", color: "U", persists: true }], { tap: false, generic: 1, colors: [] }).length, 2, "a lasting unit is not interchangeable with an expiring one");

	// The actual classifier request must distinguish both sources and payments.
	const twins = start(standard, [
		{ name: "A", deck: ["Qiqirn Merchant", "Qiqirn Merchant", ...Array(58).fill("Forest")] },
		{ name: "B", deck: Array(60).fill("Island") },
	], "payment-descriptions");
	commit(twins, ["0-0", "0-1"].map((what) => ({ do: "move", what, to: "battlefield", reason: "game-setup" })), "game-setup");
	const frame = workFrame(position(twins), 0);
	frame.view.pools = [{ seat: 0, mana: [{ id: "green", color: "G", persists: true }, { id: "blue", color: "U" }] }];
	frame.view.work = prepareWork(frame, [{ do: "recipe.put", recipe: { id: "payments", label: "Choose payment", guidance: "Preserve green mana.", reserves: [], steps: draft(lootProcedure()).steps } }, { do: "draft.start", recipe: "payments" }]);
	const source = frame.view.objects!.find((object) => object.id === "0-1")!;
	const sourceText = `Source: Qiqirn Merchant (${source.id}@${source.incarnation})`;
	let calls = 0, description = "";
	const classify: Classify = async (model, request) => {
		const question = request.questions.pick!;
		assert.equal(question.type, "choice");
		if (question.type !== "choice") throw new Error("Expected a choice");
		const packet = request.state as unknown as Packet;
		assert.deepEqual(packet.options, frame.decision!.options);
		const bindings = Object.entries(question.criteria).filter(([id]) => id.startsWith("work:bind:"));
		if (calls === 0) {
			assert.equal(bindings.length, 4);
			assert.equal(new Set(bindings.map(([, text]) => text)).size, 4);
			assert.ok(bindings.some(([, text]) => text.includes("{G} (green, persists)")));
		}
		const chosen = calls === 0 ? bindings.find(([, text]) => text.includes(sourceText) && text.includes("{U} (blue, expires at step end)"))![0]
			: calls === 1 ? "work:ready" : "work:execute";
		const shown = packet.workOptions!.find((option) => option.id === chosen)!.shows!;
		if (calls === 0) description = shown;
		assert.equal(shown, description, "binding, readiness and execution carry the same terms");
		assert.ok(question.criteria[chosen]!.includes(description));
		assert.match(description, /Stated cost: tap source; 1 generic/);
		assert.match(description, /Put the ability on the stack/);
		assert.match(description, /Source controller draws 1 card/);
		assert.match(description, /chooses one card from their hand to put into graveyard/);
		assert.equal(JSON.stringify(packet.work).includes('"action"'), false);
		calls += 1;
		return { api: model.api, provider: model.provider, model: model.id, stopReason: "stop", timestamp: 0,
			answers: { pick: { type: "choice", choice: chosen, probabilities: { [chosen]: 1 }, confidence: 1 } } };
	};
	const player = aiSeat({ name: "A", api: decisionApi(classify, { id: "fixture", provider: "offline", api: "typesafe-system-one" } as never), intent: startingIntent(0), onGap: assert.fail });
	for (let step = 0; step < 3; step++) {
		const answer = await player.answer(frame);
		if (step < 2) {
			assert.equal(answer.kind, "work");
			if (answer.kind === "work") frame.view.work = prepareWork(frame, answer.tools);
		} else assert.equal(answer.kind, "execute");
	}
	assert.equal(calls, 3);
	const projected = focus(frame, startingIntent(0));
	assert.equal(projected.work!.draft!.bound, frame.view.work!.draft!.bound);
	assert.deepEqual(projected.work!.draft!.boundObjects, frame.view.work!.draft!.boundObjects);
	assert.deepEqual(workMenu(frame).find((option) => option.id === "work:execute")!.objects, [{ id: source.id, incarnation: source.incarnation }]);
});

test("responses resolve newest first and a pending choice closes priority without revealing a hidden card", () => {
	const table = position();
	fire(table, manaProcedure("Forest", "G"));
	const accepted = fire(table, lootProcedure());
	accepted.instructions.length = 0;
	const a = cardsIn(table, "stack")[0]!;
	assert.equal(a.ability!.instructions.length, 2, "accepted meaning is not a reference to editable preparation");
	pass(table);
	fire(table, manaProcedure("Island", "U"));
	fire(table, lootProcedure());
	const b = cardsIn(table, "stack")[0]!;
	assert.deepEqual(cardsIn(table, "stack").map((object) => object.controller), [1, 0]);
	// A source leaving does not erase the ability it already put on the stack.
	commit(table, [{ do: "move", what: "0-0", to: "graveyard", reason: "destroy" }], "destroy");
	pass(table); pass(table);
	assert.equal(table.resolution?.object, b.id);
	assert.equal(table.cursor.priority, null);
	const top = cardsIn(table, "library", 1)[0]!;
	assert.equal(JSON.stringify(nextDecision(table)).includes(top.id), false, "the draw option never names the hidden library object");
	const hand = cardsIn(table, "hand", 1).length;
	settle(table);
	assert.equal(cardsIn(table, "hand", 1).length, hand + 1);
	assert.equal(table.resolution?.instruction, 1);
	assert.equal(nextDecision(table)!.seat, 1);
	assert.equal(nextDecision(table)!.options.some((option) => option.id === "pass"), false);
	assert.equal(JSON.stringify(project(table, 0)).includes(top.id), false);
	assert.equal(JSON.stringify(project(table, "spectator")).includes(top.id), false);
	assert.equal(project(table, 1).objects!.some((object) => object.id === top.id), true);
	settle(table, "chosen");
	assert.equal(table.resolution, null);
	assert.equal(table.cursor.priority, null, "finishing reaches a checkpoint before priority");
	advance(table);
	assert.equal(table.cursor.priority, 0, "the active player receives priority between resolutions");
	assert.deepEqual(cardsIn(table, "stack").map((object) => object.id), [a.id]);
	pass(table); pass(table); settle(table); settle(table, "chosen");
	assert.equal(cardsIn(table, "stack").length, 0);
	assert.equal(table.cursor.steps[0], "upkeep", "resolution did not advance the step");
});

test("state-based checks wait for the whole accepted effect, including a pause between instructions", () => {
	const table = position();
	fire(table, { ...lootProcedure(), claim: "Checkpoint fixture", basis: "An authored checkpoint test, not a card ruling.", cost: { tap: true, generic: 0, colors: [] },
		instructions: [{ do: "life", who: "self", amount: -25 }, { do: "draw", who: "self", count: 1 }, { do: "life", who: "self", amount: 25 }] });
	pass(table); pass(table); settle(table);
	assert.equal(table.seats[0]!.life, -5);
	assert.equal(nextDecision(table)!.situation, "resolution");
	settle(table);
	assert.equal(table.outcome, null);
	settle(table);
	assert.equal(table.seats[0]!.life, 20);
	advance(table);
	assert.equal(nextDecision(table)!.situation, "priority");
	assert.equal(table.ledger.some((row) => row.situation === "state-based"), false);

	const loses = position();
	fire(loses, { ...lootProcedure(), cost: { tap: true, generic: 0, colors: [] }, instructions: [{ do: "life", who: "self", amount: -25 }] });
	pass(loses); pass(loses); settle(loses);
	assert.equal(loses.resolution, null);
	assert.equal(nextDecision(loses)!.situation, "state-based", "the checkpoint runs as soon as resolution finishes");
});

test("the real seat loop delegates a unique effect continuation and asks for each actual discard", async () => {
	const run = await abilityExercise();
	assert.ok(run.outcome);
	assert.deepEqual(run.table.gaps, []);
	assert.equal(run.plans, 2);
	assert.equal(run.table.ledger.filter((row) => row.activation?.timing === "mana").length, 2);
	assert.equal(run.table.ledger.filter((row) => row.activation?.timing === "stack").length, 2);
	assert.deepEqual(run.paused.map((pause) => pause.seat), [1, 0]);
	assert.equal(run.table.ledger.filter((row) => row.situation === "resolution" && row.why === "delegated").length, 2);
	assert.equal(run.table.ledger.filter((row) => row.situation === "resolution" && row.why === "chosen").length, 2);
	assert.equal(run.table.ledger.some((row) => row.situation === "resolution" && row.why === "forced"), false);
	assert.ok(run.exchangeCalls > 0);

	// Delegating our effect is not permission to answer another seat's choice.
	const other = position();
	const hand = cardsIn(other, "hand", 1);
	commit(other, hand.slice(1).map((object) => ({ do: "move", what: object.id, to: "graveyard", reason: "game-setup" })), "game-setup");
	fire(other, { ...lootProcedure(), claim: "Another seat's choice", basis: "An authored delegation test, not a card ruling.", cost: { tap: true, generic: 0, colors: [] },
		instructions: [{ do: "choose-move", who: "opponent", from: "hand", to: "graveyard", reason: "discard", count: 1 }] });
	pass(other); pass(other);
	assert.equal(nextDecision(other)!.seat, 1);
	assert.equal(nextDecision(other)!.options.length, 1);
	assert.equal(nextDecision(other)!.delegated, false);
	let asked = 0;
	const unavailable: Player = { name: "B", observe() {}, close() {}, async answer() { asked += 1; throw new Error("No delegation from this seat"); } };
	assert.equal(await play(other, { 1: unavailable }, {}), null);
	assert.equal(asked, 2);
	assert.equal(cardsIn(other, "hand", 1).length, 1);
});

test("a journal preserves accepted instructions and a clone resumes after the draw without drawing again", async () => {
	const run = await abilityExercise();
	const directory = mkdtempSync(join(tmpdir(), "magic-abilities-"));
	const header: Header = { id: "abilities", format: run.table.format.name, seed: run.table.rng.seed,
		seats: run.table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
		cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(directory, "parent.jsonl"), header);
	save(journal, run.table);
	const restored = replay(journal.path, (header) => abilityTable(header.seed)).table;
	assert.deepEqual(restored.ledger, run.table.ledger);
	assert.deepEqual(restored.log, run.table.log);
	assert.deepEqual(restored.work, run.table.work);
	const pause = run.paused[0]!;
	const childPath = join(directory, "child.jsonl");
	fork(journal.path, pause.version, "child", childPath);
	const child = replay(childPath, (header) => abilityTable(header.seed)).table;
	assert.deepEqual(workFrame(child, pause.seat), { ...pause.frame, view: project(child, pause.seat) });
	assert.equal(child.resolution?.instruction, 1);
	assert.equal(child.cursor.priority, null);
	assert.equal(cardsIn(child, "stack").length, 2);
	const hand = cardsIn(child, "hand", pause.seat).length;
	const library = cardsIn(child, "library", pause.seat).length;
	const next = nextDecision(child)!;
	apply(child, next.options.at(-1)!.id, "model", "chosen");
	assert.equal(cardsIn(child, "hand", pause.seat).length, hand - 1);
	assert.equal(cardsIn(child, "library", pause.seat).length, library, "the clone did not repeat the already completed draw");
	assert.equal(child.resolution, null);
	const prefix = read(childPath).lines;
	assert.deepEqual(linesOf(child).filter((line) => line.v <= pause.version), prefix);
	assert.ok(readFileSync(childPath, "utf8").includes("{1}, {T}: Draw a card, then discard a card."));

	// With delegation withdrawn, even the one draw instruction belongs to a seat.
	const manual = position();
	fire(manual, { ...lootProcedure(), delegate: false, cost: { tap: true, generic: 0, colors: [] } });
	pass(manual); pass(manual);
	const before = cardsIn(manual, "hand", 0).length;
	let asked = 0;
	const unavailable: Player = { name: "A", observe() {}, close() {}, async answer() { asked += 1; throw new Error("Keep this instruction pending"); } };
	assert.equal(await play(manual, { 0: unavailable, 1: unavailable }, {}), null);
	assert.equal(asked, 2);
	assert.equal(cardsIn(manual, "hand", 0).length, before);
	assert.equal(manual.resolution?.instruction, 0);
	assert.equal(refuseExecution(draft(lootProcedure()), workFrame(manual, 0)) !== null, true);
});
