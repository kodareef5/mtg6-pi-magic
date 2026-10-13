/**
 * The saved games a Pi keeps, for watching: each one's summary for the games
 * list, searched, sorted and paged on the server; each one as moments for a
 * replay; and its looks and what its run cost. A summary reads the journal's
 * header and decisions and the newest saved result, never a replay, so the
 * list stays quick however many games there are.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { Universe } from "../core/cards.ts";
import { start } from "../core/commit.ts";
import { standard } from "../core/format.ts";
import { read, replay, type Header } from "../core/journal.ts";
import type { Rules } from "../core/rules.ts";
import type { Table } from "../core/table.ts";
import type { Viewer } from "../core/types.ts";
import { defaults } from "../board/looks.ts";
import type { Dress } from "../board/render.ts";
import type { Run, Stats } from "../board/stats.ts";
import { playByPlay, type Moment } from "../board/series.ts";

/** A game id is its journal's file name: letters, digits and dashes, so no request can name another file. */
export const GAME_ID = /^[a-z0-9][a-z0-9-]{0,159}$/i;

export type Summary = {
	id: string; played: string; seats: { name: string; deck: string }[];
	status: "finished" | "live" | "unfinished"; winner?: string; turns?: number; decisions: number; cost?: number; elapsedMs?: number;
	/** Not yet replayed: status, winner and turns are the saved result's, which a later rollback or end can outdate. */
	checking?: true;
};
/** What a replay of a journal says about its game. */
export type Facts = { outcome: Record<string, "win" | "lose" | "draw"> | null; turn: number; decisions: number };

/** A saved game replayed for its page: the moments to show, from the perspectives it may be shown from, and its numbers. */
export type Replayed = { header: Header; finished: boolean; seats: { id: number; name: string }[]; stats: Stats; viewers: Viewer[]; moments: Moment[] };

/**
 * A worker thread that replays journals, or undefined where Node cannot load
 * this repository's TypeScript in a worker. The list then keeps to saved
 * results, and a saved game's page is replayed where it is asked for.
 */
export function journalReader(paths: { cards: string; rules: string }) {
	if (!(process.features as { typescript?: unknown }).typescript) return undefined;
	const worker = new Worker(new URL("./outcomes.ts", import.meta.url), { workerData: paths });
	worker.unref();
	const waiting = new Map<string, (reply: { error?: string } & Record<string, unknown>) => void>();
	let asked = 0;
	worker.on("message", ({ id, ...reply }: { id: string; error?: string }) => { waiting.get(id)?.(reply); waiting.delete(id); });
	worker.on("error", (error) => { for (const done of waiting.values()) done({ error: String(error) }); waiting.clear(); });
	const ask = (message: Record<string, unknown>) => new Promise<{ error?: string } & Record<string, unknown>>((done) => {
		const id = String(++asked); waiting.set(id, done); worker.postMessage({ ...message, id });
	});
	return {
		facts: async (path: string): Promise<Facts | undefined> => { const { error, ...facts } = await ask({ path }); return error ? undefined : facts as Facts; },
		replay: async (path: string, run?: Run): Promise<Replayed> => { const { error, ...back } = await ask({ path, moments: true, ...(run ? { run } : {}) }); if (error) throw new Error(error); return back as Replayed; },
		close: () => void worker.terminate(),
	};
}

/** The file name of a game's newest saved result, by the time its run began; part of what says a game changed. */
export function resultName(dir: string, game: string): string | undefined {
	const named = new RegExp(`^${game.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+\\.result\\.json$`);
	return readdirSync(dir).filter((name) => named.test(name)).sort().at(-1);
}
function resultOf(dir: string, game: string): Record<string, unknown> | undefined {
	const newest = resultName(dir, game);
	if (!newest) return undefined;
	try { return JSON.parse(readFileSync(join(dir, newest), "utf8")) as Record<string, unknown>; } catch { return undefined; }
}

/** What a game's run took, from its newest saved result, when one was saved with model usage. */
export function runOf(dir: string, game: string): Run | undefined {
	const result = resultOf(dir, game) as { elapsedMs?: number; llm?: { total?: { calls: number; input: number; output: number; cost: number }; roles?: { role: string; calls: number; cost: number }[] } } | undefined;
	const total = result?.llm?.total;
	return total && result!.elapsedMs !== undefined ? { elapsedMs: result!.elapsedMs, calls: total.calls, input: total.input, output: total.output, cost: total.cost,
		roles: (result!.llm?.roles ?? []).map(({ role, calls, cost }) => ({ role, calls, cost })) } : undefined;
}

/**
 * What a game's pictures wear, as its journal recorded the looks: every seat's portrait, and the viewer's
 * background and colours. A game saved before tables had looks gets a default background, the same one each time.
 */
export function dressOf(header: Header | undefined, viewer: Viewer): Dress {
	const mine = viewer === "spectator" ? header : header?.seats[viewer], standing = defaults("backgrounds");
	const background = mine?.background ?? header?.background ?? (header && standing[[...header.id].reduce((sum, one) => sum + one.charCodeAt(0), 0) % standing.length]);
	return { avatars: Object.fromEntries((header?.seats ?? []).flatMap((one) => one.avatar ? [[one.id, one.avatar]] : [])),
		...(background ? { background } : {}), ...(mine?.colors ? { colors: mine.colors } : {}) };
}

/** A saved game replayed into moments, as the audience and each seat saw it, calling no models. */
export function momentsOf(path: string, cards: Universe, rules: Rules): { moments: Moment[]; viewers: Viewer[]; table: Table; header: Header } {
	let series: ReturnType<typeof playByPlay> | undefined;
	const back = replay(path, (saved) => {
		const opened = start(standard, saved.seats.map((at) => ({ name: at.name, deck: at.deck })), saved.seed, cards);
		series = playByPlay(opened.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck.name })));
		return opened;
	}, undefined, { cards, rules }, { observe: (seen) => series!.take(seen) });
	series!.take(back.table);
	return { moments: series!.moments, viewers: series!.viewers, table: back.table, header: back.header };
}

/**
 * Every saved game's summary, read again only when its journal changes. `live`
 * names the games playing in this Pi. Whether a game is over, who won and in
 * how many turns come from replaying its journal with `facts`, in the
 * background, one game at a time; until then a summary says it is checking.
 */
export function gameIndex(dir: string, facts?: (path: string) => Promise<Facts | undefined>) {
	const known = new Map<string, { stamp: string; summary: Omit<Summary, "status"> & { finished: boolean } }>();
	const replayed = new Map<string, { stamp: string; facts: Facts }>(), queued = new Set<string>();
	let chain = Promise.resolve();
	const check = (id: string, stamp: string) => {
		if (!facts || queued.has(id)) return;
		queued.add(id);
		chain = chain.then(async () => {
			const found = await facts(join(dir, `${id}.jsonl`)).catch(() => undefined);
			if (found) replayed.set(id, { stamp, facts: found });
			queued.delete(id);
		});
	};
	return {
		/** Resolves once every game asked about so far has been replayed. */
		settled: () => chain,
		all(live: ReadonlySet<string> = new Set()): Summary[] {
			if (!existsSync(dir)) return [];
			const games = readdirSync(dir).filter((name) => name.endsWith(".jsonl") && GAME_ID.test(name.slice(0, -6)));
			for (const name of games) {
				const id = name.slice(0, -6), file = statSync(join(dir, name)), stamp = `${file.mtimeMs}:${file.size}:${resultName(dir, id) ?? ""}`;
				if (known.get(id)?.stamp === stamp) continue;
				try {
					const { header, lines } = read(join(dir, name));
					const result = resultOf(dir, id) as { outcome?: { results: Record<string, string> } | null; turn?: number; elapsedMs?: number; llm?: { total?: { cost: number } } } | undefined;
					const outcome = result?.outcome, winner = outcome && header.seats.filter((seat) => outcome.results[seat.id] === "win").map((seat) => seat.name).join(" and ");
					known.set(id, { stamp, summary: { id, played: header.created, seats: header.seats.map((seat) => ({ name: seat.name, deck: seat.deck.name })),
						finished: !!outcome, ...(outcome ? { winner: winner || "draw" } : {}), ...(result?.turn !== undefined ? { turns: result.turn } : {}),
						decisions: lines.filter((line) => "row" in line).length,
						...(result?.llm?.total ? { cost: result.llm.total.cost } : {}), ...(result?.elapsedMs !== undefined ? { elapsedMs: result.elapsedMs } : {}) } });
				} catch { known.delete(id); }
			}
			for (const id of known.keys()) if (!games.includes(`${id}.jsonl`)) known.delete(id);
			return [...known.values()].map(({ summary: { finished, ...one } }): Summary => {
				if (live.has(one.id)) return { ...one, status: "live" };
				const file = statSync(join(dir, `${one.id}.jsonl`)), stamp = `${file.mtimeMs}:${file.size}`, found = replayed.get(one.id);
				if (found?.stamp !== stamp) {
					check(one.id, stamp);
					return { ...one, status: finished ? "finished" : "unfinished", ...(facts ? { checking: true as const } : {}) };
				}
				const { outcome, turn, decisions } = found.facts, { winner: _winner, turns: _turns, ...rest } = one;
				const won = outcome && one.seats.filter((_, seat) => outcome[seat] === "win").map((seat) => seat.name).join(" and ");
				return { ...rest, decisions, turns: turn, status: outcome ? "finished" : "unfinished", ...(outcome ? { winner: won || "draw" } : {}) };
			});
		},
	};
}

export type Query = { q?: string; status?: string; sort?: string; dir?: string; page?: number; size?: number };
const SORTS: Record<string, (one: Summary) => string | number> = {
	played: (one) => one.played, id: (one) => one.id, turns: (one) => one.turns ?? -1, decisions: (one) => one.decisions,
	cost: (one) => one.cost ?? -1, time: (one) => one.elapsedMs ?? -1, winner: (one) => one.winner ?? "",
};

/** A page of games: every word of `q` in its id, decks, seats or winner; then the status; sorted; then paged. */
export function searchGames(games: Summary[], query: Query): { total: number; page: number; size: number; pages: number; rows: Summary[] } {
	const words = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
	const matched = games.filter((one) => {
		const text = [one.id, one.winner ?? "", one.status, ...one.seats.flatMap((seat) => [seat.name, seat.deck])].join(" ").toLowerCase();
		return words.every((word) => text.includes(word)) && (!query.status || query.status === "all" || one.status === query.status);
	});
	const key = SORTS[query.sort ?? "played"] ?? SORTS.played!, order = query.dir === "asc" ? 1 : -1;
	matched.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * order || a.id.localeCompare(b.id); });
	const size = Math.min(100, Math.max(1, Math.floor(query.size ?? 25))), pages = Math.max(1, Math.ceil(matched.length / size));
	const page = Math.min(pages, Math.max(1, Math.floor(query.page ?? 1)));
	return { total: matched.length, page, size, pages, rows: matched.slice((page - 1) * size, page * size) };
}
