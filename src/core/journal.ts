/**
 * A game on disk. One file per game, append-only, one JSON object per line.
 *
 * This is the stored form, not a serialisation of something else. Exporting is
 * copying it, rolling back is reading less of it, and copying a game from a
 * point is copying a prefix. docs/STATE.md says why, and what it is for.
 *
 * Past 150 lines because the file, the replay over it and the two ways to copy
 * one are the same mechanism, and a reader asking "can I clone this game here"
 * should not have to find which of four files answers.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { advance, apply, nextDecision } from "./decisions.ts";
import type { Said } from "./say.ts";
import type { LedgerRow, Receipt, Table } from "./table.ts";
import { project } from "./view.ts";
import type { SeatId } from "./types.ts";

export type Header = {
	/** The game id. Also the directory a published game lives in. */
	id: string;
	format: string;
	seed: string;
	seats: { id: SeatId; name: string; deck: string[] }[];
	/**
	 * The data files this game was played against, with their dates. A set
	 * release changes oracle text, and a replay against different text is a
	 * different game, so these are pinned rather than assumed.
	 */
	cards: { path: string; generated: string };
	rules: { path: string; effective: string };
	created: string;
	forkedFrom?: { game: string; version: number };
};

/**
 * One line after the header. `v` is the decisions answered when it was written,
 * which is the version a frame carries and the point a rollback names. A group
 * that only moves the cursor writes no receipt, because `replay` derives every
 * one of those from the picks.
 *
 * A `prepared` line is what a model wrote before the game began: a seat's
 * brief, in whatever shape the context layer files it. It is a journal line
 * rather than a cache beside the journal, so copying a prefix copies it too and
 * there is no second format to keep in step. The core does not read it; it
 * carries it, which is why the shape is opaque here.
 */
export type Line =
	| { v: number; receipt: Receipt }
	| { v: number; row: LedgerRow }
	| { v: number; said: Said }
	| { v: number; prepared: { seat: SeatId; of: string; made: unknown } };

export type Journal = { path: string; header: Header; appended: number };

/**
 * Start a journal.
 *
 * Refuses to overwrite a file that already has a header, because a second
 * header in a journal is a lost game. One line per write, newline terminated,
 * and nothing buffered, so a crash costs at most a partial last line.
 */
export function open(path: string, header: Header): Journal {
	if (existsSync(path) && readFileSync(path, "utf8").trim().length > 0) {
		throw new Error(`${path} already holds a game. Pick another id or fork it.`);
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify({ header })}\n`);
	return { path, header, appended: 0 };
}

export function append(journal: Journal, line: Line): void {
	appendFileSync(journal.path, `${JSON.stringify(line)}\n`);
	journal.appended += 1;
}

/** Every line a table has produced so far, in order, ready to append. */
export function linesOf(table: Table): Line[] {
	const lines: Line[] = [];
	// A receipt carries the decision count that produced it. A row's own version
	// is the one after it, so version zero is a game that has answered nothing.
	for (const receipt of table.log) lines.push({ v: receipt.at, receipt });
	for (const row of table.ledger) lines.push({ v: row.seq + 1, row });
	for (const said of table.said) lines.push({ v: said.at, said });
	return lines.sort((a, b) => a.v - b.v);
}

/**
 * Read a journal.
 *
 * A trailing partial line is a crash and is dropped with a note. A partial line
 * anywhere else is a corrupt file and is refused, because the lines after it
 * cannot be trusted to be the game that was played.
 */
export function read(path: string): { header: Header; lines: Line[]; truncated?: string } {
	const text = readFileSync(path, "utf8");
	const rows = text.split("\n");
	const last = rows.pop();
	const first = rows.shift();
	if (!first) throw new Error(`${path} is empty. A file without a header is not a game.`);
	const opening = JSON.parse(first) as { header?: Header };
	if (!opening.header) throw new Error(`${path} does not start with a header.`);

	const lines: Line[] = [];
	for (const [at, row] of rows.entries()) {
		if (!row) continue;
		try {
			lines.push(JSON.parse(row) as Line);
		} catch (error) {
			throw new Error(`${path} line ${at + 2} is not a line: ${String(error)}`);
		}
	}
	let truncated: string | undefined;
	if (last && last.length) {
		try {
			lines.push(JSON.parse(last) as Line);
		} catch {
			truncated = `${path} ends mid line. The last entry was dropped.`;
		}
	}
	return { header: opening.header, lines, ...(truncated ? { truncated } : {}) };
}

/**
 * The recorded decisions, in order, which is what a replay applies.
 *
 * `upTo` is a version and so counts decisions: version 40 is the first forty,
 * which are the rows with sequence 0 to 39.
 */
export const rowsOf = (lines: Line[], upTo?: number): LedgerRow[] =>
	lines
		.flatMap((line) => ("row" in line ? [line.row] : []))
		.filter((row) => upTo === undefined || row.seq < upTo)
		.sort((a, b) => a.seq - b.seq);

/** What a model prepared before the game, so a clone does not pay for it twice. */
export const preparedIn = (lines: Line[]): { seat: SeatId; of: string; made: unknown }[] =>
	lines.flatMap((line) => ("prepared" in line ? [line.prepared] : []));

/**
 * Apply recorded decisions to a fresh table, in order, with the reason each one
 * carried.
 *
 * Driven by the ledger rather than by scripted players, because a fallback is
 * the absence of an answer and no player can produce one. Scripting the model
 * rows alone desynchronises the moment a game contains one: the engine asks a
 * question the script has no answer for, and every pick after it lands on the
 * wrong decision. So all five reasons are replayed as recorded, and a replayed
 * game counts forced, delegated, chosen, declared and fallback exactly as the
 * original did.
 *
 * Running out of rows is the end, not an error. A bounded set of rows is how a
 * fork asks for a position: the game is unfinished, a decision is pending, and
 * that is the thing being rebuilt. A row that does not match the decision the
 * table is asking is the real corruption signal, and that still throws.
 *
 * Two things stay outside it. Table talk changes nothing and is restored from
 * its own lines. A declared motion is not a listed pick, so `declare` will need
 * to record what it committed before a replay can carry one; until then a game
 * with a declaration is not fully reliveable, and that is a gap rather than a
 * silent approximation.
 */
export function relive(table: Table, rows: LedgerRow[]): Table {
	let next = 0;
	while (table.outcome === null) {
		const decision = nextDecision(table);
		if (decision === null) {
			advance(table);
			continue;
		}
		const row = rows[next];
		if (!row) return table;
		next += 1;
		if (row.seat !== decision.seat || row.situation !== decision.situation || !row.why) {
			throw new Error(
				`Record ${row.seq} is seat ${row.seat} ${row.situation} ${row.why ?? "with no reason"}, ` +
					`the table asks seat ${decision.seat} ${decision.situation}`,
			);
		}
		apply(table, row.picked, row.by, row.why);
	}
	return table;
}

/**
 * Roll a live game back to a declared point, with every remaining seat agreeing.
 *
 * The agreement is the feature. Without it this is a corrupted game, because a
 * seat that saw a card has not unseen it in the room, only in the record. With
 * it, the players know what they are accepting.
 *
 * So the rollback is itself an entry: the journal says one happened, who agreed,
 * and where it went back to. A reader can always see that information crossed.
 * Nothing rewrites the entries it rolled past; they stay, behind the marker.
 */
export function rollback(journal: Journal, to: number, agreed: SeatId[]): void {
	void [journal, to, agreed];
	throw new Error("rollback is unwritten: every remaining seat agrees, and the entry stays.");
}

/**
 * Rebuild the table as it stood at a version.
 *
 * It needs no model and no player. `relive` below is the whole of it once the
 * lines are read, because the ledger carries every decision and the seed
 * carries the shuffles.
 *
 * It does need the same card text and the same rules the game was played
 * against. The header names both, and a mismatch is reported rather than
 * replayed through: a replay against a later set is a different game, and one
 * that quietly succeeded would be the worst of the three outcomes.
 */
export function replay(
	path: string,
	start: (header: Header) => Table,
	upTo?: number,
	against?: { cards: { generated: string }; rules: { effective: string } },
): { table: Table; header: Header; prepared: { seat: SeatId; of: string; made: unknown }[] } {
	const { header, lines } = read(path);
	if (against) {
		const drift = [
			against.cards.generated === header.cards.generated
				? null
				: `cards are ${against.cards.generated}, the game used ${header.cards.generated}`,
			against.rules.effective === header.rules.effective
				? null
				: `rules are ${against.rules.effective}, the game used ${header.rules.effective}`,
		].filter(Boolean);
		if (drift.length) throw new Error(`${path} cannot be replayed here: ${drift.join("; ")}`);
	}
	return {
		table: relive(start(header), rowsOf(lines, upTo)),
		header,
		prepared: preparedIn(lines),
	};
}

/**
 * Copy a game from a point so it can be played on differently.
 *
 * This is also how a benchmark fixture is made. An interesting position frozen
 * at its version is a journal prefix, so there is no second format for
 * fixtures and there should never be one.
 *
 * Two points matter and both are prefixes of the same file. After the opening
 * settled is a position: the cards are where they are and play continues. At
 * version zero is a table that has been dealt nothing and whose seats already
 * hold what a model prepared for them, which is the one to reuse when the thing
 * being tested is the game and not the pregame.
 *
 * The new journal carries `forkedFrom`, so the two share a prefix and the
 * difference between two lines of play is a diff of two files. Playing on needs
 * live players again, because the decisions past the fork belong to the other
 * game.
 */
export function fork(path: string, at: number, id: string, to: string): Header {
	const { header, lines } = read(path);
	const kept = lines.filter((line) => line.v <= at);
	if (!kept.length && at > 0) throw new Error(`${path} has nothing at or before version ${at}.`);
	const forked: Header = { ...header, id, created: new Date().toISOString(), forkedFrom: { game: header.id, version: at } };
	const journal = open(to, forked);
	for (const line of kept) append(journal, line);
	return forked;
}

/**
 * Keep what a model prepared, so the next game from this point does not pay
 * for it again.
 *
 * Written at version zero, before anything is dealt, which is what makes a
 * version zero fork a reusable pregame. `of` names what it was prepared from,
 * so a brief written for one deck and roster is not silently reused for
 * another.
 */
export const keep = (journal: Journal, seat: SeatId, of: string, made: unknown): void =>
	append(journal, { v: 0, prepared: { seat, of, made } });

/**
 * What an export may contain. The journal is private: it holds every hand and
 * every library. Only `public` is safe to put on a URL, and it is safe because
 * it was filtered before it was written, not because the reader was careful.
 */
export type Export =
	| { mode: "full" }
	| { mode: "seat"; seat: SeatId }
	| { mode: "public" };

export function exportGame(
	path: string,
	how: Export,
	start: (header: Header) => Table,
	upTo?: number,
): string {
	const { header, lines } = read(path);
	const at = upTo ?? Math.max(0, ...lines.map((line) => line.v));
	// The version is named in every mode. An export with no version is a claim
	// about a moment nobody can find again.
	const stamp = `${header.id} at version ${at}`;
	if (how.mode === "full") {
		return [JSON.stringify({ header }), ...lines.filter((line) => line.v <= at).map((line) => JSON.stringify(line))].join("\n");
	}
	const table = relive(start(header), rowsOf(lines, at));
	const view = project(table, how.mode === "seat" ? how.seat : "spectator");
	return [stamp, ...view.table, ...view.yours].join("\n");
}
