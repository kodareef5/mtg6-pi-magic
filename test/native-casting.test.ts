/** A native permission starts readiness and carries its chosen price through payment and departure. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { preparation, useSources } from "../src/core/readiness.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import { playable } from "../src/core/permits.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { activationChanges } from "../src/core/procedures.ts";
import { announce, example, finish, main, offered, pack, passBoth, place, step } from "./play.ts";

function discard(table: Table, creature: boolean) {
	step(table); // Draw first, then choose the branch using the new hand.
	const before = cardsIn(table, "hand", 0).length;
	step(table, (label) => creature ? label.includes("Eddymurk Crab") : label.startsWith("Decline"));
	const partial = structuredClone(table), at = table.ledger.length;
	step(table); // Discard the creature or skip its empty branch.
	if (!creature) { step(table, (label) => label.startsWith("Choose")); step(table, (label) => label.startsWith("Choose")); }
	finish(table);
	assert.equal(cardsIn(table, "hand", 0).length, before - (creature ? 1 : 2));
	assert.deepEqual(relive(partial, table.ledger.slice(at)), table, "a clone after the branch choice discards the same cards");
}

test("a native graveyard permission requires interpretation before actions and preserves its price and departure", () => {
	const normal = example("Winternight Stories draws and discards"), harmonize = example("Harmonize Winternight Stories");
	for (const payment of ["none", "elf", "crab"] as const) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("Mono-Green Landfall") }], `native-${payment}`);
		main(table, 0);
		const [spell] = place(table, 0, "graveyard", "Winternight Stories");
		const [crab] = place(table, 0, "battlefield", "Eddymurk Crab");
		place(table, 0, "hand", "Eddymurk Crab");
		const [elf] = place(table, 1, "graveyard", "Llanowar Elves");
		commit(table, [{ do: "move", what: elf!.id, to: "battlefield", controller: 0, registers: pack("Llanowar Elves"), reason: "resolve" },
			{ do: "counters", what: elf!.id, kind: "+1/+1", amount: 2 }], "game-setup");
		const registers = pack("Winternight Stories"), uses = [normal, harmonize].map(({ claim, basis, source, timing }) => ({ claim, basis, source, timing: timing as "spell" }));
		editWork(table, 0, [{ do: "package.put", package: { card: spell!.card!, assessed: true, registers, deferred: uses } }], "native-permission");
		for (const world of [tableWorld(table), viewWorld(project(table, 0))]) {
			const seen = world.objects.find((one) => one.id === spell!.id)!;
			assert.equal(playable(world, 0, seen, table.cursor.turn, false), true);
			assert.equal(playable(world, 1, seen, table.cursor.turn, false), false);
		}
		assert.ok(preparation(workFrame(table, 0))[0]!.uses.some((one) => one.claim === harmonize.claim), "a permitted graveyard use is required without mana");
		assert.throws(() => apply(table, "pass", "model", "chosen"), /Prepare the known uses/);
		const hidden = structuredClone(table);
		commit(hidden, [{ do: "move", what: spell!.id, to: "exile", reason: "exile" }], "exile");
		assert.equal(useSources(workFrame(hidden, 0), harmonize).length, 0, "a native graveyard permission does not reach exile");
		editWork(table, 0, [{ do: "package.put", package: { card: spell!.card!, assessed: true, registers, procedures: [normal, harmonize], deferred: [] } }], "native-use");
		commit(table, [{ do: "add-mana", who: 0, colors: ["U", "C", "C", "C", "C"] }], "game-setup");
		const variants = offered(table, harmonize);
		assert.ok(variants.some((one) => !one.activation.cost.tapped?.length && one.activation.cost.generic === 4));
		assert.ok(variants.some((one) => one.activation.cost.tapped?.[0]?.id === elf!.id && one.activation.cost.generic === 1), "read the chosen creature's current layered power");
		assert.ok(variants.some((one) => one.activation.cost.tapped?.[0]?.id === crab!.id && one.activation.cost.generic === 0), "power above four does not erase colored mana");
		assert.ok(variants.every((one) => one.activation.cost.colors.join("") === "U" && one.activation.leavesStack === "exile"));
		assert.ok(variants.every((one) => !one.activation.funding?.some((mana) => one.activation.cost.tapped?.some((tap) => tap.id === mana.source.id))), "tapped payment resources cannot also produce mana");
		assert.equal(offered(table, { ...harmonize, cost: { mana: "{0}" } }).length, 0, "a different alternative price cannot replace the permission");
		const colorless = structuredClone(table);
		commit(colorless, [{ do: "spend-mana", who: 0, ids: colorless.seats[0]!.pool.filter((one) => one.color === "U").map((one) => one.id) }], "game-setup");
		assert.equal(offered(colorless, harmonize).length, 0);
		const chosen = variants.find((one) => !one.activation.funding?.length && (payment === "none" ? !one.activation.cost.tapped?.length :
			one.activation.cost.tapped?.[0]?.id === (payment === "elf" ? elf!.id : crab!.id)))!;
		assert.ok(chosen);
		const tapped = chosen.activation.cost.tapped?.[0];
		if (tapped) assert.throws(() => activationChanges(table, { ...chosen.activation,
			cost: { ...chosen.activation.cost, tapped: [tapped, tapped] } }), /tapped twice/);
		const initial = structuredClone(table), at = table.ledger.length;
		announce(table, harmonize, (one) => one.option.id === chosen.option.id);
		assert.equal(elf!.tapped, payment === "elf"); assert.equal(crab!.tapped, payment === "crab");
		assert.equal(spell!.ability!.cost.generic, payment === "none" ? 4 : payment === "elf" ? 1 : 0);
		const onStack = structuredClone(table), from = table.ledger.length;
		passBoth(table); discard(table, payment !== "none");
		assert.equal(spell!.zone, "exile");
		assert.deepEqual(relive(onStack, table.ledger.slice(from)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
});

test("a creature-or-two-card discard binds the selected branch and moves exactly its own hand cards", () => {
	for (const creature of [false, true]) {
		const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], `discard-branch-${creature}`);
		main(table, 0); place(table, 0, "hand", "Winternight Stories", "Eddymurk Crab");
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C", "U"] }], "game-setup");
		const initial = structuredClone(table), at = table.ledger.length, other = structuredClone(cardsIn(table, "hand", 1));
		const { activation } = announce(table, example("Winternight Stories draws and discards")); passBoth(table); discard(table, creature);
		assert.equal(table.things.get(activation.source.id)!.zone, "graveyard", "an ordinary cast has no harmonize departure");
		assert.deepEqual(cardsIn(table, "hand", 1), other);
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
});
