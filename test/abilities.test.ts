/** Physical procedure invariants. These test declared meaning, not card interpretation.
 * Past 150 lines because the same exchange is exercised through choices and journals.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { abilityExercise, abilityTable, lootProcedure, manaProcedure } from "../tools/ability-fixture.ts";
import { activate, activationChanges, procedureOptions } from "../src/core/procedures.ts";
import { fundings } from "../src/core/funding.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { editWork, prepareWork, workFrame } from "../src/core/work-tools.ts";
import { workMenu } from "../src/core/work-menu.ts";
import { refuseExecution } from "../src/core/draft.ts";
import { fork, open, read, relive, replay, save, linesOf, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Procedure } from "../src/core/work-language.ts";
import type { Mana } from "../src/core/table.ts";
import type { Draft } from "../src/core/work.ts";
import type { Player } from "../src/core/player.ts";
import { aiSeat } from "../src/context/seat.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import { focus, type Packet } from "../src/context/packet.ts";
import { matchTable } from "../tools/matchup-fixture.ts";

const elf: Procedure = { source: { zones: ["hand"], controller: "self", card: "Llanowar Elves" }, claim: "Cast Llanowar Elves", basis: "Creature — Elf Druid 1/1.",
	timing: "spell", spell: { speed: "sorcery", destination: "battlefield" }, instructions: [], delegate: true };
const shock: Procedure = { source: { zones: ["hand"], controller: "self", card: "Shock" }, claim: "Cast Shock", basis: "Shock deals 2 damage to any target.",
	timing: "spell", spell: { speed: "instant", destination: "graveyard" }, target: "creature-or-player", instructions: [{ do: "damage", amount: 2 }], delegate: true };

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

function mainFor(table: Table, seat: number) {
	while (table.cursor.turn < 4) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && decision.seat === seat && table.cursor.active === seat && table.cursor.steps[0] === "precombat-main") return;
		const id = decision.situation === "pregame" ? "keep" : decision.options.find((option) => option.id === "pass")?.id ?? decision.options[0]!.id;
		apply(table, id, "model", decision.options.length === 1 ? "forced" : "chosen");
	}
	throw new Error("Missed main phase");
}
function castElf() {
	const table = matchTable("real-standard-9"); mainFor(table, 0);
	const land = nextDecision(table)!.options.find((option) => option.label === "Play Forest")!;
	apply(table, land.id, "model", "chosen"); fire(table, manaProcedure("Forest", "G"));
	const before = structuredClone(table), offered = proposed(table, elf);
	assert.deepEqual(table, before, "listing casts changes no state");
	assert.throws(() => activate(table, { ...offered.activation, paid: [] }, { picked: offered.option.id, offered: [offered.option.id], by: "model", why: "declared" }), /payment/);
	assert.deepEqual(table, before, "an unpaid cast changes neither cards nor the ledger");
	fire(table, elf); pass(table); pass(table); settle(table);
	return table;
}

test("a prepared activation spends existing resources once and refuses a bad payment atomically", async () => {
	const table = position();
	const viaLand = proposed(table, lootProcedure());
	assert.deepEqual(viaLand.activation.funding, [{ source: { id: "0-1", incarnation: 1 }, colors: ["G"], claim: "Tap Forest for mana (basic land type)", intrinsic: true }],
		"with an empty pool, the land's basic type pays the generic cost during activation (601.2g)");
	assert.match(viaLand.option.shows!, /Pay with tap Forest \(0-1\)/);
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
	const payments = (mana: Mana[], cost: { tap: boolean; generic: number; colors: Mana["color"][] }) =>
		fundings({ seat: 0, version: 0, view: { window: { kind: "turn" }, table: [], yours: [], since: [], objects: [], pools: [{ seat: 0, mana }] } } as never, cost);
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
	// Label one Merchant so the two are distinct sources.
	const held = frame.view.objects!.find((object) => object.id === "0-0")!;
	frame.view.work = prepareWork(frame, [{ do: "recipe.put", recipe: { id: "payments", label: "Choose payment", guidance: "Preserve green mana.", reserves: [], steps: draft(lootProcedure()).steps } }, { do: "draft.start", recipe: "payments" },
		{ do: "label.put", object: { id: held.id, incarnation: held.incarnation }, role: "blocker", purpose: "Hold back to block." }]);
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

	const real = castElf(), creature = cardsIn(real, "battlefield").find((object) => object.card === "Llanowar Elves")!;
	assert.equal("creature" in creature, false, "printed characteristics are read, never stored on the object");
	assert.deepEqual(project(real, 1).objects!.find((object) => object.id === creature.id)!.creature, { power: 1, toughness: 1 },
		"every seat reads the printed base toughness of a public creature");
	assert.equal(real.things.size, 120, "casting and resolving preserved every registered card");
	advance(real);
	const tapElf = manaProcedure("Llanowar Elves", "G");
	assert.equal(proposed(real, tapElf), undefined, "a newly cast Elf cannot pay its tap cost");
	const unready = structuredClone(real);
	assert.throws(() => activationChanges(real, { source: { id: creature.id, incarnation: creature.incarnation }, controller: 0,
		claim: tapElf.claim, basis: tapElf.basis, timing: "mana", cost: tapElf.cost!, instructions: tapElf.instructions, delegate: true, paid: [] }), /turn began/);
	assert.deepEqual(real, unready);
	mainFor(real, 1);
	apply(real, nextDecision(real)!.options.find((option) => option.label === "Play Mountain")!.id, "model", "chosen");
	fire(real, manaProcedure("Mountain", "R"));
	const choices = procedureOptions(draft(shock), workFrame(real, 1));
	assert.equal(choices.length, 3, "one creature and either player are different announced targets");
	assert.equal(new Set(choices.map((choice) => choice.option.shows)).size, 3);
	const playerHit = structuredClone(real), playerTarget = choices.find((choice) => choice.activation.target && "player" in choice.activation.target && choice.activation.target.player === 0)!;
	activate(playerHit, playerTarget.activation, { picked: playerTarget.option.id, offered: choices.map((choice) => choice.option.id), by: "model", why: "declared" });
	pass(playerHit); pass(playerHit); settle(playerHit);
	assert.equal(playerHit.seats[0]!.life, 18, "damage to an announced player changes that player's life");
	assert.equal(playerHit.things.get(creature.id)!.damage, 0, "a player target never becomes a creature target");
	const aimed = choices.find((choice) => choice.activation.target && "id" in choice.activation.target)!;
	const changed = structuredClone(real);
	commit(changed, [{ do: "move", what: creature.id, to: "hand", reason: "bounce" }, { do: "move", what: creature.id, to: "battlefield", reason: "resolve" }], "resolve");
	const snapshot = structuredClone(changed);
	assert.throws(() => activationChanges(changed, aimed.activation), /target is unavailable/);
	assert.deepEqual(changed, snapshot, "a stale target cannot spend mana or move the spell");
	activate(real, aimed.activation, { picked: aimed.option.id, offered: choices.map((choice) => choice.option.id), by: "model", why: "declared" });
	const vanished = structuredClone(real);
	commit(vanished, [{ do: "move", what: creature.id, to: "hand", reason: "bounce" }], "bounce");
	pass(vanished); pass(vanished); settle(vanished);
	assert.equal(cardsIn(vanished, "graveyard", 1).some((object) => object.card === "Shock"), true);
	assert.equal(cardsIn(vanished, "hand", 0).find((object) => object.id === creature.id)!.damage, 0);
	assert.equal(vanished.resolution, null, "a spell with its only target gone finishes without damage");
	const allInstructions = structuredClone(snapshot);
	// An authored multi-instruction spell checks cancellation of the whole effect,
	// not a claim that Shock also draws cards.
	const rebound = procedureOptions(draft({ ...shock, instructions: [...shock.instructions, { do: "draw", who: "self", count: 2 }] }), workFrame(allInstructions, 1))[0]!;
	activate(allInstructions, rebound.activation, { picked: rebound.option.id, offered: [rebound.option.id], by: "model", why: "declared" });
	commit(allInstructions, [{ do: "move", what: creature.id, to: "hand", reason: "bounce" }], "bounce");
	const librarySize = cardsIn(allInstructions, "library", 1).length;
	pass(allInstructions); pass(allInstructions); settle(allInstructions);
	assert.equal(allInstructions.resolution, null);
	assert.equal(cardsIn(allInstructions, "library", 1).length, librarySize, "an unavailable only target cancels even the untargeted draw");
	assert.equal(cardsIn(allInstructions, "stack").length, 0);
	pass(real); pass(real); settle(real);
	assert.equal(creature.damage, 2);
	assert.equal(creature.zone, "battlefield", "damage is marked before the state-based checkpoint");
	assert.equal(nextDecision(real)!.situation, "state-based");
	settle(real);
	assert.equal(creature.zone, "graveyard");
	assert.equal(creature.incarnation, 4, "hand, stack, battlefield, then graveyard are distinct incarnations");
	assert.equal(real.things.size, 120);
	const matured = castElf();
	mainFor(matured, 1); mainFor(matured, 0);
	assert.ok(proposed(matured, tapElf), "the Elf's tap cost becomes available on its controller's next turn");
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

test("permanents are cast for their printed cost, register their seat's package as they enter, and replay from the frozen row", () => {
	const decks = [{ name: "Green", deck: [...Array(4).fill("Llanowar Elves"), ...Array(4).fill("Bear Cub"), ...Array(52).fill("Forest")] },
		{ name: "Red", deck: Array(60).fill("Mountain") }];
	const dealt = () => {
		const fresh = start(standard, decks, "default-casts");
		for (const card of ["Llanowar Elves", "Bear Cub"]) {
			const object = cardsIn(fresh, "library", 0).find((one) => one.card === card)!;
			commit(fresh, [{ do: "move", what: object.id, to: "hand", reason: "draw" }], "draw");
		}
		return fresh;
	};
	const table = dealt();
	const reach = (seat: number, turn: number) => {
		for (;;) {
			const decision = nextDecision(table);
			if (!decision) { advance(table); continue; }
			if (decision.situation === "priority" && decision.seat === seat && table.cursor.active === seat && table.cursor.turn === turn && table.cursor.steps[0] === "precombat-main") return decision;
			const discard = decision.options.find((option) => /Forest|Mountain/.test(option.label));
			apply(table, decision.situation === "pregame" ? "keep" : decision.options.find((option) => option.id === "pass")?.id ?? discard?.id ?? decision.options[0]!.id, "model", "chosen");
		}
	};
	const casts = (card: string) => nextDecision(table)!.options.filter((option) => option.id.startsWith("cast:") && option.label.includes(card));
	const land = () => apply(table, nextDecision(table)!.options.find((option) => option.label === "Play Forest")!.id, "model", "chosen");
	const mana = { basis: "{T}: Add {G}.", kind: "mana" as const, cost: { tap: true as const }, colors: ["G"] };

	reach(0, 1);
	assert.equal(casts("Llanowar Elves").length, 0, "no mana source, no cast");
	land();
	const [bare] = casts("Llanowar Elves");
	assert.match(bare!.shows!, /Printed cost: 0 generic \+ \{G\}\. Pay with tap Forest .* for G\. .*No package is prepared: it enters with nothing registered\./, "an entry without a package is announced");
	editWork(table, 0, [{ do: "package.put", package: { card: "Llanowar Elves", registers: [mana] } }], "package-elves");
	const before = structuredClone(table);
	const [elves] = casts("Llanowar Elves");
	assert.deepEqual(table, before, "listing casts changes nothing");
	assert.match(elves!.shows!, /It enters registering: \{T\}: Add \{G\}\./);
	apply(table, elves!.id, "model", "chosen");
	pass(table); pass(table); settle(table);
	const entered = cardsIn(table, "battlefield", 0).find((object) => object.card === "Llanowar Elves")!;
	assert.deepEqual(entered.registrations, [mana], "the package attached as it entered");
	assert.deepEqual(table.ledger.at(-1)!.registered, { [entered.id]: [mana] }, "the row that put it onto the battlefield froze what it registered");
	assert.deepEqual(project(table, 1).objects!.find((object) => object.id === entered.id)!.registrations, [mana], "registrations are public");

	reach(0, 3);
	land();
	editWork(table, 0, [{ do: "package.put", package: { card: "Llanowar Elves", registers: [{ ...mana, colors: ["G", "G"] }] } }], "package-edit");
	assert.deepEqual(thingOf(table, entered.id).registrations, [mana], "editing a package changes no permanent already on the battlefield");
	const pays = casts("Bear Cub").map((option) => option.shows!.match(/Pay with ([^.]*)\./)![1]!);
	assert.ok(pays.some((pay) => /Llanowar Elves .* for G/.test(pay)) && pays.some((pay) => !/Llanowar/.test(pay)), "a registered mana ability pays like a land");
	assert.ok(casts("Bear Cub").every((option) => !/package/.test(option.shows!)), "a vanilla creature enters with nothing to register and says nothing");

	// Floating mana is one way to pay, never the only one offered.
	fire(table, manaProcedure("Forest", "G"));
	const floating = casts("Bear Cub").map((option) => option.shows!);
	assert.ok(floating.some((pay) => /\{G\} \(mana-/.test(pay)), "the floating green can pay");
	assert.ok(floating.some((pay) => !/\{G\} \(mana-/.test(pay)), "tapping other sources and keeping the floating green is offered too");
	apply(table, casts("Bear Cub").find((option) => /Llanowar Elves/.test(option.shows!))!.id, "model", "chosen");
	pass(table); pass(table); settle(table);
	assert.ok(cardsIn(table, "battlefield", 0).some((object) => object.card === "Bear Cub" && !object.registrations));

	const rebuilt = relive(dealt(), table.ledger);
	assert.equal(Object.keys(rebuilt.work).length, 0, "replay reads no private work");
	assert.deepEqual(rebuilt.log, table.log, "entries replay from their recorded rows, change for change");
	assert.deepEqual([...rebuilt.things], [...table.things]);
});
const thingOf = (table: Table, id: string) => table.things.get(id)!;
