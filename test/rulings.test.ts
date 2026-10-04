/**
 * Ruled. A seat objects to another seat's recorded action and the judge
 * decides: an illegal action is rolled back to just before it, with no seat
 * asked to agree, and a ruling that lets it stand is recorded. A rollback is a
 * journal line of its own; the lines it rolled past stay in the file, replay
 * skips them, and every seat is told it happened.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { open, reopen, replay, save, type Header } from "../src/core/journal.ts";
import { play, type Judge } from "../src/core/loop.ts";
import type { Ruling } from "../src/core/judge.ts";
import type { Answer, Player } from "../src/core/player.ts";
import type { Table } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";
import { project } from "../src/core/view.ts";

const made: Header = {
	id: "ruled", format: standard.name, seed: "ruled",
	seats: [{ id: 0, name: "A", deck: deck("Green Stompy") }, { id: 1, name: "B", deck: deck("Dimir Control") }],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" }, rules: { path: "rules/cr.tsv", effective: "September 25, 2026" }, created: "2026-10-04T00:00:00.000Z",
};
const dealt = () => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });
/** B objects once, on turn 3, to A's latest land play. */
function objector(table: Table, contested: { row?: number }): Player {
	return { name: "B", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const land = [...table.ledger].reverse().find((row) => row.seat === 0 && row.picked.startsWith("land:"));
		if (contested.row === undefined && table.cursor.turn >= 3 && land) {
			contested.row = land.seq;
			return { kind: "object", row: land.seq, claim: "That land says it enters tapped, and it entered untapped.", rule: "614.1c" };
		}
		return { kind: "pick", option: landsFirst(frame), actionId: `B-${frame.version}` };
	} };
}
const stop = new Error("stop");
async function playThrough(table: Table, players: Record<number, Player>, judge: Judge | undefined, turn: number) {
	try { await play(table, players, {}, undefined, () => { if (table.cursor.turn > turn) throw stop; }, 32, judge); } catch (error) { if (error !== stop) throw error; }
}
const physical = (table: Table) => JSON.stringify({ ledger: table.ledger, log: table.log, things: [...table.things], cursor: table.cursor, rulings: table.rulings });

test("an upheld objection takes the game back to just before the action, and the journal keeps what it rolled past", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-rulings-"));
	const table = dealt();
	const journal = open(join(dir, "ruled.jsonl"), made);
	const contested: { row?: number } = {};
	const ruling: Ruling = { legal: false, rule: "614.1c", remedy: "rollback", because: "It enters tapped." };
	let rebuiltAt = -1;
	const judge: Judge = { async rule(_table, open) { assert.equal(open.raisedBy, 1); return ruling; }, restart: dealt,
		flush() { save(journal, table); rebuiltAt = table.ledger.length; } };
	await playThrough(table, { 0: steady("A"), 1: objector(table, contested) }, judge, 4);
	save(journal, table);

	assert.ok(contested.row !== undefined && rebuiltAt > contested.row, "B objected to a land A had already played");
	assert.deepEqual(table.rulings.map((one) => [one.case.row, one.at, one.kept !== undefined]), [[contested.row, contested.row, true]], "the ruling is kept, at the version the game went back to");
	assert.ok(project(table, 0).table.some((line) => line.startsWith("The judge upheld B's objection")), "and every seat is told");

	const file = readFileSync(journal.path, "utf8").trim().split("\n").slice(1).map((line) => JSON.parse(line) as { row?: { seq: number }; ruling?: unknown });
	const contestedRows = file.filter((line) => line.row?.seq === contested.row);
	assert.equal(contestedRows.length, 2, "the rolled-past action stays in the file, behind the ruling, beside the one played after it");
	assert.equal(physical(replay(journal.path, dealt).table), physical(table), "and replay reads the game that was played on");

	// Resuming the journal holds the same game and owes it nothing.
	const back = replay(journal.path, dealt).table;
	const resumed = reopen(journal.path, made, back);
	assert.equal(save(resumed, back), 0);
	assert.equal(physical(replay(journal.path, dealt).table), physical(table));
});

test("a ruling that lets the action stand is recorded and play goes on; without a judge the objection is a gap", async () => {
	const stands: Judge = { async rule() { return { legal: true, rule: "305.1", remedy: "stand", because: "A land play." }; }, restart: dealt };
	const table = dealt(), contested: { row?: number } = {};
	await playThrough(table, { 0: steady("A"), 1: objector(table, contested) }, stands, 4);
	assert.deepEqual(table.rulings.map((one) => [one.case.row, one.kept]), [[contested.row, undefined]]);
	assert.ok(table.ledger.length > contested.row! + 1, "play went on from where it was");

	const alone = dealt(), asked: { row?: number } = {};
	await playThrough(alone, { 0: steady("A"), 1: objector(alone, asked) }, undefined, 4);
	assert.deepEqual(alone.rulings, []);
	assert.ok(alone.gaps.some((gap) => gap.includes("this game has no judge")));
});
