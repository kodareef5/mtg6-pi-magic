/**
 * The watching server: read-only HTTP for spectators and rewatchers, beside
 * the seats' wire and separate from it. It needs no token, so it serves only
 * what any audience may see. A game with a result is served from every
 * perspective, hands and all. Any other game, live or stopped short, is served
 * as the audience saw it, since it may yet be played on.
 *
 *   GET /                                    the games page
 *   GET /api/games?q&status&sort&dir&page&size   a page of game summaries
 *   GET /games/<id>/                         the replay page
 *   GET /games/<id>/game.js                  the game's data, as the page reads it
 *   GET /games/<id>/live.json?version&moments&deck&images
 *                                            what a live page lacks, held until there is something new
 *   GET /games/<id>/cardboard/<name>.js      cardboard-api's browser scripts
 *
 * It binds the loopback address; a tunnel in front of it reaches the public.
 */
import { readFileSync, statSync } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import type { Table } from "../core/table.ts";
import type { Header } from "../core/journal.ts";
import { cardboardScript, gameScript, gameStats, replayBuilder, replayPage, type ReplayOptions } from "../board/replay.ts";
import { audienceOnly, playByPlay } from "../board/series.ts";
import { dressOf, GAME_ID, gameIndex, journalReader, momentsOf, resultName, runOf, searchGames } from "./games.ts";

const HOLD_MS = 25_000;
/** Replays kept built, the most recently asked for first. */
const KEPT = 6;

export type Watching = {
	/** Where the journals are. */
	dir: string;
	cards(): Universe; rules(): Rules;
	art: ReplayOptions["art"]; resolveArt: ReplayOptions["resolveArt"];
	/** The card list and rules files, for replaying journals off the main thread; without them the list keeps to saved results. */
	paths?: { cards: string; rules: string };
	port?: number;
};

export type Watch = Awaited<ReturnType<typeof watchServer>>;

export async function watchServer(options: Watching) {
	// The journal reader starts once the server is listening, so a port in use leaves no worker behind.
	let reader: ReturnType<typeof journalReader>, index = gameIndex(options.dir);
	const built = new Map<string, { stamp: string; script: string }>();
	const live = new Map<string, { take(table: Table): void; finish(): void; script(): string; since(query: URLSearchParams, signal: AbortSignal): Promise<unknown> }>();
	/** A game still playing has no totals yet; its page shows them once it is over. */
	const replayOptions = (id: string, header: Header, table: Table, totals: boolean): ReplayOptions => ({
		title: header.seats.map((one) => one.name).join(" vs "), subtitle: `${id} · ${totals ? "play by play" : "live"}`,
		...(totals ? { stats: gameStats(table, header.created, runOf(options.dir, id)) } : {}),
		dress: (viewer) => dressOf(header, viewer), art: options.art, cards: options.cards(), resolveArt: options.resolveArt,
	});

	/** A saved game's data, built once for each version of its journal. */
	async function saved(id: string): Promise<string> {
		const path = join(options.dir, `${id}.jsonl`), file = statSync(path), stamp = `${file.mtimeMs}:${file.size}:${resultName(options.dir, id) ?? ""}`, kept = built.get(id);
		if (kept?.stamp === stamp) { built.delete(id); built.set(id, kept); return kept.script; }
		const { moments, viewers, table, header } = momentsOf(path, options.cards(), options.rules()), finished = !!table.outcome;
		const shown = finished ? moments : audienceOnly(moments), seen = finished ? viewers : ["spectator" as const];
		const replay = await replayBuilder(table.seats, seen, replayOptions(id, header, table, true));
		await replay.sync(shown);
		const script = gameScript(replay.data({ finished }));
		built.set(id, { stamp, script });
		while (built.size > KEPT) built.delete(built.keys().next().value!);
		return script;
	}

	const send = (response: ServerResponse, status: number, type: string, body: string | Buffer) => {
		response.writeHead(status, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
		response.end(body);
	};
	const json = (response: ServerResponse, status: number, body: unknown) => send(response, status, "application/json", JSON.stringify(body));

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://watch");
			if (request.method !== "GET") return json(response, 405, { message: "Only GET: this server shows games and changes nothing." });
			if (url.pathname === "/") return send(response, 200, "text/html; charset=utf-8", readFileSync(join(import.meta.dirname, "games.html")));
			if (url.pathname === "/api/games") {
				const number = (name: string) => url.searchParams.has(name) ? Number(url.searchParams.get(name)) : undefined;
				return json(response, 200, searchGames(index.all(new Set(live.keys())), { q: url.searchParams.get("q") ?? "", status: url.searchParams.get("status") ?? "all",
					sort: url.searchParams.get("sort") ?? "played", dir: url.searchParams.get("dir") ?? "desc", ...(number("page") ? { page: number("page") } : {}), ...(number("size") ? { size: number("size") } : {}) }));
			}
			const game = /^\/games\/([^/]+)(\/.*)?$/.exec(url.pathname);
			if (!game || !GAME_ID.test(game[1]!)) return json(response, 404, { message: "No such page." });
			const id = game[1]!, rest = game[2] ?? "";
			if (!rest) { response.writeHead(301, { location: `/games/${id}/` }); return response.end(); }
			const playing = live.get(id);
			const known = playing || index.all().some((one) => one.id === id);
			if (!known) return json(response, 404, { message: `No game ${id}.` });
			if (rest === "/") return send(response, 200, "text/html; charset=utf-8", readFileSync(replayPage()));
			if (rest === "/game.js") {
				try { return send(response, 200, "text/javascript; charset=utf-8", playing ? playing.script() : await saved(id)); }
				catch (error) { return send(response, 200, "text/javascript; charset=utf-8", `window.GAME_ERROR = ${JSON.stringify(`This game could not be replayed here: ${error instanceof Error ? error.message : String(error)}`)};\n`); }
			}
			if (rest === "/live.json") {
				// A watcher who leaves stops waiting.
				const gone = new AbortController();
				response.once("close", () => gone.abort());
				return json(response, 200, playing ? await playing.since(url.searchParams, gone.signal) : { finished: true });
			}
			const script = /^\/cardboard\/([a-z-]+)\.js$/.exec(rest), file = script && cardboardScript(script[1]!);
			if (file) return send(response, 200, "text/javascript; charset=utf-8", readFileSync(file));
			return json(response, 404, { message: "No such page." });
		} catch (error) {
			if (!response.headersSent) json(response, 500, { message: error instanceof Error ? error.message : String(error) });
		}
	});
	// A port in use is an error the caller can recover from, as by trying another.
	await new Promise<void>((done, fail) => {
		server.once("error", fail);
		server.listen(options.port ?? 0, "127.0.0.1", () => { server.off("error", fail); done(); });
	});
	reader = options.paths && journalReader(options.paths);
	index = gameIndex(options.dir, reader?.facts);
	const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	return {
		base,
		/**
		 * Watch a game as it plays. `take` sees the table before each decision, as
		 * the loop's checkpoint does; `finish` says it is over, and its watchers load
		 * the saved game, every perspective of it once it has a result.
		 */
		async live(id: string, header: Header, table: Table) {
			const seats = table.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck.name }));
			const series = playByPlay(seats, ["spectator"]);
			const replay = await replayBuilder(table.seats, ["spectator"], replayOptions(id, header, table, false));
			const waiting = new Set<() => void>();
			let queue = Promise.resolve(), finished = false;
			const wake = () => { for (const go of [...waiting]) go(); };
			const watched = {
				take(seen: Table) {
					series.take(seen);
					queue = queue.then(async () => { if (await replay.sync(series.moments)) wake(); }).catch(() => {});
				},
				finish() { finished = true; void queue.then(() => { live.delete(id); wake(); }); },
				script: () => gameScript(replay.data({ live: true })),
				async since(query: URLSearchParams, signal: AbortSignal) {
					const have = (name: string) => Number(query.get(name) ?? 0) || 0;
					// Held until something is new, the hold runs out or the watcher leaves; whichever comes first clears the others.
					if (replay.version === have("version") && !finished && !signal.aborted) await new Promise<void>((go) => {
						const done = () => { clearTimeout(timer); waiting.delete(done); signal.removeEventListener("abort", done); go(); };
						const timer = setTimeout(done, HOLD_MS);
						waiting.add(done);
						signal.addEventListener("abort", done, { once: true });
					});
					return { ...replay.since({ moments: have("moments"), deck: have("deck"), images: have("images") }), finished };
				},
			};
			live.set(id, watched);
			watched.take(table);
			return watched;
		},
		/** Resolves once the games list has replayed every journal it was asked about. */
		indexed: () => index.settled(),
		close: () => new Promise<void>((done) => { reader?.close(); for (const one of live.values()) one.finish(); server.closeAllConnections(); server.close(() => done()); }),
	};
}
