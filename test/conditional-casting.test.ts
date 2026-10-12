/** Conditional native prices follow a public discard incarnation, without changing timing or spending early. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { printedCast } from "../src/core/procedures.ts";
import { castingPrices, playable } from "../src/core/permits.ts";
import { holds, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { preparation } from "../src/core/readiness.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { dossier } from "../src/context/dossier.ts";
import { announce, example, finish, main, offered, pack, passBoth, quiet } from "./play.ts";

const card = "Carnage, Crimson Chaos";
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function setup() {
	const table = start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "mayhem", undefined, { announcementsFrom: 0 }); main(table, 0);
	const source = [...cardsIn(table, "hand", 0), ...cardsIn(table, "library", 0)].find(one => one.card === card)!;
	const academic = [...cardsIn(table, "hand", 0), ...cardsIn(table, "library", 0)].find(one => one.card === "Hardened Academic")!;
	commit(table, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" },
		{ do: "move", what: academic.id, to: "battlefield", reason: "game-setup", registers: pack("Hardened Academic") },
		{ do: "add-mana", who: 0, colors: ["B", "R"] }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, registers: pack(card) } }], "mayhem-terms");
	return { table, source, academic };
}
const prices = (table: Table, source: Thing, seat = 0) => castingPrices(tableWorld(table), seat, source, table.cursor.turn);

test("a conditional native cast requires this turn's exact discard and retains normal timing, readiness and replay", () => {
	const { table, source } = setup(), cast = printedCast(card, table.printed[card]!);
	assert.deepEqual(prices(table, source), [{}], "the hand keeps its printed price"); assert.equal(offered(table, cast).length, 0, "two mana cannot pay four");
	const before = structuredClone(table);
	announce(table, example("Discard for Hardened Academic's lifelink"), one => !!one.activation.cost.discarded?.some(one => one.id === source.id));
	assert.equal(source.zone, "graveyard"); assert.equal(prices(table, source)[0]!.mana, "{B}{R}");
	assert.equal(offered(table, cast).length, 0, "permission does not make a creature instant speed");
	passBoth(table); finish(table); replay(table, before);
	const eligible = structuredClone(table), condition = { discardedThisTurn: "this", by: "you" } as const;
	for (const viewer of [0, 1, "spectator"] as const) {
		const world = viewWorld(project(table, viewer));
		assert.ok(holds({ world, controller: 0, source }, condition));
		assert.equal(castingPrices(world, 0, world.objects.find(one => one.id === source.id)!, table.cursor.turn)[0]!.mana, "{B}{R}");
		assert.ok(!holds({ world, controller: 1, source }, condition));
	}
	assert.deepEqual(prices(table, source, 1), []); assert.match(dossier({ frame: workFrame(table, 0) }), /discardedThisTurn.* is met/);
	assert.deepEqual(table, eligible, "permission, projection and dossier reads are pure");
	assert.equal(offered(table, { ...cast, cost: { mana: "{0}" } }).length, 0, "alternative costs cannot combine");
	// A known use becomes required work even without mana or a legal timing window.
	const unready = structuredClone(table), deferred = { source: { card, zones: ["graveyard" as const] }, timing: "spell" as const, claim: "Cast Carnage", basis: "Mayhem {B}{R}" };
	commit(unready, [{ do: "spend-mana", who: 0, ids: unready.seats[0]!.pool.map(one => one.id) }], "resolve");
	editWork(unready, 0, [{ do: "package.put", package: { card, registers: pack(card), deferred: [deferred] } }], "deferred-mayhem");
	assert.equal(preparation(workFrame(unready, 0))[0]!.card, card); assert.throws(() => apply(unready, "pass", "model", "chosen"), /Prepare the known uses/);
	// Use the staged public choice, clone before confirmation, and check that only confirmation spends.
	const action = nextDecision(table)!.options.find(one => one.label.includes(card))!; assert.ok(action);
	apply(table, action.id, "model", "chosen"); assert.ok(table.announcement); assert.equal(source.zone, "graveyard");
	const pending = structuredClone(table);
	for (let guard = 0; guard < 20 && table.announcement; guard++) {
		const decision = nextDecision(table)!;
		const choice = decision.options.find(one => !/:(cancel|back|undo)/.test(one.id))!;
		assert.ok(choice); apply(table, choice.id, "model", "chosen");
	}
	assert.equal(source.zone, "stack"); assert.equal(table.seats[0]!.pool.length, 0); assert.equal(source.ability!.leavesStack, undefined);
	for (let guard = 0; guard < 100; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) break;
		apply(table, quiet(decision.options).id, "model", "chosen");
	}
	assert.equal(source.zone, "battlefield"); replay(table, pending); replay(table, eligible); replay(table, before);
	commit(table, [{ do: "move", what: source.id, to: "graveyard", reason: "destroy" }], "resolve"); assert.deepEqual(prices(table, source), [], "dying is a new object");
	for (const route of ["mill", "resolve", "cleanup-discard", "exile-return", "next-turn", "counter", "discard-again", "repeated-group", "hidden"] as const) {
		const { table: game, source: object } = setup();
		commit(game, [{ do: "move", what: object.id, to: route === "hidden" ? "exile" : "graveyard", reason: route === "mill" || route === "resolve" ? route : route === "cleanup-discard" ? route : "discard", ...(route === "hidden" ? { faceDown: true as const } : {}) }], "resolve");
		if (route === "exile-return" || route === "counter") commit(game, [
			{ do: "move", what: object.id, to: route === "counter" ? "stack" : "exile", reason: "resolve" }, { do: "move", what: object.id, to: "graveyard", reason: route === "counter" ? "counter" : "resolve" }], "resolve");
		if (route === "discard-again" || route === "repeated-group") commit(game, [
			{ do: "move", what: object.id, to: "hand", reason: "bounce" }, { do: "move", what: object.id, to: "graveyard", reason: "discard" },
			...(route === "repeated-group" ? [{ do: "move" as const, what: object.id, to: "hand" as const, reason: "bounce" as const }, { do: "move" as const, what: object.id, to: "graveyard" as const, reason: "discard" as const }] : [])], "resolve");
		if (route === "next-turn") main(game, 1, 2);
		const expected = ["cleanup-discard", "discard-again", "repeated-group"].includes(route);
		assert.equal(playable(tableWorld(game), 0, object, game.cursor.turn, false), expected, route);
		if (route === "hidden") {
			const history = project(game, "spectator").history!.filter(one => one.kind === "physical" && one.action === "discarded");
			assert.deepEqual(history, [{ kind: "physical", action: "discarded", by: 0 }]);
			commit(game, [{ do: "move", what: object.id, to: "graveyard", reason: "resolve" }], "resolve");
			assert.deepEqual(project(game, "spectator").history!.filter(one => one.kind === "physical" && one.action === "discarded"), history);
			assert.deepEqual(prices(game, object), []);
		}
	}
});
