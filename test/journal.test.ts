/**
 * A game on disk, and the two places worth copying it from.
 *
 * Version zero is a table that has been dealt nothing and whose seats already
 * hold what a model prepared for them. Forking there reuses the pregame and
 * plays a new game, which is what testing the game rather than the pregame
 * needs. Any later version is a position, and forking there plays on from it.
 */

import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import {
	append,
	exportGame,
	fork,
	keep,
	linesOf,
	open,
	preparedIn,
	read,
	relive,
	replay,
	rowsOf,
	type Header,
} from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import type { Frame } from "../src/core/types.ts";

const where = () => mkdtempSync(join(tmpdir(), "magic-journal-"));
const deck = (card: string) => Array.from({ length: 60 }, () => card);

const header = (id: string, seed: string): Header => ({
	id,
	format: standard.name,
	seed,
	seats: [
		{ id: 0, name: "A", deck: deck("Forest") },
		{ id: 1, name: "B", deck: deck("Swamp") },
	],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" },
	rules: { path: "rules/cr.tsv", effective: "September 25, 2026" },
	created: "2026-10-03T00:00:00.000Z",
});

const dealt = (from: Header) =>
	start(standard, from.seats.map((at) => ({ name: at.name, deck: at.deck })), from.seed);

const seat = (name: string): Player => ({
	name,
	async answer(frame: Frame) {
		const options = frame.decision!.options;
		const land = options.find((option) => option.id.startsWith("land:"));
		return { kind: "pick", option: (land ?? options[0]!).id, actionId: `${name}` };
	},
	observe() {},
	close() {},
});

/** One finished game, written to a journal with a brief kept at version zero. */
async function recorded(dir: string, id = "one", seed = "journal") {
	const made = header(id, seed);
	const table = dealt(made);
	const journal = open(join(dir, `${id}.jsonl`), made);
	for (const at of table.seats) {
		keep(journal, at.id, `${standard.name}/gpt-6.1-sol:low/${[...at.deck].sort().join(",")}`, {
			seat: at.id, version: 1, deck: `Sixty ${at.deck[0]}s.`, combos: "None.",
			opening: "Keep any seven.", against: {}, phases: {}, cards: {}, gaps: [],
		});
	}
	const outcome = await play(table, { 0: seat("A"), 1: seat("B") }, {});
	for (const line of linesOf(table)) append(journal, line);
	return { made, table, journal, outcome };
}

test("a journal is a header and lines, and refuses a second header", async () => {
	const dir = where();
	const { made, table, journal } = await recorded(dir);

	const back = read(journal.path);
	assert.deepEqual(back.header, made);
	assert.equal(back.truncated, undefined);
	assert.equal(rowsOf(back.lines).length, table.ledger.length);
	assert.equal(back.lines.filter((line) => "receipt" in line).length, table.log.length);
	assert.equal(preparedIn(back.lines).length, 2, "a brief per seat, kept at version zero");
	for (const line of back.lines.filter((l) => "prepared" in l)) assert.equal(line.v, 0);

	assert.throws(() => open(journal.path, made), /already holds a game/);
	assert.throws(() => read(join(dir, "nothing.jsonl")));

	// A crash costs the last line and says so. A break anywhere else is refused,
	// because the lines after it are not the game that was played.
	const cut = join(dir, "cut.jsonl");
	writeFileSync(cut, readFileSync(journal.path, "utf8").slice(0, -40));
	assert.match(read(cut).truncated!, /ends mid line/);
	const broken = join(dir, "broken.jsonl");
	const rows = readFileSync(journal.path, "utf8").split("\n");
	rows[3] = "{not json";
	writeFileSync(broken, rows.join("\n"));
	assert.throws(() => read(broken), /line 4 is not a line/);
});

test("replay rebuilds the game and refuses data it was not played against", async () => {
	const dir = where();
	const { made, table, journal } = await recorded(dir);

	const again = replay(journal.path, dealt);
	assert.deepEqual(again.table.log, table.log);
	assert.deepEqual(again.table.ledger, table.ledger);
	assert.deepEqual(again.table.outcome, table.outcome);
	assert.equal(again.prepared.length, 2, "a replay carries what was prepared");

	// Stopping short is a position, not a different game.
	const half = Math.floor(table.ledger.length / 2);
	const partway = replay(journal.path, dealt, half);
	assert.equal(partway.table.ledger.length, half);
	assert.equal(partway.table.outcome, null);
	assert.ok(partway.table.cursor.turn < table.cursor.turn);

	// A set release changes oracle text, so a replay against later cards is a
	// different game and is reported rather than quietly run.
	assert.throws(
		() => replay(journal.path, dealt, undefined, {
			cards: { generated: "2026-12-01" },
			rules: { effective: made.rules.effective },
		}),
		/cards are 2026-12-01, the game used 2026-10-03/,
	);
	assert.doesNotThrow(() =>
		replay(journal.path, dealt, undefined, { cards: made.cards, rules: made.rules }));
});

test("forking at version zero reuses the pregame, and later forks carry the position", async () => {
	const dir = where();
	const { table, journal } = await recorded(dir, "parent");

	// Version zero: the briefs and nothing else. This is the one to fork when
	// the thing being tested is the game and not the pregame.
	const fresh = fork(journal.path, 0, "fresh", join(dir, "fresh.jsonl"));
	assert.deepEqual(fresh.forkedFrom, { game: "parent", version: 0 });
	assert.deepEqual(fresh.seats, table.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck })));
	const zero = read(join(dir, "fresh.jsonl"));
	assert.equal(preparedIn(zero.lines).length, 2, "the briefs came with it");
	assert.equal(rowsOf(zero.lines).length, 0, "and no decisions did");
	// The setup shuffle is at version zero too, so the fork is a dealt table.
	assert.equal(relive(dealt(fresh), rowsOf(zero.lines)).ledger.length, 0);

	// The brief is reusable only where it belongs: it names the deck, the format
	// and the model it was written for.
	const of = preparedIn(zero.lines)[0]!.of;
	assert.match(of, /^standard\/gpt-6\.1-sol:low\/Forest,/);

	// A later version is a position. Replaying the prefix puts the cards back
	// where they were and leaves the game unfinished.
	const at = 40;
	const mid = fork(journal.path, at, "mid", join(dir, "mid.jsonl"));
	assert.deepEqual(mid.forkedFrom, { game: "parent", version: at });
	const position = replay(join(dir, "mid.jsonl"), dealt);
	assert.equal(position.table.outcome, null);
	assert.ok(position.table.ledger.length > 0);
	assert.deepEqual(position.table.ledger, table.ledger.slice(0, position.table.ledger.length));
	assert.equal(position.prepared.length, 2);

	// Playing on from the position finishes a game, and the prefix it shares
	// with its parent is identical.
	const onward = position.table;
	assert.ok(await play(onward, { 0: seat("A"), 1: seat("B") }, {}));
	assert.deepEqual(
		onward.ledger.slice(0, position.table.ledger.length).map((row) => row.picked),
		table.ledger.slice(0, position.table.ledger.length).map((row) => row.picked),
	);
});

test("an export names its version, and only full holds a hand", async () => {
	const dir = where();
	const { journal } = await recorded(dir);

	const shown = exportGame(journal.path, { mode: "public" }, dealt);
	assert.match(shown, /^one at version \d+/);
	assert.equal(shown.includes("Your hand"), false, "a spectator has no hand");

	const mine = exportGame(journal.path, { mode: "seat", seat: 0 }, dealt, 40);
	assert.match(mine, /^one at version 40/);
	assert.match(mine, /Your hand|Your hand is empty/);
	// Seat 0 plays Forests, so a Swamp in its private lines would be a leak.
	const privately = mine.split("\n").filter((line) => line.startsWith("Your"));
	assert.equal(privately.join(" ").includes("Swamp"), false);

	// full is the file, which holds every hand, which is why it stays on disk.
	const everything = exportGame(journal.path, { mode: "full" }, dealt);
	assert.match(everything, /^\{"header"/);
	assert.ok(everything.includes('"prepared"'));
});
