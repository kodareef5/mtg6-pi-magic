/** One occurrence of target selects distinct recipients and keeps a single instruction simultaneous. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { activationChanges, checkProcedure } from "../src/core/procedures.ts";
import { announce, example, finish, main, offered, passBoth, place, step } from "./play.ts";

test("one target slot enforces its range and uniqueness while resolving all surviving members together", () => {
	const damage = example("Prismari Charm deals 1 to each of one or two targets");
	for (const invalid of [{ count: 2, atLeast: 3 }, { count: 2, atLeast: 1, upTo: true }])
		assert.throws(() => checkProcedure({ ...damage, targets: [{ ...damage.targets![0], ...invalid }] }), /target minimum/);
	for (const lost of [false, true]) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], `bounded-targets-${lost}`);
		main(table, 0); place(table, 0, "hand", "Prismari Charm");
		const [crab] = place(table, 0, "battlefield", "Eddymurk Crab");
		commit(table, [{ do: "add-mana", who: 0, colors: ["U", "R"] }], "game-setup");
		const choices = offered(table, damage), targets = choices.map((one) => one.activation.targets[0]!);
		assert.deepEqual(new Set(targets.map((one) => one.length)), new Set([1, 2]));
		assert.ok(targets.every((set) => new Set(set.map((one) => JSON.stringify(one))).size === set.length));
		const mixed = choices.find((one) => one.activation.targets[0]?.some((one) => "id" in one && one.id === crab!.id) &&
			one.activation.targets[0]?.some((one) => "player" in one && one.player === 1))!;
		for (const bad of [[], [mixed.activation.targets[0]![0]!, mixed.activation.targets[0]![0]!], [...mixed.activation.targets[0]!, { player: 0 }]]) {
			const before = structuredClone(table);
			assert.throws(() => activationChanges(table, { ...mixed.activation, targets: [bad] }), /target slot/);
			assert.deepEqual(table, before, "a bad declared target count or duplicate moves nothing");
		}
		const initial = structuredClone(table), at = table.ledger.length;
		announce(table, damage, (one) => one.option.id === mixed.option.id);
		if (lost) commit(table, [{ do: "move", what: crab!.id, to: "graveyard", reason: "destroy" }], "destroy");
		passBoth(table);
		const partial = structuredClone(table), from = table.ledger.length;
		step(table);
		const dealt = table.log.at(-1)!.changes.filter((one) => one.do === "damage");
		assert.equal(dealt.length, lost ? 1 : 2, "every surviving target takes damage in one group");
		assert.equal(table.seats[1]!.life, 19); assert.equal(crab!.damage, lost ? 0 : 1);
		finish(table);
		assert.deepEqual(relive(partial, table.ledger.slice(from)), table);
		if (!lost) assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
	const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], "bounded-returns");
	main(table, 0); place(table, 0, "hand", "Get Out");
	const [crab, hearth] = place(table, 0, "graveyard", "Eddymurk Crab", "Hearth Elemental // Stoke Genius");
	commit(table, [{ do: "move", what: crab!.id, to: "battlefield", controller: 1, reason: "resolve" },
		{ do: "move", what: hearth!.id, to: "battlefield", reason: "resolve" }, { do: "add-mana", who: 0, colors: ["U", "U"] }], "game-setup");
	const initial = structuredClone(table), at = table.ledger.length;
	announce(table, example("Get Out returns one or two creatures or enchantments you own"), (one) => one.activation.targets[0]?.length === 2);
	passBoth(table); step(table);
	const returned = table.log.at(-1)!.changes.filter((one) => one.do === "move" && one.to === "hand");
	assert.equal(returned.length, 2); assert.equal(crab!.zone, "hand"); assert.equal(hearth!.zone, "hand");
	finish(table); assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
});
