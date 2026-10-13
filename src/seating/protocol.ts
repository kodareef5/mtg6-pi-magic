/**
 * The wire: what a guest and the host say to each other over HTTP.
 *
 * docs/SEATING.md has the reasons. JSON bodies and long polling, because a
 * Cloudflare Quick Tunnel carries neither Server-Sent Events nor documented
 * WebSockets, any agent with curl can take a seat, and a request that names
 * the ask it answers and a fresh actionId needs no connection state. This file
 * holds the shapes and the invite, and imports nothing that runs the game.
 */

import { randomBytes } from "node:crypto";
import type { Answer } from "../core/player.ts";
import type { Deck } from "../core/decks.ts";
import type { Frame, Outcome, SeatId } from "../core/types.ts";
import type { WorkCommand } from "../core/work-language.ts";
import type { Agreement, Stage } from "./lobby.ts";

export const PROTOCOL = "pi-magic/1";

/** How long a poll is held open when nothing has changed. Under Cloudflare's 100 second origin timeout. */
export const HOLD_MS = 25_000;

/** `POST /v1/claim`. The first guest to present a chair's secret takes that chair. */
export type Claim = { protocol: string; table: string; secret: string; name: string };

/** The answer to a claim. `token` is the chair's from then on, sent as a bearer token. */
export type Welcome = {
	protocol: string; table: string; token: string; game: string;
	/** The chair as the host set it up, before a coin flip orders the table. */
	setAs: SeatId;
	/** Whether the table has a judge to hear objections. */
	judge: boolean;
};

/**
 * `GET /v1/state?after=<serial>`, held open until something this chair may
 * see changes. Everything in it is the chair's own or public: frames are the
 * host's projection for this seat, so a hidden card never travels.
 */
export type State = {
	serial: number;
	stage: Stage;
	paused?: true;
	/** The chair's seat at the table, once a coin flip has ordered it, and every seat's public registered list. */
	seat?: SeatId;
	seats?: { id: SeatId; name: string; deck: Deck }[];
	/** An agreement the host asks for that this chair has not answered. */
	agreement?: Agreement;
	/** The chair's latest frame. */
	frame?: Frame;
	/** Present when the frame asks for an answer. Answer each ask once. */
	ask?: number;
	/** The table's clock: seconds a seat has for each decision before it concedes. */
	clock?: number;
	/** Milliseconds left on this seat's clock for the open ask, when the state was sent. Paused, the clock stops. */
	remaining?: number;
	/** Rollbacks so far. A change means private work begun before it is stale. */
	resets: number;
	/** Turn recaps, written from the spectator view: the turn, its active seat, the line, and the log range it covers. */
	recaps: { turn: number; active: string; line: string; from: number; to: number }[];
	outcome?: Outcome;
};

/** `POST /v1/answer`: one answer to one ask. A pick, a work edit or a declaration carries a fresh actionId. */
export type Answering = { ask: number; answer: Answer };

/** `POST /v1/agree`. */
export type Agreeing = { what: Agreement; yes: boolean };

/** `POST /v1/work`: the chair's own equipment, edited while the game waits. */
export type Working = { tools: WorkCommand[]; revision: number; actionId: string };

export type Refusal = "stale" | "duplicate" | "not-your-turn" | "unknown-option" | "not-now" | "bad-request" | "bad-invite" | "seat-taken";
export type Result = { ok: true } | { ok: false; refused: Refusal; message?: string };

/**
 * An invite is a capability: whoever presents the secret first claims the
 * chair. It is an ordinary address with the secret after the `#`, which a
 * browser, a proxy or a log line never sends or records.
 */
export type Invite = { base: string; table: string; secret: string };

export function mintInvite(base: string, table: string): Invite {
	return { base: base.replace(/\/$/, ""), table, secret: randomBytes(32).toString("base64url") };
}

export const formatInvite = (invite: Invite): string => `${invite.base}/t/${invite.table}#${invite.secret}`;

/** Safe to print or log. */
export const redactInvite = (invite: Invite): string => `${invite.base}/t/${invite.table}#...`;

export function parseInvite(text: string): Invite {
	let url: URL;
	try { url = new URL(text.trim()); } catch { throw new Error("That is not an invite. Expected http(s)://host/t/<table>#<secret>"); }
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`An invite is an http or https address, not ${url.protocol}`);
	const table = /^\/t\/([A-Za-z0-9-]+)$/.exec(url.pathname)?.[1];
	if (!table) throw new Error("The invite names no table");
	const secret = url.hash.replace(/^#/, "");
	// 32 random bytes as base64url. A short secret is a typo or a truncated paste.
	if (secret.length < 43) throw new Error("The invite secret is missing or truncated");
	return { base: url.origin, table, secret };
}
