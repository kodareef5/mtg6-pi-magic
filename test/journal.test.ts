/**
 * A game on disk, and the two places worth copying it from.
 *
 * Version zero is a table that has been dealt nothing and whose seats already
 * hold what a model prepared for them. Forking there reuses the pregame and
 * plays a new game, which is what testing the game rather than the pregame
 * needs. Any later version is a position, and forking there plays on from it.
 */

import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { commit, start } from "../src/core/commit.ts";
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
import { cardsIn } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";

const where = () => mkdtempSync(join(tmpdir(), "magic-journal-"));

const header = (id: string, seed: string): Header => ({
	id,
	format: standard.name,
	seed,
	seats: [
		{ id: 0, name: "A", deck: deck("Green Stompy") },
		{ id: 1, name: "B", deck: deck("Dimir Control") },
	],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" },
	rules: { path: "rules/cr.tsv", effective: "September 25, 2026" },
	created: "2026-10-03T00:00:00.000Z",
});

const dealt = (from: Header) =>
	start(standard, from.seats.map((at) => ({ name: at.name, deck: at.deck })), from.seed);

const seat = (name: string, shown?: (frame: Frame) => void): Player => ({
	name,
	async answer(frame: Frame) {
		shown?.(structuredClone(frame));
		const options = frame.decision!.options;
		const land = options.find((option) => option.id.startsWith("land:"));
		return { kind: "pick", option: (land ?? options[0]!).id, actionId: `${name}` };
	},
	observe() {},
	close() {},
});

/** One finished game, written to a journal with a brief kept at version zero. */
async function recorded(dir: string, id = "one", seed = "journal", shown?: (frame: Frame, at: number) => void) {
	const made = header(id, seed);
	const table = dealt(made);
	const journal = open(join(dir, `${id}.jsonl`), made);
	for (const at of table.seats) {
		keep(journal, at.id, {
			seat: at.id, version: 1, deck: `${at.deck.name}.`, combos: "None.",
			opening: "Keep any seven.", against: {}, phases: {}, cards: {}, gaps: [],
		});
	}
	const capture = (frame: Frame) => shown?.(frame, table.ledger.length);
	const outcome = await play(table, { 0: seat("A", capture), 1: seat("B", capture) }, {});
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
	const parent = new Map<number, Frame>();
	const { table, journal } = await recorded(dir, "parent", "journal", (frame, at) => parent.set(at, frame));

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

	// A clone is the same game continued, so the briefs come across as they are
	// and there is nothing to match them against.
	assert.deepEqual(preparedIn(zero.lines).map((made) => made.seat), [0, 1]);
	assert.match(JSON.stringify(preparedIn(zero.lines)[0]!.made), /Green Stompy\./);

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
	const frames = new Map<number, Frame>();
	const capture = (frame: Frame) => frames.set(onward.ledger.length, frame);
	assert.ok(await play(onward, { 0: seat("A", capture), 1: seat("B", capture) }, {}));
	assert.ok(frames.size > 1);
	for (const [version, frame] of frames) assert.deepEqual(frame, parent.get(version), `resumed decision ${version} preserves the parent's whole frame, including receipts`);
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

test("a game reconstructed from its header deals the cards the original dealt", async () => {
	// Naming the seats and shuffling the libraries are different sources of
	// randomness. They shared a counter, so a game rebuilt from a header, which
	// supplies the names it recorded, never made those draws and every shuffle
	// after them moved. That path is every replay.
	const generated = start(standard, [{ deck: deck("Green Stompy") }, { deck: deck("Dimir Control") }], "streams");
	const rebuilt = start(
		standard,
		generated.seats.map((at) => ({ name: at.name, deck: at.deck })),
		"streams",
	);

	assert.deepEqual(rebuilt.seats.map((at) => at.name), generated.seats.map((at) => at.name));
	assert.ok(generated.rng.calls.names! > 0, "generating names drew from its own stream");
	assert.equal(rebuilt.rng.calls.names, undefined, "supplied names drew nothing");
	assert.equal(rebuilt.rng.calls.play, generated.rng.calls.play, "the shuffle drew the same either way");

	const order = (table: ReturnType<typeof start>, seat: number) =>
		cardsIn(table, "library", seat).map((card) => card.id).join(" ");
	assert.equal(order(rebuilt, 0), order(generated, 0));
	assert.equal(order(rebuilt, 1), order(generated, 1));

	// And so a whole game replays from the header, which is what this is for.
	const dir = where();
	const made = header("streamed", "streams");
	const table = dealt(made);
	const journal = open(join(dir, "streamed.jsonl"), made);
	await play(table, { 0: seat("A"), 1: seat("B") }, {});
	for (const line of linesOf(table)) append(journal, line);
	assert.deepEqual(replay(journal.path, dealt).table.log, table.log);
});

test("the stack is one order for the table, not one per seat", () => {
	// A library and a graveyard are each a seat's own, so two seats can both
	// hold a top card. The stack has a single top, and what is on it resolves in
	// one sequence whoever cast it.
	const table = start(standard, [{ name: "A", deck: deck("Green Stompy") }, { name: "B", deck: deck("Dimir Control") }], "stack");

	const cast = ["0-0", "1-0", "0-1", "1-1"];
	for (const what of cast) commit(table, [{ do: "move", what, to: "stack", reason: "cast" }], "cast");

	const on = cardsIn(table, "stack");
	assert.equal(on.length, 4);
	assert.deepEqual(on.map((item) => item.position), [0, 1, 2, 3], "one position each");
	// Top first, so the last cast resolves first.
	assert.deepEqual(on.map((item) => item.id), [...cast].reverse());

	// Resolving the top renumbers the whole zone, not one seat's part of it.
	commit(table, [{ do: "move", what: "1-1", to: "graveyard", reason: "resolve" }], "resolve");
	const after = cardsIn(table, "stack");
	assert.deepEqual(after.map((item) => item.id), ["0-1", "1-0", "0-0"]);
	assert.deepEqual(after.map((item) => item.position), [0, 1, 2]);

	// A seat can still ask for its own, and the global order is preserved.
	assert.deepEqual(cardsIn(table, "stack", 0).map((item) => item.id), ["0-1", "0-0"]);

	// Each seat's own library stays its own order, both starting at the top.
	assert.equal(cardsIn(table, "library", 0)[0]!.position, 0);
	assert.equal(cardsIn(table, "library", 1)[0]!.position, 0);
});
