/** The next named end step is an entry boundary, not end-of-turn cleanup. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { playable } from "../src/core/permits.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import type { Zone } from "../src/core/syntax.ts";
import { announce, finish, main, pack, passBoth, quiet } from "./play.ts";

const card = "Inti, Seneschal of the Sun", ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = () => start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "inti", undefined, { discardsFrom: 0 });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function put(table: Table, card: string, zone: Zone) {
	const one = [...cardsIn(table, "library", 0), ...cardsIn(table, "hand", 0)].find(one => one.card === card)!; assert.ok(one, card);
	if (one.zone !== zone) commit(table, [{ do: "move", what: one.id, to: zone, reason: "game-setup", ...(zone === "battlefield" ? { registers: pack(card) } : {}) }], "game-setup"); return one;
}
function settle(table: Table, target?: Thing) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		const preferred = decision.situation === "trigger-order" && target ? decision.options.find(one => one.objects?.some(one => one.id === target.id)) : undefined;
		apply(table, (preferred ?? quiet(decision.options)).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
}

test("Inti discards before reflexive targets, and its permission expires before the next own end step's priority", () => {
	for (const accept of [false, true]) {
		const table = build(); main(table, 0);
		editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [], deferred: [] } }], "inti");
		const inti = put(table, card, "hand"), cast = printedCast(card, table.printed[card]!); cast.source.refs = [ref(inti)];
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "R"] }], "game-setup"); const castStart = structuredClone(table);
		announce(table, cast); settle(table); replay(table, castStart);
		const attacker = put(table, "Hardened Academic", "battlefield"); put(table, "Burst Lightning", "hand");
		const top = put(table, "Mountain", "library"); commit(table, [{ do: "move", what: top.id, to: "library", position: "top", reason: "game-setup" }], "game-setup");
		for (let guard = 0; guard < 100; guard++) {
			const decision = nextDecision(table); if (!decision) { advance(table); continue; }
			if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers") break;
			apply(table, quiet(decision.options).id, "model", "chosen");
		}
		const beforeAttack = structuredClone(table); apply(table, `attack:${attacker.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
		assert.equal(table.waiting.length, 1); const trigger = nextDecision(table)!; apply(table, trigger.options[0]!.id, "model", "chosen"); passBoth(table);
		const payment = nextDecision(table)!, chosen = payment.options.find(one => accept ? one.label.startsWith("Pay ") && one.label.includes("Burst Lightning") : one.label.startsWith("Decline"));
		assert.ok(chosen, payment.options.map(one => one.label).join(" | ")); assert.ok(payment.options.every(one => !one.objects?.some(one => one.id === attacker.id)), "no reflexive target is chosen before discarding");
		apply(table, chosen.id, "model", "chosen"); finish(table);
		assert.equal(table.waiting.length, accept ? 2 : 0); const pending = structuredClone(table); settle(table, attacker);
		assert.equal(attacker.counters["+1/+1"] ?? 0, accept ? 1 : 0); assert.equal(characteristics(table, attacker)!.words.includes("trample"), accept);
		assert.equal(top.zone, accept ? "exile" : "library"); assert.equal(table.notes.filter(one => one.kind === "permit").length, accept ? 1 : 0);
		replay(table, pending); replay(table, beforeAttack);
		if (accept) {
			assert.deepEqual(table.notes.find(one => one.kind === "permit")!.until, { nextEndStep: 0 });
			assert.ok(playable(tableWorld(table), 0, top, table.cursor.turn, true));
			assert.ok(!nextDecision(table)!.options.some(one => one.id.startsWith("land:")), "permission does not grant a combat land play");
			main(table, 0, 1, "postcombat-main"); const beforePlay = structuredClone(table), expires = structuredClone(table);
			const play = nextDecision(table)!.options.find(one => one.id.startsWith("land:") && one.objects?.some(one => one.id === top.id)); assert.ok(play);
			apply(table, play.id, "model", "chosen"); assert.equal(top.zone, "battlefield"); replay(table, beforePlay);
			main(expires, 0, 1, "end"); assert.equal(expires.notes.some(one => one.kind === "permit"), false); replay(expires, beforePlay);
		}
	}
	// Grant at each boundary; read the same result through core and the owning seat's projection.
	for (const timing of ["own-main", "own-end", "their-main", "their-end", "cleanup", "skip", "extra-end"] as const) {
		const game = build(); main(game, 0);
		const object = put(game, "Burst Lightning", "exile");
		if (["own-end", "cleanup", "extra-end"].includes(timing)) main(game, 0, 1, "end");
		if (timing === "cleanup") { passBoth(game); advance(game); assert.equal(game.cursor.steps[0], "cleanup"); }
		if (timing === "their-main" || timing === "their-end") main(game, 1, 2, timing === "their-main" ? "precombat-main" : "end");
		if (timing === "skip") game.cursor.steps = game.cursor.steps.filter(one => one !== "end");
		if (timing === "extra-end") game.cursor.steps.splice(1, 0, "end");
		commit(game, [{ do: "note", note: { kind: "permit", on: ref(object), by: 0, who: 0, fromTurn: game.cursor.turn, until: { nextEndStep: 0 } } }], "resolve");
		const before = structuredClone(game); nextDecision(game); project(game, 0); assert.deepEqual(game, before);
		assert.ok(playable(tableWorld(game), 0, object, game.cursor.turn, false));
		const seen = project(game, 0); assert.ok(playable(viewWorld(seen), 0, seen.objects!.find(one => one.id === object.id)!, game.cursor.turn, false));
		assert.ok(!playable(tableWorld(game), 1, object, game.cursor.turn, false));
		if (timing !== "extra-end") main(game, 0, timing === "own-main" ? 1 : 3, "postcombat-main");
		assert.ok(game.notes.some(one => one.kind === "permit"), timing);
		const boundary = structuredClone(game); passBoth(game); advance(game);
		assert.equal(game.cursor.steps[0], "end"); assert.equal(game.cursor.stepDone, false); assert.equal(game.cursor.priority, null);
		assert.equal(game.notes.some(one => one.kind === "permit"), false, timing); assert.ok(!playable(tableWorld(game), 0, object, game.cursor.turn, false));
		settle(game); replay(game, boundary); replay(game, before);
	}
});
