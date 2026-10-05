/**
 * What every model call cost.
 *
 * One record per request, for every role, so a change that doubles the token
 * bill is visible in the same run that shows it did not play better. Bulk
 * simulation is the point of this engine, which makes the unit cost of a game
 * a number worth watching rather than an afterthought.
 *
 * Recorded per call: the role, the model actually answered by, the thinking
 * level asked for, the wall time, the tokens in and out, the reasoning tokens
 * and the cached tokens where the provider reports them, and the cost at the
 * catalog price. Pi computes all of that; this keeps it.
 *
 * The output ceiling is here and not in the prompts because it is a price, not
 * a style. Some routes, OpenRouter among them, price a request against the
 * maximum output asked for rather than the output returned, so asking for
 * 128,000 tokens to receive 80 costs more than asking for 200. Every role
 * therefore names a deliberate ceiling, and a reply that hits it is recorded as
 * truncated rather than quietly accepted.
 */

import type { Usage } from "@earendil-works/pi-ai";
// pi-agent-core's level, because that is the one Pi's "model:level" patterns
// parse into and so the one a roster can hold. It includes "off".
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { Role } from "./roles.ts";

/**
 * How much output each role may ask for.
 *
 * Read these together with the prompt that uses them. A summary is two or three
 * sentences, so 200 tokens is loose rather than tight, and a ceiling a reply
 * never reaches costs nothing in quality and saves money on every call.
 */
export const CEILING: Record<Role, number> = {
	/** A classifier returns a choice and a distribution. We do not size its output. */
	decide: 0,
	/** One analyst's findings; the brief asks for more where the synthesis writes every field. */
	pregame: 2000,
	/** A plan update and any new instructions. Thinking counts against it too. */
	strategy: 4000,
	/** A verdict, the rule it rests on, and the remedy. */
	judge: 700,
	/** Two sentences, three if it must. */
	summary: 200,
};

/** A card assessment may include several casting modes, registrations and their full source quotes. */
export const ASSESSMENT_CEILING = 4000;

/** One request. */
export type Spend = {
	role: Role;
	seat?: number;
	/** What the request was for, so two pregame calls are tellable apart. */
	about: string;
	/** provider/id of the model that answered, which is not always the one asked for. */
	model: string;
	/** Kept when the reply identifies a different model. */
	requestedModel?: string;
	thinking?: ThinkingLevel;
	/** When the request started, in epoch milliseconds, so overlapping calls are not summed as waiting. */
	at?: number;
	ms: number;
	/** A hash of the system prompt and tools: two calls with the same one share a cacheable prefix and a prompt version. */
	prompt?: string;
	/** The output ceiling asked for. Some routes price against this, not the reply. */
	ceiling: number;
	usage?: Usage;
	/** The reply stopped because it ran out of room. The prompt or the ceiling is wrong. */
	truncated?: boolean;
	/** Set when the call failed. The caller decides what that means. */
	failed?: string;
	/** Pending preparation was deliberately discarded, rather than a model failure. */
	cancelled?: true;
	/** Recorded before dispatch, cleared when the request settles. */
	pending?: true;
};

export type Tally = {
	record(spend: Spend): void;
	spent(): readonly Spend[];
};

export const tally = (): Tally => {
	const spends: Spend[] = [];
	return { record: (spend) => void spends.push(spend), spent: () => spends };
};

/** Count dispatch immediately. Settlement updates that same attempt, never adds a second one. */
export function meter(counted: Tally | undefined, request: Omit<Spend, "ms">): (reply: Partial<Spend>) => void {
	const spend: Spend = { ...request, at: request.at ?? Date.now(), ms: 0, pending: true };
	counted?.record(spend);
	return (reply) => {
		if (reply.model && reply.model !== spend.model) spend.requestedModel = spend.model;
		Object.assign(spend, reply, { ms: Date.now() - spend.at! });
		delete spend.pending;
	};
}

export { bill } from "./metrics.ts";
