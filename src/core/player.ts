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
import { commands, type WorkCommand } from "./work-language.ts";

export type Answer =
	/** Take one of the moves the table listed. The cheap path, and the common one. */
	| { kind: "pick"; option: string; actionId: string }
	/** Edit private equipment atomically. It neither answers priority nor moves cards. */
	| { kind: "work"; tools: WorkCommand[]; revision: number; actionId: string }
	/** Execute the current ready step against the live table, then record progress. */
	| { kind: "execute"; draft: string; revision: number; actionId: string }
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

/**
 * Why this answer cannot be taken, or null when it can.
 *
 * The reason is written for whoever sent the answer, because the retry shows it
 * and a retry that says only "not usable" buys nothing: the same answer comes
 * back. Declaration conservation belongs to declare, not here.
 */
export function refuse(value: unknown, decision: Decision): string | null {
	const kinds = "pick, work, execute, declare, delegate, ask, object, say or concede";
	if (!value || typeof value !== "object" || !("kind" in value)) {
		return `An answer is an object with a kind: ${kinds}.`;
	}
	const text = (key: string) => key in value && typeof (value as Record<string, unknown>)[key] === "string";
	const needs = (key: string, what: string) => text(key) ? null : `A ${String(value.kind)} needs ${what}.`;
	switch (value.kind) {
		case "work":
		case "execute": {
			if (!text("actionId")) return "A seat tool needs a string actionId.";
			const revision = (value as { revision?: unknown }).revision;
			if (!Number.isInteger(revision) || (revision as number) < 0) return "A seat tool needs its equipment revision.";
			if (value.kind === "execute") return needs("draft", "a draft id");
			try { commands((value as { tools?: unknown }).tools); return null; }
			catch (error) { return String(error); }
		}
		case "pick": {
			if (!text("actionId")) return "A pick needs a string actionId.";
			const picked = (value as { option?: unknown }).option;
			if (decision.options.some((o) => o.id === picked)) return null;
			return `No option ${JSON.stringify(picked)}. Answer with one of: ${decision.options.map((o) => o.id).join(", ")}.`;
		}
		case "declare":
			if (!Array.isArray((value as { changes?: unknown }).changes)) return "A declaration needs a changes array.";
			return needs("actionId", "a string actionId") ?? needs("says", "a says line another seat could check");
		case "object": return needs("claim", "a claim");
		case "delegate": return needs("instruction", "an instruction");
		case "ask": return needs("route", "a route");
		case "say": {
			const message = (value as { message?: unknown }).message;
			if (typeof message === "string" && Object.hasOwn(MESSAGES, message)) return null;
			return `No message ${JSON.stringify(message)}. The messages are: ${Object.keys(MESSAGES).join(", ")}.`;
		}
		case "concede": return null;
		default: return `No answer kind ${JSON.stringify(value.kind)}. The kinds are ${kinds}.`;
	}
}

/** The narrowing form. It exists because a reason cannot narrow a type. */
export const usable = (value: unknown, decision: Decision): value is Answer =>
	refuse(value, decision) === null;

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
