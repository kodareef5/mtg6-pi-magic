/**
 * Watching. The games list is searched, sorted and paged on the server; a
 * finished game is served from every perspective and any other from the
 * audience's alone; a live game sends what is new as it plays and says when it
 * is over; nothing outside the games is served, and nothing is changed. The
 * public address comes from cloudflared's own output.
 */
import { strict as assert } from "node:assert";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { load } from "../src/core/cards.ts";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { endByHost, rollbackByHost } from "../src/core/host.ts";
import { open, save, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import { load as loadRules } from "../src/core/rules.ts";
import type { Table } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";
import { project } from "../src/core/view.ts";
import { gameStats, replayBuilder } from "../src/board/replay.ts";
import { playByPlay } from "../src/board/series.ts";
import { searchGames, type Summary } from "../src/watch/games.ts";
import { watchServer } from "../src/watch/server.ts";
import { quickTunnel } from "../src/watch/tunnel.ts";

const cards = load(join(import.meta.dirname, "..", "cards", "standard.tsv")), rules = loadRules(join(import.meta.dirname, "..", "rules", "cr.tsv"));
const header = (id: string, decks: [string, string]): Header => ({
	id, format: standard.name, seed: id, seats: [{ id: 0, name: "A", deck: deck(decks[0]) }, { id: 1, name: "B", deck: deck(decks[1]) }],
	cards: { path: cards.path, generated: cards.generated, ...(cards.faces ? { faces: cards.faces } : {}), ...(cards.names ? { names: cards.names } : {}) },
	rules: { path: "rules/cr.tsv", effective: rules.effective }, created: "2026-10-13T12:00:00.000Z",
});
const dealt = (made: Header) => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed, cards);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });
async function through(table: Table, turn: number, checkpoint?: () => void) {
	const stop = new Error("stop");
	try { await play(table, { 0: steady("A"), 1: steady("B") }, {}, { ...(checkpoint ? { checkpoint } : {}), watch: () => { if (table.cursor.turn > turn) throw stop; } }); }
	catch (error) { if (error !== stop) throw error; }
}
/** Two saved games: one the host ended, with a saved result, and one stopped at turn 3. */
async function games() {
	const dir = mkdtempSync(join(tmpdir(), "watch-"));
	const ended = header("green-stompy-vs-dimir-control-1", ["Green Stompy", "Dimir Control"]), stopped = header("dimir-control-vs-green-stompy-2", ["Dimir Control", "Green Stompy"]);
	const one = dealt(ended), journal = open(join(dir, `${ended.id}.jsonl`), ended);
	await through(one, 2); endByHost(one, "Checked."); save(journal, one);
	writeFileSync(join(dir, `${ended.id}-1791891574243.result.json`), JSON.stringify({ outcome: one.outcome, turn: 2, elapsedMs: 61_000, llm: { total: { calls: 3, input: 1, output: 1, cost: 0.12 }, roles: [] } }));
	const two = dealt(stopped);
	await through(two, 3); save(open(join(dir, `${stopped.id}.jsonl`), stopped), two);
	return { dir, ended, stopped };
}
/** A game ended with no result written, and one whose saved result says it finished before a rollback took it back. */
async function outdated(dir: string) {
	const quiet = header("green-stompy-vs-dimir-control-3", ["Green Stompy", "Dimir Control"]), back = header("green-stompy-vs-dimir-control-4", ["Green Stompy", "Dimir Control"]);
	const one = dealt(quiet), journal = open(join(dir, `${quiet.id}.jsonl`), quiet);
	await through(one, 2); endByHost(one, "Ended while stopped."); save(journal, one);
	const two = dealt(back), kept = open(join(dir, `${back.id}.jsonl`), back);
	await through(two, 2); endByHost(two, "Over, for now."); save(kept, two);
	writeFileSync(join(dir, `${back.id}-1791891574243.result.json`), JSON.stringify({ outcome: two.outcome, turn: 3, elapsedMs: 1_000 }));
	rollbackByHost(two, 2, "Not over after all.", () => dealt(back)); save(kept, two);
	return { quiet, back };
}
const serve = (dir: string, port?: number) => watchServer({ dir, cards: () => cards, rules: () => rules, art: new Map(), resolveArt: async () => ({}),
	paths: { cards: join(import.meta.dirname, "..", "cards", "standard.tsv"), rules: join(import.meta.dirname, "..", "rules", "cr.tsv") }, ...(port ? { port } : {}) });
const data = (script: string) => JSON.parse(script.replace(/^window\.GAME = /, "").replace(/;\n$/, ""));

test("the games list is searched, filtered, sorted and paged on the server", () => {
	const at = (id: string, more: Partial<Summary>): Summary => ({ id, played: "2026-10-13T12:00:00.000Z", seats: [{ name: "A", deck: "Green Stompy" }, { name: "B", deck: "Dimir Control" }], status: "finished", decisions: 10, ...more });
	const all = [at("a", { decisions: 30, winner: "A" }), at("b", { status: "unfinished", decisions: 5, seats: [{ name: "A", deck: "Mardu Discard" }, { name: "B", deck: "Jund Sacrifice" }] }), at("c", { decisions: 20, played: "2026-10-14T00:00:00.000Z" })];
	assert.deepEqual(searchGames(all, {}).rows.map((one) => one.id), ["c", "a", "b"], "newest first by default");
	assert.deepEqual(searchGames(all, { q: "green DIMIR" }).rows.map((one) => one.id).sort(), ["a", "c"], "every word, any case, in the decks");
	assert.deepEqual(searchGames(all, { q: "jund" }).rows.map((one) => one.id), ["b"]);
	assert.deepEqual(searchGames(all, { status: "unfinished" }).rows.map((one) => one.id), ["b"]);
	assert.deepEqual(searchGames(all, { sort: "decisions", dir: "asc" }).rows.map((one) => one.id), ["b", "c", "a"]);
	const paged = searchGames(all, { size: 2, page: 2 });
	assert.deepEqual([paged.total, paged.pages, paged.page, paged.rows.map((one) => one.id)], [3, 2, 2, ["b"]]);
	assert.equal(searchGames(all, { size: 2, page: 9 }).page, 2, "a page past the end is the last page");
});

test("a finished game is served from every perspective, any other from the audience's alone, and nothing else is served", async () => {
	const { dir, ended, stopped } = await games(), server = await serve(dir);
	try {
		const get = (path: string, init?: RequestInit) => fetch(`${server.base}${path}`, { redirect: "manual", ...init });
		assert.match(await (await get("/")).text(), /<title>Magic games<\/title>/);
		const list = await (await get("/api/games?q=stompy&sort=decisions&dir=desc")).json();
		assert.equal(list.total, 2);
		const finished = list.rows.find((one: Summary) => one.id === ended.id);
		assert.deepEqual([finished.status, finished.winner, finished.turns, finished.cost, finished.elapsedMs], ["finished", "draw", 2, 0.12, 61_000]);
		assert.equal(list.rows.find((one: Summary) => one.id === stopped.id).status, "unfinished");
		assert.match(await (await get(`/games/${ended.id}/`)).text(), /<title>Magic replay<\/title>/);
		assert.equal((await get(`/games/${ended.id}`)).headers.get("location"), `/games/${ended.id}/`);
		const whole = data(await (await get(`/games/${ended.id}/game.js`)).text());
		assert.deepEqual([whole.finished, whole.perspectives.length, Object.fromEntries(whole.stats.game).Result], [true, 3, "A draw on turn 3"]);
		const partial = data(await (await get(`/games/${stopped.id}/game.js`)).text());
		assert.deepEqual([partial.finished, partial.perspectives.map((one: { key: string }) => one.key)], [false, ["audience"]], "a game not over shows no hand");
		const hands = partial.moments.flatMap((one: { views: { scene: { players: { zones: { id: string; cardIds: string[] }[] }[] } }[] }) =>
			one.views[0]!.scene.players.flatMap((player) => player.zones.filter((zone) => zone.id === "hand").flatMap((zone) => zone.cardIds)));
		assert.deepEqual(hands, []);
		assert.match(await (await get(`/games/${ended.id}/cardboard/mtg-renderer.js`)).text(), /registerScene\('mtg'/);
		for (const path of [`/games/${ended.id}/cardboard/../../../etc/passwd`, "/games/..%2F..%2Fetc/game.js", "/games/no-such-game/game.js", `/games/${ended.id}/cardboard/fs.js`, "/etc/passwd"])
			assert.equal((await get(path)).status, 404, path);
		assert.equal((await get("/api/games", { method: "POST" })).status, 405);
	} finally { await server.close(); }
});

test("a live game sends what is new as it plays, from the audience alone, and says when it is over", async () => {
	const { dir } = await games(), server = await serve(dir), made = header("live-1", ["Green Stompy", "Dimir Control"]), table = dealt(made);
	open(join(dir, "live-1.jsonl"), made);
	try {
		const watched = await server.live("live-1", made, table);
		assert.equal((await (await fetch(`${server.base}/api/games?status=live`)).json()).rows[0]?.id, "live-1");
		const first = data(await (await fetch(`${server.base}/games/live-1/game.js`)).text());
		assert.deepEqual([first.live, first.perspectives.length, first.stats], [true, 1, null]);
		const query = `version=${first.version}&moments=${first.moments.length}&deck=${first.deck.length}&images=${Object.keys(first.images).length}`;
		const asked = fetch(`${server.base}/games/live-1/live.json?${query}`).then((one) => one.json());
		await through(table, 2, () => watched.take(table));
		const update = await asked;
		assert.ok(update.version > first.version && update.moments.length > 0 && update.from === Math.max(0, first.moments.length - 1), "the client's last moment again, and what came after");
		assert.ok(update.deck.every((one: { id: string }) => !first.deck.some((known: { id: string }) => known.id === one.id)), "only definitions the client lacks");
		assert.equal(update.finished, false);
		watched.finish();
		const over = await (await fetch(`${server.base}/games/live-1/live.json?version=${update.version}`)).json();
		assert.equal(over.finished, true, "a page told the game is over loads it again");
		assert.equal((await (await fetch(`${server.base}/api/games?status=live`)).json()).total, 0);
	} finally { await server.close(); }
});

test("a public address is the one cloudflared prints, and a missing cloudflared says how to get it", async () => {
	const fake = join(mkdtempSync(join(tmpdir(), "cloudflared-")), "cloudflared");
	writeFileSync(fake, "#!/bin/sh\necho 'INF Requesting new quick Tunnel' 1>&2\necho 'INF |  https://quick-brown-fox.trycloudflare.com  |' 1>&2\nsleep 30\n");
	chmodSync(fake, 0o755);
	const tunnel = await quickTunnel("http://127.0.0.1:4747", fake);
	assert.equal(tunnel.url, "https://quick-brown-fox.trycloudflare.com");
	tunnel.close();
	await assert.rejects(quickTunnel("http://127.0.0.1:4747", join(tmpdir(), "no-such-cloudflared")), /brew install cloudflared/);
});

test("the list says a game is over from its journal, not from a result that is missing or outdated", async () => {
	const { dir } = await games(), { quiet, back } = await outdated(dir), server = await serve(dir);
	try {
		const status = async () => Object.fromEntries((await (await fetch(`${server.base}/api/games?size=100`)).json()).rows.map((one: Summary) => [one.id, [one.status, one.winner ?? null, !!one.checking]]));
		const first = await status();
		assert.deepEqual([first[quiet.id], first[back.id]], [["unfinished", null, true], ["finished", "draw", true]], "until replayed, the saved results stand, marked as checking");
		await server.indexed();
		const after = await status();
		assert.deepEqual([after[quiet.id], after[back.id]], [["finished", "draw", false], ["unfinished", null, false]], "replayed, each journal says how its game stands");
	} finally { await server.close(); }
});

test("a port in use is an error to recover from, and a watcher who leaves stops waiting", async () => {
	const { dir } = await games(), first = await serve(dir);
	try {
		await assert.rejects(serve(dir, Number(new URL(first.base).port)), /EADDRINUSE/);
		const made = header("live-2", ["Green Stompy", "Dimir Control"]), table = dealt(made);
		open(join(dir, "live-2.jsonl"), made);
		const watched = await first.live("live-2", made, table), version = (await (await fetch(`${first.base}/games/live-2/game.js`)).text()).match(/"version":(\d+)/)![1]!;
		const leaving = new AbortController(), began = Date.now();
		const waited = watched.since(new URLSearchParams({ version }), leaving.signal);
		setTimeout(() => leaving.abort(), 50);
		await waited;
		assert.ok(Date.now() - began < 2_000, "the hold ends when the watcher leaves");
		const held = fetch(`${first.base}/games/live-2/live.json?version=${version}`).then((one) => one.json(), () => "closed");
		await new Promise((go) => setTimeout(go, 50));
		await first.close();
		assert.ok(["closed", "object"].includes(typeof (await held) === "object" ? "object" : String(await held)), "closing ends a held request");
	} finally { await first.close().catch(() => {}); }
});

test("a rollback is a moment of its own, showing the position play went back to", async () => {
	const made = header("rolled", ["Green Stompy", "Dimir Control"]), table = dealt(made), seen = playByPlay(table.seats.map((one) => ({ id: one.id, name: one.name })), ["spectator"]);
	await through(table, 2, () => seen.take(table));
	const lands = (snapshot: { seats: { battlefield: unknown[] }[] }) => snapshot.seats.reduce((sum, one) => sum + one.battlefield.length, 0);
	assert.ok(lands(seen.moments.at(-1)!.views[0]!.snapshot) > 0, "a land was played before the rollback");
	rollbackByHost(table, 2, "Back to the start.", () => dealt(made));
	seen.take(table);
	const now = seen.moments.at(-1)!.views[0]!;
	assert.match(now.lines.join(" "), /^Play went back to an earlier position\. The host's note: Back to the start\.$/);
	assert.equal(lands(now.snapshot), project(table, "spectator").objects!.filter((one) => one.zone === "battlefield").length);
	assert.equal(lands(now.snapshot), 0, "the board as it stands after the rollback");
});

test("no client is sent a card before its art and text, and custom images are kept in the replay", async () => {
	const made = header("drawn", ["Green Stompy", "Dimir Control"]), table = dealt(made), seen = playByPlay(table.seats.map((one) => ({ id: one.id, name: one.name })));
	await through(table, 2, () => seen.take(table));
	const portrait = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
	const images = createServer((_request, response) => { response.writeHead(200, { "content-type": "image/png" }); response.end(portrait); });
	await new Promise<void>((done) => images.listen(0, "127.0.0.1", done));
	const at = `http://127.0.0.1:${(images.address() as AddressInfo).port}`;
	try {
		let release!: () => void;
		const later = new Promise<void>((go) => { release = go; });
		const built = await replayBuilder(table.seats, seen.viewers, { title: "t", subtitle: "s", art: new Map([["Forest", "f"]]), cards,
			dress: () => ({ avatars: { 0: `${at}/me.png` }, background: `${at}/table.png` }),
			resolveArt: async (definitions) => { await later; return Object.fromEntries(definitions.filter((one) => one.scryfallId).map((one) => [`${one.scryfallId}:front`, { image: "data:image/jpeg;base64,AA==" }])); } });
		const syncing = built.sync(seen.moments);
		const early = built.data() as { deck: unknown[]; moments: unknown[] };
		assert.deepEqual([early.deck.length, early.moments.length], [0, 0], "nothing is published while the art is coming");
		release();
		await syncing;
		const late = built.since({ moments: 0, deck: early.deck.length, images: 0 }) as unknown as { deck: { id: string; scryfallId?: string; name: string }[]; art: Record<string, unknown>; cards: Record<string, unknown> };
		const forest = late.deck.find((one) => one.name === "Forest")!;
		assert.ok(forest && late.art[`${forest.scryfallId}:front`] && late.cards[forest.id], "the card arrives with its art and text");
		const all = JSON.stringify(built.data());
		assert.ok(!all.includes(at), "no scene names the image server");
		assert.ok(Object.values((built.data() as { images: Record<string, string> }).images).some((one) => one.startsWith("data:image/png;base64,")), "the custom portrait is kept in the replay");
	} finally { images.close(); }
});

test("damage dealt by a referenced object counts for its owner", () => {
	const table = { seats: [{ id: 0, name: "A", deck: { name: "Red" } }, { id: 1, name: "B", deck: { name: "Blue" } }], ledger: [], outcome: null, cursor: { turn: 3 },
		log: [{ reason: "resolve", changes: [{ do: "damage", source: { id: "0-12", incarnation: 2 }, target: { player: 1 }, amount: 2 }, { do: "damage", source: "0-13", target: { player: 1 }, amount: 3, combat: true }] }] } as unknown as Table;
	const counts = Object.fromEntries(gameStats(table).seats[0]!.counts);
	assert.deepEqual([counts["Other damage to players"], counts["Combat damage to players"]], [2, 3]);
});
