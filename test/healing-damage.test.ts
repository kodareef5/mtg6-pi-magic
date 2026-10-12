/** Healing removes only earlier marked damage, preserves the incoming group and follows replacement choices. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { beforeDamage } from "../src/core/damage-order.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import type { Change } from "../src/core/syntax.ts";
import type { Package, Registration } from "../src/core/language.ts";
import { check, PackageSchema } from "../src/core/language.ts";
import { announce, example, main, pack, passBoth, finish, place, quiet } from "./play.ts";

const wolverine = "Wolverine, Fierce Fighter", bat = "Deep-Cavern Bat", pride = "Ajani's Pridemate";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = () => start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Lifegain")) }], "healing");
const stored = (slug: string): Registration[] => (JSON.parse(readFileSync(new URL(`../prepared/packages/2026-10-10/${slug}.json`, import.meta.url), "utf8")).package as Package).registers;
function put(table: Table, who: number, card: string, registers: Registration[] = []) {
	if (card === pride) {
		const creation = example("Ajani creates a Pridemate").instructions[0]!; assert.ok(creation.do === "token" && creation.spec);
		const id = `pridemate-${who}-${table.cursor.clock}`; commit(table, [{ do: "token", id, controller: who, spec: creation.spec }], "game-setup"); return table.things.get(id)!;
	}
	const one = cardsIn(table, "hand", who).find(one => one.card === card) ?? place(table, who, "hand", card)[0]!;
	commit(table, [{ do: "move", what: one.id, to: "battlefield", reason: "game-setup", registers }], "game-setup"); return one;
}
const hit = (source: Thing, target: Thing, amount: number): Extract<Change, { do: "damage" }> => ({ do: "damage", source: ref(source), target: ref(target), amount });
const replay = (table: Table, before: Table) => {
	while (!table.outcome && !nextDecision(table)) advance(table);
	assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
};
function settle(table: Table) {
	for (let guard = 0; guard < 150; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
}
function reach(table: Table, step: string) {
	for (let guard = 0; guard < 250; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === step) return decision;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error(`Never reached ${step}`);
}

test("healing preserves simultaneous damage, affects no life total, and keeps prevention order, deathtouch and combat assignments", () => {
	for (const to of [undefined, { player: "you" }]) assert.throws(() => check(PackageSchema, { card: wolverine, registers: [{ kind: "damage-rule", basis: "Healing fixture", mode: "heal", ...(to ? { to } : {}) }] }, "healing needs a permanent"));
	for (const chooseFight of [false, true]) {
		const table = build(); main(table, 0); const target = put(table, 1, pride);
		const source = cardsIn(table, "hand", 0).find(one => one.card === wolverine) ?? place(table, 0, "hand", wolverine)[0]!;
		editWork(table, 0, [{ do: "package.put", package: { card: wolverine, assessed: true, printedCast: true, registers: pack(wolverine), procedures: [], deferred: [] } }], "wolverine");
		commit(table, [{ do: "add-mana", who: 0, colors: ["R", "G", "C", "C"] }], "game-setup");
		const before = structuredClone(table); announce(table, printedCast(wolverine, table.printed[wolverine]!)); passBoth(table); finish(table);
		const decision = nextDecision(table)!, chosen = decision.options.find(one => chooseFight ? one.objects?.some(object => object.id === target.id) : !one.objects?.some(object => object.id === target.id))!;
		assert.ok(chosen); apply(table, chosen.id, "model", "chosen"); const pending = structuredClone(table); settle(table);
		assert.equal(source.damage, chooseFight ? 2 : 0); assert.equal(target.zone, chooseFight ? "graveyard" : "battlefield");
		assert.equal(table.seats[0]!.life, 20); assert.equal(table.seats[1]!.life, 20); replay(table, pending); replay(table, before);
	}
	const plain = build(); main(plain, 0); const wolf = put(plain, 0, wolverine, pack(wolverine)), dealer = put(plain, 1, bat, stored("deep-cavern-bat"));
	commit(plain, [hit(dealer, wolf, 3)], "resolve"); assert.equal(wolf.damage, 3); assert.equal(plain.seats[1]!.life, 23);
	const zero = commit(plain, [{ ...hit(dealer, wolf, 0), healed: 99 }], "resolve"); assert.equal(wolf.damage, 3); assert.ok(!zero.changes.some(one => one.do === "damage" && one.healed), "healing is derived from the applicable event, not an incoming receipt annotation");
	const second = commit(plain, [hit(dealer, wolf, 3)], "resolve"); assert.equal(wolf.damage, 3); assert.equal(plain.seats[1]!.life, 26);
	assert.match(describe(plain, second), /3 earlier damage healed/);
	const together = commit(plain, [hit(dealer, wolf, 2), hit(dealer, wolf, 2)], "resolve"); assert.equal(wolf.damage, 4); assert.equal(plain.seats[1]!.life, 30);
	assert.equal(together.changes.reduce((sum, one) => sum + (one.do === "damage" ? one.healed ?? 0 : 0), 0), 3, "prior damage is healed once, leaving both new hits");
	assert.equal(plain.seats[0]!.life, 20, "healing marked damage is not life gain");
	const removed = structuredClone(plain), beforeRemoval = removed.things.get(wolf.id)!;
	commit(removed, [{ do: "note", note: { kind: "label", on: ref(beforeRemoval), by: 0, until: "end-of-turn", text: "Ability loss fixture", change: { loseAbilities: true } } }], "resolve");
	commit(removed, [hit(dealer, beforeRemoval, 1)], "resolve"); assert.equal(beforeRemoval.damage, 5); finish(removed); assert.equal(beforeRemoval.zone, "graveyard");
	const departing = structuredClone(plain), oldRef = ref(departing.things.get(wolf.id)!);
	commit(departing, [{ do: "move", what: wolf.id, to: "graveyard", reason: "destroy" }, { do: "damage", source: ref(dealer), target: oldRef, amount: 3 }], "resolve");
	assert.equal(departing.things.get(wolf.id)!.damage, 0, "simultaneous damage cannot mark the new graveyard incarnation");
	// Removing marked damage does not undo a deathtouch occurrence before the next checkpoint.
	const deadly = build(); main(deadly, 0); const w = put(deadly, 0, wolverine, pack(wolverine)), b = put(deadly, 1, bat, stored("deep-cavern-bat"));
	commit(deadly, [{ do: "note", note: { kind: "label", on: ref(b), by: 1, until: "end-of-turn", text: "Deathtouch fixture", change: { words: ["deathtouch"] } } }], "game-setup");
	commit(deadly, [hit(b, w, 1)], "resolve"); commit(deadly, [hit(w, w, 2)], "resolve"); assert.equal(w.damage, 2); assert.equal(w.deathtouched, true); finish(deadly); assert.equal(w.zone, "graveyard");
	for (const first of ["heal", "prevent"] as const) for (const unpreventable of [false, true]) {
		const game = build(); main(game, 0); const target = put(game, 0, wolverine, pack(wolverine)), source = put(game, 1, bat, stored("deep-cavern-bat"));
		commit(game, [hit(source, target, 3)], "resolve");
		commit(game, [{ do: "note", note: { kind: "damage-rule", by: 0, until: "end-of-turn", mode: "prevent" } },
			...(unpreventable ? [{ do: "note" as const, note: { kind: "damage-rule" as const, by: 0, until: "end-of-turn" as const, mode: "unpreventable" as const } }] : [])], "resolve");
		const group: Change[] = [hit(source, target, 3), { do: "damage", source: ref(source), target: { player: 0 }, amount: 2 }], unchanged = structuredClone(game);
		assert.throws(() => commit(game, [{ do: "tap", what: target.id }, ...group], "resolve"), /replacement-order/); assert.deepEqual(game, unchanged);
		commit(game, beforeDamage(game, group, "resolve"), "resolve"); const pending = structuredClone(game);
		assert.equal(target.damage, 3); assert.equal(game.seats[0]!.life, 20); assert.equal(nextDecision(game)!.seat, 0);
		const pure = structuredClone(game); nextDecision(game); project(game, "spectator"); assert.deepEqual(game, pure);
		apply(game, nextDecision(game)!.options.find(one => first === "heal" ? one.label.includes(wolverine) : one.label.includes("Prevent all"))!.id, "model", "chosen");
		assert.equal(game.damageOrder, undefined); assert.equal(target.damage, unpreventable || first === "prevent" ? 3 : 0);
		assert.equal(game.seats[0]!.life, unpreventable ? 18 : 20); assert.equal(game.seats[1]!.life, unpreventable ? 28 : 23); replay(game, pending);
	}
	const added = build(); main(added, 0); const addingWolf = put(added, 0, wolverine, pack(wolverine)), addingSource = put(added, 1, bat);
	commit(added, [hit(addingSource, addingWolf, 3)], "resolve");
	commit(added, [{ do: "note", note: { kind: "register", on: ref(addingSource), by: 1, until: "end-of-turn", registration: { kind: "damage-rule", basis: "Damage addition fixture", mode: "add", amount: 1, from: { is: "this" } } } }], "resolve");
	commit(added, beforeDamage(added, [hit(addingSource, addingWolf, 3)], "resolve"), "resolve"); const addStart = structuredClone(added);
	apply(added, nextDecision(added)!.options.find(one => one.label.includes(wolverine))!.id, "model", "chosen"); assert.equal(addingWolf.damage, 4); replay(added, addStart);
	// Two normal blockers deal one lethal group; double strike makes two separately healed events.
	for (const doubleStrike of [false, true]) {
		const game = build(); main(game, 0); const source = put(game, 0, wolverine, pack(wolverine));
		const blockers = Array.from({ length: doubleStrike ? 1 : 2 }, () => put(game, 1, pride));
		commit(game, blockers.map(one => ({ do: "counters", what: one.id, kind: "+1/+1", amount: 1 })), "game-setup");
		if (doubleStrike) commit(game, [{ do: "note", note: { kind: "label", on: ref(blockers[0]!), by: 1, until: "end-of-turn", text: "Double strike fixture", change: { words: ["double strike"] } } }], "game-setup");
		commit(game, [hit(blockers[0]!, source, 2)], "resolve"); const initial = structuredClone(game);
		reach(game, "declare-attackers"); apply(game, `attack:${source.id}`, "model", "chosen"); apply(game, "attack:done", "model", "chosen"); reach(game, "declare-blockers");
		for (const one of blockers) apply(game, `block:${one.id}:${source.id}`, "model", "chosen"); apply(game, "block:done", "model", "chosen");
		const blocked = structuredClone(game); main(game, 0, 1, "postcombat-main");
		assert.equal(source.zone, doubleStrike ? "battlefield" : "graveyard"); if (doubleStrike) assert.equal(source.damage, 3);
		const events = game.log.flatMap(row => row.changes.filter(one => one.do === "damage" && "id" in one.target && one.target.id === source.id && one.combat));
		assert.equal(events.reduce((sum, one) => sum + (one.do === "damage" ? one.amount : 0), 0), 6);
		assert.equal(events.reduce((sum, one) => sum + (one.do === "damage" ? one.healed ?? 0 : 0), 0), doubleStrike ? 5 : 2);
		replay(game, blocked); replay(game, initial);
	}
	const trampling = build(); const defender = put(trampling, 0, wolverine, pack(wolverine)), attacker = put(trampling, 1, pride);
	commit(trampling, [{ do: "counters", what: attacker.id, kind: "+1/+1", amount: 4 }, { do: "note", note: { kind: "label", on: ref(attacker), by: 1, until: "indefinite", text: "Trample fixture", change: { words: ["trample"] } } }], "game-setup");
	main(trampling, 1, 2); commit(trampling, [hit(attacker, defender, 3)], "resolve"); const initial = structuredClone(trampling);
	reach(trampling, "declare-attackers"); apply(trampling, `attack:${attacker.id}`, "model", "chosen"); apply(trampling, "attack:done", "model", "chosen");
	reach(trampling, "declare-blockers"); apply(trampling, `block:${defender.id}:${attacker.id}`, "model", "chosen"); apply(trampling, "block:done", "model", "chosen");
	const assignment = reach(trampling, "combat-damage"); assert.ok(assignment.options.some(one => one.id === `assign:${attacker.id}:2-4`));
	apply(trampling, `assign:${attacker.id}:2-4`, "model", "chosen"); main(trampling, 1, 2, "postcombat-main");
	assert.equal(defender.damage, 2); assert.equal(defender.zone, "battlefield"); assert.equal(trampling.seats[0]!.life, 16); replay(trampling, initial);
});
