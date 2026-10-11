/** Set amounts use current characteristics and preserve the colored part of a reduced price. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { amount, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { relive } from "../src/core/journal.ts";
import type { Amount } from "../src/core/language.ts";
import { announce, establish, example, finish, main, offered, passBoth, place } from "./play.ts";

test("set aggregates read layers, empty sets and distinct extrema for a replayable reduced cast", () => {
	const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("Mono-Red Aggro") }], "greatest-elemental");
	main(table, 0);
	const greatest: Amount = { aggregate: "max", of: { controller: "self", subtypes: ["Elemental"] }, value: "manaValue" };
	const read = (value: Amount) => amount({ world: tableWorld(table), controller: 0 }, value);
	assert.equal(read(greatest), 0);
	const first = establish(table, 0, "Hearth Elemental // Stoke Genius", []);
	establish(table, 0, "Hearth Elemental // Stoke Genius", []);
	assert.equal(read(greatest), 6); assert.equal(read({ ...greatest, aggregate: "sum" }), 12);
	const crab = establish(table, 0, "Eddymurk Crab", []);
	assert.equal(read(greatest), 7); assert.equal(read({ ...greatest, aggregate: "min" }), 6);
	commit(table, [{ do: "note", note: { kind: "label", on: { id: first.id, incarnation: first.incarnation }, by: 0, until: "end-of-turn", text: "Power adjustment",
		change: { power: 3 } } }], "game-setup");
	assert.equal(read({ ...greatest, value: "power" }), 7, "aggregate reads modified power, not the printed body");
	assert.equal(amount({ world: viewWorld(project(table, 0)), controller: 0 }, greatest), 7);
	place(table, 0, "hand", "Sunderflock");
	commit(table, [{ do: "add-mana", who: 0, colors: ["U", "U", "C"] }], "game-setup");
	const spell = example("Cast Sunderflock with its greatest-Elemental reduction");
	assert.ok(offered(table, spell).every((one) => one.activation.cost.generic === 0 && one.activation.cost.colors.join("") === "UU"));
	commit(table, [{ do: "move", what: crab.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.equal(read(greatest), 6);
	const options = offered(table, spell); assert.ok(options.length);
	assert.ok(options.every((one) => one.activation.cost.generic === 1 && one.activation.cost.colors.join("") === "UU"), "two six-mana Elementals reduce by six, not twelve");
	const prefix = structuredClone(table), from = table.ledger.length;
	announce(table, spell); const clone = structuredClone(table), at = table.ledger.length;
	passBoth(table); finish(table);
	assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
});
