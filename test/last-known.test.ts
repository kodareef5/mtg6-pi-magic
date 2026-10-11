/** Information survives a departure; physical instructions cannot reuse the old incarnation. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { amount, objects, players, tableWorld, targetKey } from "../src/core/selectors.ts";
import { announce, establish, example, finish, main, passBoth, place, step } from "./play.ts";

test("resolution reads departed targets without moving their new incarnation or changing instruction order", () => {
	const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], "defeat-last-controller");
	const victim = establish(table, 0, "Thor, God of Thunder", []);
	commit(table, [{ do: "move", what: victim.id, to: "battlefield", controller: 1, reason: "game-setup" }], "game-setup");
	main(table, 0);
	place(table, 0, "hand", "Inevitable Defeat");
	commit(table, [{ do: "add-mana", who: 0, colors: ["C", "R", "W", "B"] }], "game-setup");
	const target = { id: victim.id, incarnation: victim.incarnation };
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, example("Exile, then change life totals with Inevitable Defeat")); passBoth(table);
	step(table, () => true);
	assert.equal(victim.zone, "exile");
	assert.deepEqual(table.seats.map((one) => one.life), [20, 20], "exile precedes both life changes");
	const scope = { world: tableWorld(table), controller: 0, targets: [[target]] };
	assert.deepEqual(objects(scope, "target:0"), [], "the old target cannot move again");
	assert.deepEqual(players(scope, "controller:target:0"), [1], "read the former controller, not the exile object's owner");
	assert.deepEqual(players(scope, "owner:target:0"), [0]);
	assert.equal(amount(scope, { power: "target:0" }), 5);
	assert.equal(amount(scope, { manaValue: "target:0" }), 5);
	assert.deepEqual(players({ ...scope, illegal: [targetKey(target)] }, "controller:target:0"), []);
	const clone = structuredClone(table), at = table.ledger.length;
	finish(table);
	assert.deepEqual(table.seats.map((one) => one.life), [23, 17]);
	assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
});
