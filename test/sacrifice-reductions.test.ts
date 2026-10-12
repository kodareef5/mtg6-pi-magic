/** Optional cost choices remain physical selections, with exact mana and no subset product.
 * Past 150 lines to keep the transaction, affordability and resource-overlap positions together. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { announcementOffers, affordableCosts, canAfford } from "../src/core/announcement-options.ts";
import { offerBases } from "../src/core/announce.ts";
import { canPay } from "../src/core/payment-search.ts";
import { manaBudget } from "../src/core/budget.ts";
import type { Procedure, TokenSpec } from "../src/core/language.ts";
import { main, example, pack, place, quiet } from "./play.ts";

const card = "Rottenmouth Viper", cast = checkProcedure(example("Cast Rottenmouth Viper with optional sacrifices"));
const token = pack("Smaug the Magnificent").flatMap(one => one.kind === "watch" && "instructions" in one.effect ? one.effect.instructions : []).find(one => one.do === "token")!;
assert.equal(token.do, "token"); assert.ok(token.spec); const treasure: TokenSpec = token.spec;
const build = () => {
	const table = start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Selesnya Landfall")) }], "sacrifice-reductions", undefined, { announcementsFrom: 0, excessManaFrom: 0 });
	main(table, 0); const source = cardsIn(table, "hand", 0).find(one => one.card === card) ?? place(table, 0, "hand", card)[0]!;
	editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, registers: pack(card), procedures: [cast], deferred: [] } }], "viper-cast");
	return { table, source };
};
const pick = (table: Table, id: string) => { assert.ok(nextDecision(table)?.options.some(one => one.id === id), `${id}: ${nextDecision(table)?.options.map(one => one.id)}`); apply(table, id, "model", "chosen"); };
const begin = (table: Table) => pick(table, nextDecision(table)!.options.find(one => one.announcement?.procedure.source.card === card)!.id);
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
const settle = (table: Table) => {
	for (let guard = 0; guard < 150; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, decision.options.find(one => one.label === "Choose to lose 4 life")?.id ?? quiet(decision.options).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
};

test("optional sacrifices lock a generic discount, preserve every reachable selection and spend only on confirmation", () => {
	for (const count of [0, 1, 5, 7]) {
		const { table, source } = build();
		const land = place(table, 0, "battlefield", "Swamp")[0]!, opponent = place(table, 1, "battlefield", "Llanowar Elves")[0]!;
		commit(table, Array.from({ length: 7 }, (_, at) => ({ do: "token" as const, id: `treasure-${at}`, controller: 0, spec: treasure })), "game-setup");
		commit(table, [{ do: "add-mana", who: 0, colors: ["B", "C", "C", "C", "C", "C"] }], "game-setup");
		const snapshots = [structuredClone(table)], things = structuredClone([...table.things]), pools = structuredClone(table.seats.map(one => one.pool));
		begin(table); snapshots.push(structuredClone(table)); assert.equal(nextDecision(table)!.preparing!.stage, "sacrifices");
		assert.ok(!nextDecision(table)!.options.some(one => one.id === `announce:sacrifice:${land.id}` || one.id === `announce:sacrifice:${opponent.id}`));
		for (let at = 0; at < count; at++) { pick(table, `announce:sacrifice:treasure-${at}`); snapshots.push(structuredClone(table)); }
		if (count) { pick(table, "announce:unsacrifice:treasure-0"); pick(table, "announce:sacrifice:treasure-0"); }
		const pending = structuredClone(table); nextDecision(table); assert.deepEqual(table, pending);
		assert.deepEqual([...table.things], things); assert.deepEqual(table.seats.map(one => one.pool), pools);
		for (const viewer of [1, "spectator"] as const) assert.equal(project(table, viewer).announcement, undefined);
		assert.throws(() => pick(table, "pass"));
		const cancelled = structuredClone(table); pick(cancelled, "announce:cancel"); assert.deepEqual([...cancelled.things], things); assert.deepEqual(cancelled.seats.map(one => one.pool), pools);
		pick(table, "announce:sacrifices-done"); pick(table, "announce:cost:0"); snapshots.push(structuredClone(table));
		assert.equal(table.announcement!.cost!.price.generic, Math.max(0, 5 - count)); assert.deepEqual(table.announcement!.cost!.price.colors, ["B"]);
		pick(table, "announce:back"); pick(table, "announce:back"); assert.equal(table.announcement!.sacrificesDone, undefined);
		pick(table, "announce:sacrifices-done"); pick(table, "announce:cost:0");
		// Fix the exact floating payment so unused Treasures remain available rather than being spent by the test.
		if (nextDecision(table)!.options.some(one => one.id === "announce:individual")) pick(table, "announce:individual");
		for (let n = 0; n < Math.max(0, 5 - count) + 1; n++) {
			if (nextDecision(table)!.options.some(one => one.id === "announce:individual")) pick(table, "announce:individual");
			const option = nextDecision(table)!.options.find(one => one.id.startsWith("announce:pay:") && one.label.includes(n === 0 ? "Spend {B}" : "Spend {C}"));
			assert.ok(option, nextDecision(table)!.options.map(one => one.label).join(" | ")); pick(table, option.id);
		}
		assert.deepEqual([...table.things], things); snapshots.push(structuredClone(table)); pick(table, "announce:confirm");
		assert.equal(source.zone, "stack"); assert.equal(source.ability!.cost.sacrificed!.length, count);
		assert.equal(source.ability!.cost.sacrificeReduction, count); assert.equal(table.seats[0]!.pool.length, Math.min(count, 5));
		assert.equal(cardsIn(table, "graveyard").filter(one => one.token?.name === "Treasure Token").length, count);
		settle(table); assert.equal(source.zone, "battlefield"); assert.equal(source.counters.blight, 1); assert.equal(table.seats[1]!.life, 16);
		for (const snapshot of snapshots) replay(table, snapshot);
	}
	// A Treasure can fund the black symbol or reduce generic mana, never both.
	for (const count of [5, 6]) {
		const { table } = build(); commit(table, Array.from({ length: count }, (_, at) => ({ do: "token" as const, id: `treasure-${at}`, controller: 0, spec: treasure })), "game-setup");
		assert.equal(nextDecision(table)!.options.some(one => one.announcement?.procedure.source.card === card), count === 6);
		if (count === 5) continue;
		begin(table); for (let at = 0; at < 5; at++) pick(table, `announce:sacrifice:treasure-${at}`);
		assert.ok(!nextDecision(table)!.options.some(one => one.id === "announce:sacrifice:treasure-5"));
		pick(table, "announce:sacrifices-done"); pick(table, "announce:cost:0");
		const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
		assert.equal(payment.use!.funding!.length, 1); assert.equal(payment.use!.funding![0]!.source.id, "treasure-5"); assert.deepEqual(payment.use!.funding![0]!.colors, ["B"]);
		pick(table, payment.id); settle(table); assert.equal(cardsIn(table, "battlefield").filter(one => one.token?.name === "Treasure Token").length, 0);
	}
	// Borrowed Elves may tap for mana before their sacrifice; ownership is not control.
	const { table, source } = build(), elf = place(table, 1, "hand", "Llanowar Elves")[0]!;
	commit(table, [{ do: "move", what: elf.id, to: "battlefield", controller: 0, reason: "game-setup", registers: pack("Llanowar Elves") },
		{ do: "note", note: { kind: "label", on: elf, by: 0, until: "end-of-turn", text: "Haste fixture", change: { words: ["haste"] } } },
		{ do: "add-mana", who: 0, colors: ["B", "C", "C", "C"] }], "game-setup");
	const before = structuredClone(table); begin(table); pick(table, `announce:sacrifice:${elf.id}`);
	pick(table, "announce:sacrifices-done"); pick(table, "announce:cost:0");
	const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
	assert.equal(payment.use!.funding![0]!.source.id, elf.id); assert.ok(!payment.shows!.includes(`Leaves available: Llanowar Elves (${elf.id})`));
	pick(table, payment.id); assert.equal(elf.zone, "graveyard"); assert.equal(elf.tapped, false); assert.equal(elf.owner, 1); settle(table); replay(table, before);
	assert.equal(source.zone, "battlefield");
	assert.throws(() => checkProcedure({ ...cast, timing: "stack" }), /spell announcements/);
	assert.throws(() => checkProcedure({ ...cast, cost: undefined, instructions: [{ do: "pay", who: "you", cost: cast.cost }] }), /resolving payment/);
	const frame = workFrame(build().table, 0), spell = frame.view.objects!.find(one => one.card === card && one.zone === "hand")!;
	assert.match(manaBudget(frame, cast, spell).scope, /Not priced/);

	// Exhaustive small-resource comparison checks the witness against fixed, selected subsets.
	const small = build(); commit(small.table, Array.from({ length: 4 }, (_, at) => ({ do: "token" as const, id: `treasure-${at}`, controller: 0, spec: treasure })), "game-setup");
	const smallFrame = workFrame(small.table, 0), refs = cardsIn(small.table, "battlefield").map(one => ({ id: one.id, incarnation: one.incarnation }));
	for (const reduce of [1, 2, 5]) for (const colors of ["", "{B}", "{B}{B}", "{C}"]) for (let generic = 0; generic <= 6; generic++) {
		const procedure: Procedure = { ...cast, claim: "Cost arithmetic fixture", cost: { sacrifice: { choose: { not: { types: ["land"] } }, any: true, reduce }, mana: `{${generic}}${colors}` } };
		const base = [...offerBases(procedure, smallFrame, "fixture")][0]!;
		for (let fixed = 0; fixed < 16; fixed++) {
			const selected = refs.filter((_, at) => fixed & 1 << at);
			const exists = Array.from({ length: 16 }, (_, at) => at).some(mask => (mask & fixed) === fixed && affordableCosts(base, smallFrame, [], refs.filter((_, at) => mask & 1 << at)).length > 0);
			assert.equal(canAfford(base, smallFrame, [], selected), exists, `${generic}${colors}, mask ${fixed}`);
		}
	}
	// A hundred exclusive mana/discount resources remain one affordability problem.
	const units = Array.from({ length: 100 }, (_, at) => [{ id: `mana-${at}`, yields: [{ colors: ["B" as const], tapped: [{ id: `sac-${at}` }] }] }, { id: `sac-${at}`, yields: [{ colors: [], reduce: 1 }] }]).flat();
	assert.equal(canPay(units, { generic: 100, colors: ["B"] }, 20), false);
	assert.equal(canPay(units, { generic: 99, colors: ["B"] }, 20), true);
	assert.equal(canPay(units, { generic: 0, colors: ["C"] }, 20), false);
	assert.equal(announcementOffers(cast, frame, "cast").length, 0, "no resources means no cast, despite optional sacrifices");
});
