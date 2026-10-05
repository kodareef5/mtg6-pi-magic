/** Physical procedure invariants. These test declared meaning, not card interpretation.
 * Past 150 lines because the same exchange is exercised through choices and journals.
 */
import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { quiet } from "./play.ts";
import { abilityExercise, abilityTable, lootProcedure, manaProcedure } from "../tools/ability-fixture.ts";
import { activate, activationChanges, procedureOptions } from "../src/core/procedures.ts";
import { fundings } from "../src/core/funding.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { editWork, prepareWork, workFrame } from "../src/core/work-tools.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { fork, open, read, relive, replay, save, linesOf, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Procedure } from "../src/core/work-language.ts";
import type { Mana } from "../src/core/table.ts";
import type { Player } from "../src/core/player.ts";
import { aiSeat } from "../src/context/seat.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import type { Packet } from "../src/context/packet.ts";
import { matchTable } from "../tools/matchup-fixture.ts";

const elf: Procedure = { source: { zones: ["hand"], controller: "self", card: "Llanowar Elves" }, claim: "Cast Llanowar Elves", basis: "Creature — Elf Druid 1/1.",
	timing: "spell", instructions: [] };
const shock: Procedure = { source: { zones: ["hand"], controller: "self", card: "Shock" }, claim: "Cast Shock", basis: "Shock deals 2 damage to any target.",
	timing: "spell", targets: [{ object: { types: ["creature", "planeswalker", "battle"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };

/** A seat's first permanent with that name. */
const on = (table: Table, seat: number, card: string) => cardsIn(table, "battlefield", seat).find((one) => one.card === card)!;
function position(table = abilityTable()) {
	for (;;) {
		const decision = nextDecision(table);
		if (!decision) advance(table);
		else if (decision.situation === "priority" && table.cursor.turn === 3) return table;
		else apply(table, quiet(decision.options).id, "engine", "forced");
	}
}
function proposed(table: Table, procedure: Procedure) {
	return procedureOptions(procedure, workFrame(table, table.cursor.priority!), "procedure")[0]!;
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
		const id = decision.situation === "pregame" ? "keep" : quiet(decision.options).id;
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
	const island = on(table, 0, "Island"), merchant = on(table, 0, "Qiqirn Merchant");
	assert.deepEqual(viaLand.activation.funding, [{ source: { id: island.id, incarnation: 1 }, colors: ["U"], claim: "Tap Island for mana (basic land type)", intrinsic: true }],
		"with an empty pool, the land's basic type pays the generic cost during activation (601.2g)");
	assert.match(viaLand.option.shows!, new RegExp(`Pay with tap Island \\(${island.id}\\)`));
	const before = structuredClone(table);
	const mana = proposed(table, manaProcedure("Island", "U"));
	assert.ok(mana);
	assert.deepEqual(table, before, "enumerating a source and payment moves nothing");
	fire(table, manaProcedure("Island", "U"));
	assert.equal(table.seats[0]!.pool.length, 1);
	assert.equal(table.things.get(island.id)!.tapped, true);
	assert.equal(cardsIn(table, "stack").length, 0, "a mana procedure does not open a response window");
	assert.equal(table.cursor.priority, 0);
	const paid = proposed(table, lootProcedure()).activation;
	const funded = structuredClone(table);
	assert.throws(() => activationChanges(table, { ...paid, cost: { ...paid.cost, generic: 2 }, paid: [paid.paid[0]!, paid.paid[0]!] }), /duplicated/);
	assert.throws(() => activationChanges(table, { ...paid, cost: { ...paid.cost, generic: 0, colors: ["G"] } }), /stated cost/);
	assert.deepEqual(table, funded, "a failed payment did not tap the source or remove mana");
	assert.throws(() => commit(table, [{ do: "tap", what: merchant.id }, { do: "spend-mana", who: 0, ids: [paid.paid[0]!, paid.paid[0]!] }], "cost-payment"), /not available/);
	assert.deepEqual(table, funded, "even the writer refuses a duplicate spend before earlier changes");
	fire(table, lootProcedure());
	assert.equal(table.seats[0]!.pool.length, 0);
	assert.equal(table.things.get(merchant.id)!.tapped, true);
	assert.equal(cardsIn(table, "stack").length, 1);
	const committed = structuredClone(table);
	assert.throws(() => activationChanges(table, paid), /cannot be tapped/);
	assert.deepEqual(table, committed);
	const payments = (mana: Mana[], cost: { generic: number; colors: Mana["color"][] }) =>
		fundings({ seat: 0, version: 0, view: { window: { kind: "turn" }, table: [], yours: [], since: [], objects: [], pools: [{ seat: 0, mana }] } } as never, cost);
	assert.deepEqual(payments([{ id: "a", color: "U", spendOnly: { types: ["creature"] } }], { generic: 1, colors: [] }), [], "restricted mana pays for nothing unnamed");
	assert.equal(payments([{ id: "a", color: "U" }, { id: "b", color: "U" }], { generic: 1, colors: [] }).length, 1, "identical unrestricted units do not multiply a menu");
	assert.equal(payments([{ id: "a", color: "U" }, { id: "b", color: "U", persists: true }], { generic: 1, colors: [] }).length, 2, "a lasting unit is not interchangeable with an expiring one");

	// The actual classifier request must distinguish the payments, each marked as the plan's step.
	const twins = start(standard, [{ name: "A", deck: deck("Dimir Control") }, { name: "B", deck: deck("Dimir Control") }], "payment-descriptions");
	const [first, second] = cardsIn(twins, "library", 0).filter((one) => one.card === "Qiqirn Merchant");
	commit(twins, [first!.id, second!.id].map((what) => ({ do: "move", what, to: "battlefield", reason: "game-setup" })), "game-setup");
	const frame = workFrame(position(twins), 0);
	frame.view.pools = [{ seat: 0, mana: [{ id: "green", color: "G", persists: true }, { id: "blue", color: "U" }] }];
	frame.view.work = prepareWork(frame, [{ do: "plan.put", plan: { objective: "Loot.", guidance: "Preserve green mana.",
		steps: [{ label: "Loot with a Merchant", when: {}, action: { procedure: lootProcedure() } }] } }]);
	frame.decision = { ...frame.decision!, options: annotate(frame.decision!.options, planState(frame)!) };
	let calls = 0;
	const classify: Classify = async (model, request) => {
		const question = request.questions.pick!;
		if (question.type !== "choice") throw new Error("Expected a choice");
		const packet = request.state as unknown as Packet;
		if (Object.hasOwn(question.criteria, "review:hold")) {
			const choice = Object.hasOwn(question.criteria, "review:act") ? "review:act" : "review:skip";
			return { api: model.api, provider: model.provider, model: model.id, stopReason: "stop", timestamp: 0,
				answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } } };
		}
		// Every option, the plan's step first.
		assert.deepEqual(packet.options.map((option) => option.id).sort(), frame.decision!.options.map((option) => option.id).sort());
		assert.match(packet.options[0]!.id, /^plan:/);
		const steps = Object.entries(question.criteria).filter(([, text]) => text.includes("Plan step 1: Loot with a Merchant"));
		assert.equal(steps.length, 2, "two payments for one source: identical Merchants are one choice");
		assert.equal(new Set(steps.map(([, text]) => text)).size, 2);
		assert.ok(steps.some(([, text]) => text.includes("{G} (green, persists)")));
		const [chosen, description] = steps.find(([, text]) => text.includes("{U} (blue, expires at step end)"))!;
		assert.match(description, /Cost: 1 generic\. Tap the source\./);
		assert.match(description, /Put the ability on the stack/);
		assert.match(description, /you draws 1\./);
		assert.match(description, /you chooses 1 of \{"zones":\["hand"\],"owner":"you"\} as discard\. Put bound:discard into graveyard \(discard\)\./);
		assert.equal(packet.plan?.due, "Loot with a Merchant");
		calls += 1;
		return { api: model.api, provider: model.provider, model: model.id, stopReason: "stop", timestamp: 0,
			answers: { pick: { type: "choice", choice: chosen, probabilities: { [chosen]: 1 }, confidence: 1 } } };
	};
	const player = aiSeat({ name: "A", api: decisionApi(classify, { id: "fixture", provider: "offline", api: "typesafe-system-one" } as never), intent: startingIntent(0), onGap: assert.fail });
	let answer = await player.answer(frame);
	while (answer.kind === "work") { frame.view.work = prepareWork(frame, answer.tools); answer = await player.answer(frame); }
	assert.equal(answer.kind, "pick");
	assert.equal(calls, 1);
	assert.ok(answer.kind === "pick" && answer.option.startsWith(`plan:${frame.view.work!.planned}:s0:`), "the pick names the plan's step");
});

test("responses resolve newest first and a pending choice closes priority without revealing a hidden card", () => {
	const table = position();
	fire(table, manaProcedure("Island", "U"));
	const accepted = fire(table, lootProcedure());
	accepted.instructions.length = 0;
	const a = cardsIn(table, "stack")[0]!;
	assert.equal(a.ability!.instructions.length, 3, "accepted meaning is not a reference to editable preparation");
	pass(table);
	fire(table, manaProcedure("Island", "U"));
	fire(table, lootProcedure());
	const b = cardsIn(table, "stack")[0]!;
	assert.deepEqual(cardsIn(table, "stack").map((object) => object.controller), [1, 0]);
	// A source leaving does not erase the ability it already put on the stack.
	commit(table, [{ do: "move", what: on(table, 0, "Qiqirn Merchant").id, to: "graveyard", reason: "destroy" }], "destroy");
	pass(table); pass(table);
	assert.equal(table.resolution?.object, b.id);
	assert.equal(table.cursor.priority, null);
	const top = cardsIn(table, "library", 1)[0]!;
	assert.equal(JSON.stringify(nextDecision(table)).includes(top.id), false, "the draw option never names the hidden library object");
	const hand = cardsIn(table, "hand", 1).length;
	settle(table);
	assert.equal(cardsIn(table, "hand", 1).length, hand + 1);
	assert.equal(table.resolution?.program[0]?.instruction.do, "choose");
	assert.equal(nextDecision(table)!.seat, 1);
	assert.equal(nextDecision(table)!.options.some((option) => option.id === "pass"), false);
	assert.equal(JSON.stringify(project(table, 0)).includes(top.id), false);
	assert.equal(JSON.stringify(project(table, "spectator")).includes(top.id), false);
	assert.equal(project(table, 1).objects!.some((object) => object.id === top.id), true);
	settle(table, "chosen"); settle(table);
	assert.equal(table.resolution, null);
	assert.equal(table.cursor.priority, null, "finishing reaches a checkpoint before priority");
	advance(table);
	assert.equal(table.cursor.priority, 0, "the active player receives priority between resolutions");
	assert.deepEqual(cardsIn(table, "stack").map((object) => object.id), [a.id]);
	pass(table); pass(table); settle(table); settle(table, "chosen"); settle(table);
	assert.equal(cardsIn(table, "stack").length, 0);
	assert.equal(table.cursor.steps[0], "upkeep", "resolution did not advance the step");

	const real = castElf(), creature = cardsIn(real, "battlefield").find((object) => object.card === "Llanowar Elves")!;
	assert.equal("traits" in creature, false, "characteristics are read, never stored on the object");
	const seen = project(real, 1).objects!.find((object) => object.id === creature.id)!.traits!;
	assert.deepEqual([seen.power, seen.toughness, seen.types, seen.subtypes], [1, 1, ["creature"], ["Elf", "Druid"]],
		"every seat reads the characteristics of a public creature");
	assert.equal(real.things.size, 150, "casting and resolving preserved every registered card, sideboards included");
	advance(real);
	const tapElf = manaProcedure("Llanowar Elves", "G");
	assert.equal(proposed(real, tapElf), undefined, "a newly cast Elf cannot pay its tap cost");
	const unready = structuredClone(real);
	assert.throws(() => activationChanges(real, { source: { id: creature.id, incarnation: creature.incarnation }, controller: 0,
		claim: tapElf.claim, basis: tapElf.basis, timing: "mana", cost: { generic: 0, colors: [], tap: true }, instructions: tapElf.instructions, targets: [], slots: [], paid: [] }), /cannot be tapped/);
	assert.deepEqual(real, unready);
	mainFor(real, 1);
	apply(real, nextDecision(real)!.options.find((option) => option.label === "Play Mountain")!.id, "model", "chosen");
	fire(real, manaProcedure("Mountain", "R"));
	const choices = procedureOptions(shock, workFrame(real, 1), "procedure");
	assert.equal(choices.length, 3, "one creature and either player are different announced targets");
	assert.equal(new Set(choices.map((choice) => choice.option.shows)).size, 3);
	const playerHit = structuredClone(real), playerTarget = choices.find((choice) => choice.activation.targets[0]!.some((one) => "player" in one && one.player === 0))!;
	activate(playerHit, playerTarget.activation, { picked: playerTarget.option.id, offered: choices.map((choice) => choice.option.id), by: "model", why: "declared" });
	pass(playerHit); pass(playerHit); settle(playerHit);
	assert.equal(playerHit.seats[0]!.life, 18, "damage to an announced player changes that player's life");
	assert.equal(playerHit.things.get(creature.id)!.damage, 0, "a player target never becomes a creature target");
	const aimed = choices.find((choice) => choice.activation.targets[0]!.some((one) => "id" in one))!;
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
	const rebound = procedureOptions({ ...shock, instructions: [...shock.instructions, { do: "draw", who: "you", count: 2 }] }, workFrame(allInstructions, 1), "procedure")
		.find((choice) => choice.activation.targets[0]!.some((one) => "id" in one))!;
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
	assert.equal(real.things.size, 150);
	const matured = castElf();
	mainFor(matured, 1); mainFor(matured, 0);
	assert.ok(proposed(matured, tapElf), "the Elf's tap cost becomes available on its controller's next turn");
});

test("state-based checks wait for the whole accepted effect, including a pause between instructions", () => {
	const table = position();
	fire(table, { ...lootProcedure(), claim: "Checkpoint fixture", basis: "An authored checkpoint test, not a card ruling.", cost: { tap: true },
		instructions: [{ do: "life", who: "you", amount: -25 }, { do: "draw", who: "you", count: 1 }, { do: "life", who: "you", amount: 25 }] });
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
	fire(loses, { ...lootProcedure(), cost: { tap: true }, instructions: [{ do: "life", who: "you", amount: -25 }] });
	pass(loses); pass(loses); settle(loses);
	assert.equal(loses.resolution, null);
	assert.equal(nextDecision(loses)!.situation, "state-based", "the checkpoint runs as soon as resolution finishes");
});

test("the real seat loop delegates a unique effect continuation and asks for each actual discard", async () => {
	const run = await abilityExercise();
	assert.ok(run.outcome);
	assert.deepEqual(run.table.gaps, []);
	assert.equal(run.plans, 2);
	const loots = run.table.ledger.filter((row) => row.activation?.timing === "stack");
	assert.equal(loots.length, 2);
	assert.deepEqual(loots.map((row) => [row.seat, row.execution]), [[0, { plan: run.table.work[0]!.planned, step: 0 }], [1, { plan: run.table.work[1]!.planned, branch: 0 }]], "a step and a branch, each recorded");
	assert.deepEqual(loots.map((row) => row.by), ["model", "model"], "the pilot chooses both the due step and the response");
	const response = run.exchange.find((frame) => frame.seat === 1 && frame.decision?.options.some((one) => /Plan branch/.test(one.shows ?? "")));
	assert.ok(response, "the opponent receives the response window with the plan's action");
	assert.match(response.view.since.join("\n"), /Qiqirn Merchant/, "passive observations do not consume the opponent action before Jev reads it");
	assert.deepEqual(run.paused.map((pause) => pause.seat), [1, 0]);
	assert.equal(run.table.ledger.filter((row) => row.situation === "resolution" && row.why === "delegated").length, 4, "each draw and each move of the chosen card");
	assert.equal(run.table.ledger.filter((row) => row.situation === "resolution" && row.why === "chosen").length, 2);
	assert.equal(run.table.ledger.some((row) => row.situation === "resolution" && row.why === "forced"), false);
	assert.ok(run.exchangeCalls > 0);

	// Delegating our effect is not permission to answer another seat's choice.
	const other = position();
	const hand = cardsIn(other, "hand", 1);
	commit(other, hand.slice(1).map((object) => ({ do: "move", what: object.id, to: "graveyard", reason: "game-setup" })), "game-setup");
	fire(other, { ...lootProcedure(), claim: "Another seat's choice", basis: "An authored delegation test, not a card ruling.", cost: { tap: true },
		instructions: [{ do: "choose", who: "opponent", from: { zones: ["hand"], owner: "opponent" }, count: 1, as: "discard" },
			{ do: "move", what: "bound:discard", to: "graveyard", reason: "discard" }] });
	pass(other); pass(other);
	assert.equal(nextDecision(other)!.seat, 1);
	assert.equal(nextDecision(other)!.options.length, 1);
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
	assert.equal(child.resolution?.program[0]?.instruction.do, "choose");
	assert.equal(child.cursor.priority, null);
	assert.equal(cardsIn(child, "stack").length, 2);
	const hand = cardsIn(child, "hand", pause.seat).length;
	const library = cardsIn(child, "library", pause.seat).length;
	const next = nextDecision(child)!;
	apply(child, next.options.at(-1)!.id, "model", "chosen");
	apply(child, nextDecision(child)!.options[0]!.id, "model", "delegated");
	assert.equal(cardsIn(child, "hand", pause.seat).length, hand - 1);
	assert.equal(cardsIn(child, "library", pause.seat).length, library, "the clone did not repeat the already completed draw");
	assert.equal(child.resolution, null);
	const prefix = read(childPath).lines;
	assert.deepEqual(linesOf(child).filter((line) => line.v <= pause.version), prefix);
	assert.ok(readFileSync(childPath, "utf8").includes("{1}, {T}: Draw a card, then discard a card."));

	// Without a seat's intent delegating it, even the one draw instruction belongs to that seat.
	const manual = position();
	fire(manual, { ...lootProcedure(), cost: { tap: true } });
	pass(manual); pass(manual);
	const before = cardsIn(manual, "hand", 0).length;
	let asked = 0;
	const unavailable: Player = { name: "A", observe() {}, close() {}, async answer() { asked += 1; throw new Error("Keep this instruction pending"); } };
	assert.equal(await play(manual, { 0: unavailable, 1: unavailable }, {}), null);
	assert.equal(asked, 2);
	assert.equal(cardsIn(manual, "hand", 0).length, before);
	assert.equal(manual.resolution?.program.length, 3, "nothing resolved without the seat");

});

test("permanents are cast for their printed cost, register their seat's package as they enter, and replay from the frozen row", () => {
	const decks = [{ name: "Green", deck: deck("Green Stompy") }, { name: "Red", deck: deck("Red Burn") }];
	const dealt = () => {
		const fresh = start(standard, decks, "default-casts");
		for (const card of ["Llanowar Elves", "Bear Cub", "Forest", "Forest"]) {
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
			// Keep the lands and the cards this position needs.
			const discard = decision.options.find((option) => option.id.startsWith("discard:") && !/Forest|Mountain|Llanowar Elves|Bear Cub/.test(option.label));
			apply(table, decision.situation === "pregame" ? "keep" : decision.options.find((option) => option.id === "pass" || option.id === "attack:done" || option.id === "block:done")?.id ?? discard?.id ?? decision.options[0]!.id, "model", "chosen");
		}
	};
	const casts = (card: string) => nextDecision(table)!.options.filter((option) => option.id.startsWith("cast:") && option.label.includes(card));
	const land = () => apply(table, nextDecision(table)!.options.find((option) => option.label === "Play Forest")!.id, "model", "chosen");
	const mana = { basis: "{T}: Add {G}.", kind: "mana" as const, cost: { tap: true as const }, colors: ["G"] };

	reach(0, 1);
	assert.equal(casts("Llanowar Elves").length, 0, "no mana source, no cast");
	land();
	const [bare] = casts("Llanowar Elves");
	assert.match(bare!.shows!, /Cost: 0 generic \+ \{G\}\. Pay with tap Forest .* for G\. .*No package is prepared: it enters with nothing registered\./, "an entry without a package is announced");
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
