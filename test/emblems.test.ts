/** An emblem is its own public command-zone object, retaining abilities after its maker leaves. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { checkProcedure, printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import { activeWatches } from "../src/core/triggers.ts";
import { select, tableWorld } from "../src/core/selectors.ts";
import type { Package, Registration } from "../src/core/language.ts";
import { announce, example, finish, main, offered, pack, passBoth, step } from "./play.ts";

const ajani = "Ajani Resolute", cat = "Ajani's Pridemate", bird = "Hinterland Sanctifier";
const zero = () => example("Ajani gains one life"), minus4 = () => example("Ajani creates a Pridemate"), minus10 = () => example("Ajani gives an emblem");
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const stored = (slug: string): Package => JSON.parse(readFileSync(new URL(`../prepared/packages/2026-10-10/${slug}.json`, import.meta.url), "utf8")).package;
const build = () => start(standard, [{ deck: alpha(deck("Lifegain")) }, { deck: alpha(deck("Lifegain")) }], "emblems");
function put(table: Table, card: string, zone: "hand" | "battlefield", who = 0, registers: Registration[] = []) {
	const one = [...cardsIn(table, "library", who), ...cardsIn(table, "hand", who), ...cardsIn(table, "outside", who)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, reason: "game-setup", ...(zone === "battlefield" ? { registers } : {}) }], "game-setup"); return one;
}
function ready(table: Table) {
	editWork(table, 0, [{ do: "package.put", package: { card: ajani, printedCast: true, assessed: true, registers: pack(ajani), procedures: [zero(), minus4(), minus10()], deferred: [] } },
		{ do: "package.put", package: stored("hinterland-sanctifier") }], "prepare-ajani");
}
function castAjani(table: Table) {
	const one = put(table, ajani, "hand"); commit(table, [{ do: "add-mana", who: 0, colors: ["W", "W"] }], "game-setup");
	announce(table, printedCast(ajani, table.printed[ajani]!)); passBoth(table); finish(table); assert.equal(one.counters.loyalty, 2); return one;
}
const emblems = (table: Table) => cardsIn(table, "command").filter(one => one.emblem);
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function settle(table: Table) {
	for (let n = 0; n < 100; n++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, decision.situation === "priority" ? "pass" : decision.options[0]!.id, "model", "chosen");
	}
	throw new Error("The stack did not settle");
}

test("emblems keep independent command-zone characteristics, continuous effects and triggers through source death, later entries and saved continuations", () => {
	// Ajani's first two abilities retain the loyalty rules and create a complete token.
	const loyalty = build(); main(loyalty, 0); ready(loyalty); const maker = castAjani(loyalty), beforeZero = structuredClone(loyalty);
	announce(loyalty, zero()); settle(loyalty); assert.equal(loyalty.seats[0]!.life, 21); assert.equal(maker.counters.loyalty, 3);
	assert.equal(offered(loyalty, zero()).length, 0); assert.equal(offered(loyalty, minus4()).length, 0); replay(loyalty, beforeZero);
	main(loyalty, 0, 3); commit(loyalty, [{ do: "change-life", who: 0, amount: 6, reason: "resolve" }], "resolve");
	assert.equal(loyalty.waiting.length, 1); settle(loyalty); assert.equal(maker.counters.loyalty, 4, "six life is one loyalty counter");
	const beforeCat = structuredClone(loyalty); announce(loyalty, minus4()); finish(loyalty); assert.equal(maker.zone, "graveyard");
	const paid = structuredClone(loyalty); passBoth(loyalty); finish(loyalty);
	const token = cardsIn(loyalty, "battlefield").find(one => one.token?.name === cat)!; assert.ok(token);
	assert.equal(characteristics(loyalty, token)!.power, 2); assert.deepEqual(characteristics(loyalty, token)!.subtypes, ["Cat", "Soldier"]);
	replay(loyalty, paid); replay(loyalty, beforeCat);
	commit(loyalty, [{ do: "change-life", who: 0, amount: 5, reason: "resolve" }], "resolve");
	const growth = structuredClone(loyalty); settle(loyalty); assert.equal(token.counters["+1/+1"], 1); replay(loyalty, growth);
	for (const lastCounter of [false, true]) {
		const table = build(); main(table, 0); ready(table); const source = castAjani(table);
		const own = put(table, bird, "battlefield"), opposing = put(table, bird, "battlefield", 1), land = put(table, "Plains", "battlefield");
		const base = characteristics(table, own)!;
		commit(table, [{ do: "counters", what: source.id, kind: "loyalty", amount: lastCounter ? 8 : 10 }], "game-setup");
		const before = structuredClone(table), fieldCount = cardsIn(table, "battlefield").length;
		announce(table, minus10()); finish(table); assert.equal(source.zone, lastCounter ? "graveyard" : "battlefield");
		const pending = structuredClone(table); passBoth(table); const unmade = structuredClone(table);
		nextDecision(table); nextDecision(table); assert.deepEqual(table, unmade); assert.equal(emblems(table).length, 0);
		step(table); finish(table); const emblem = emblems(table)[0]!; assert.ok(emblem);
		assert.equal(emblem.owner, 0); assert.equal(emblem.controller, 0); assert.equal(emblem.card, undefined); assert.equal(emblem.token, undefined);
		assert.equal(cardsIn(table, "battlefield").length, fieldCount - Number(lastCounter)); assert.equal(table.waiting.length, 0);
		const traits = characteristics(table, emblem)!;
		assert.equal(traits.name, ""); assert.deepEqual(traits.types, []); assert.deepEqual(traits.colors, []); assert.equal(traits.power, undefined);
		assert.equal(characteristics(table, own)!.power, base.power! + 2); assert.equal(characteristics(table, opposing)!.power, base.power);
		assert.equal(characteristics(table, land)!.power, undefined); assert.equal(own.counters["+1/+1"], undefined);
		assert.ok(!select({ world: tableWorld(table), controller: 0 }, { zones: ["battlefield"] }).some(one => one.id === emblem.id));
		const receipt = table.log.find(one => one.changes.some(one => one.do === "emblem"))!;
		assert.ok(!receipt.changes.some(one => one.do === "token" || one.do === "move")); assert.match(describe(table, receipt), /got an emblem/);
		for (const viewer of [0, 1, "spectator"] as const) {
			const view = project(table, viewer); assert.equal(view.objects!.find(one => one.id === emblem.id)!.zone, "command");
			assert.ok(view.table.some(line => line.includes("emblem") && line.includes("Creatures you control get +2/+2.")));
			assert.equal(view.objects!.filter(one => one.zone === "library").length, 0);
		}
		replay(table, pending); replay(table, before); replay(table, unmade);
		if (!lastCounter) commit(table, [{ do: "move", what: source.id, to: "exile", reason: "exile" }], "exile");
		assert.equal(characteristics(table, own)!.power, base.power! + 2);
		const arrived = put(table, bird, "hand"); commit(table, [{ do: "add-mana", who: 0, colors: ["W"] }], "game-setup");
		const later = structuredClone(table); announce(table, printedCast(bird, table.printed[bird]!)); settle(table);
		assert.equal(characteristics(table, arrived)!.power, base.power! + 2); replay(table, later);
		// A separate Ajani can make a second independent emblem.
		const second = castAjani(table); commit(table, [{ do: "counters", what: second.id, kind: "loyalty", amount: 8 }], "game-setup");
		const twice = structuredClone(table); announce(table, minus10()); settle(table); assert.equal(emblems(table).length, 2);
		assert.equal(characteristics(table, own)!.power, base.power! + 4); assert.equal(characteristics(table, opposing)!.power, base.power); replay(table, twice);
		const creation = minus4().instructions[0]!; assert.ok(creation.do === "token" && creation.spec);
		commit(table, [{ do: "token", id: "late-pridemate", controller: 0, spec: creation.spec }], "resolve");
		const lateToken = table.things.get("late-pridemate")!; assert.equal(characteristics(table, lateToken)!.power, 6);
		const born = structuredClone(table); settle(table); assert.equal(lateToken.counters["+1/+1"], 1);
		assert.equal(characteristics(table, lateToken)!.power, 7); replay(table, born);
		const unchanged = structuredClone(table);
		assert.throws(() => commit(table, [{ do: "emblem", id: emblem.id, who: 0, registers: emblem.registrations! }], "resolve"), /new object identity/);
		assert.deepEqual(table, unchanged);
		main(table, 0, 3); assert.equal(characteristics(table, own)!.power, base.power! + 4, "cleanup does not expire an emblem");
	}
	// A real command-zone watch uses its own targets and the life-gain amount after its maker dies.
	const triggered = start(standard, [{ deck: deck("Jund Sacrifice") }, { deck: alpha(deck("Lifegain")) }], "emblem-trigger");
	main(triggered, 0); const professor = put(triggered, "Professor Dellian Fel", "battlefield");
	commit(triggered, [{ do: "counters", what: professor.id, kind: "loyalty", amount: 1 }], "game-setup");
	const before = structuredClone(triggered); announce(triggered, example("Professor gives a life-gain emblem")); finish(triggered);
	assert.equal(professor.zone, "graveyard"); const gone = structuredClone(triggered); passBoth(triggered); finish(triggered);
	const emblem = emblems(triggered)[0]!; assert.ok(emblem); replay(triggered, gone); replay(triggered, before);
	assert.equal(activeWatches({ seat: 0, version: triggered.cursor.clock, view: project(triggered, 0) }).length, 1);
	commit(triggered, [{ do: "change-life", who: 0, amount: 7, reason: "resolve" }], "resolve");
	assert.equal(triggered.waiting.length, 1); assert.deepEqual(triggered.waiting[0]!.source, ref(emblem)); assert.equal(triggered.waiting[0]!.event.amount, 7);
	const gain = structuredClone(triggered); settle(triggered); assert.equal(triggered.seats[1]!.life, 13); replay(triggered, gain);
	const bad = minus10(); bad.instructions = [{ do: "emblem", who: "you", registers: [{ kind: "draw-rule", basis: "Unsupported emblem fixture", who: "you", additional: 1 }] }];
	assert.throws(() => checkProcedure(bad), /continuous characteristic effects and triggered abilities only/);
});
