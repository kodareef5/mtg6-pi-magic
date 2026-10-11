import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { relive } from "../src/core/journal.ts";
import { amount, holds, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import type { Procedure } from "../src/core/language.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { checkProcedure, checkReferences } from "../src/core/procedures.ts";
import { announcementOffers } from "../src/core/announcement-options.ts";
import { beginAnnouncement } from "../src/core/announcing.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { manaBudget } from "../src/core/budget.ts";
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
	// The casting half of offspring: payment is independent of the printed or
	// permitted base price, and of the future token-copy instruction.
	for (const alternative of [false, true]) for (const paid of [false, true]) for (const reduced of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Rakdos Lizards")) }, { deck: deck("Mono-Green Landfall") }],
			`offspring-cost-${alternative}-${paid}-${reduced}`, undefined, { announcementsFrom: 0 });
		const [lizard] = place(table, 0, alternative ? "exile" : "hand", "Iridescent Vinelasher");
		main(table, 0);
		if (alternative) commit(table, [{ do: "note", note: { kind: "permit", on: { id: lizard!.id, incarnation: lizard!.incarnation },
			by: 0, who: 0, fromTurn: 0, mana: "{2}", until: "indefinite" } }], "resolve");
		commit(table, [{ do: "add-mana", who: 0, colors: ["B", "C", "C", "C"] }], "game-setup");
		const procedure: Procedure = checkProcedure({ source: { card: lizard!.card!, refs: [{ id: lizard!.id, incarnation: lizard!.incarnation }], zones: ["hand", "exile"], controller: "self" },
			claim: `Cast Vinelasher ${paid ? "with" : "without"} offspring`, basis: table.printed[lizard!.card!]!.oracle.split("\n")[0]!,
			timing: "spell", cost: { ...(paid ? { additional: [{ name: "offspring", mana: "{2}" }] } : {}), ...(reduced ? { reduce: 4 } : {}) }, instructions: [] });
		const total = reduced ? alternative ? 0 : 1 : (alternative ? 2 : 1) + (paid ? 2 : 0);
		const frame = workFrame(table, 0), shown = frame.view.objects!.find(one => one.id === lizard!.id)!;
		if (!reduced) {
			const budget = manaBudget(frame, procedure, shown);
			assert.equal(budget.payableBeforeNewResources, true);
			assert.equal(budget.cost, alternative ? `{${total}}` : paid ? "{2}{B}" : "{B}");
		}
		const initial = structuredClone(table), from = table.ledger.length;
		const root = announcementOffers(procedure, frame, "offspring")[0]!;
		assert.ok(root);
		beginAnnouncement(table, root.announcement, { picked: root.option.id, offered: [root.option.id], by: "model", why: "declared" });
		apply(table, "announce:cost:0", "model", "chosen");
		assert.equal(table.announcement!.cost!.price.generic + table.announcement!.cost!.price.colors.length, total, JSON.stringify({ alternative, paid, reduced, root: root.announcement.permission, cost: table.announcement!.cost!.price }));
		const pending = structuredClone(table), at = table.ledger.length;
		while (!nextDecision(table)!.options.some(one => one.id === "announce:confirm"))
			apply(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:pay:"))!.id, "model", "chosen");
		apply(table, "announce:confirm", "model", "chosen");
		const read = () => ({ world: tableWorld(table), controller: 0, source: lizard });
		assert.equal(amount(read(), { manaSpent: "this" }), total);
		assert.equal(amount(read(), { manaValue: "this" }), 1);
		assert.equal(holds(read(), { cast: "this", paid: "offspring" }), paid);
		assert.equal(holds(read(), { cast: "this", paid: "offspring-2" }), false);
		passBoth(table); finish(table);
		assert.equal(lizard!.zone, "battlefield");
		assert.equal(holds(read(), { cast: "this", paid: "offspring" }), paid, "a reduced-to-zero cost was still chosen and paid");
		const view = project(table, 1), other = view.objects!.find(one => one.id === lizard!.id)!;
		assert.equal(holds({ world: viewWorld(view), controller: 1, source: other }, { cast: "this", paid: "offspring" }), paid);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
		commit(table, [{ do: "move", what: lizard!.id, to: "exile", reason: "exile" },
			{ do: "move", what: lizard!.id, to: "battlefield", reason: "resolve" }], "resolve");
		assert.equal(holds(read(), { cast: "this", paid: "offspring" }), false);
		assert.throws(() => checkProcedure({ ...procedure, timing: "stack", cost: { additional: [{ name: "offspring", mana: "{2}" }] } }), /spell announcement/);
		assert.throws(() => checkProcedure({ ...procedure, cost: { additional: [{ name: "same", mana: "{1}" }, { name: "same", mana: "{2}" }] } }), /distinct name/);
		assert.throws(() => checkReferences({ do: "pay", who: "you", cost: { additional: [{ name: "later", mana: "{1}" }] } }), /spell announcement/);
		assert.throws(() => checkReferences({ do: "counter", unless: { who: "you", pays: { additional: [{ name: "later", mana: "{1}" }] } } }), /spell announcement/);
	}
});
