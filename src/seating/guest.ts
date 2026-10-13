/**
 * The guest's side of the wire: claim a chair, then follow it.
 *
 * A guest holds nothing of the game but the last state its chair sent. It
 * answers each ask once, tells its player what it observes, and lets the host
 * judge: a stale answer is dropped and the newer state answered instead. The
 * player can be anything that answers a frame, a model seat or a person.
 */

import type { Player } from "../core/player.ts";
import type { Outcome } from "../core/types.ts";
import type { Agreement } from "./lobby.ts";
import { HOLD_MS, PROTOCOL, parseInvite, type Agreeing, type Answering, type Claim, type Result, type State, type Welcome, type Working } from "./protocol.ts";

export type Guest = Awaited<ReturnType<typeof join>>;

export async function join(invite: string, name: string) {
	const { base, table, secret } = parseInvite(invite);
	const call = async <T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> => {
		const { token, ...rest } = init;
		const response = await fetch(`${base}${path}`, { ...rest, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
		const body = await response.json() as T & { ok?: boolean; message?: string };
		if (!response.ok) throw new Error(body.message ?? `The host answered ${response.status}.`);
		return body;
	};
	const welcome = await call<Welcome>("/v1/claim", { method: "POST", body: JSON.stringify({ protocol: PROTOCOL, table, secret, name } satisfies Claim) });
	const post = <T>(path: string, value: T) => call<Result>(path, { method: "POST", body: JSON.stringify(value), token: welcome.token });
	return {
		welcome,
		/** Held open by the host until something changes past `after`, or about 25 seconds. */
		state: (after: number, signal?: AbortSignal) => call<State>(`/v1/state?after=${after}`, { token: welcome.token, signal: AbortSignal.any([AbortSignal.timeout(HOLD_MS + 15_000), ...(signal ? [signal] : [])]) }),
		answer: (value: Answering) => post("/v1/answer", value),
		agree: (value: Agreeing) => post("/v1/agree", value),
		work: (value: Working) => post("/v1/work", value),
	};
}

/**
 * Drive a player from the wire until the game is over or `signal` aborts.
 * `agree` decides what this seat says to each agreement, and may wait, as a
 * seat preparing its own models does before it agrees to begin. `player` is
 * the seat's player once it has one.
 */
export async function follow(guest: Guest, seat: {
	agree(what: Agreement, state: State): Promise<boolean>;
	player(state: State): Player | undefined;
	seen?(state: State): void;
}, signal?: AbortSignal): Promise<Outcome | undefined> {
	let after = -1, answered = 0, resets = 0, version = -1;
	while (!signal?.aborted) {
		let state: State;
		try { state = await guest.state(after, signal); }
		catch (error) {
			if (signal?.aborted) break;
			// A dropped poll is asked again; the host keeps the chair and its ask.
			await new Promise((wait) => setTimeout(wait, 1_000));
			continue;
		}
		after = state.serial;
		seat.seen?.(state);
		if (state.agreement) { await guest.agree({ what: state.agreement, yes: await seat.agree(state.agreement, state) }); continue; }
		const player = seat.player(state);
		if (player && state.resets !== resets) { resets = state.resets; player.reset?.(); }
		// Over, with a result or without one: a host's game can stop short of an outcome.
		if (state.outcome || state.stage === "over") { await player?.close(); return state.outcome; }
		if (!player || !state.frame) continue;
		if (state.ask !== undefined && state.ask > answered) {
			answered = state.ask;
			version = state.frame.version;
			// Stale means the table moved on; the next state carries the newer ask.
			await guest.answer({ ask: state.ask, answer: await player.answer(state.frame) });
		} else if (state.frame.version !== version) {
			version = state.frame.version;
			player.observe(state.frame);
		}
	}
	return undefined;
}
