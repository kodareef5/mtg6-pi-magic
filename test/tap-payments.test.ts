/** A bounded alternative to generic mana preserves payment choices without making subset menus. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { offerBases } from "../src/core/announce.ts";
import { affordableCosts, canAfford, announcementOffers } from "../src/core/announcement-options.ts";
import type { Package, Procedure, TokenSpec } from "../src/core/language.ts";
import { main, example, establish, place, passBoth, finish } from "./play.ts";

const card = "Aang, Swift Savior // Aang and La, Ocean's Fury", waterbend = checkProcedure(example("Waterbend to transform Aang"));
const creature: TokenSpec = { name: "Ally Token", types: ["creature"], subtypes: ["Ally"], colors: [], power: 1, toughness: 1 };
const pick = (table: Table, id: string) => { assert.ok(nextDecision(table)!.options.some(one => one.id === id), `${id}: ${nextDecision(table)!.options.map(one => one.id)}`); apply(table, id, "model", "chosen"); };
const build = (procedure = waterbend) => {
	const table = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Selesnya Landfall")) }], "waterbend", undefined, { announcementsFrom: 0, excessManaFrom: 0 });
	main(table, 0);
	const prepared: Package = JSON.parse(readFileSync("prepared/packages/2026-10-10/aang-swift-savior-aang-and-la-ocean-s-fury.json", "utf8")).package;
	const source = establish(table, 0, card, prepared.registers);
	const edited = editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: prepared.registers, procedures: [procedure] } }], "waterbend-use"); assert.equal(edited, true);
	return { table, source };
};
const begin = (table: Table) => { const decision = nextDecision(table)!; const option = decision.options.find(one => one.announcement?.procedure.claim === waterbend.claim); assert.ok(option, JSON.stringify(decision)); pick(table, option.id); };
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);

test("bounded tap payments preserve every mixed payment, keep colors and other components payable, and complete the named cost once", () => {
	for (const count of [0, 1, 4, 8]) {
		const { table, source } = build(), land = place(table, 0, "battlefield", "Breeding Pool")[0]!, opposing = place(table, 1, "battlefield", "Llanowar Elves")[0]!;
		commit(table, [{ do: "add-mana", who: 0, colors: Array(8).fill("C") }, ...Array.from({ length: 9 }, (_, at) => ({ do: "token" as const, id: `ally-${at}`, controller: 0, spec: creature }))], "game-setup");
		establish(table, 0, "Hallowed Fountain", [{ kind: "watch", basis: "Fixture records completed waterbend payments", event: { on: "keyword", keyword: "waterbend", by: "you" }, effect: { instructions: [{ do: "life", who: "you", amount: 1 }] } }]);
		const snapshots = [structuredClone(table)], physical = structuredClone({ things: table.things, seats: table.seats });
		begin(table); assert.equal(nextDecision(table)!.preparing?.stage, "mana-taps");
		assert.ok(!nextDecision(table)!.options.some(one => one.id === `announce:tap:${land.id}` || one.id === `announce:tap:${opposing.id}`));
		for (let at = 0; at < count; at++) pick(table, `announce:tap:ally-${at}`);
		if (count) { pick(table, "announce:untap:ally-0"); pick(table, "announce:tap:ally-0"); }
		if (count === 8) assert.ok(!nextDecision(table)!.options.some(one => one.id.startsWith("announce:tap:")), "extra eligible creatures cannot overpay the component");
		assert.deepEqual({ things: table.things, seats: table.seats }, physical); const pending = structuredClone(table); nextDecision(table); assert.deepEqual(table, pending);
		snapshots.push(pending); for (const viewer of [1, "spectator"] as const) assert.equal(project(table, viewer).announcement, undefined);
		const cancelled = structuredClone(table); pick(cancelled, "announce:cancel"); assert.deepEqual({ things: cancelled.things, seats: cancelled.seats }, physical);
		pick(table, "announce:taps-done"); pick(table, "announce:cost:0"); assert.equal(table.announcement!.cost!.price.generic, 8 - count);
		pick(table, "announce:back"); pick(table, "announce:back"); assert.equal(table.announcement!.manaTapsDone, undefined);
		pick(table, "announce:taps-done"); pick(table, "announce:cost:0"); snapshots.push(structuredClone(table));
		const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:") && !one.use?.funding?.length)!;
		assert.ok(payment); pick(table, payment.id);
		assert.equal(table.seats[0]!.pool.length, count); assert.equal(source.face ?? 0, 0, "paying has not resolved transformation");
		assert.equal(cardsIn(table, "battlefield").filter(one => one.id.startsWith("ally-") && one.tapped).length, count);
		assert.equal(table.log.filter(one => one.changes.some(change => change.do === "keyword" && change.name === "waterbend")).length, 1);
		assert.equal(table.waiting.length, 1, "waterbend happens even when paid entirely with mana");
		assert.equal(nextDecision(table)!.situation, "trigger-order"); pick(table, nextDecision(table)!.options[0]!.id); passBoth(table); finish(table);
		assert.equal(table.seats[0]!.life, 21); passBoth(table); finish(table); assert.equal(source.face, 1);
		for (const snapshot of snapshots) replay(table, snapshot);
	}
	// An untapped newly entered creature, including the source, can replace generic mana.
	const fresh = build(); commit(fresh.table, Array.from({ length: 7 }, (_, at) => ({ do: "token" as const, id: `fresh-${at}`, controller: 0, spec: creature })), "game-setup");
	begin(fresh.table); pick(fresh.table, `announce:tap:${fresh.source.id}`); for (let at = 0; at < 7; at++) pick(fresh.table, `announce:tap:fresh-${at}`);
	pick(fresh.table, "announce:taps-done"); pick(fresh.table, "announce:cost:0"); pick(fresh.table, nextDecision(fresh.table)!.options.find(one => one.id.startsWith("announce:payment:"))!.id);
	assert.equal(fresh.source.tapped, true); passBoth(fresh.table); finish(fresh.table); assert.equal(fresh.source.face, 1);

	// Exhaustively compare feasibility with all complete selections in a small position.
	const { table, source } = build(); commit(table, [{ do: "tap", what: source.id }, ...Array.from({ length: 4 }, (_, at) => ({ do: "token" as const, id: `mana-${at}`, controller: 0,
		spec: { ...creature, types: ["artifact"], power: undefined, toughness: undefined, registers: [{ kind: "mana" as const, basis: "Fixture mana artifact", cost: { tap: true as const }, colors: ["U" as const] }] } }))], "game-setup");
	const frame = workFrame(table, 0), refs = cardsIn(table, "battlefield").filter(one => one.id.startsWith("mana-")).map(one => ({ id: one.id, incarnation: one.incarnation }));
	for (const generic of [0, 1, 3, 5]) for (const colors of ["", "{U}", "{U}{U}", "{B}", "{C}"]) for (const limit of [1, 2, 4]) {
		const procedure: Procedure = { ...waterbend, claim: "Tap payment arithmetic fixture", cost: { mana: `{${generic}}${colors}`, tap: { choose: { types: ["artifact", "creature"] }, count: limit, upTo: true, pay: "generic" } } };
		const base = [...offerBases(procedure, frame, "fixture")][0]!;
		for (let fixed = 0; fixed < 16; fixed++) {
			const selected = refs.filter((_, at) => fixed & 1 << at);
			const exists = Array.from({ length: 16 }, (_, mask) => mask).some(mask => (mask & fixed) === fixed && affordableCosts(base, frame, [], refs.filter((_, at) => mask & 1 << at)).length > 0);
			assert.equal(canAfford(base, frame, [], selected), exists, `generic ${generic}, ${colors}, limit ${limit}, selected ${fixed}`);
		}
	}
	// Component limits survive other generic costs and standing reductions.
	const adjusted = build(); commit(adjusted.table, [{ do: "tap", what: adjusted.source.id }, ...Array.from({ length: 8 }, (_, at) => ({ do: "token" as const, id: `component-${at}`, controller: 0, spec: creature }))], "game-setup");
	const componentRefs = cardsIn(adjusted.table, "battlefield").filter(one => one.id.startsWith("component-")).map(one => ({ id: one.id, incarnation: one.incarnation }));
	const component: Procedure = { ...waterbend, cost: { ...waterbend.cost, mana: "{9}" } };
	let preview = workFrame(adjusted.table, 0), base = [...offerBases(component, preview, "component")][0]!;
	assert.equal(canAfford(base, preview, []), false, "eight taps cannot pay a ninth generic mana outside the component");
	const reducer = establish(adjusted.table, 0, "Hallowed Fountain", [{ kind: "cost", basis: "Fixture reduces controlled activation costs", activate: { controller: "you" }, reduce: 2 }]);
	commit(adjusted.table, [{ do: "tap", what: reducer.id }], "game-setup");
	preview = workFrame(adjusted.table, 0); base = [...offerBases(component, preview, "component")][0]!;
	assert.equal(affordableCosts(base, preview, [], componentRefs.slice(0, 7))[0]?.price.generic, 0);
	assert.equal(affordableCosts(base, preview, [], componentRefs).length, 0, "cost reduction leaves only seven generic mana to replace");
	const variable: Procedure = { ...waterbend, cost: { ...waterbend.cost, mana: "{X}" } };
	assert.deepEqual([...offerBases(variable, preview, "variable")].filter(one => canAfford(one, preview, [])).map(one => one.x), Array.from({ length: 11 }, (_, at) => at), "tap resources and reductions keep every payable X reachable");

	// A hundred bodies do not turn priority into a hundred-million-subset menu.
	const large = build(); commit(large.table, Array.from({ length: 100 }, (_, at) => ({ do: "token" as const, id: `large-${at}`, controller: 0, spec: creature })), "game-setup");
	assert.equal(announcementOffers(waterbend, workFrame(large.table, 0), "fixture").length, 1); begin(large.table);
	assert.ok(nextDecision(large.table)!.options.length < 105);
	assert.throws(() => checkProcedure({ ...waterbend, cost: { mana: "{0}" }, instructions: [{ do: "pay", who: "you", cost: waterbend.cost }] }), /resolving payment/);
});
