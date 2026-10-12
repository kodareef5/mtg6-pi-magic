/** Standing target taxes join the locked cost once, without paying during selection.
 * Past 150 lines to cover both announcement protocols, life-funded mana, permissions and source-reviewed entry damage. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { checkProcedure, printedCast } from "../src/core/procedures.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { project } from "../src/core/view.ts";
import type { Registration } from "../src/core/language.ts";
import { announce, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

const terror = "Terror of the Peaks", bitter = "Bitter Triumph", siren = "Spyglass Siren";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const lifeCast = () => example("Bitter Triumph by paying life");
const discardCast = () => example("Bitter Triumph by discarding");
function permanent(table: Table, owner: number, card: string, registers: Registration[] = [], controller = owner) {
	const one = [...table.things.values()].find(one => one.owner === owner && one.card === card && one.zone !== "battlefield")!;
	assert.ok(one);
	commit(table, [{ do: "move", what: one.id, to: "battlefield", controller, registers, reason: "game-setup" }], "game-setup");
	return one;
}
function position(life = 20, staged = false, pain = false) {
	const table = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: alpha(deck("Dimir Midrange")) }], "casting-life", undefined,
		staged ? { announcementsFrom: 0 } : {});
	const target = permanent(table, 0, terror, pack(terror)), other = permanent(table, 1, siren);
	main(table, 1);
	if (!cardsIn(table, "hand", 1).some(one => one.card === bitter)) place(table, 1, "hand", bitter);
	editWork(table, 1, [{ do: "package.put", package: { card: bitter, registers: [], procedures: [lifeCast(), discardCast()], assessed: true } }], "prepare-bitter");
	commit(table, [{ do: "change-life", who: 1, amount: life - table.seats[1]!.life, reason: "game-setup" },
		{ do: "add-mana", who: 1, colors: pain ? ["C"] : ["C", "B"] }], "game-setup");
	if (pain) permanent(table, 1, "Island", [{ kind: "mana", basis: "Life-funded mana fixture", cost: { tap: true, life: 1 }, colors: ["B"] }]);
	return { table, target, other };
}
const aimed = (table: Table, target: Thing, discard = false) => offered(table, discard ? discardCast() : lifeCast())
	.filter(one => one.activation.targets[0]?.some(aim => "id" in aim && aim.id === target.id));

test("standing life costs price selected targets once and combine with other life payments before confirmation", () => {
	for (const life of [2, 3, 5, 6, 7]) {
		const { table, target, other } = position(life), before = structuredClone(table);
		assert.equal(aimed(table, target).length > 0, life >= 6);
		assert.equal(aimed(table, target, true).length > 0, life >= 3);
		assert.equal(aimed(table, other).length > 0, life >= 3);
		assert.ok(aimed(table, target).every(one => one.activation.cost.life === 6));
		assert.ok(aimed(table, target, true).every(one => one.activation.cost.life === 3));
		assert.ok(aimed(table, other).every(one => one.activation.cost.life === 3));
		assert.deepEqual(table, before, "cost discovery spends nothing");
	}
	for (const life of [6, 7]) {
		const { table, target } = position(life, false, true), ways = aimed(table, target);
		assert.equal(ways.length > 0, life === 7, "the total includes life paid by mana sources");
		if (ways.length) assert.ok(ways.every(one => one.activation.funding!.some(one => one.life === 1)));
	}
	for (const discard of [false, true]) {
		const { table, target } = position(), initial = structuredClone(table), at = table.ledger.length;
		const hand = cardsIn(table, "hand", 1).length;
		announce(table, discard ? discardCast() : lifeCast(), one => one.activation.targets[0]?.some(aim => "id" in aim && aim.id === target.id) ?? false);
		assert.equal(table.seats[1]!.life, discard ? 17 : 14);
		assert.equal(cardsIn(table, "hand", 1).length, hand - (discard ? 2 : 1));
		assert.equal(target.zone, "battlefield", "costs precede the effect");
		passBoth(table); finish(table); assert.equal(target.zone, "graveyard");
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
	const { table, target, other } = position(20, true);
	const frame = workFrame(table, 1), card = frame.view.objects!.find(one => one.card === bitter && one.zone === "hand")!;
	assert.match(manaBudget(frame, lifeCast(), card).scope, /standing additional life cost/);
	assert.ok(paymentForecast(frame, { objective: "Remove Terror", guidance: "Use the complete payment", steps: [
		{ label: "Bitter Triumph", when: { active: "self", step: "precombat-main" }, action: { procedure: lifeCast() } },
	] }).unchecked.length, "a mana-only forecast cannot certify the life payment");
	const initial = structuredClone(table), from = table.ledger.length;
	const begin = () => apply(table, nextDecision(table)!.options.find(one => one.announcement?.procedure.claim === lifeCast().claim)!.id, "model", "chosen");
	const select = (object: Thing) => apply(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:target:") && one.objects?.some(ref => ref.id === object.id))!.id, "model", "chosen");
	begin(); select(target);
	assert.match(nextDecision(table)!.options.find(one => one.id === "announce:cost:0")!.label, /Pay 6 life/);
	apply(table, "announce:cost:0", "model", "chosen");
	const pending = structuredClone(table), at = table.ledger.length;
	assert.equal(table.seats[1]!.life, 20); assert.equal(target.zone, "battlefield");
	assert.equal(project(table, 0).announcement, undefined);
	apply(table, "announce:cancel", "model", "chosen"); assert.equal(table.seats[1]!.life, 20);
	begin(); select(other);
	assert.match(nextDecision(table)!.options.find(one => one.id === "announce:cost:0")!.label, /Pay 3 life/);
	apply(table, "announce:cancel", "model", "chosen");
	begin(); select(target); apply(table, "announce:cost:0", "model", "chosen");
	assert.deepEqual(table.seats[1]!.pool, pending.seats[1]!.pool);
	assert.match(nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!.shows!, /Pay 6 life/);
	apply(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!.id, "model", "chosen");
	assert.equal(table.seats[1]!.life, 14); passBoth(table); finish(table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);

	const free = position();
	const spell = cardsIn(free.table, "hand", 1).find(one => one.card === bitter)!;
	commit(free.table, [{ do: "move", what: spell.id, to: "exile", reason: "game-setup" }], "game-setup");
	commit(free.table, [{ do: "note", note: { kind: "permit", on: ref(spell), who: 1, by: 1, until: "indefinite", fromTurn: 0, mana: "{0}" } }], "game-setup");
	const permission = aimed(free.table, free.target).filter(one => one.activation.source.id === spell.id);
	assert.ok(permission.length); assert.ok(permission.every(one => one.activation.cost.life === 6 && one.activation.paid.length === 0));
	const freeStart = structuredClone(free.table), freeAt = free.table.ledger.length;
	announce(free.table, lifeCast(), one => one.activation.source.id === spell.id && one.activation.targets[0]?.some(aim => "id" in aim && aim.id === free.target.id) === true);
	assert.equal(free.table.seats[1]!.life, 14); assert.equal(free.table.seats[1]!.pool.length, 2);
	assert.deepEqual(relive(freeStart, free.table.ledger.slice(freeAt)), free.table);

	const many = position(), second = permanent(many.table, 0, terror, pack(terror));
	// Independent target slots distinguish one tax per source from one tax per occurrence.
	const fixture = checkProcedure({ ...lifeCast(), claim: "Target tax fixture", basis: "Target tax fixture", cost: { mana: "{0}" },
		targets: [{ object: { types: ["creature"] } }, { object: { types: ["creature"] } }], instructions: [] });
	const combined = offered(many.table, fixture); assert.ok(combined.length);
	for (const one of combined) {
		const targets = new Set(one.activation.targets.flat().flatMap(aim => "id" in aim ? [aim.id] : []));
		assert.equal(one.activation.cost.life ?? 0, 3 * [many.target, second].filter(one => targets.has(one.id)).length);
	}
	const own = permanent(many.table, 1, "Swamp");
	const activation = { ...fixture, timing: "stack" as const, source: { zones: ["battlefield" as const], controller: "self" as const, refs: [ref(own)] } };
	const abilities = offered(many.table, activation); assert.ok(abilities.length);
	assert.ok(abilities.every(one => one.activation.cost.life === undefined), "activated abilities pay no casting tax");
	commit(many.table, [{ do: "note", note: { kind: "label", on: ref(many.target), by: 1, until: "indefinite", text: "Ability removal fixture", change: { loseAbilities: true } } }], "game-setup");
	assert.ok(aimed(many.table, many.target).every(one => one.activation.cost.life === 3), "a lost static ability imposes no tax");
	commit(many.table, [{ do: "move", what: second.id, to: "exile", reason: "game-setup" },
		{ do: "move", what: second.id, to: "battlefield", controller: 1, registers: pack(terror), reason: "game-setup" }], "game-setup");
	const friendly = aimed(many.table, second); assert.ok(friendly.length);
	assert.ok(friendly.every(one => one.activation.cost.life === 3), "an owned opposing card under your control does not tax your spells");

	// The same accepted package still supplies flying and its complete entry-damage trigger.
	const damage = start(standard, [{ deck: alpha(deck("4c Reanimator")) }, { deck: alpha(deck("Dimir Midrange")) }], "terror-entry");
	const dragon = permanent(damage, 0, terror, pack(terror)); main(damage, 0);
	const bookworm = "Oblivious Bookworm";
	if (!cardsIn(damage, "hand", 0).some(one => one.card === bookworm)) place(damage, 0, "hand", bookworm);
	commit(damage, [{ do: "add-mana", who: 0, colors: ["G", "U"] }], "game-setup");
	const before = structuredClone(damage), since = damage.ledger.length;
	announce(damage, printedCast(bookworm, damage.printed[bookworm]!)); passBoth(damage); finish(damage);
	assert.equal(damage.waiting.length, 1); assert.ok(characteristics(damage, dragon)!.words.includes("flying"));
	apply(damage, nextDecision(damage)!.options.find(one => one.trigger?.targets.some(target => "player" in target && target.player === 1))!.id, "model", "chosen");
	passBoth(damage); finish(damage); assert.equal(damage.seats[1]!.life, 18);
	assert.deepEqual(relive(before, damage.ledger.slice(since)), damage);
});
