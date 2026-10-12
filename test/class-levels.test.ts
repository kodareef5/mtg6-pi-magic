/** Class levels are designations; level bars constrain announcement and derive granted abilities. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { activatedUses } from "../src/core/activated.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { copiable } from "../src/core/copies.ts";
import { project, describe } from "../src/core/view.ts";
import { matches, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { announce, finish, main, offered, pack, passBoth, quiet, step } from "./play.ts";

const card = "Cool but Rude", ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
const watches = (table: Table, object: Thing) => characteristics(table, object)!.registrations.filter(one => one.kind === "watch");
const levelUse = (table: Table, level: number) => activatedUses(workFrame(table, 0)).find(one => one.procedure.basis === `{1}{R}: Level ${level}`)!.procedure;
const money = (table: Table) => commit(table, [{ do: "add-mana", who: 0, colors: ["R", "R", "R", "R"] }], "game-setup");
function settle(table: Table) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Unsettled Class resolution");
}

test("Class level bars pay in order at sorcery timing and grant abilities without counters or copied levels", () => {
	const table = start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "class", undefined, { discardsFrom: 0, searchesFrom: 0 }); main(table, 0);
	const source = [...cardsIn(table, "hand", 0), ...cardsIn(table, "library", 0)].find(one => one.card === card)!;
	if (source.zone !== "hand") commit(table, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [], deferred: [] } }], "class");
	money(table); const beforeCast = structuredClone(table), cast = printedCast(card, table.printed[card]!); cast.source.refs = [ref(source)];
	announce(table, cast); passBoth(table); finish(table); assert.equal(source.level, undefined); assert.equal(watches(table, source).length, 1); replay(table, beforeCast);
	assert.ok(matches({ world: tableWorld(table), controller: 0, source }, source, { level: { atLeast: 1, atMost: 1 } }));
	assert.ok(offered(table, levelUse(table, 2)).length); assert.equal(offered(table, levelUse(table, 3)).length, 0);
	const preLevel = structuredClone(table), discardedBefore = cardsIn(table, "hand", 0)[0]!;
	commit(preLevel, [{ do: "move", what: discardedBefore.id, to: "graveyard", reason: "discard" }], "resolve"); assert.equal(preLevel.waiting.length, 0);
	// The level changes only when the paid activation resolves.
	const beforeLevel = structuredClone(table); announce(table, levelUse(table, 2)); assert.equal(source.level, undefined);
	const pending = structuredClone(table);
	const changedWhileStacked = structuredClone(pending); commit(changedWhileStacked, [{ do: "designate", what: source.id, designation: { level: 4 } }], "resolve");
	const alteredStart = structuredClone(changedWhileStacked); passBoth(changedWhileStacked); finish(changedWhileStacked);
	assert.equal(changedWhileStacked.things.get(source.id)!.level, 2, "the activation condition is not rechecked on resolution"); replay(changedWhileStacked, alteredStart);
	assert.equal(offered(table, levelUse(table, 2)).length, 0); passBoth(table); finish(table);
	assert.equal(source.level, 2); assert.deepEqual(source.counters, {}); assert.equal(watches(table, source).length, 2);
	assert.equal(source.registrations!.filter(one => one.kind === "watch").length, 1, "the granted watch is derived");
	replay(table, beforeLevel); replay(table, pending);
	for (const viewer of [0, 1, "spectator"] as const) {
		const view = project(table, viewer), seen = view.objects!.find(one => one.id === source.id)!;
		assert.equal(seen.level, 2); assert.ok(matches({ world: viewWorld(view), controller: 0, source: seen }, seen, { level: { atLeast: 2, atMost: 2 } }));
	}
	assert.match(table.log.map(one => describe(table, one)).join("\n"), /designated Cool but Rude as level 2/);
	money(table); assert.equal(offered(table, levelUse(table, 2)).length, 0); assert.ok(offered(table, levelUse(table, 3)).length);
	const opponent = structuredClone(table); main(opponent, 1, 2); apply(opponent, "pass", "model", "chosen"); money(opponent);
	assert.equal(opponent.cursor.priority, 0); assert.equal(offered(opponent, levelUse(opponent, 3)).length, 0, "not on the opponent's turn");
	const combat = structuredClone(table); main(combat, 0, 1, "begin-combat"); money(combat); assert.equal(offered(combat, levelUse(combat, 3)).length, 0);
	const pair = cardsIn(table, "hand", 0).slice(0, 2);
	commit(table, pair.map(one => ({ do: "move", what: one.id, to: "graveyard", reason: "discard" })), "resolve"); assert.equal(table.waiting.length, 2);
	const damage = structuredClone(table); settle(table); assert.equal(table.seats[1]!.life, 16); replay(table, damage);
	for (const accept of [false, true]) {
		const attack = structuredClone(table), attacker = cardsIn(attack, "library", 0).find(one => one.card === "Hardened Academic")!;
		commit(attack, [{ do: "move", what: attacker.id, to: "battlefield", reason: "game-setup", registers: pack("Hardened Academic") }], "game-setup");
		for (let guard = 0; guard < 100; guard++) {
			const decision = nextDecision(attack); if (!decision) { advance(attack); continue; }
			if (decision.situation === "turn-based" && attack.cursor.steps[0] === "declare-attackers") break;
			apply(attack, quiet(decision.options).id, "model", "chosen");
		}
		const beforeAttack = structuredClone(attack), library = cardsIn(attack, "library", 0).length;
		apply(attack, `attack:${attacker.id}`, "model", "chosen"); apply(attack, "attack:done", "model", "chosen");
		assert.equal(attack.waiting.length, 1); apply(attack, nextDecision(attack)!.options[0]!.id, "model", "chosen"); passBoth(attack);
		step(attack, label => label.startsWith(accept ? "Pay " : "Decline")); finish(attack); assert.equal(attack.waiting.length, Number(accept)); settle(attack);
		assert.equal(cardsIn(attack, "library", 0).length, library - Number(accept)); assert.equal(attack.seats[1]!.life, 16 - 2 * Number(accept)); replay(attack, beforeAttack);
	}
	const countered = structuredClone(table); commit(countered, [{ do: "counters", what: source.id, kind: "level", amount: 5 }], "resolve");
	assert.equal(countered.things.get(source.id)!.level, 2); assert.equal(watches(countered, countered.things.get(source.id)!).length, 2);
	// Type and ability changes retain the designation; losing abilities removes the grant.
	const altered = structuredClone(table), changed = altered.things.get(source.id)!;
	commit(altered, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: ref(changed), text: "Type change fixture", change: { types: { set: ["artifact"] } } } }], "resolve");
	assert.equal(changed.level, 2); assert.equal(characteristics(altered, changed)!.subtypes.includes("Class"), false); assert.equal(watches(altered, changed).length, 2);
	commit(altered, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: ref(changed), text: "Ability loss fixture", change: { loseAbilities: true } } }], "resolve");
	assert.equal(changed.level, 2); assert.equal(watches(altered, changed).length, 0); main(altered, 0, 3); assert.equal(watches(altered, changed).length, 2);
	const copy = copiable(table, source, "token"); assert.ok("spec" in copy); const copied = structuredClone(table);
	commit(copied, [{ do: "token", id: "class-copy", controller: 1, spec: copy.spec }], "resolve");
	assert.equal(copied.things.get("class-copy")!.level, undefined); assert.equal(watches(copied, copied.things.get("class-copy")!).length, 1);
	// A pending activation cannot mark the replacement incarnation after a blink.
	const blinked = structuredClone(table); announce(blinked, levelUse(blinked, 3));
	commit(blinked, [{ do: "move", what: source.id, to: "exile", reason: "exile" }, { do: "move", what: source.id, to: "battlefield", reason: "resolve", registers: pack(card) }], "resolve");
	const blinkStart = structuredClone(blinked); passBoth(blinked); finish(blinked); assert.equal(blinked.things.get(source.id)!.level, undefined); replay(blinked, blinkStart);
	// Level 3 grants the watch before its change is detected. Repeating the same level does not trigger.
	const beforeThird = structuredClone(table); announce(table, levelUse(table, 3)); passBoth(table); finish(table);
	assert.equal(source.level, 3); assert.equal(table.waiting.length, 1); assert.equal(watches(table, source).length, 3);
	const levelled = structuredClone(table); commit(levelled, [{ do: "designate", what: source.id, designation: { level: 3 } }], "resolve"); assert.equal(levelled.waiting.length, 1);
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	const announced = structuredClone(table); passBoth(table); step(table); assert.ok(table.resolution!.searching);
	const searched = structuredClone(table), found = nextDecision(table)!.options.find(one => one.objects?.length)!;
	const picked = found.objects![0]!; apply(table, found.id, "model", "chosen"); step(table); assert.equal(table.things.get(picked.id)!.zone, "hand");
	step(table); assert.equal(table.log.at(-1)!.changes[0]!.do, "shuffle"); const beforeRandom = structuredClone(table); step(table);
	const sample = table.log.at(-1)!.changes.find(one => one.do === "sample")!; assert.equal(sample.do, "sample");
	if (sample.do === "sample") assert.ok(sample.cards.some(one => one.id === picked.id), "the tutor result is eligible for random discard");
	step(table); settle(table); assert.equal(table.seats[1]!.life, 14);
	assert.equal(offered(table, levelUse(table, 2)).length, 0); assert.equal(offered(table, levelUse(table, 3)).length, 0);
	for (const before of [beforeThird, announced, searched, beforeRandom]) replay(table, before);
	const departed = structuredClone(announced); commit(departed, [{ do: "move", what: source.id, to: "exile", reason: "exile" }], "resolve");
	const departedStart = structuredClone(departed); settle(departed); assert.equal(departed.things.get(source.id)!.level, undefined);
	assert.ok(departed.log.some(one => one.changes.some(change => change.do === "sample"))); replay(departed, departedStart);
	commit(departed, [{ do: "designate", what: source.id, designation: { level: 2 } }], "resolve"); assert.equal(departed.things.get(source.id)!.level, undefined);
	const unchanged = structuredClone(table); assert.throws(() => commit(table, [{ do: "designate", what: source.id, designation: { level: 0 } }], "resolve"), /positive integer/); assert.deepEqual(table, unchanged);
});
