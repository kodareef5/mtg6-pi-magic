/**
 * A table before its game: the seats, their decks, who plays first, and the
 * two agreements.
 *
 * The host sets the table and is never a seat. Nothing is dealt until every
 * seat has agreed twice: first to prepare, when decks register, card
 * assessments load and model seats write their briefs; then to begin, when the
 * hands are dealt and the mulligans start. A seat answered by a model agrees as
 * soon as it is asked. A person or a remote agent answers when it answers.
 */

import type { SeatId } from "../core/types.ts";

/**
 * Who answers a seat: a model in the host's Pi, or a guest over the wire who
 * brings its own player and models. `setAs` is the seat it was set up as before
 * the table was ordered: its roster, keys and chair follow it.
 */
export type SeatSetup = { deck: string; by: "ai" | "remote"; setAs?: SeatId };
export type Agreement = "prepare" | "begin";
export type Stage = "setting" | "preparing" | "prepared" | "playing" | "over";

export type Lobby = {
	game: keyof typeof GAME_TYPES;
	seats: SeatSetup[];
	/** A coin flip decides who plays first unless the host names a seat. */
	first: "coin" | SeatId;
	/** Seconds a guest seat has to answer each decision before it concedes, or null for no clock. */
	clock: number | null;
	stage: Stage;
	agreed: Record<Agreement, SeatId[]>;
};

/** Two minutes a decision, as a table setting: long enough for a person or a guest's models, short enough that a guest who left does not hold the table. */
export const CLOCK = 120;

export const GAME_TYPES = {
	"standard-alpha": { name: "Standard alpha: main decks only, one on one", seats: 2 },
} as const;

export function lobby(decks: readonly string[], game: keyof typeof GAME_TYPES = "standard-alpha"): Lobby {
	if (decks.length !== GAME_TYPES[game].seats) throw new Error(`${GAME_TYPES[game].name} seats ${GAME_TYPES[game].seats} players, not ${decks.length}.`);
	return { game, seats: decks.map((deck) => ({ deck, by: "ai" as const })), first: "coin", clock: CLOCK, stage: "setting", agreed: { prepare: [], begin: [] } };
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
