/**
 * A game as pictures. Replaying a journal yields a moment each time something
 * visible happened, with the lines that say what; a moment that leaves the
 * board as it was joins the one before; a seat's series shows its own hand and
 * the spectator's shows none; and the series is drawn as numbered pictures
 * with an index.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { open, replay, save, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import type { Frame, Viewer } from "../src/core/types.ts";
import { drawSeries, playByPlay } from "../src/board/series.ts";
import { gameStats, viewerHtml } from "../src/board/viewer.ts";

const made: Header = {
	id: "pictured", format: standard.name, seed: "pictured",
	seats: [{ id: 0, name: "A", deck: deck("Green Stompy") }, { id: 1, name: "B", deck: deck("Dimir Control") }],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" }, rules: { path: "rules/cr.tsv", effective: "September 25, 2026" }, created: "2026-10-13T00:00:00.000Z",
};
const dealt = () => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });

async function savedGame(): Promise<string> {
	const table = dealt(), journal = open(join(mkdtempSync(join(tmpdir(), "series-")), "pictured.jsonl"), made), stop = new Error("stop");
	try { await play(table, { 0: steady("A"), 1: steady("B") }, {}, { watch: () => { if (table.cursor.turn > 3) throw stop; } }); }
	catch (error) { if (error !== stop) throw error; }
	save(journal, table);
	return journal.path;
}
function series(path: string, viewer: Viewer) {
	const seen = playByPlay(viewer, made.seats.map((one) => ({ id: one.id, name: one.name })));
	const back = replay(path, dealt, undefined, undefined, { observe: (table) => seen.take(table) });
	seen.take(back.table);
	return Object.assign(seen.moments, { table: back.table });
}

test("a replayed game is a moment each time something visible happened, as one viewer saw it", async () => {
	const path = await savedGame(), watched = series(path, "spectator"), mine = series(path, 1);
	assert.ok(watched.length >= 6, `a moment for the deal, the keeps and each land: ${watched.length}`);
	assert.ok(watched.every((one) => one.lines.length), "every moment says what happened");
	assert.ok(watched.some((one) => one.lines.some((line) => /into battlefield \(play-land\)/.test(line))));
	const board = (one: (typeof watched)[number]) => JSON.stringify({ ...one.snapshot, step: undefined });
	assert.ok(watched.every((one, at) => at === 0 || board(one) !== board(watched[at - 1]!)), "a moment that leaves the board as it was joins the one before");
	assert.ok(watched.every((one) => one.snapshot.seats.every((seat) => !seat.handCards)), "the spectator sees no hand");
	assert.ok(mine.some((one) => one.snapshot.seats[1]!.handCards?.length) && mine.every((one) => !one.snapshot.seats[0]!.handCards), "a seat sees its own hand and no other");
});

test("a series is drawn as numbered pictures named by turn, with an index of what happened", async () => {
	const moments = series(await savedGame(), "spectator"), dir = mkdtempSync(join(tmpdir(), "series-drawn-")), heard: number[] = [];
	const plain = { name: "plain", svg: async () => '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/></svg>' };
	const { files, failed } = await drawSeries(moments, plain, dir, "pictured: play by play", { progress: (done) => void heard.push(done) });
	assert.deepEqual([files.length, failed], [moments.length, 0]);
	assert.deepEqual(heard, moments.map((_, at) => at + 1));
	assert.match(files[0]!, /^0001-turn-00\.webp$/);
	assert.ok(files.some((name) => /-turn-03\.webp$/.test(name)));
	assert.deepEqual(readdirSync(dir).sort(), [...files, "index.html", "index.md"].sort());
	const index = readFileSync(join(dir, "index.md"), "utf8");
	assert.match(index, /^# pictured: play by play\n\n## 1\. Opening hands\n\n!\[0001-turn-00\.webp\]\(0001-turn-00\.webp\)\n\n- /);
	assert.match(index, /## \d+\. Turn 2, B's /);
	assert.ok(!files.slice(1).some((name) => /-turn-00\.webp$/.test(name)), "only the opening hands come before turn 1");

	let drawn = 0;
	const flaky = { name: "flaky", svg: async () => { if (++drawn === 2) throw new Error("Card ID must contain 1–100 characters."); return plain.svg(); } };
	const again = await drawSeries(moments, flaky, mkdtempSync(join(tmpdir(), "series-flaky-")), "flaky");
	assert.deepEqual([again.files.length, again.failed], [moments.length - 1, 1], "one picture that fails does not stop the series");
});

test("the page flips through the series with each moment's counts and the game's own numbers", async () => {
	const moments = series(await savedGame(), "spectator"), table = moments.table;
	const stats = gameStats(table, "2026-10-13T12:00:00.000Z", { elapsedMs: 754_000, calls: 12, input: 40_000, output: 3_000, cost: 0.4, roles: [{ role: "decide", calls: 10, cost: 0.1 }] });
	const lands = stats.seats.map((seat) => seat.counts.find(([what]) => what === "Lands played")![1]);
	assert.ok(lands.every((count) => count >= 1), `each seat played a land: ${lands}`);
	const facts = Object.fromEntries(stats.game);
	assert.equal(facts.Result, "Unfinished");
	assert.match(facts.Decisions!, new RegExp(`^${table.ledger.length}: `));
	assert.deepEqual([facts["Wall time"], facts.Cost], ["12m 34s", "$0.40 (decide $0.10)"]);
	moments[1]!.lines.push("A line that says </script><script>alert(1)</script>");
	const page = viewerHtml("A vs B", "pictured", moments, moments.map((_, at) => at === 2 ? null : `${at}.webp`), stats);
	const script = /<script>([^]*)<\/script>/.exec(page)![1]!;
	assert.equal(script.match(/<\/script>/g), null, "a line cannot close the page's script");
	assert.doesNotThrow(() => new Function(script), "the page's script compiles");
	const data = JSON.parse(/const DATA = (.*);\n/.exec(script)![1]!);
	assert.equal(data.moments.length, moments.length);
	assert.equal(data.moments[2].file, null, "a picture not drawn says so");
	assert.deepEqual(data.moments[0].seats[0].length, 6, "life, hand, library, board, graveyard, exile");
});
