import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { start, commit } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { fundings, type Price } from "../src/core/funding.ts";
import { payable, paymentOptions } from "../src/core/payment-options.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { main, establish, place } from "./play.ts";

test("partial mana selections retain every complete payment without spending or enumerating the product", () => {
	const table = start(standard, [{ deck: deck("Jund Sacrifice") }, { deck: deck("Mono-Red Aggro") }], "partial-payments");
	const town = establish(table, 0, "Starting Town", [
		{ kind: "mana", basis: "{T}: Add {C}.", cost: { tap: true }, colors: ["C"] },
		{ kind: "mana", basis: "{T}, Pay 1 life: Add one mana of any color.", cost: { tap: true, life: 1 }, any: 1 },
	]);
	place(table, 0, "battlefield", "Swamp", "Blood Crypt", "Stomping Ground");
	main(table, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: ["B", "G"] }], "game-setup");
	const before = structuredClone(table), frame = workFrame(table, 0);
	for (const except of [new Set<string>(), new Set([town.id])]) for (const colors of [[], ["B"], ["R", "G"], ["W", "W"]] as Price["colors"][]) {
		for (let generic = 0; generic <= 5; generic++) {
			const price = { generic, colors }, all = fundings(frame, price, except);
			assert.equal(payable(frame, price, except), all.length > 0);
			assert.equal(paymentOptions(frame, price, [], except).possible, all.length > 0);
			for (const { funding } of all) {
				const selected: string[] = [];
				for (const part of [...funding.paid.map((id) => ({ paid: [id], taps: [] })), ...funding.taps.map((tap) => ({ paid: [], taps: [tap] }))]) {
					const next = paymentOptions(frame, price, selected, except).next.find((one) => isDeepStrictEqual(one.funding, part));
					assert.ok(next, "each complete payment has a path through individual resource choices"); selected.push(next.id);
				}
				const finished = paymentOptions(frame, price, selected, except);
				assert.equal(finished.complete, true); assert.equal(finished.next.length, 0);
				assert.deepEqual(finished.funding, funding);
			}
		}
	}
	assert.deepEqual(table, before, "listing and selecting draft payments changes no physical resource");
	const first = paymentOptions(frame, { generic: 1, colors: [] }).next[0]!;
	assert.throws(() => paymentOptions(frame, { generic: 2, colors: [] }, [first.id, first.id]), /selected twice/);
	assert.throws(() => paymentOptions(frame, { generic: 1, colors: [] }, ["mana:unknown"]), /unavailable/);
	commit(table, [{ do: "change-life", who: 0, amount: -19, reason: "game-setup" }], "game-setup");
	assert.equal(payable(workFrame(table, 0), { generic: 0, colors: ["W"], life: 1 }), false, "the spell and mana ability cannot spend the same life");
	assert.equal(payable(workFrame(table, 0), { generic: 0, colors: ["W"] }), true);
	const onlyTown = workFrame(table, 0);
	onlyTown.view.objects = onlyTown.view.objects!.filter((one) => one.id === town.id);
	onlyTown.view.pools = [];
	assert.equal(payable(onlyTown, { generic: 1, colors: ["W"] }), false, "two abilities of the same land cannot supply two mana");
	const townMenu = paymentOptions(onlyTown, { generic: 1, colors: [] });
	assert.ok(townMenu.next.length > 1, "the player chooses which mana ability to use");
	assert.throws(() => paymentOptions(onlyTown, { generic: 2, colors: [] }, townMenu.next.slice(0, 2).map((one) => one.id)), /selected twice/);

	const wide = start(standard, [{ deck: deck("Mono-Green Landfall") }, { deck: deck("Mono-Red Aggro") }], "many-payment-sources");
	place(wide, 0, "battlefield", ...Array(15).fill("Forest")); main(wide, 0);
	const visible = workFrame(wide, 0), price = { generic: 6, colors: ["G" as const] }, selected: string[] = [];
	assert.equal(paymentOptions(visible, price).next.length, 15, "one choice per physical source, not one per seven-land subset");
	for (let at = 0; at < 7; at++) {
		const menu = paymentOptions(visible, price, selected);
		assert.equal(menu.next.length, 15 - at); assert.equal(menu.complete, false);
		selected.push(menu.next.at(-1)!.id);
	}
	assert.equal(paymentOptions(visible, price, selected).complete, true);
	assert.equal(paymentOptions(visible, price, selected.slice(0, -1)).complete, false, "withdrawing one selection reopens payment");
	assert.equal(payable(visible, { generic: 6, colors: ["R"] }), false);
	assert.ok([...wide.things.values()].filter((one) => one.zone === "battlefield").every((one) => !one.tapped));
});
