/**
 * Hosted. The host is never a seat. Nothing is dealt until every seat agrees,
 * a paused game asks nobody and then plays on exactly as it would have, and the
 * host's rollback and end are journal lines that replay honors: a clone before
 * either is the game without it.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { start } from "../src/core/commit.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { endByHost, rollbackByHost } from "../src/core/host.ts";
import { fork, open, replay, save, type Header, type Journal } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { TableHalted, type Player } from "../src/core/player.ts";
import type { Table } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";
import { project } from "../src/core/view.ts";
import { hold, type Hold } from "../src/seating/hold.ts";
import { agree, lobby, seatOrder } from "../src/seating/lobby.ts";
import { setupWork } from "../src/context/sit.ts";

const made: Header = {
	id: "hosted", format: standard.name, seed: "hosted",
	seats: [{ id: 0, name: "A", deck: deck("Green Stompy") }, { id: 1, name: "B", deck: deck("Dimir Control") }],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" }, rules: { path: "rules/cr.tsv", effective: "September 25, 2026" }, created: "2026-10-12T00:00:00.000Z",
};
const dealt = () => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });
const physical = (table: Table) => JSON.stringify({ ledger: table.ledger, log: table.log, things: [...table.things], cursor: table.cursor, rulings: table.rulings, outcome: table.outcome });
const settle = () => new Promise((go) => setTimeout(go, 30));
const stop = new Error("stop");

/** What a hosted run does: play, and between loops apply the host's direction. Stops once `turn` has passed. */
async function hosted(table: Table, holding: Hold, turn: number, journal?: Journal) {
	const players = { 0: holding.seat(steady("A"), 0), 1: holding.seat(steady("B"), 1) };
	for (;;) {
		try { await play(table, players, {}, { checkpoint: holding.checkpoint, watch: () => { if (table.cursor.turn > turn) throw stop; } }); break; }
		catch (error) {
			if (error === stop) break;
			if (!(error instanceof TableHalted)) throw error;
			if (journal) save(journal, table);
			if (!holding.halted(table)) break;
		}
	}
	while (!table.outcome && !nextDecision(table)) advance(table);
	if (journal) save(journal, table);
}

test("a seat agrees or is named, and the coin flip seats whoever plays first first", async () => {
	const setup = lobby(["Green Stompy", "Dimir Control"]);
	assert.deepEqual(await agree(setup, "prepare", async (seat) => seat === 0), [1], "the seat that declined is named");
	assert.deepEqual(setup.agreed.prepare, [0]);
	assert.deepEqual(await agree(setup, "prepare", async () => true), [], "asking again asks everyone again");
	assert.deepEqual(seatOrder(setup, () => 0.7), { order: [1, 0], first: 1, by: "coin" });
	setup.first = 0;
	assert.deepEqual(seatOrder(setup, () => 0.7), { order: [0, 1], first: 0, by: "host" });
	assert.throws(() => lobby(["Green Stompy"]), /seats 2 players/);
});

test("a paused game asks nobody, and played on it is the game it would have been", async () => {
	const unpaused = dealt();
	await hosted(unpaused, hold(dealt), 3);

	const table = dealt(), holding = hold(dealt);
	holding.pause();
	const running = hosted(table, holding, 3);
	await settle();
	const held = table.ledger.length;
	assert.ok(table.ledger.every((row) => row.why !== "chosen"), "no seat answered while paused");
	await settle();
	assert.equal(table.ledger.length, held, "and nothing moved");
	holding.resume();
	await running;
	assert.equal(physical(table), physical(unpaused));
});

test("the host's rollback is a journal line: seats are told, play goes on, and replay rebuilds the same game", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-hosted-"));
	const table = dealt(), holding = hold(dealt), journal = open(join(dir, "hosted.jsonl"), made);
	await hosted(table, holding, 3, journal);
	const to = Math.floor(table.ledger.length / 2);
	holding.pause();
	const running = hosted(table, holding, 4, journal);
	await settle();
	holding.direct({ do: "rollback", to, note: "A misclick." });
	await settle();
	assert.equal(table.ledger.length, to, "the table went back in place");
	assert.ok(holding.paused(), "a paused game stays paused after a rollback");
	assert.ok(project(table, 0).table.some((line) => line.startsWith(`The host rolled the game back to action ${to}: A misclick.`)), "every seat is told");
	holding.resume();
	await running;
	assert.ok(table.cursor.turn > 3, "play went on");
	assert.equal(physical(replay(journal.path, dealt).table), physical(table));
});

test("a direction the table refuses changes nothing, and play goes on", async () => {
	const refused: string[] = [];
	const table = dealt(), holding = hold(dealt, (_direction, _table, why) => { if (why) refused.push(why); });
	holding.pause();
	const running = hosted(table, holding, 3);
	await settle();
	const before = physical(table);
	holding.direct({ do: "rollback", to: 999, note: "Too far." });
	await settle();
	assert.match(refused.join(" "), /Roll back to a version/);
	assert.equal(physical(table), before, "the table is as it was");
	holding.resume();
	await running;
	assert.ok(table.cursor.turn > 3, "and the game played on");
});

test("the host's end gives no winner, replay honors it, and a clone before it or a rollback past it plays on", () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-ended-"));
	const table = dealt(), journal = open(join(dir, "hosted.jsonl"), made);
	return hosted(table, hold(dealt), 2, journal).then(() => {
		const at = table.ledger.length;
		endByHost(table, "Time.");
		save(journal, table);
		assert.deepEqual(table.outcome?.results, { 0: "draw", 1: "draw" });
		assert.ok(project(table, 1).table.some((line) => line.startsWith(`The host ended the game at action ${at} with no winner: Time.`)));
		const back = replay(journal.path, dealt).table;
		assert.equal(physical(back), physical(table), "replay ends the game where the host ended it");

		fork(journal.path, at - 1, "before", join(dir, "before.jsonl"));
		assert.equal(replay(join(dir, "before.jsonl"), dealt).table.outcome, null, "a clone before the end is unfinished");

		rollbackByHost(table, at - 1, "Play on.", dealt);
		save(journal, table);
		assert.equal(table.outcome, null);
		assert.equal(replay(journal.path, dealt).table.outcome, null, "a rollback past the end undoes it on replay");
		assert.throws(() => rollbackByHost(table, table.ledger.length + 1, "Too far.", dealt), /Roll back to a version/);
	});
});

test("a seat on the clock that does not answer concedes as a timeout, paused time does not count, and replay reaches the same end", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-clock-"));
	const table = dealt(), holding = hold(dealt), journal = open(join(dir, "clock.jsonl"), made);
	const gone: Player = { name: "B", observe() {}, close() {}, answer: () => new Promise(() => {}) };
	const players = { 0: holding.seat(steady("A"), 0), 1: holding.seat(gone, 1, 0.3) };
	const running = (async () => {
		for (;;) {
			try { await play(table, players, {}, { checkpoint: holding.checkpoint }); break; }
			catch (error) { if (!(error instanceof TableHalted)) throw error; if (!holding.halted(table)) break; }
		}
		save(journal, table);
	})();
	for (const begun = Date.now(); holding.asking()?.seat !== 1; await new Promise((go) => setTimeout(go, 5)))
		if (Date.now() - begun > 5_000) throw new Error("seat 1 was never asked");
	holding.pause();
	await new Promise((go) => setTimeout(go, 600));
	const outcome = () => table.outcome;
	assert.equal(outcome(), null, "a paused clock does not run out");
	holding.resume();
	await running;
	assert.deepEqual(outcome()?.results, { 0: "win", 1: "lose" });
	const last = table.ledger.at(-1)!;
	assert.deepEqual([last.seat, last.picked, last.why, last.by], [1, "concede", "timeout", "engine"]);
	assert.equal(physical(replay(journal.path, dealt).table), physical(table), "replay concedes where the clock did");
});

test("a seat that concedes when asked loses, and the row says it chose to", async () => {
	const table = dealt();
	const quitter: Player = { name: "B", observe() {}, close() {}, async answer() { return { kind: "concede" }; } };
	await play(table, { 0: steady("A"), 1: quitter }, {});
	assert.deepEqual(table.outcome?.results, { 0: "win", 1: "lose" });
	assert.deepEqual([table.ledger.at(-1)!.picked, table.ledger.at(-1)!.why], ["concede", "chosen"]);
});

test("a seat's setup edits keep the actionIds older journals carry", () => {
	assert.deepEqual(setupWork(undefined, 0, 1), [{ actionId: "planning-1", tools: [{ do: "plan.each-turn" }] }]);
	const older = { revision: 2, request: "Plan the opening: your first turn and the opponent's first turn." } as never;
	assert.deepEqual(setupWork(older, 0, 0).map((one) => one.actionId), ["planning-0", "opening-covered-0"]);
});
