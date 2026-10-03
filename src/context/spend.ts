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
	/** One brief snippet. Several are asked at once and each is a few lines. */
	pregame: 500,
	/** A phase plan: an order of operations and what would reopen it. */
	strategy: 500,
	/** A verdict, the rule it rests on, and the remedy. */
	judge: 700,
	/** Two sentences, three if it must. */
	summary: 200,
};

/** One request. */
export type Spend = {
	role: Role;
	/** What the request was for, so two pregame calls are tellable apart. */
	about: string;
	/** provider/id of the model that answered, which is not always the one asked for. */
	model: string;
	thinking?: ThinkingLevel;
	ms: number;
	/** The output ceiling asked for. Some routes price against this, not the reply. */
	ceiling: number;
	usage?: Usage;
	/** The reply stopped because it ran out of room. The prompt or the ceiling is wrong. */
	truncated?: boolean;
	/** Set when the call failed. The caller decides what that means. */
	failed?: string;
};

export type Tally = {
	record(spend: Spend): void;
	spent(): readonly Spend[];
};

export const tally = (): Tally => {
	const spends: Spend[] = [];
	return { record: (spend) => void spends.push(spend), spent: () => spends };
};

const sum = (spends: readonly Spend[], of: (usage: Usage) => number | undefined) =>
	spends.reduce((n, spend) => n + (spend.usage ? (of(spend.usage) ?? 0) : 0), 0);

/**
 * The bill, by role.
 *
 * Reasoning and cached tokens are shown beside the totals they are part of,
 * because the question they answer is different: reasoning tokens say whether a
 * thinking level is earning its cost, and cached reads say whether the prompts
 * are stable enough to be cached at all.
 */
export function bill(spends: readonly Spend[]): string[] {
	const roles = [...new Set(spends.map((spend) => spend.role))];
	const lines = roles.map((role) => {
		const mine = spends.filter((spend) => spend.role === role);
		const cost = mine.reduce((n, spend) => n + (spend.usage?.cost.total ?? 0), 0);
		const reasoning = sum(mine, (usage) => usage.reasoning);
		const cached = sum(mine, (usage) => usage.cacheRead);
		return (
			`${role.padEnd(9)} ${String(mine.length).padStart(4)} calls  ` +
			`${String(sum(mine, (u) => u.input)).padStart(7)} in  ` +
			`${String(sum(mine, (u) => u.output)).padStart(6)} out` +
			(reasoning ? ` (${reasoning} thinking)` : "") +
			(cached ? `  ${cached} cached` : "") +
			`  ${(mine.reduce((n, spend) => n + spend.ms, 0) / 1000).toFixed(1)}s` +
			`  $${cost.toFixed(4)}` +
			(mine.some((spend) => spend.truncated) ? "  TRUNCATED" : "") +
			(mine.some((spend) => spend.failed) ? `  ${mine.filter((s) => s.failed).length} failed` : "")
		);
	});
	const total = spends.reduce((n, spend) => n + (spend.usage?.cost.total ?? 0), 0);
	lines.push(`${"total".padEnd(9)} ${String(spends.length).padStart(4)} calls` + `  $${total.toFixed(4)}`);
	return lines;
}
