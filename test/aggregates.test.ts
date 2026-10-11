/** Set amounts use current characteristics and preserve the colored part of a reduced price. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { amount, matches, select, tableWorld, viewWorld } from "../src/core/selectors.ts";
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

test("Adventure alternatives count once with normal characteristics and never reveal a hidden identity", () => {
	const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("Boros Dragons") }], "adventure-count");
	main(table, 0);
	const card = "Hearth Elemental // Stoke Genius", spell = example("Cast Hearth Elemental with its graveyard reduction");
	const grave = place(table, 0, "graveyard", card, "Burst Lightning", "Sleight of Hand", "Eddymurk Crab");
	const hand = place(table, 0, "hand", card)[0]!;
	const omen = place(table, 1, "graveyard", "Twinmaw Stormbrood // Charring Bite")[0]!;
	const scope = () => ({ world: tableWorld(table), controller: 0 });
	assert.equal(amount(scope(), spell.cost!.reduce!), 3, "creature Adventure, instant and sorcery each count once");
	assert.equal(select(scope(), { zones: ["graveyard"], hasAdventure: true }).length, 1, "an Omen is not an Adventure");
	assert.ok(select(scope(), { zones: ["graveyard"], hasAdventure: false }).some((one) => one.id === omen.id));
	for (const viewer of [0, 1, "spectator"] as const) {
		const seen = { world: viewWorld(project(table, viewer)), controller: 0 };
		assert.equal(amount(seen, spell.cost!.reduce!), 3);
		assert.equal(select(seen, { zones: ["hand"], owner: "you", hasAdventure: true }).some((one) => one.id === hand.id), viewer === 0);
		if (viewer !== 0) assert.equal(select(seen, { zones: ["hand"], owner: "you", hasAdventure: false }).length, 0, "negation cannot identify unseen cards either");
	}
	assert.equal(matches(scope(), { ...grave[0]!, faceDown: true }, { zones: ["graveyard"], hasAdventure: true }, scope().world.read(grave[0]!)), false);
	commit(table, [{ do: "add-mana", who: 0, colors: ["R", "C", "C"] }], "game-setup");
	assert.ok(offered(table, spell).length);
	assert.ok(offered(table, spell).every((one) => one.activation.cost.generic === 2));
	const prefix = structuredClone(table), at = table.ledger.length;
	const chosen = announce(table, spell); const clone = structuredClone(table), after = table.ledger.length;
	assert.ok(select(scope(), { zones: ["stack"], hasAdventure: true }).some((one) => one.id === chosen.activation.source.id));
	passBoth(table); finish(table);
	assert.deepEqual(relive(prefix, table.ledger.slice(at)), table);
	assert.deepEqual(relive(clone, table.ledger.slice(after)), table);
});
