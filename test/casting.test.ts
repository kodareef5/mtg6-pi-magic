import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { amount, holds, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import type { Procedure } from "../src/core/language.ts";
import { editWork } from "../src/core/work-tools.ts";
import { announce, finish, main, passBoth, place, step } from "./play.ts";

test("casting facts read actual payments and survive resolution only into the resulting permanent", () => {
	for (const reduced of [false, true]) {
		const table = start(standard, [{ deck: deck("Selesnya Landfall") }, { deck: deck("4c Control") }], `spent-${reduced}`);
		const [dyadrine] = place(table, 0, "hand", "Dyadrine, Synthesis Amalgam");
		place(table, 0, "battlefield", "Forest", "Plains");
		main(table, 0);
		commit(table, [{ do: "add-mana", who: 0, colors: ["R", "C"] }], "game-setup");
		editWork(table, 0, [{ do: "package.put", package: { card: dyadrine!.card!, registers: [{ kind: "enters",
			basis: "Dyadrine enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.", counters: { "+1/+1": { manaSpent: "this" } } }] } }], "spent-entry");
		const initial = structuredClone(table), from = table.ledger.length;
		const procedure: Procedure = { source: { card: dyadrine!.card!, zones: ["hand"] }, timing: "spell", claim: "Cast Dyadrine", basis: "Printed {X}{G}{W}",
			instructions: [], ...(reduced ? { cost: { reduce: 2 } } : {}) };
		announce(table, procedure, (one) => one.activation.x === 2 && one.activation.paid.length === (reduced ? 0 : 2));
		const stack = structuredClone(dyadrine!);
		const read = () => ({ world: tableWorld(table), controller: 0, source: dyadrine });
		assert.equal(amount(read(), { manaSpent: "this" }), reduced ? 2 : 4);
		assert.equal(amount(read(), { manaValue: "this" }), 4, "a reduction changes payment, not the announced X");
		assert.equal(amount(read(), { colorsSpent: "this" }), reduced ? 2 : 3, "colorless pays generic but adds no color");
		assert.equal(amount(read(), { manaSpent: "this", color: "G" }), 1);
		assert.equal(holds(read(), { cast: "this", from: "hand" }), true);
		passBoth(table); step(table);
		assert.equal(dyadrine!.counters["+1/+1"], reduced ? 2 : 4, "entry reads the spell before its entry receipt exists");
		finish(table);
		assert.equal(amount(read(), { manaSpent: "this" }), reduced ? 2 : 4, "the permanent retains its casting provenance after the ability is cleared");
		const projected = project(table, 1), seen = projected.objects!.find((one) => one.id === dyadrine!.id)!;
		assert.equal(amount({ world: viewWorld(projected), controller: 1, source: seen }, { manaSpent: "this" }), reduced ? 2 : 4);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		commit(table, [{ do: "move", what: dyadrine!.id, to: "exile", reason: "exile" },
			{ do: "move", what: dyadrine!.id, to: "battlefield", reason: "resolve", registers: table.work[0]!.packages![0]!.registers }], "resolve");
		assert.equal(amount(read(), { manaSpent: "this" }), 0, "a blink is not a cast and cannot inherit an earlier payment");
		assert.equal(dyadrine!.counters["+1/+1"] ?? 0, 0);
		assert.equal(holds(read(), { cast: "this" }), false);
		assert.equal(amount({ ...read(), event: { object: stack } }, { manaSpent: "event:object" }), reduced ? 2 : 4, "old spell events keep the actual payment");
	}
});
