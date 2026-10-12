/** Draw replacements modify one batch, settle before continuations and retain privacy.
 * Past 150 lines to cover actual casts, draw steps, multiplayer order and saved choices together. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { orderedDraw } from "../src/core/draw.ts";
import { beforeDraw } from "../src/core/draw-order.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { describe, project } from "../src/core/view.ts";
import type { Instruction, Procedure } from "../src/core/language.ts";
import { announce, example, finish, main, pack, passBoth, quiet, step } from "./play.ts";

const card = "Quantum Riddler", ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const position = () => start(standard, [{ deck: alpha(deck("Azorius Momo")) }, { deck: alpha(deck("Azorius Momo")) }], "draw-replacements");
function put(table: Table, who = 0) {
	const source = [...cardsIn(table, "library", who), ...cardsIn(table, "hand", who)].find(one => one.card === card)!; assert.ok(source);
	commit(table, [{ do: "move", what: source.id, to: "battlefield", reason: "game-setup", registers: pack(card) }], "game-setup"); return source;
}
function hand(table: Table, who: number, count: number, keep?: Thing) {
	const held = cardsIn(table, "hand", who).filter(one => one.id !== keep?.id);
	commit(table, held.slice(Math.max(0, count - (keep ? 1 : 0))).map(one => ({ do: "move", what: one.id, to: "graveyard", reason: "game-setup" })), "game-setup");
	while (cardsIn(table, "hand", who).length < count) commit(table, [{ do: "move", what: cardsIn(table, "library", who)[0]!.id, to: "hand", reason: "game-setup" }], "game-setup");
}
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function settle(table: Table) {
	for (let guard = 0; table.resolution || table.drawOrder; guard++) {
		assert.ok(guard < 100); const next = nextDecision(table)!; assert.ok(["resolution", "replacement-order"].includes(next.situation));
		apply(table, next.options[0]!.id, "model", "chosen");
	}
	finish(table);
}
const effect = (instructions: Instruction[]): Procedure => ({ source: { card, zones: ["battlefield"], controller: "self" }, timing: "stack",
	claim: "Draw sequence fixture", basis: "When this creature enters, draw a card.", instructions });
function reach(table: Table, stepName: string, turn: number) {
	for (let guard = 0; guard < 1500; guard++) {
		const next = nextDecision(table);
		if (table.cursor.turn === turn && table.cursor.steps[0] === stepName && next) return next;
		if (next) apply(table, quiet(next.options).id, "model", "chosen"); else advance(table);
	}
	throw new Error("The requested turn window did not arrive");
}

test("draw increases apply once per batch, finish affected-player choices before motion and preserve source and turn-draw scope", () => {
	for (const warp of [false, true]) for (const remaining of [0, 1, 2]) {
		const table = position(); main(table, 0);
		const source = [...cardsIn(table, "library", 0), ...cardsIn(table, "hand", 0)].find(one => one.card === card)!;
		if (source.zone !== "hand") commit(table, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" }], "game-setup");
		hand(table, 0, remaining + 1, source);
		editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, assessed: true, registers: pack(card), procedures: [example("Cast Quantum Riddler for warp")], deferred: [] } }], "prepare-riddler");
		commit(table, [{ do: "add-mana", who: 0, colors: Array(warp ? 2 : 5).fill("U") }], "game-setup");
		const before = structuredClone(table);
		const cast = announce(table, warp ? example("Cast Quantum Riddler for warp") : printedCast(card, table.printed[card]!));
		const actual = table.things.get(cast.activation.source.id)!;
		passBoth(table); finish(table); assert.equal(actual.zone, "battlefield");
		assert.ok(characteristics(table, actual)!.words.includes("flying"));
		assert.equal(table.waiting.length, 1); assert.equal(cardsIn(table, "hand", 0).length, remaining);
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		const pending = structuredClone(table);
		if (!warp && remaining === 1) {
			const departed = structuredClone(table);
			commit(departed, [{ do: "move", what: actual.id, to: "graveyard", reason: "destroy" }], "destroy");
			const gone = structuredClone(departed); passBoth(departed); settle(departed);
			assert.equal(cardsIn(departed, "hand", 0).length, 2, "the surviving entry trigger draws without the departed replacement"); replay(departed, gone);
		}
		passBoth(table); settle(table);
		assert.equal(cardsIn(table, "hand", 0).length, remaining + (remaining <= 1 ? 2 : 1));
		replay(table, pending); replay(table, before);
		if (warp) {
			const end = reach(table, "end", 1); assert.equal(end.situation, "trigger-order");
			apply(table, end.options[0]!.id, "model", "chosen"); passBoth(table); settle(table);
			assert.equal(actual.zone, "exile"); hand(table, 0, 0);
			assert.equal(orderedDraw(tableWorld(table), { do: "draw", who: 0, count: 3 }).count, 3, "warp exile ends the standing replacement");
		}
	}
	for (const initial of [1, 2]) {
		const table = position(); main(table, 0); put(table); hand(table, 0, initial);
		const before = structuredClone(table), exile = cardsIn(table, "exile", 0).length;
		announce(table, effect([{ do: "draw", who: "you", count: 3, as: "drawn" }, { do: "move", what: "bound:drawn", to: "exile", reason: "exile" }, { do: "draw", who: "you", count: 1 }]));
		passBoth(table); step(table);
		assert.equal(cardsIn(table, "hand", 0).length, initial + (initial === 1 ? 4 : 3), "the whole draw batch is increased once");
		settle(table); assert.equal(cardsIn(table, "hand", 0).length, initial === 1 ? 6 : 3);
		assert.equal(cardsIn(table, "exile", 0).length - exile, initial === 1 ? 0 : 3, "a replaced draw supplies no cards for the linked exile"); replay(table, before);
	}
	const table = position(); main(table, 0); const sources = [put(table), put(table), put(table)]; hand(table, 0, 1);
	const before = structuredClone(table), hidden = cardsIn(table, "library", 0)[0]!;
	announce(table, effect([{ do: "draw", who: "you", count: 2 }, { do: "life", who: "you", amount: 1 }])); passBoth(table); step(table);
	assert.ok(table.drawOrder); assert.equal(cardsIn(table, "hand", 0).length, 1); assert.equal(table.seats[0]!.life, 20);
	const pending = structuredClone(table), choice = nextDecision(table)!; assert.equal(choice.options.length, 3); assert.equal(choice.seat, 0);
	assert.ok(!JSON.stringify(choice).includes(hidden.id)); assert.equal(project(table, 1).objects?.find(one => one.id === hidden.id), undefined);
	assert.deepEqual(table, pending, "discovery and projection leave the waiting batch unchanged");
	apply(table, choice.options.at(-1)!.id, "model", "chosen"); assert.equal(cardsIn(table, "hand", 0).length, 1);
	const middle = structuredClone(table); assert.equal(nextDecision(table)!.options.length, 2);
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	assert.equal(cardsIn(table, "hand", 0).length, 6, "three Riddlers add three to a two-card batch");
	assert.equal(table.seats[0]!.life, 20, "the following instruction is still pending"); settle(table); assert.equal(table.seats[0]!.life, 21);
	replay(table, before); replay(table, pending); replay(table, middle);
	for (const receipt of table.log.slice(pending.log.length)) assert.ok(!describe(table, receipt, 1).includes(hidden.card!));
	// Losing the ability, leaving the battlefield, and changing controller affect the next draw.
	const independent = position(); main(independent, 0); const riddler = put(independent); hand(independent, 0, 0); hand(independent, 1, 0);
	commit(independent, [{ do: "note", note: { kind: "label", on: ref(riddler), by: 0, until: "end-of-turn", text: "Ability loss fixture", change: { loseAbilities: true } } }], "game-setup");
	assert.equal(orderedDraw(tableWorld(independent), { do: "draw", who: 0, count: 2 }).count, 2);
	commit(independent, [{ do: "move", what: riddler.id, to: "exile", reason: "exile" }], "game-setup");
	commit(independent, [{ do: "move", what: riddler.id, to: "battlefield", reason: "game-setup", controller: 1, registers: pack(card) }], "game-setup");
	assert.equal(orderedDraw(tableWorld(independent), { do: "draw", who: 0, count: 2 }).count, 2);
	assert.equal(orderedDraw(tableWorld(independent), { do: "draw", who: 1, count: 2 }).count, 3);
	assert.equal(orderedDraw(tableWorld(independent), { do: "draw", who: 1, count: 0 }).count, 0);
	const librarySize = cardsIn(independent, "library", 1).length;
	commit(independent, [{ do: "draw", who: 1, count: 0 }], "resolve");
	assert.equal(cardsIn(independent, "library", 1).length, librarySize);
	const direct = cardsIn(independent, "library", 1)[0]!;
	commit(independent, [{ do: "move", what: direct.id, to: "hand", reason: "resolve" }], "resolve");
	assert.equal(cardsIn(independent, "hand", 1).length, 1, "putting a card into the hand is not a draw");
	const unchanged = structuredClone(independent);
	assert.throws(() => commit(independent, [{ do: "tap", what: riddler.id }, { do: "draw", who: 1, count: -1 }], "resolve"), /nonnegative/);
	assert.deepEqual(independent, unchanged);
	const mill = position(); main(mill, 0); put(mill); hand(mill, 0, 1);
	const grave = cardsIn(mill, "graveyard", 0).length;
	announce(mill, effect([{ do: "mill", who: "you", count: 2 }])); passBoth(mill); settle(mill);
	assert.equal(cardsIn(mill, "graveyard", 0).length, grave + 2); assert.equal(cardsIn(mill, "hand", 0).length, 1);
	// The mandatory turn draw does not report itself complete while choices remain.
	const turn = position(); main(turn, 0); put(turn); put(turn); reach(turn, "draw", 3); hand(turn, 0, 1);
	const turnBefore = structuredClone(turn); apply(turn, "draw", "engine", "forced");
	assert.ok(turn.drawOrder); assert.equal(turn.cursor.stepDone, false); assert.equal(project(turn, 0).drawnAt, undefined);
	const turnPending = structuredClone(turn); apply(turn, nextDecision(turn)!.options[0]!.id, "model", "chosen");
	assert.equal(turn.cursor.stepDone, true); assert.equal(cardsIn(turn, "hand", 0).length, 4);
	assert.equal(project(turn, 0).turnDraw!.length, 3); assert.equal(project(turn, 0).drawnAt, turn.cursor.clock);
	const drawnIds = new Set(project(turn, 0).turnDraw!.map(one => one.id));
	assert.ok(!project(turn, 1).turnDraw?.some(one => drawnIds.has(one.id))); assert.equal(project(turn, "spectator").turnDraw, undefined);
	advance(turn); assert.equal(nextDecision(turn)!.situation, "priority");
	replay(turn, turnBefore); replay(turn, turnPending);
	// Multiple recipients draw in active-player order; later conditions see earlier draws.
	for (const active of [0, 1]) {
		const other = 1 - active, multi = position(); main(multi, active); put(multi, active); const second = put(multi, other); hand(multi, 0, 1); hand(multi, 1, 1);
		commit(multi, [{ do: "note", note: { kind: "label", on: ref(second), by: other, until: "indefinite", text: "Cross-player hand condition fixture", change: { registers: [
			{ kind: "draw-rule", basis: "Cross-player hand condition fixture", who: "you", additional: 1, if: { amount: { count: { zones: ["hand"], controller: "opponent" } }, atLeast: 3 } },
		] } } }], "game-setup");
		const multiBefore = structuredClone(multi); announce(multi, effect([{ do: "draw", who: "each-player", count: 1 }, { do: "life", who: "you", amount: 1 }])); passBoth(multi); step(multi);
		assert.equal(nextDecision(multi)!.seat, active); apply(multi, nextDecision(multi)!.options[0]!.id, "engine", "forced");
		assert.equal(cardsIn(multi, "hand", active).length, 3); assert.equal(cardsIn(multi, "hand", other).length, 1);
		const multiMiddle = structuredClone(multi); assert.equal(nextDecision(multi)!.seat, other); assert.equal(nextDecision(multi)!.options.length, 2);
		apply(multi, nextDecision(multi)!.options[0]!.id, "model", "chosen"); settle(multi);
		assert.equal(cardsIn(multi, "hand", other).length, 4); assert.equal(multi.seats[active]!.life, 21); replay(multi, multiBefore); replay(multi, multiMiddle);
	}
	const bound = position(); main(bound, 0); put(bound); hand(bound, 0, 1); hand(bound, 1, 1);
	const boundBefore = structuredClone(bound), exiled = cardsIn(bound, "exile", 1).length;
	announce(bound, effect([{ do: "draw", who: "each-player", count: 1, as: "drawn" }, { do: "move", what: "bound:drawn", to: "exile", reason: "exile" }])); passBoth(bound); settle(bound);
	assert.equal(cardsIn(bound, "hand", 0).length, 3); assert.equal(cardsIn(bound, "hand", 1).length, 1);
	assert.equal(cardsIn(bound, "exile", 1).length, exiled + 1, "only the unreplaced recipient's drawn card survives the combined binding"); replay(bound, boundBefore);
	// Empty libraries still attempt the increased draw; the state check waits until resolution finishes.
	const empty = position(); main(empty, 0); put(empty); hand(empty, 0, 0);
	commit(empty, cardsIn(empty, "library", 0).map(one => ({ do: "move", what: one.id, to: "exile", reason: "game-setup" })), "game-setup");
	const emptyBefore = structuredClone(empty); announce(empty, effect([{ do: "draw", who: "you", count: 1 }, { do: "life", who: "you", amount: 1 }])); passBoth(empty); step(empty);
	assert.equal(empty.seats[0]!.marks["drew-from-empty"], 1); assert.equal(empty.outcome, null); step(empty);
	assert.equal(empty.seats[0]!.life, 21); while (empty.resolution) step(empty);
	assert.equal(nextDecision(empty)!.situation, "state-based"); apply(empty, nextDecision(empty)!.options[0]!.id, "engine", "forced");
	assert.ok(empty.outcome); replay(empty, emptyBefore);
	// A direct unordered group refuses before an earlier physical change can occur.
	hand(table, 0, 1); const atomic = structuredClone(table);
	assert.throws(() => commit(table, [{ do: "tap", what: sources[0]!.id }, { do: "draw", who: 0, count: 1 }], "resolve"), /replacement-order/);
	assert.deepEqual(table, atomic);
	commit(table, beforeDraw(table, [{ do: "draw", who: 0, count: 1 }], "resolve"), "resolve"); assert.ok(table.drawOrder);
});
