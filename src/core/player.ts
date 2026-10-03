/**
 * Who answers a seat, and everything a seat may do.
 *
 * A player is fully capable. It can take a move the table listed, or reach past
 * that list and move specific cards itself: tap this, untap that, put that card
 * in the graveyard. The listed moves exist so a player need not know the rules
 * and does not miss an opportunity. They are not a cage, and the table does not
 * ask whether a judge would call a declared move legal.
 *
 * A player may also choose to play badly. Skipping a chance is a decision
 * nobody else gets to overrule, and who is to say it was not deliberate.
 *
 * Four kinds of player, one interface. A decision model through src/context/, a
 * remote agent through src/seating/, a person at this Pi, an MCP client. The
 * last three load nothing from src/context/.
 */

import { MESSAGES, type MessageId } from "./say.ts";
import type { Change } from "./syntax.ts";
import type { Decision, Frame } from "./types.ts";

export type Answer =
	/** Take one of the moves the table listed. The cheap path, and the common one. */
	| { kind: "pick"; option: string; actionId: string }
	/**
	 * Move specific cards. `says` is the announcement: what this seat claims it
	 * is doing, in enough detail that another seat could check it. The table
	 * records the claim beside the motion, because that claim is what another
	 * seat accepts or objects to.
	 */
	| { kind: "declare"; changes: Change[]; says: string; actionId: string }
	/**
	 * Hand the turn to a model, in English. "Attack with everything that can
	 * profitably attack, hold the counterspell."
	 *
	 * It runs as a sequence of ordinary answers, so everything it does is
	 * recorded as this seat's own actions. Another seat acting interrupts it at
	 * the next boundary, because a plan written before that action may be the
	 * wrong plan after it.
	 */
	| { kind: "delegate"; instruction: string }
	/** Ask for more options, better targets, or a new plan. Returns to this same decision. */
	| { kind: "ask"; route: string }
	/** Object, and let the judge settle it. Any seat, whether or not it holds priority. */
	| { kind: "object"; claim: string }
	/** One of the fixed messages, at a phase ending. Flavour, and it changes nothing. */
	| { kind: "say"; message: MessageId }
	/**
	 * Give up the game.
	 *
	 * Available whenever this seat is asked anything. Concede to save the other
	 * seats from stepping through a result that is already decided, the way a
	 * chess player resigns. Not to avoid the work of a hard position: another
	 * seat can still play badly, and a game given away was not lost.
	 */
	| { kind: "concede" };

/** Validate the answer envelope; declaration conservation belongs to declare. */
export function usable(value: unknown, decision: Decision): value is Answer {
	if (!value || typeof value !== "object" || !("kind" in value)) return false;
	const text = (key: string) => key in value && typeof (value as Record<string, unknown>)[key] === "string";
	switch (value.kind) {
		case "pick": return text("actionId") && "option" in value && decision.options.some((o) => o.id === value.option);
		case "declare": return text("actionId") && text("says") && "changes" in value && Array.isArray(value.changes);
		case "object": return text("claim");
		case "delegate": return text("instruction");
		case "ask": return text("route");
		case "say": return "message" in value && typeof value.message === "string" && Object.hasOwn(MESSAGES, value.message);
		case "concede": return true;
		default: return false;
	}
}

export interface Player {
	readonly name: string;
	/** Called when this seat's frame carries a decision. No timer bounds it. */
	answer(frame: Frame): Promise<Answer>;
	/** The table moved and it is not this seat's turn. Returns nothing. */
	observe(frame: Frame): void;
	/**
	 * Asked at every phase ending. Null is the expected answer. Only a message
	 * or a concession comes through here; a move waits for this seat's turn.
	 *
	 * The rules let a seat concede at any moment, including mid resolution.
	 * This offers it at every phase ending and whenever the seat is asked, which
	 * is not the same thing, and the difference is a known limit.
	 */
	interject?(frame: Frame): Promise<Answer | null>;
	close(): void;
}

/** A seat that plays a fixed list of ids. For tests and for replaying a ledger. */
export function scriptedPlayer(name: string, picks: string[]): Player {
	let next = 0;
	return {
		name,
		async answer(frame) {
			const option = picks[next++];
			if (option === undefined) {
				throw new Error(
					`${name} ran out of picks at version ${frame.version}. Offered: ` +
						(frame.decision?.options.map((o) => o.id).join(", ") ?? "nothing"),
				);
			}
			return { kind: "pick", option, actionId: `${name}-${next}` };
		},
		observe() {},
		close() {},
	};
}
