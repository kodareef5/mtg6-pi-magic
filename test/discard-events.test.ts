/** A discard retains its actor and group through costs, resolution, cleanup and replacements. */
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
import { project } from "../src/core/view.ts";
import type { Registration } from "../src/core/language.ts";
import type { Change } from "../src/core/syntax.ts";
import { announce, example, finish, main, pack, passBoth, quiet, step } from "./play.ts";

const card = "Marauding Mako", cycle = example("Cycle Marauding Mako");
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const build = () => start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: alpha(deck("Mardu Discard")) }], "discards", undefined, { discardsFrom: 0 });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function hand(table: Table, name: string, owner = 0) {
	const one = cardsIn(table, "library", owner).find(one => one.card === name) ?? cardsIn(table, "hand", owner).find(one => one.card === name)!; assert.ok(one, name);
	if (one.zone !== "hand") commit(table, [{ do: "move", what: one.id, to: "hand", reason: "game-setup" }], "game-setup"); return one;
}
function settle(table: Table) {
	for (let guard = 0; guard < 200; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
}
const discard = (one: Thing): Change => ({ do: "move", what: one.id, to: "graveyard", reason: "discard" });

test("discard watches count simultaneous cards after the event, preserve privacy, and resolve above cycling", () => {
	const table = build(); main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, assessed: true, registers: pack(card), procedures: [cycle], deferred: [] } }], "mako");
	const mako = hand(table, card); commit(table, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
	const cast = printedCast(card, table.printed[card]!); cast.source.refs = [ref(mako)];
	const startCast = structuredClone(table); announce(table, cast); settle(table); replay(table, startCast);
	const cycled = hand(table, card); commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C"] }], "game-setup");
	const startCycle = structuredClone(table), held = cardsIn(table, "hand", 0).length;
	announce(table, { ...cycle, source: { ...cycle.source, refs: [ref(cycled)] } });
	assert.equal(cycled.zone, "graveyard"); assert.equal(table.waiting.length, 1); assert.deepEqual(table.waiting[0]!.event, { object: ref(cycled), objects: [ref(cycled)], player: 0, amount: 1 });
	const trigger = nextDecision(table)!; assert.equal(trigger.situation, "trigger-order"); apply(table, trigger.options[0]!.id, "model", "chosen");
	const pending = structuredClone(table); passBoth(table); step(table); finish(table);
	assert.equal(mako.counters["+1/+1"], 1); assert.equal(cardsIn(table, "hand", 0).length, held - 1, "the draw is still below Mako's trigger");
	settle(table); assert.equal(cardsIn(table, "hand", 0).length, held); replay(table, pending); replay(table, startCycle);
	for (const mode of ["group", "separate", "opponent", "exile", "hidden", "ordinary", "mill", "leaving", "entering", "lost"] as const) {
		const game = build(); main(game, 0); const source = hand(game, card), a = hand(game, "Bloodghast", mode === "opponent" ? 1 : 0), b = hand(game, "Iron-Shield Elf", mode === "opponent" ? 1 : 0);
		const registers = pack(card), original = registers[0]!;
		assert.equal(original.kind, "watch"); if (original.kind !== "watch") throw new Error("Mako watch missing");
		const perCard: Registration = { ...original, basis: "Per-card discard fixture", event: { on: "discarded", by: "you" } };
		const typed: Registration = { ...original, basis: "Creature discard fixture", event: { on: "discarded", by: "you", of: { zones: ["graveyard", "exile"], types: ["creature"] }, batch: true } };
		if (mode !== "entering") commit(game, [{ do: "move", what: source.id, to: "battlefield", reason: "game-setup", registers: [...registers, perCard, typed] }], "game-setup");
		if (mode === "mill") commit(game, [a, b].map(one => ({ do: "move", what: one.id, to: "library", reason: "game-setup" })), "game-setup");
		const moves: Change[] = [a, b].map(one => ({ do: "move", what: one.id, to: mode === "exile" || mode === "hidden" ? "exile" : "graveyard", reason: mode === "ordinary" || mode === "mill" ? "resolve" : "discard", ...(mode === "hidden" ? { faceDown: true } : {}) }));
		if (mode === "leaving") moves.push({ do: "move", what: source.id, to: "graveyard", reason: "destroy" });
		if (mode === "entering") moves.push({ do: "move", what: source.id, to: "battlefield", reason: "resolve", registers: [...registers, perCard, typed] });
		if (mode === "lost") moves.push({ do: "note", note: { kind: "label", on: ref(source), by: 0, until: "end-of-turn", text: "Ability loss fixture", change: { loseAbilities: true } } });
		if (mode === "separate") for (const move of moves) commit(game, [move], "resolve"); else commit(game, moves, "resolve");
		const expected = ["opponent", "ordinary", "mill", "leaving", "lost"].includes(mode) ? 0 : mode === "separate" ? 6 : mode === "hidden" ? 3 : 4;
		assert.equal(game.waiting.length, expected, mode);
		const batched = game.waiting.filter(one => one.basis === original.basis);
		assert.deepEqual(batched.map(one => one.event.amount), !expected ? [] : mode === "separate" ? [1, 1] : [2]);
		for (const trigger of game.waiting) { assert.equal(trigger.event.player, 0); if (mode === "hidden") { assert.equal(trigger.event.object, undefined); assert.equal(trigger.event.objects, undefined); } }
		const before = structuredClone(game); nextDecision(game);
		for (const viewer of [0, 1, "spectator"] as const) {
			const projected = project(game, viewer);
			if (mode === "hidden") for (const hidden of [a, b]) assert.equal(projected.objects?.find(one => one.id === hidden.id)?.card, undefined);
		} assert.deepEqual(game, before); settle(game); replay(game, before);
	}
	// A delayed discard trigger belongs to the table after its source leaves.
	const delayed = build(); main(delayed, 0); const source = hand(delayed, card), victim = hand(delayed, "Bloodghast");
	commit(delayed, [{ do: "note", note: { kind: "delay", by: 0, until: "end-of-turn", once: true, event: { on: "discarded", by: "you" },
		effect: { instructions: [{ do: "life", who: "event:player", amount: { event: "amount" } }] }, fixed: { source: ref(source), targets: [], bound: {} } } }], "game-setup");
	commit(delayed, [discard(source), discard(victim)], "resolve"); assert.equal(delayed.waiting.length, 1);
	const delayedStart = structuredClone(delayed); settle(delayed); assert.equal(delayed.seats[0]!.life, 21); replay(delayed, delayedStart);
});
