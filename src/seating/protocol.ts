/**
 * The wire. Seven messages and an invite.
 *
 * Read docs/PROTOCOL.md for the reasons. This file holds the shapes, the invite
 * format, and one decoder. It imports nothing but node crypto, so a guest needs
 * no engine to talk.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { Frame, Outcome, SeatId } from "../core/types.ts";

export const PROTOCOL = "pi-magic/0";
export const SCHEME = "pimagic:";

/** A guest sends two messages. */
export type Hello = {
	type: "hello";
	protocol: string;
	table: string;
	secret: string;
	name: string;
};

export type Act = {
	type: "act";
	seat: SeatId;
	/** The version of the frame this answers. The host refuses a stale one. */
	version: number;
	/** Fresh per attempt. Replaying it changes the game once. */
	actionId: string;
	option: string;
};

export type GuestMessage = Hello | Act;

/** The host sends five. */
export type Welcome = {
	type: "welcome";
	protocol: string;
	table: string;
	game: string;
	seat: SeatId;
	seats: number;
};

/**
 * Every push carries a frame. A frame with a decision means it is this seat's
 * turn. One message means a view and a turn notice can never disagree.
 *
 * `Frame` is the engine's own shape, from types.ts. The wire only wraps it.
 */
export type FrameMessage = { type: "frame" } & Frame;

export type Refusal = "stale" | "duplicate" | "not-your-turn" | "unknown-option";

export type Result =
	| { type: "result"; actionId: string; ok: true }
	| { type: "result"; actionId: string; ok: false; refused: Refusal };

export type Over = { type: "over"; version: number; outcome: Outcome };

export type ErrorCode = "bad-protocol" | "bad-invite" | "seat-taken" | "bad-message";

export type ErrorMessage = { type: "error"; code: ErrorCode; message: string };

export type HostMessage = Welcome | FrameMessage | Result | Over | ErrorMessage;

export type Message = GuestMessage | HostMessage;

const TYPES = new Set([
	"hello",
	"act",
	"welcome",
	"frame",
	"result",
	"over",
	"error",
]);

/** Returns null for anything this version does not recognise. The caller answers with `bad-message`. */
export function decode(raw: string | Buffer): Message | null {
	let value: unknown;
	try {
		value = JSON.parse(typeof raw === "string" ? raw : raw.toString("utf8"));
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null) return null;
	const type = (value as { type?: unknown }).type;
	if (typeof type !== "string" || !TYPES.has(type)) return null;
	return value as Message;
}

export function encode(message: Message): string {
	return JSON.stringify(message);
}

/**
 * An invite is a capability: whoever presents this secret first claims the
 * seat. The secret sits after the `#` so that it stays out of a request line
 * when the invite travels through anything that speaks HTTP.
 */
export type Invite = {
	host: string;
	port: number;
	table: string;
	secret: string;
};

export function mintInvite(host: string, port: number): Invite {
	return {
		host,
		port,
		table: randomUUID().replaceAll("-", "").slice(0, 12),
		secret: randomBytes(32).toString("base64url"),
	};
}

export function formatInvite(invite: Invite): string {
	return `${SCHEME}//${invite.host}:${invite.port}/${invite.table}#${invite.secret}`;
}

/** Safe to print or log. */
export function redactInvite(invite: Invite): string {
	return `${SCHEME}//${invite.host}:${invite.port}/${invite.table}#...`;
}

export function parseInvite(text: string): Invite {
	let url: URL;
	try {
		url = new URL(text.trim());
	} catch {
		throw new Error("That is not an invite. Expected pimagic://host:port/table#secret");
	}
	if (url.protocol !== SCHEME) throw new Error(`Wrong scheme: ${url.protocol}`);
	const table = url.pathname.replace(/^\//, "");
	const secret = url.hash.replace(/^#/, "");
	if (!url.hostname || !url.port) throw new Error("The invite names no host and port");
	if (!table) throw new Error("The invite names no table");
	// 32 random bytes as base64url. A short secret is a typo or a truncated paste.
	if (secret.length < 43) throw new Error("The invite secret is missing or truncated");
	return { host: url.hostname, port: Number(url.port), table, secret };
}
