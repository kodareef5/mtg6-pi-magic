/**
 * The watching server: HTTP for spectators, rewatchers and seats. Without a
 * seat's code it changes nothing and serves only what any audience may see. A
 * game with a result is served from every perspective, hands and all. Any
 * other game, live or stopped short, is served as the audience saw it, since
 * it may yet be played on. With a seat's code, sent as a bearer token and never
 * in an address, it serves that seat's own board and lets its holder pilot it.
 *
 *   GET /                                    the games page
 *   GET /api/games?q&status&sort&dir&page&size   a page of game summaries
 *   GET /games/<id>/                         the replay page
 *   GET /games/<id>/game.js                  the game's data, as the page reads it
 *   GET /games/<id>/live.json?version&moments&deck&images&art
 *                                            what a live page lacks, held until there is something new
 *   GET /games/<id>/cardboard/<name>.js      cardboard-api's browser scripts
 *   GET /seat/                               a seat's page, its code after the #
 *   GET /api/seat?after&game&version&moments&deck&images&art
 *                                            the seat's state and what its board lacks, held until there is something new
 *   POST /api/seat                           one action from the seat's page
 *
 * It binds the loopback address; a tunnel in front of it reaches the public.
 */
import { readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import type { Table } from "../core/table.ts";
import type { Header } from "../core/journal.ts";
import type { SeatId } from "../core/types.ts";
import { cardboardScript, gameScript, gameStats, replayBuilder, replayPage, type ReplayOptions } from "../board/replay.ts";
import { audienceOnly, playByPlay } from "../board/series.ts";
import { dressOf, GAME_ID, gameIndex, journalReader, momentsOf, resultName, runOf, searchGames } from "./games.ts";

const HOLD_MS = 25_000;
/** How long a live board waits for new cards' art before it is published without it. */
const ART_WAIT = 3_000;
/** Replays kept built, the most recently asked for first. */
const KEPT = 6;

/** A seat as its code holder reaches it. The host makes one for each request, so it is always the seat as it is now. */
export type Desk = {
	/** The game the seat is in once it is dealt, and its place at that game's table. */
	game?: string; viewer?: SeatId;
	/** What the seat's page shows beside the board, from this seat's own view. */
	state(): unknown;
	/** One action from the seat's page; a refusal says why. */
	act(post: Record<string, unknown>): Promise<string | null>;
};

export type Watching = {
	/** Where the journals are. */
	dir: string;
	cards(): Universe; rules(): Rules;
	art: ReplayOptions["art"]; resolveArt: ReplayOptions["resolveArt"];
	/** The card list and rules files, for replaying journals off the main thread; without them the list keeps to saved results. */
	paths?: { cards: string; rules: string };
	port?: number;
	/** The seat a code opens at this Pi's table, or undefined. */
	seats?(code: string): Desk | undefined;
};

export type Watch = Awaited<ReturnType<typeof watchServer>>;
/** One seat's board as the game plays: all of it, or what a client holding some of it lacks. */
type SeatFeed = { version: number; data(): unknown; since(have: { moments: number; deck: number; images: number; art: number }): unknown };

export async function watchServer(options: Watching) {
	// The journal reader starts once the server is listening, so a port in use leaves no worker behind.
	let reader: ReturnType<typeof journalReader>, index = gameIndex(options.dir);
	const built = new Map<string, { stamp: string; script: string }>();
	const live = new Map<string, { take(table: Table): void; finish(): void; script(): string; since(query: URLSearchParams, signal: AbortSignal): Promise<unknown>; seat(viewer: SeatId): SeatFeed | undefined }>();
	// Seats' pages wait on this: anything a seat may see changed, at the table or on its board.
	let seatSerial = 0;
	const seatWaiters = new Set<() => void>();
	const seatsChanged = () => { seatSerial++; for (const go of [...seatWaiters]) go(); };
	/** Held until `go` says there is something new, the hold runs out or the client leaves; whichever comes first clears the others. */
	const held = (waiters: Set<() => void>, signal: AbortSignal) => new Promise<void>((go) => {
		const done = () => { clearTimeout(timer); waiters.delete(done); signal.removeEventListener("abort", done); go(); };
		const timer = setTimeout(done, HOLD_MS);
		waiters.add(done);
		signal.addEventListener("abort", done, { once: true });
	});
	/** A game still playing has no totals yet; its page shows them once it is over. Its boards wait a moment for art, never longer. */
	const replayOptions = (id: string, header: Header, table: Table, totals: boolean): ReplayOptions => ({
		title: header.seats.map((one) => one.name).join(" vs "), subtitle: `${id} · ${totals ? "play by play" : "live"}`,
		...(totals ? { stats: gameStats(table, header.created, runOf(options.dir, id)) } : { artWait: ART_WAIT }),
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
	async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
		const parts: Buffer[] = [];
		let size = 0;
		for await (const part of request) {
			size += (part as Buffer).length;
			if (size > 100_000) throw new Error("The request is too large.");
			parts.push(part as Buffer);
		}
		const read = JSON.parse(Buffer.concat(parts).toString("utf8") || "null") as unknown;
		if (!read || typeof read !== "object" || Array.isArray(read)) throw new Error("Send one JSON object.");
		return read as Record<string, unknown>;
	}

	/** A seat's page: its state, and its board once it is dealt, all of it the first time and what is new after. */
	async function seat(request: IncomingMessage, response: ServerResponse, url: URL) {
		const code = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "")?.[1], found = code ? options.seats?.(code) : undefined;
		if (!code || !found) return json(response, 401, { message: "That code opens no seat at this table. Ask the host for the seat's link." });
		if (request.method === "POST") {
			let post: Record<string, unknown>;
			try { post = await body(request); } catch (error) { return json(response, 400, { ok: false, message: error instanceof Error ? error.message : String(error) }); }
			// The link may have been replaced while the request came in: only a seat the code still opens acts.
			const now = options.seats?.(code);
			if (!now) return json(response, 401, { ok: false, message: "That code opens no seat at this table any more. Ask the host for the seat's link." });
			const problem = await now.act(post);
			seatsChanged();
			return json(response, problem ? 400 : 200, problem ? { ok: false, message: problem } : { ok: true });
		}
		const number = (name: string) => Number(url.searchParams.get(name) ?? 0) || 0, after = Number(url.searchParams.get("after") ?? -1);
		const board = (desk: Desk) => desk.game && desk.viewer !== undefined ? live.get(desk.game)?.seat(desk.viewer) : undefined;
		const behind = (desk: Desk) => { const feed = board(desk); return !!feed && (url.searchParams.get("game") !== desk.game || feed.version !== number("version")); };
		if (seatSerial <= after && !behind(found)) {
			const gone = new AbortController();
			response.once("close", () => gone.abort());
			await held(seatWaiters, gone.signal);
		}
		const desk = options.seats?.(code);
		if (!desk) return json(response, 401, { message: "That code opens no seat at this table any more. Ask the host for the seat's link." });
		const feed = board(desk), have = { moments: number("moments"), deck: number("deck"), images: number("images"), art: number("art") };
		return json(response, 200, { serial: seatSerial, state: desk.state(),
			...(feed && url.searchParams.get("game") !== desk.game ? { board: { game: desk.game, full: feed.data() } } : feed && feed.version !== number("version") ? { board: { game: desk.game, since: feed.since(have) } } : {}) });
	}

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://watch");
			if (url.pathname === "/api/seat" && (request.method === "GET" || request.method === "POST")) return await seat(request, response, url);
			if (request.method !== "GET") return json(response, 405, { message: "Only GET: without a seat's code this server shows games and changes nothing." });
			if (url.pathname === "/seat") { response.writeHead(301, { location: "/seat/" }); return response.end(); }
			if (url.pathname === "/seat/") return send(response, 200, "text/html; charset=utf-8", readFileSync(replayPage()));
			if (url.pathname === "/seat/game.js") return send(response, 200, "text/javascript; charset=utf-8", "window.SEAT = true;\n");
			const seatScript = /^\/seat\/cardboard\/([a-z-]+)\.js$/.exec(url.pathname), seatFile = seatScript && cardboardScript(seatScript[1]!);
			if (seatFile) return send(response, 200, "text/javascript; charset=utf-8", readFileSync(seatFile));
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
			// Each seat's own board, as that seat sees it, for its page alone.
			const own = new Map(await Promise.all(table.seats.map(async (one) => [one.id, { series: playByPlay(seats, [one.id]),
				replay: await replayBuilder(table.seats, [one.id], replayOptions(id, header, table, false)) }] as const)));
			const waiting = new Set<() => void>();
			let queue = Promise.resolve(), finished = false;
			const wake = () => { for (const go of [...waiting]) go(); };
			const watched = {
				take(seen: Table) {
					series.take(seen);
					for (const one of own.values()) one.series.take(seen);
					queue = queue.then(async () => {
						if (await replay.sync(series.moments)) wake();
						let moved = false;
						for (const one of own.values()) moved = await one.replay.sync(one.series.moments) || moved;
						if (moved) seatsChanged();
					}).catch(() => {});
				},
				seat(viewer: SeatId): SeatFeed | undefined {
					const one = own.get(viewer);
					return one && { version: one.replay.version, data: () => one.replay.data({ live: true, seat: true }), since: (have) => one.replay.since(have) };
				},
				finish() { finished = true; void queue.then(() => { live.delete(id); wake(); }); },
				script: () => gameScript(replay.data({ live: true })),
				async since(query: URLSearchParams, signal: AbortSignal) {
					const have = (name: string) => Number(query.get(name) ?? 0) || 0;
					if (replay.version === have("version") && !finished && !signal.aborted) await held(waiting, signal);
					return { ...replay.since({ moments: have("moments"), deck: have("deck"), images: have("images"), art: have("art") }), finished };
				},
			};
			live.set(id, watched);
			watched.take(table);
			return watched;
		},
		/** Something a seat may see changed at the table: its pages ask again. */
		seatsChanged,
		/** Resolves once the games list has replayed every journal it was asked about. */
		indexed: () => index.settled(),
		close: () => new Promise<void>((done) => { reader?.close(); for (const one of live.values()) one.finish(); for (const go of [...seatWaiters]) go(); server.closeAllConnections(); server.close(() => done()); }),
	};
}
