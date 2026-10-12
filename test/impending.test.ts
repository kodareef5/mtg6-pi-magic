/** Impending reads the actual named cast throughout one battlefield incarnation.
 * Past 150 lines to check entry observation, graveyard selection, every end step and later counter changes together. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { editWork } from "../src/core/work-tools.ts";
import { printedCast } from "../src/core/procedures.ts";
import { casting } from "../src/core/casting.ts";
import { project } from "../src/core/view.ts";
import { main, announce, passBoth, step, finish, pack, example, quiet } from "./play.ts";

const overlord = "Overlord of the Balemurk", terror = "Terror of the Peaks", bookworm = "Oblivious Bookworm";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
function put(table: Table, name: string, zone: "hand" | "graveyard" | "battlefield", owner = 0) {
	const object = [...table.things.values()].find(one => one.owner === owner && one.card === name && one.zone === "library")
		?? [...table.things.values()].find(one => one.owner === owner && one.card === name && one.zone === "hand");
	assert.ok(object);
	commit(table, [{ do: "move", what: object.id, to: zone, ...(zone === "battlefield" ? { registers: [terror, "Torpor Orb"].includes(name) ? pack(name) : [] } : {}), reason: "game-setup" }], "game-setup");
	return object;
}
function end(table: Table) {
	for (let guard = 0; guard < 500; guard++) {
		const decision = nextDecision(table);
		if (table.cursor.steps[0] === "end" && decision && ["trigger-order", "priority"].includes(decision.situation)) return decision;
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	throw new Error("Never reached the end step");
}
function assertBody(table: Table, card: Thing, creature: boolean) {
	const before = structuredClone(table), traits = characteristics(table, card)!;
	assert.ok(traits.types.includes("enchantment"));
	assert.equal(traits.types.includes("creature"), creature);
	assert.equal(traits.power, creature ? 5 : undefined); assert.equal(traits.toughness, creature ? 5 : undefined);
	assert.equal(traits.subtypes.includes("Avatar"), creature);
	for (const who of [0, 1, "spectator"] as const)
		assert.equal(project(table, who).objects!.find(one => one.id === card.id)!.traits!.types.includes("creature"), creature);
	assert.deepEqual(table, before, "reading and projecting characteristics changes nothing");
}

test("impending is already noncreature at entry, counts down only while its cast and counters qualify, and resets on a new incarnation", () => {
	for (const mode of ["ordinary", "reduced", "impending", "orb"] as const) {
		const impending = mode === "impending" || mode === "orb";
		const table = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: alpha(deck("Jeskai Artifacts")) }], `impending-${mode}`);
		main(table, 0);
		const card = put(table, overlord, "hand"), excluded = put(table, overlord, "graveyard"), returned = put(table, bookworm, "graveyard");
		put(table, terror, "battlefield");
		if (mode === "orb") put(table, "Torpor Orb", "battlefield", 1);
		editWork(table, 0, [{ do: "package.put", package: { card: overlord, printedCast: true, registers: pack(overlord), procedures: [example("Cast Overlord for impending")], assessed: true } }], "prepare-overlord");
		if (mode === "reduced") {
			const land = put(table, "Forest", "battlefield");
			commit(table, [{ do: "note", note: { kind: "label", on: ref(land), by: 0, until: "indefinite", text: "Ordinary-price reduction fixture", change: { registers: [
				{ kind: "cost", basis: "Ordinary-price reduction fixture", cast: { zones: ["stack"], controller: "you" }, reduce: 3 },
			] } } }], "game-setup");
		}
		commit(table, [{ do: "add-mana", who: 0, colors: Array.from({ length: mode === "ordinary" ? 5 : 2 }, () => "B" as const) }], "game-setup");
		const initial = structuredClone(table), at = table.ledger.length;
		const announced = announce(table, impending ? example("Cast Overlord for impending") : printedCast(overlord, table.printed[overlord]!));
		assert.equal(announced.activation.source.id, card.id);
		assert.equal(announced.activation.paid.length, mode === "ordinary" ? 5 : 2, "reduced normal and impending casts can spend the same mana");
		passBoth(table); finish(table);
		assert.equal(card.counters.time ?? 0, impending ? 5 : 0);
		assertBody(table, card, !impending);
		assert.equal(table.waiting.length, impending ? 1 : 2, "the impending entry neither triggers Terror nor lets Torpor Orb suppress Overlord");
		const pending = structuredClone(table), from = table.ledger.length;
		if (!impending) apply(table, nextDecision(table)!.options.find(one => one.trigger?.name.includes(terror) && one.trigger.targets.some(target => "player" in target && target.player === 1))!.id, "model", "chosen");
		apply(table, nextDecision(table)!.options.find(one => one.trigger?.name.includes(overlord))!.id, "model", "chosen");
		passBoth(table);
		const graveyard = cardsIn(table, "graveyard", 0).length;
		step(table); assert.equal(cardsIn(table, "graveyard", 0).length, graveyard + 4, "mill precedes the return selection");
		const choose = nextDecision(table)!;
		assert.ok(!choose.options.some(one => one.objects?.some(one => one.id === excluded.id)), "Avatar creatures cannot be returned");
		const returning = choose.options.find(one => one.objects?.some(one => one.id === returned.id)); assert.ok(returning);
		apply(table, returning.id, "model", "chosen"); finish(table); assert.equal(returned.zone, "hand");
		if (!impending) { passBoth(table); finish(table); assert.equal(table.seats[1]!.life, 15); }
		assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(at)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(from)), table);
		const started = structuredClone(table), since = table.ledger.length;
		if (!impending) {
			assert.equal(end(table).situation, "priority", "an ordinary cast has no impending countdown");
			assert.deepEqual(relive(started, table.ledger.slice(since)), table);
			continue;
		}
		for (let remaining = 5; remaining > 0; remaining--) {
			if (remaining !== 5) main(table, 0, 1 + (5 - remaining) * 2);
			assert.equal(card.counters.time, remaining, "the opponent's end step does not remove a counter");
			const decision = end(table); assert.equal(decision.situation, "trigger-order");
			apply(table, decision.options[0]!.id, "model", "chosen");
			if (remaining === 5) {
				const branch = structuredClone(table), before = branch.log.length;
				commit(branch, [{ do: "counters", what: card.id, kind: "time", amount: -5 }], "resolve");
				const empty = structuredClone(branch), row = branch.ledger.length;
				passBoth(branch); finish(branch);
				assert.ok(!branch.log.slice(before + 1).some(one => one.changes.some(change => change.do === "counters")), "the intervening condition is rechecked before resolving");
				assert.deepEqual(relive(empty, branch.ledger.slice(row)), branch);
			}
			const pending = structuredClone(table), row = table.ledger.length;
			passBoth(table); finish(table);
			assert.equal(card.counters.time ?? 0, remaining - 1); assertBody(table, card, remaining === 1);
			assert.equal(table.waiting.length, 0, "becoming a creature is not another entry");
			assert.deepEqual(relive(pending, table.ledger.slice(row)), table);
		}
		assert.deepEqual(relive(started, table.ledger.slice(since)), table);
		commit(table, [{ do: "counters", what: card.id, kind: "time", amount: 1 }], "resolve");
		assertBody(table, card, false);
		const later = structuredClone(table), laterAt = table.ledger.length;
		main(table, 0, 11); const again = end(table); assert.equal(again.situation, "trigger-order");
		apply(table, again.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
		assertBody(table, card, true); assert.deepEqual(relive(later, table.ledger.slice(laterAt)), table);
		const attacking = structuredClone(table), attackAt = table.ledger.length;
		main(table, 0, 13);
		for (let guard = 0; guard < 100; guard++) {
			const decision = nextDecision(table);
			if (decision?.options.some(one => one.id === "attack:done")) break;
			if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
		}
		const attack = nextDecision(table)!.options.find(one => one.id.startsWith("attack:") && one.objects?.some(one => one.id === card.id)); assert.ok(attack);
		apply(table, attack.id, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
		assert.equal(table.waiting.length, 1, "the mature Overlord still triggers on attacking through Torpor Orb");
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		const beforeMill = cardsIn(table, "graveyard", 0).length;
		step(table); assert.equal(cardsIn(table, "graveyard", 0).length, beforeMill + 4);
		step(table, label => label.startsWith("Decline") || label === "Nothing can be chosen"); finish(table);
		assert.equal(cardsIn(table, "graveyard", 0).length, beforeMill + 4, "the attack return can be declined");
		assert.deepEqual(relive(attacking, table.ledger.slice(attackAt)), table);
		const old = ref(card);
		commit(table, [{ do: "move", what: card.id, to: "graveyard", reason: "destroy" }], "resolve");
		commit(table, [{ do: "move", what: card.id, to: "battlefield", registers: pack(overlord), reason: "resolve" }], "resolve");
		assert.notEqual(card.incarnation, old.incarnation); assert.equal(casting(table, ref(card)), undefined);
		assert.equal(card.counters.time ?? 0, 0); assertBody(table, card, true);
		assert.equal(table.waiting.length, mode === "orb" ? 0 : 2, "the noncast creature entry is suppressed by Torpor Orb");
	}
});
