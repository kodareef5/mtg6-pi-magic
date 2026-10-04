/**
 * A game on disk. One file per game, append-only, one JSON object per line.
 *
 * Full export copies the journal. A clone copies a prefix and replays it;
 * public and seat exports use projections. Agreed rollback is unfinished.
 * docs/STATE.md describes the file and visibility boundaries.
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
import type { WorkEntry } from "./work.ts";
import { advanceDraft } from "./work-tools.ts";
import { activate } from "./procedures.ts";
import type { Deck } from "./decks.ts";

export type Header = {
	/** The game id. Also the directory a published game lives in. */
	id: string;
	format: string;
	seed: string;
	/** Each seat's registered deck, so a replay registers the same lists. */
	seats: { id: SeatId; name: string; deck: Deck }[];
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
 * One line after the header. `v` counts decisions answered and names a clone
 * point. A frame's version counts table revisions, a different number. Cursor
 * changes write no receipt because replay derives them from the picks.
 *
 * A `prepared` line is what a model wrote before the game began: a seat's
 * brief, in whatever shape the context layer files it. It is a journal line
 * rather than a cache beside the journal, so a clone carries it and there is no
 * second format to keep in step. The core does not read it; it carries it, which
 * is why the shape is opaque here.
 */
export type Line =
	| { v: number; receipt: Receipt }
	| { v: number; row: LedgerRow }
	| { v: number; said: Said }
	| { v: number; work: WorkEntry }
	| { v: number; prepared: { seat: SeatId; made: unknown } };

/**
 * `saved` is a position in `linesOf`, not a count of writes.
 *
 * Those are two different numbers and conflating them cost the first gameplay
 * line per seat: `keep` writes a prepared line, which is in the file and is not
 * in `linesOf`, so counting it as progress through that list skipped a receipt.
 * Only `save` moves this.
 */
export type Journal = {
	path: string;
	header: Header;
	saved: number;
	/** What a resume cut off a torn last line, for the caller to report. */
	repaired?: string;
};

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
	return { path, header, saved: 0 };
}

/**
 * Pick up a journal that already holds a game, to append to it.
 *
 * A resumed game is the same game, so the file is added to rather than
 * replaced. `already` is the table the replay rebuilt, and its lines are the
 * ones the file holds, so the writes from here on are only the new ones.
 *
 * A torn last line is repaired before anything is written. `read` drops those
 * bytes from what it returns, but they are still in the file, and the next
 * append fused onto the fragment and made one unreadable line out of two. The
 * fragment was already not part of the game: dropping it on a read and keeping
 * it on disk is what turned a recoverable crash into a lost journal.
 */
export function reopen(path: string, header: Header, already: Table): Journal {
	if (!existsSync(path)) throw new Error(`No game at ${path} to resume.`);
	const torn = repair(path);
	const back = read(path);
	const rebuilt = linesOf(already);
	const recorded = back.lines.filter((line) => !("prepared" in line));
	// A crash inside a decision group can leave a receipt without its row, or
	// omit a setup group that replay derives. Reconcile to the durable decisions
	// before appending rather than skipping or duplicating reconstructed entries.
	const reconciled = back.truncated || recorded.length !== rebuilt.length;
	if (reconciled) writeFileSync(path, [JSON.stringify({ header }),
		...back.lines.filter((line) => "prepared" in line).map((line) => JSON.stringify(line)),
		...rebuilt.map((line) => JSON.stringify(line))].join("\n") + "\n");
	const repaired = [torn, reconciled ? back.truncated ?? "Reconstructed missing derived journal entries." : null].filter(Boolean).join(" ");
	return { path, header, saved: rebuilt.length, ...(repaired ? { repaired } : {}) };
}

export function append(journal: Journal, line: Line): void {
	appendFileSync(journal.path, `${JSON.stringify(line)}\n`);
}

/**
 * Write the gameplay lines this table has produced that the file does not hold.
 *
 * Returns how many went in. The caller does no arithmetic, because the one time
 * it did the counter it sliced with was counting something else.
 */
export function save(journal: Journal, table: Table): number {
	const lines = linesOf(table);
	const fresh = lines.slice(journal.saved);
	for (const line of fresh) append(journal, line);
	journal.saved = lines.length;
	return fresh.length;
}

/**
 * Cut a torn last line off a journal, so it can be appended to again.
 *
 * Returns what was removed, or null for a file that ends cleanly. The bytes it
 * drops are the ones `read` already refuses to count as part of the game.
 */
export function repair(path: string): string | null {
	const text = readFileSync(path, "utf8");
	if (!text.length || text.endsWith("\n")) return null;
	const end = text.lastIndexOf("\n");
	const torn = text.slice(end + 1);
	try {
		JSON.parse(torn);
		writeFileSync(path, `${text}\n`);
		return null;
	} catch { /* Only an incomplete JSON value is a torn line. */ }
	writeFileSync(path, text.slice(0, end + 1));
	return torn;
}

/** Every line a table has produced so far, in order, ready to append. */
export function linesOf(table: Table): Line[] {
	const lines: Line[] = [];
	// A receipt carries the decision count that produced it. A row's own version
	// is the one after it, so version zero is a game that has answered nothing.
	for (const receipt of table.log) lines.push({ v: receipt.at, receipt });
	for (const row of table.ledger) lines.push({ v: row.seq + 1, row });
	for (const said of table.said) lines.push({ v: said.at, said });
	for (const work of table.workLog) lines.push({ v: work.at, work });
	const clock = (line: Line): number => "receipt" in line ? line.receipt.clock ?? 0 : "row" in line ? line.row.clock ?? 0 : "work" in line ? line.work.clock : 0;
	return lines.sort((a, b) => a.v - b.v || clock(a) - clock(b));
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
	const durable = lines.reduce((last, line) => "row" in line ? Math.max(last, line.row.seq + 1) : last, 0);
	const complete = lines.filter((line) => line.v <= durable);
	if (complete.length !== lines.length) truncated = [truncated, `${path} ends before its decision group completed. Uncommitted entries were dropped.`].filter(Boolean).join(" ");
	return { header: opening.header, lines: complete, ...(truncated ? { truncated } : {}) };
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

/** What a model prepared before the game. A clone carries it, so it is not paid for twice. */
export const preparedIn = (lines: Line[]): { seat: SeatId; made: unknown }[] =>
	lines.flatMap((line) => ("prepared" in line ? [line.prepared] : []));

/** Equipment is private journal state, accepted once and carried through forks. */
export function restoreWork(table: Table, lines: Line[], upTo?: number): void {
	table.workLog = lines.flatMap((line) => "work" in line && (upTo === undefined || line.v <= upTo) ? [structuredClone(line.work)] : []);
	for (const entry of table.workLog) table.work[entry.seat] = structuredClone(entry.workspace);
	for (const row of table.ledger.filter((row) => row.execution)) {
		const execution = row.execution!;
		if (row.clock === undefined) throw new Error(`Executed draft step in ledger row ${row.seq} has no physical clock.`);
		const current = table.work[row.seat];
		if (current?.draft?.id !== execution.draft || current.draft.next !== execution.step) continue;
		const workspace = advanceDraft(current);
		table.work[row.seat] = workspace;
		table.workLog.push({ seq: table.workLog.length, at: row.seq + 1, clock: row.clock, seat: row.seat,
			actionId: execution.actionId, note: `Executed step ${workspace.draft!.next} of ${workspace.draft!.label}`, workspace: structuredClone(workspace) });
	}
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
		if (row.activation) activate(table, row.activation, { picked: row.picked, offered: row.offered, by: row.by, why: row.why, ...(row.execution ? { execution: row.execution } : {}) }, row.registered ?? {});
		else apply(table, row.picked, row.by, row.why, row.execution, row.registered ?? {});
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
): { table: Table; header: Header; prepared: { seat: SeatId; made: unknown }[] } {
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
	const table = relive(start(header), rowsOf(lines, upTo));
	restoreWork(table, lines, upTo);
	table.said = lines.flatMap((line) => "said" in line && (upTo === undefined || line.v <= upTo) ? [structuredClone(line.said)] : []);
	return {
		table,
		header,
		prepared: preparedIn(lines),
	};
}

/**
 * Copy a game up to a point. Everything up to that point, nothing after it.
 *
 * A clone is the same game continued, which is what keeps this simple: there is
 * no question of whether some part of the parent belongs to the child, because
 * all of it does. The header, the receipts, the decisions, the table talk and
 * what a model prepared for the seats all come across.
 *
 * This is also how a benchmark fixture is made. An interesting position frozen
 * at its version is a journal prefix, so there is no second format for fixtures
 * and there should never be one.
 *
 * Two points are worth knowing about. Version zero is a table that has been set
 * up and asked nothing, whose seats already hold what a model prepared for
 * them: clone there to vary the play without paying for a pregame again. Any
 * later version is a position: clone there to try a different line from it.
 *
 * The new journal carries `forkedFrom`, so the two share a prefix and the
 * difference between two lines of play is a diff of two files. Playing on needs
 * live players again, because the decisions past the clone belong to the parent.
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
 * Keep what a model prepared.
 *
 * Written at version zero, before anything is dealt, which is what makes a
 * clone at version zero a game with its pregame already paid for.
 */
export const keep = (journal: Journal, seat: SeatId, made: unknown): void =>
	append(journal, { v: 0, prepared: { seat, made } });

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
	const at = upTo ?? lines.reduce((last, line) => Math.max(last, line.v), 0);
	// The version is named in every mode. An export with no version is a claim
	// about a moment nobody can find again.
	const stamp = `${header.id} at version ${at}`;
	if (how.mode === "full") {
		return [JSON.stringify({ header }), ...lines.filter((line) => line.v <= at).map((line) => JSON.stringify(line))].join("\n") + "\n";
	}
	const table = relive(start(header), rowsOf(lines, at));
	restoreWork(table, lines, at);
	const view = project(table, how.mode === "seat" ? how.seat : "spectator");
	return [stamp, ...view.table, ...view.yours,
		...(view.decks ?? []).map((deck) => `Registered deck for seat ${deck.seat}: ${JSON.stringify(deck.cards)}`),
		...(view.work ? ["Your equipment:", JSON.stringify(view.work, null, 2)] : [])].join("\n");
}
