/**
 * The turn, in two sentences.
 *
 * This is the cheapest call in the game and one of the most reused. Every seat
 * reads it, it carries from turn to turn, and it is what lets a decision later
 * know what has been going on without carrying the whole log. So it is short on
 * purpose: two sentences, three if it must, and half a sentence per phase only
 * where that phase mattered.
 *
 * The announcer's view, which is not a courtesy but the only safe view. A
 * summary is shared with every seat and with a spectator, so it is built from
 * the spectator projection and can hold nothing private by construction. No
 * care at the point of use would fix a summary that knew a hand.
 */

import type { Receipt, Table } from "../core/table.ts";
import { describe, project } from "../core/view.ts";
import type { Reasoner } from "./reason.ts";

/** One turn's line, and what it was built from. */
export type Recap = {
	turn: number;
	/** The active seat's name, so a reader can place the line without the table. */
	active: string;
	line: string;
	/** Receipts this covers, as a log range, so a second run cannot double count. */
	from: number;
	to: number;
};

const SYSTEM = [
	"You are the commentator at a game of Magic: The Gathering. You are given the",
	"public events of one turn and you write what happened.",
	"",
	"Two sentences. Three only if the turn genuinely had three things in it. Half a",
	"sentence for a phase only where that phase mattered; a phase where nothing",
	"happened gets no words at all. Name cards and numbers. Past tense.",
	"",
	"What your answer does not promise. You were given public events only, so you do",
	"not know anybody's hand, anybody's library or why anything was done. Do not",
	"guess at a plan, do not predict the next turn, and do not say a seat is winning.",
	"Say what was done.",
	"",
	"No preamble, no headings, no bullet points.",
].join("\n");

/** The public events of one turn, as a reader would see them. */
export function events(table: Table, from: number, to: number): string[] {
	return table.log
		.slice(from, to)
		.map((receipt: Receipt) => describe(table, receipt))
		.filter(Boolean);
}

/**
 * Summarise the turn that just ended.
 *
 * `from` is the log length when the turn began. A turn with no public events is
 * not sent to a model: an untap, a draw and two passes is a turn a commentator
 * would skip, and paying for "nothing happened" hundreds of times is how a
 * cheap call stops being cheap.
 */
export async function recap(
	table: Table,
	reasoner: Reasoner,
	turn: { number: number; active: string; from: number },
): Promise<Recap | null> {
	const to = table.log.length;
	const said = events(table, turn.from, to);
	if (!said.length) return null;

	// Built from the spectator view, so nothing private can reach the request.
	const board = project(table, "spectator").table;
	const line = await reasoner.think(`turn ${turn.number}`, {
		system: SYSTEM,
		user:
			`Turn ${turn.number}. ${turn.active} was the active seat.\n\n` +
			`The board now:\n${board.join("\n")}\n\n` +
			`What happened, in order:\n${said.join("\n")}`,
	});
	return { turn: turn.number, active: turn.active, line, from: turn.from, to };
}

/**
 * The recent turns as a few lines, which is what a decision reads.
 *
 * Newest last, because that is the order a reader expects and the order the
 * events happened in. Bounded, because the whole history of a hundred turn game
 * is not context, it is a transcript.
 */
export const recent = (recaps: readonly Recap[], turns = 3): string[] =>
	recaps.slice(-turns).map((r) => `Turn ${r.turn}: ${r.line}`);
