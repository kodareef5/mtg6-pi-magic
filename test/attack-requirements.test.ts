/** An attack requirement guides a declaration without choosing it, and follows the granted incarnation. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { project } from "../src/core/view.ts";
import { announce, finish, main, pack, passBoth, quiet } from "./play.ts";

const card = "Carnage, Crimson Chaos", ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
const done = (table: Table) => nextDecision(table)!.options.find(one => one.id === "attack:done")!;
function attackers(table: Table) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers") return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("No attack declaration");
}
function settle(table: Table) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Unsettled return");
}

test("Carnage's returned creature must attack when able and sacrifices only after combat damage to a player", () => {
	const table = start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "required-attacks"); main(table, 0);
	const find = (name: string, owner = 0) => [...cardsIn(table, "hand", owner), ...cardsIn(table, "library", owner)].find(one => one.card === name)!;
	const carnage = find(card), academic = find("Hardened Academic"), tooLarge = find(card, 1), opponent = find("Marauding Mako", 1);
	commit(table, [{ do: "move", what: carnage.id, to: "hand", reason: "game-setup" }, ...[academic, tooLarge, opponent].map(one => ({ do: "move" as const, what: one.id, to: "graveyard" as const, reason: "game-setup" as const })),
		{ do: "add-mana", who: 0, colors: ["C", "C", "B", "R"] }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, registers: pack(card) } },
		{ do: "package.put", package: { card: "Hardened Academic", registers: pack("Hardened Academic") } }], "return-terms");
	const before = structuredClone(table), cast = printedCast(card, table.printed[card]!); cast.source.refs = [ref(carnage)];
	announce(table, cast); passBoth(table); finish(table); assert.equal(table.waiting.length, 1);
	const targets = nextDecision(table)!; assert.ok(targets.options.some(one => one.objects?.some(ref => ref.id === academic.id)));
	assert.ok(!targets.options.some(one => one.objects?.some(ref => [tooLarge.id, opponent.id].includes(ref.id))));
	apply(table, targets.options.find(one => one.objects?.some(ref => ref.id === academic.id))!.id, "model", "chosen"); passBoth(table); finish(table); settle(table);
	assert.equal(academic.zone, "battlefield"); assert.ok(characteristics(table, academic)!.words.includes("attacks each combat if able")); replay(table, before);
	const original = ref(academic); commit(table, [{ do: "move", what: carnage.id, to: "exile", reason: "exile" }], "resolve");
	assert.ok(characteristics(table, academic)!.words.includes("attacks each combat if able"), "the grant outlasts Carnage");
	attackers(table); const declaration = structuredClone(table); assert.match(done(table).shows!, /Hardened Academic must attack/);
	for (const viewer of [0, 1, "spectator"] as const) assert.ok(project(table, viewer).objects!.find(one => one.id === academic.id)!.traits!.words.includes("attacks each combat if able"));
	assert.deepEqual(table, declaration, "discovery and projection leave the declaration unanswered");
	const declined = structuredClone(table); apply(declined, "attack:done", "model", "chosen"); settle(declined);
	assert.equal(declined.combat!.attackers.length, 0); assert.equal(declined.ledger.at(-1)!.by, "model"); replay(declined, declaration);
	for (const mode of ["tapped", "sick", "defender", "can't attack", "lose-abilities", "not-creature"] as const) {
		const changed = structuredClone(table), object = changed.things.get(academic.id)!;
		if (mode === "tapped") commit(changed, [{ do: "tap", what: academic.id }], "resolve");
		else commit(changed, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: ref(object), text: "Attack eligibility fixture",
			change: mode === "not-creature" ? { types: { set: ["artifact"] } } : mode === "lose-abilities" || mode === "sick" ? { loseAbilities: true } : { words: [mode] } } }], "resolve");
		if (mode === "sick") commit(changed, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: ref(object), text: "Requirement without haste", change: { words: ["attacks each combat if able"] } } }], "resolve");
		assert.ok(!done(changed).shows?.includes("must attack"), mode);
	}
	apply(table, `attack:${academic.id}`, "model", "chosen"); assert.ok(!done(table).shows?.includes("must attack"));
	apply(table, "attack:done", "model", "chosen");
	for (let guard = 0; guard < 200 && !table.waiting.some(one => one.source?.id === academic.id); guard++) {
		const decision = nextDecision(table); if (!decision) advance(table); else apply(table, quiet(decision.options).id, "model", "chosen");
	}
	assert.equal(table.seats[1]!.life, 18); assert.equal(academic.zone, "battlefield"); assert.equal(table.waiting.length, 1);
	const damaged = structuredClone(table); settle(table); assert.equal(academic.zone, "graveyard");
	assert.ok(table.log.some(one => one.changes.some(change => change.do === "move" && change.what === academic.id && change.reason === "sacrifice")));
	replay(table, damaged); replay(table, declaration);
	commit(table, [{ do: "move", what: academic.id, to: "battlefield", reason: "resolve", registers: pack("Hardened Academic") }], "resolve");
	assert.ok(academic.incarnation > original.incarnation); assert.ok(!characteristics(table, academic)!.words.includes("attacks each combat if able"));
	for (const mode of ["noncombat", "creature", "prevented", "double-strike"] as const) {
		const game = structuredClone(declaration), source = game.things.get(academic.id)!;
		if (mode === "double-strike") {
			commit(game, [{ do: "note", note: { kind: "label", on: ref(source), by: 0, until: "end-of-turn", text: "Double strike fixture", change: { words: ["double strike"] } } }], "resolve");
			const start = structuredClone(game); apply(game, `attack:${academic.id}`, "model", "chosen"); apply(game, "attack:done", "model", "chosen"); main(game, 0, 1, "postcombat-main");
			assert.equal(game.seats[1]!.life, 18, "sacrificed after first-strike damage, before the normal strike"); assert.equal(source.zone, "graveyard"); replay(game, start); continue;
		}
		commit(game, [{ do: "damage", source: ref(source), target: mode === "creature" ? ref(source) : { player: 1 }, amount: mode === "prevented" ? 0 : 1, ...(mode === "noncombat" ? {} : { combat: true }) }], "resolve");
		assert.ok(!game.waiting.length, mode);
	}
});
