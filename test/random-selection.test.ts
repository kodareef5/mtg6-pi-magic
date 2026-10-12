/** Seeded samples preserve physical multiplicity and privacy through delayed and immediate card instructions.
 * The positions stay together to check one sampling invariant across hand and graveyard use. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import { playable } from "../src/core/permits.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { check, PackageSchema, type Procedure } from "../src/core/language.ts";
import { announce, finish, main, pack, passBoth, quiet, step } from "./play.ts";

const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = (seed = "random-cards") => start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], seed, undefined, { discardsFrom: 0 });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function settle(table: Table) {
	for (let guard = 0; guard < 300; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Unsettled resolution");
}
function cast(table: Table, card: string) {
	const source = [...cardsIn(table, "hand", 0), ...cardsIn(table, "library", 0)].find(one => one.card === card)!; assert.ok(source);
	if (source.zone !== "hand") commit(table, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [], deferred: [] } }], card);
	commit(table, [{ do: "add-mana", who: 0, colors: ["C", "R", "R"] }], "game-setup");
	const procedure = printedCast(card, table.printed[card]!); procedure.source.refs = [ref(source)];
	const before = structuredClone(table); announce(table, procedure); passBoth(table); finish(table); return { source, before };
}
function sample(table: Table) {
	const before = structuredClone(table), decision = nextDecision(table)!;
	assert.deepEqual(table, before, "listing neither samples nor advances the seed");
	assert.equal(decision.options.length, 1); assert.match(decision.options[0]!.label, /at random/);
	assert.ok(!decision.options[0]!.objects && !decision.options[0]!.cards);
	apply(table, decision.options[0]!.id, "model", "chosen");
	const receipt = table.log.at(-1)!, change = receipt.changes.find(one => one.do === "sample")!;
	assert.equal(change.do, "sample"); if (change.do !== "sample") throw new Error("Missing sample");
	assert.equal(new Set(change.selected!.map(one => one.id)).size, change.selected!.length);
	assert.equal(change.selected!.length, Math.min(change.count, change.cards.length));
	return { before, receipt, selected: change.selected! };
}

test("random card instructions sample once on application, retain duplicate cards and replay private outcomes", () => {
	// Casey's delayed trigger survives its source and waits for the correct player's upkeep.
	for (const left of [0, 2, 7]) {
		const table = build(); main(table, 0); const hand = cardsIn(table, "hand", 0).length;
		const wasHeld = cardsIn(table, "hand", 0).some(one => one.card === "Casey Jones, Vigilante");
		const { source, before } = cast(table, "Casey Jones, Vigilante"); settle(table);
		assert.equal(cardsIn(table, "hand", 0).length, hand + 3 - Number(wasHeld));
		assert.equal(table.notes.filter(one => one.kind === "delay").length, 1); replay(table, before);
		commit(table, [{ do: "move", what: source.id, to: "graveyard", reason: "destroy" }], "resolve");
		const held = cardsIn(table, "hand", 0); commit(table, held.slice(left).map(one => ({ do: "move", what: one.id, to: "outside", reason: "game-setup" })), "game-setup");
		main(table, 1, 2); assert.equal(table.notes.filter(one => one.kind === "delay").length, 1);
		for (let guard = 0; guard < 300; guard++) {
			const decision = nextDecision(table); if (!decision) { advance(table); continue; }
			if (decision.situation === "resolution" && decision.options.some(one => one.label.startsWith("Select ") && /at random/.test(one.label))) break;
			apply(table, quiet(decision.options).id, "model", "chosen");
		}
		assert.equal(table.cursor.active, 0); assert.equal(table.cursor.steps[0], "upkeep");
		const taken = sample(table), afterSample = structuredClone(table);
		for (const viewer of [1, "spectator"] as const) {
			assert.deepEqual(project(table, viewer).resolution!.bound.discarded!.objects, []);
			for (const chosen of taken.selected) assert.ok(!describe(table, taken.receipt, viewer).includes(table.things.get(chosen.id)!.card!));
		}
		step(table); const discard = table.log.at(-1)!; assert.equal(discard.changes.filter(one => one.do === "move" && one.reason === "discard").length, Math.min(left, 3));
		settle(table); assert.equal(cardsIn(table, "hand", 0).length, Math.max(0, left - 3));
		assert.equal(table.notes.some(one => one.kind === "delay"), false); replay(table, taken.before); replay(table, afterSample);
		for (const viewer of [1, "spectator"] as const) for (const chosen of taken.selected)
			assert.ok(!describe(table, taken.receipt, viewer).includes(table.things.get(chosen.id)!.card!), "a later discard does not reveal the earlier random selection");
	}
	for (const discarded of [0, 1, 2]) {
		const table = build(); main(table, 0); const { source, before } = cast(table, "Tersa Lightshatter");
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		const hand = cardsIn(table, "hand", 0).length;
		for (let i = 0; i < discarded; i++) step(table, label => label.startsWith("Choose "));
		if (discarded < 2) step(table, label => /choose none|Stop here/.test(label));
		step(table); step(table); settle(table); assert.equal(cardsIn(table, "hand", 0).length, hand); replay(table, before);
		// Seven cards triggers; six does not. Removing one after triggering defeats the intervening if.
		const graveCount = discarded === 0 ? 6 : 7, grave = cardsIn(table, "graveyard", 0);
		commit(table, cardsIn(table, "library", 0).slice(0, graveCount - grave.length).map(one => ({ do: "move", what: one.id, to: "graveyard", reason: "game-setup" })), "game-setup");
		for (let guard = 0; guard < 100; guard++) {
			const decision = nextDecision(table); if (!decision) { advance(table); continue; }
			if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers") break;
			apply(table, quiet(decision.options).id, "model", "chosen");
		}
		const beforeAttack = structuredClone(table); apply(table, `attack:${source.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
		assert.equal(table.waiting.length, graveCount === 7 ? 1 : 0);
		if (graveCount === 6) { settle(table); replay(table, beforeAttack); continue; }
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		if (discarded === 1) {
			commit(table, [{ do: "move", what: cardsIn(table, "graveyard", 0)[0]!.id, to: "exile", reason: "exile" }], "resolve");
			const failed = structuredClone(table), rng = structuredClone(table.rng); passBoth(table); settle(table);
			assert.deepEqual(table.rng, rng); assert.ok(!table.notes.some(one => one.kind === "permit")); replay(table, failed); continue;
		}
		passBoth(table); const taken = sample(table), chosen = table.things.get(taken.selected[0]!.id)!;
		step(table); step(table); settle(table); assert.equal(chosen.zone, "exile");
		assert.ok(playable(tableWorld(table), 0, chosen, table.cursor.turn, false));
		assert.deepEqual(table.notes.find(one => one.kind === "permit")!.on, ref(chosen)); replay(table, taken.before); replay(table, beforeAttack);
		const expiry = structuredClone(table); main(table, 1, 2); assert.ok(!table.notes.some(one => one.kind === "permit")); replay(table, expiry);
	}
	// Anonymous sampling of the other hand or a library never grants a look or starts a search.
	for (const zone of ["hand", "library"] as const) {
		const table = build(); main(table, 0); const source = cardsIn(table, "hand", 0)[0]!;
		commit(table, [{ do: "move", what: source.id, to: "battlefield", reason: "game-setup" }], "game-setup");
		const procedure: Procedure = { source: { refs: [ref(source)] }, claim: "Random selection fixture", basis: "Random selection fixture", timing: "stack", cost: {}, instructions: [
			{ do: "choose", who: "you", from: { zones: [zone], owner: "opponent" }, count: 100, random: true, as: "selected" },
			{ do: "move", what: "bound:selected", to: "graveyard", reason: zone === "hand" ? "discard" : "mill" },
		] };
		const pool = cardsIn(table, zone, 1); assert.ok(new Set(pool.map(one => one.card)).size < pool.length, "the candidates contain physical copies of the same card");
		const before = structuredClone(table); announce(table, procedure); passBoth(table); const taken = sample(table);
		const privateFilter = structuredClone(taken.before), filtered = privateFilter.resolution!.program[0]!.instruction;
		assert.equal(filtered.do, "choose"); if (filtered.do !== "choose") throw new Error("Selection missing");
		filtered.from.types = ["creature"]; const untouched = structuredClone(privateFilter);
		assert.equal(nextDecision(privateFilter)!.options.length, 0); assert.throws(() => apply(privateFilter, "anything", "model", "chosen"), /unseen cards/); assert.deepEqual(privateFilter, untouched);
		const optional = structuredClone(taken.before); optional.resolution!.program[0]!.instruction.may = true;
		const rng = structuredClone(optional.rng); step(optional, label => label.startsWith("Decline")); settle(optional); assert.deepEqual(optional.rng, rng);
		assert.equal(taken.selected.length, pool.length); assert.ok(!table.resolution!.searched && !table.resolution!.seen);
		assert.deepEqual(project(table, 0).resolution!.bound.selected!.objects, []); assert.deepEqual(project(table, "spectator").resolution!.bound.selected!.objects, []);
		settle(table); assert.ok(pool.every(one => one.zone === "graveyard")); replay(table, before); replay(table, taken.before);
	}
	for (const extra of [{ upTo: true }, { reveal: true }]) assert.throws(() => check(PackageSchema, { card: "Casey Jones, Vigilante", registers: [], procedures: [
		{ source: { card: "Casey Jones, Vigilante" }, claim: "fixture", basis: "fixture", timing: "stack", cost: {}, instructions: [{ do: "choose", who: "you", from: { zones: ["hand"], owner: "you" }, count: 1, random: true, ...extra }] },
	] }, "random fixture"));
});
