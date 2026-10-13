/**
 * A table before its game: the seats, their decks, looks, models and keys, who
 * plays first, and the two agreements.
 *
 * The host runs every seat. What differs is who pilots it: a seat piloted by
 * its AI plays the AI's picks, and a seat piloted by a player shows the AI's
 * picks to the player as suggestions. Each seat has a code, and whoever holds
 * it sees that seat and acts for it. Nothing is dealt until every seat has
 * agreed twice, to the table as it is set: first to prepare, when decks
 * register, card assessments load and seats write their briefs; then to begin,
 * when the hands are dealt and the mulligans start. A seat its AI pilots agrees
 * as soon as it is asked; a player answers when they answer.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import type { SeatId } from "../core/types.ts";
import { choose, deal, type Colors, type Look } from "../board/looks.ts";

export type Pilot = "ai" | "player";

/**
 * Whose OpenRouter key pays for a seat's model calls: the game's, the one the
 * seat's player gave, or one the host names as an environment variable
 * (`$OPENROUTER_SEAT_1`). The key itself is never here.
 */
export type KeyFrom = "game" | "player" | `$${string}`;

/**
 * `setAs` is the seat it was set up as before the table was ordered: its
 * roster, keys and look follow it. `models` are role patterns over the table's
 * roster for this seat alone, which is how two models play each other.
 */
export type SeatSetup = { deck: string; setAs?: SeatId; look: Look; pilot: Pilot; models: Record<string, string>; key: KeyFrom; code: string };
export type Agreement = "prepare" | "begin";
export type Stage = "setting" | "preparing" | "prepared" | "playing" | "over";

export type Lobby = {
	game: keyof typeof GAME_TYPES;
	seats: SeatSetup[];
	/** A coin flip decides who plays first unless the host names a seat. */
	first: "coin" | SeatId;
	/** Seconds a player has to answer each decision before their seat concedes, or null for no clock. */
	clock: number | null;
	/** The background of the host's pictures, which show the table as a spectator sees it, and their frame colours when set. */
	background: string;
	colors?: Colors;
	stage: Stage;
	agreed: Record<Agreement, SeatId[]>;
};

/** Two minutes a decision, as a table setting: long enough for a person, short enough that a player who left does not hold the table. */
export const CLOCK = 120;

export const GAME_TYPES = {
	"standard-alpha": { name: "Standard alpha: main decks only, one on one", seats: 2 },
} as const;

/** 32 random bytes: a seat's code, which nobody guesses. */
export const seatCode = () => randomBytes(32).toString("base64url");

export function lobby(decks: readonly string[], game: keyof typeof GAME_TYPES = "standard-alpha"): Lobby {
	if (decks.length !== GAME_TYPES[game].seats) throw new Error(`${GAME_TYPES[game].name} seats ${GAME_TYPES[game].seats} players, not ${decks.length}.`);
	const looks = deal(decks.length);
	return { game, seats: decks.map((deck, at) => ({ deck, look: looks[at]!, pilot: "ai" as const, models: {}, key: "game" as const, code: seatCode() })),
		first: "coin", clock: CLOCK, background: choose("backgrounds", "random"), stage: "setting", agreed: { prepare: [], begin: [] } };
}

/** The seat a code opens, by its place at the table, compared in constant time. */
export function seatOf(table: Lobby, code: string): number | undefined {
	const given = Buffer.from(code);
	const at = table.seats.findIndex((one) => { const mine = Buffer.from(one.code); return mine.length === given.length && timingSafeEqual(mine, given); });
	return at < 0 ? undefined : at;
}

/**
 * Ask every seat at once. The agreement holds only when every seat said yes;
 * a seat that declined is named, and asking again asks everyone again.
 */
export async function agree(table: Lobby, what: Agreement, ask: (seat: SeatId, setup: SeatSetup) => Promise<boolean>): Promise<SeatId[]> {
	const answers = await Promise.all(table.seats.map((setup, seat) => ask(seat, setup)));
	table.agreed[what] = answers.flatMap((yes, seat) => yes ? [seat] : []);
	return answers.flatMap((yes, seat) => yes ? [] : [seat]);
}

/** Seat order for the game. Seat 0 takes the first turn, so whoever plays first sits first. */
export function seatOrder(table: Lobby, flip: () => number = Math.random): { order: number[]; first: number; by: "coin" | "host" } {
	const first = table.first === "coin" ? Math.floor(flip() * table.seats.length) : table.first;
	if (!Number.isInteger(first) || first < 0 || first >= table.seats.length) throw new Error(`No seat ${first} to play first.`);
	return { order: table.seats.map((_, at) => (first + at) % table.seats.length), first, by: table.first === "coin" ? "coin" : "host" };
}
