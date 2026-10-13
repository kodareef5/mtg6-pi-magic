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
 *
 * While the player chooses, the guest keeps reading its chair. An ask the host
 * closes in the meantime, because the clock ran out, the host rolled back or
 * the game ended, is dropped unanswered and the newer state is followed.
 */
export async function follow(guest: Guest, seat: {
	agree(what: Agreement, state: State): Promise<boolean>;
	player(state: State): Player | undefined;
	seen?(state: State): void;
}, signal?: AbortSignal): Promise<Outcome | undefined> {
	let after = -1, answered = 0, resets = 0, version = -1, next: State | undefined;
	const read = async (at: number, stop?: AbortSignal): Promise<State> => {
		for (;;) {
			try { return await guest.state(at, stop); }
			catch (error) {
				if (stop?.aborted) throw error;
				// A dropped poll is asked again; the host keeps the chair and its ask.
				await new Promise((wait) => setTimeout(wait, 1_000));
			}
		}
	};
	while (!signal?.aborted) {
		let state: State;
		if (next) { state = next; next = undefined; }
		else try { state = await read(after, signal); } catch { break; }
		after = state.serial;
		seat.seen?.(state);
		if (state.agreement) { await guest.agree({ what: state.agreement, yes: await seat.agree(state.agreement, state) }); continue; }
		const player = seat.player(state);
		if (player && state.resets !== resets) { resets = state.resets; player.reset?.(); }
		// Over, with a result or without one: a host's game can stop short of an outcome.
		if (state.outcome || state.stage === "over") { await player?.close(); return state.outcome; }
		if (!player || !state.frame) continue;
		if (state.ask !== undefined && state.ask > answered) {
			const ask = state.ask, watching = new AbortController(), stop = AbortSignal.any([watching.signal, ...(signal ? [signal] : [])]);
			answered = ask;
			version = state.frame.version;
			const thinking = player.answer(state.frame).then((answer) => ({ answer }));
			const moved = (async () => {
				for (let at = after; ;) {
					const seen = await read(at, stop);
					at = seen.serial;
					seat.seen?.(seen);
					if (seen.ask !== ask || seen.outcome || seen.stage === "over") return { moved: seen };
				}
			})();
			thinking.catch(() => {});
			moved.catch(() => {});
			const first = await Promise.race([thinking, moved]);
			watching.abort();
			// Stale means the table moved on; the next state carries the newer ask.
			if ("answer" in first) await guest.answer({ ask, answer: first.answer });
			else next = first.moved;
		} else if (state.frame.version !== version) {
			version = state.frame.version;
			player.observe(state.frame);
		}
	}
	return undefined;
}
