/**
 * A game on disk. One file per game, append-only, one JSON object per line.
 *
 * This is the stored form, not a serialisation of something else. Exporting is
 * copying it, rolling back is reading less of it, and copying a game from a
 * point is copying a prefix. docs/STATE.md says why, and what it is for.
 */

import { advance, apply, nextDecision } from "./decisions.ts";
import type { Said } from "./say.ts";
import type { LedgerRow, Receipt, Table } from "./table.ts";
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
 */
export type Line =
	| { v: number; receipt: Receipt }
	| { v: number; row: LedgerRow }
	| { v: number; said: Said };

export type Journal = { path: string; header: Header; appended: number };

export function open(path: string, header: Header): Journal {
	/*
	 * 1. Write the header as the first line. Refuse to overwrite a file that
	 *    already has one: a second header in a journal is a lost game.
	 * 2. Keep the handle open for appends. One line per write, newline
	 *    terminated, so a crash costs at most a partial last line.
	 */
	void [path, header];
	throw new Error("open is unwritten. Two steps above.");
}

export function append(journal: Journal, line: Line): void {
	void [journal, line];
	throw new Error("append is unwritten: one line, newline terminated, no buffering games.");
}

export function read(path: string): { header: Header; lines: Line[] } {
	/*
	 * 1. Read the first line as the header. A file without one is not a game.
	 * 2. Parse the rest in order. Drop a trailing partial line and say so, and
	 *    refuse a partial line anywhere else.
	 */
	void path;
	throw new Error("read is unwritten. Two steps above.");
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
 * replayed through.
 */
export function replay(path: string, upTo?: number): Table {
	/*
	 * 1. read(path), check the header's cards and rules against what is on disk.
	 * 2. start() from the header's format, seats and seed.
	 * 3. relive() with the ledger rows up to the version, then replace `said`
	 *    from the recorded said lines.
	 */
	void [path, upTo, relive];
	throw new Error("replay is unwritten. Three steps above, and step 3 is relive.");
}

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
		const row = rows[next++];
		if (!row) {
			throw new Error(
				`The record holds ${rows.length} decisions and the table still asks seat ` +
					`${decision.seat} a ${decision.situation} question`,
			);
		}
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
 * Copy a game from a point so it can be played on differently.
 *
 * This is also how a benchmark fixture is made. An interesting position frozen
 * at its version is a journal prefix, so there is no second format for
 * fixtures and there should never be one.
 *
 * The new journal carries `forkedFrom`, so the two share a prefix and the
 * difference between two lines of play is a diff of two files. Playing on needs
 * live players again, because the ledger past the fork belongs to the other
 * game.
 */
export function fork(path: string, at: number, id: string, to: string): Header {
	void [path, at, id, to];
	throw new Error("fork is unwritten: new id, same header plus forkedFrom, prefix copied.");
}

/**
 * What an export may contain. The journal is private: it holds every hand and
 * every library. Only `public` is safe to put on a URL, and it is safe because
 * it was filtered before it was written, not because the reader was careful.
 */
export type Export =
	| { mode: "full" }
	| { mode: "seat"; seat: SeatId }
	| { mode: "public" };

export function exportGame(path: string, how: Export, upTo?: number): string {
	/*
	 * 1. full: the journal itself, up to the version. No filtering, operator only.
	 * 2. seat: replay to the version, then project for that seat, from that
	 *    seat's knowledge rather than from the truth.
	 * 3. public: replay to the version, then project for a spectator.
	 * 4. Name the version in the output. An export with no version is a claim
	 *    about a moment nobody can find again.
	 */
	void [path, how, upTo];
	throw new Error("exportGame is unwritten. Four steps above.");
}
