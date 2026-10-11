/** A next-cast effect is consumed by its matching announcement, before priority or triggers. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { activationChanges } from "../src/core/procedures.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { cardsIn } from "../src/core/table.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, example, finish, main, offered, passBoth, place, step } from "./play.ts";

test("future spell words are applied before responses and consume only the next matching cast", () => {
	const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Dimir Control") }], "mistrise-next-spell");
	establish(table, 0, "Mistrise Village", []);
	const turtle = establish(table, 1, "Aegis Turtle", []);
	main(table, 0);
	place(table, 0, "hand", "Stock Up", "Stock Up");
	place(table, 1, "hand", "Negate", "Unsummon");
	commit(table, [{ do: "add-mana", who: 0, colors: ["U", "U", "U", "C", "C", "C", "C"] }, { do: "add-mana", who: 1, colors: ["U", "U", "C"] }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, example("Protect the next spell with Mistrise Village")); passBoth(table); finish(table);
	assert.equal(table.notes.filter((one) => one.kind === "cast-words").length, 1);
	const expiry = structuredClone(table); main(expiry, 1, 2);
	assert.equal(expiry.notes.filter((one) => one.kind === "cast-words").length, 0, "an unused effect expires at cleanup");
	apply(table, "pass", "model", "chosen");
	announce(table, { source: { card: "Unsummon", zones: ["hand"] }, claim: "Unsummon", basis: table.printed.Unsummon!.oracle, timing: "spell",
		targets: [{ object: { types: ["creature"] } }], instructions: [{ do: "move", what: "target:0", to: "hand", reason: "bounce" }] });
	passBoth(table); finish(table); assert.equal(turtle.zone, "hand");
	assert.equal(table.notes.filter((one) => one.kind === "cast-words").length, 1, "an opponent's cast cannot consume the effect");
	const stock = example("Stock Up from five cards"), option = offered(table, stock)[0]!;
	assert.deepEqual(option.activation.words, ["can't be countered"], "the offered action states the property before casting");
	const untouched = structuredClone(table);
	assert.throws(() => activationChanges(table, { ...option.activation, cost: { ...option.activation.cost, generic: 99 } }));
	assert.deepEqual(table, untouched);
	const before = structuredClone(table), at = table.ledger.length;
	announce(table, stock);
	const spell = cardsIn(table, "stack")[0]!;
	assert.ok(characteristics(table, spell)!.words.includes("can't be countered"));
	assert.equal(table.notes.filter((one) => one.kind === "cast-words").length, 0);
	assert.equal(table.waiting.length, 0, "the property creates no trigger to respond to");
	apply(table, "pass", "model", "chosen");
	const negate: Procedure = { source: { card: "Negate", zones: ["hand"] }, claim: "Negate", basis: table.printed.Negate!.oracle, timing: "spell",
		targets: [{ object: { zones: ["stack"], not: { types: ["creature"] } } }], instructions: [{ do: "counter", what: "target:0" }] };
	announce(table, negate); passBoth(table);
	assert.ok(nextDecision(table)!.options.some((one) => one.label.includes("conflicts with can't be countered")), "the original instruction stays available with its conflict");
	step(table, (label) => label.startsWith("Apply can't be countered")); finish(table);
	assert.equal(spell.zone, "stack");
	passBoth(table); while (table.resolution) step(table, () => true); finish(table);
	assert.equal(spell.zone, "graveyard");
	assert.ok(!characteristics(table, spell)!.words.includes("can't be countered"), "the property belongs only to that spell");
	assert.ok(offered(table, stock).every((one) => !one.activation.words?.includes("can't be countered")), "the next spell gets no consumed effect");
	assert.deepEqual(relive(before, table.ledger.slice(at)), table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
});
