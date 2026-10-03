/**
 * The reasoning roles, and the one adapter that reaches them.
 *
 * Four of the five roles are chat models rather than classifiers, because they
 * are asked to think rather than to choose: what this deck is for, how to spend
 * this phase, whether a move was legal, what happened this turn. Their output is
 * read by us and turned into something small, never shown to a player raw.
 *
 * One adapter for all four, because the difference between them is the prompt
 * and the ceiling, not the plumbing. Pi authenticates the request and prices it.
 *
 * Retry lives here, which is the opposite of `model.ts`. The decision adapter
 * holds no retry policy because the core loop owns it for every kind of player,
 * and a retried pick has to be recorded as a pick. Nothing owns a failed brief,
 * so this does.
 *
 * Past 150 lines because telling a blip from a broken configuration, and
 * stopping once it is the configuration, is the point of the file rather than a
 * detail of it.
 */

import type { Api, Model, ThinkingLevel as Reasoning } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { Role } from "./roles.ts";
import { CEILING, type Tally } from "./spend.ts";

/** The part of Pi this uses. `ctx.modelRegistry` satisfies it, and a double can too. */
export type Stream = (
	model: Model<Api>,
	context: { systemPrompt?: string; messages: { role: "user"; content: string }[] },
	options?: { reasoning?: Reasoning; maxTokens?: number; signal?: AbortSignal },
) => { result(): Promise<{ content: unknown[]; usage?: unknown; stopReason: string; errorMessage?: string }> };

/**
 * Worth trying again, or not.
 *
 * A rate limit, an overloaded provider and a dropped socket are the same
 * request arriving at a bad moment. A rejected key, an unknown model and a
 * malformed request are the configuration being wrong, and trying those again
 * wastes time and money to reach the same answer.
 *
 * Matched on the message because that is what Pi passes through. Anything
 * unrecognised counts as transient once: the cost of one extra attempt is a
 * second, and the cost of abandoning a brief over a blip is a worse game.
 */
const SETTLED = /\b(401|403|404|invalid[_ -]?api[_ -]?key|unauthorized|forbidden|no such model|model not found|unsupported|invalid[_ -]?request|context[_ -]?length)\b/i;
export const transient = (why: string): boolean => !SETTLED.test(why);

export type Reasoner = {
	/** provider/id, for the gap text and the bill. */
	readonly named: string;
	/**
	 * One question, one answer, as text.
	 *
	 * `about` names what the call was for and lands in the bill, so two pregame
	 * questions are tellable apart without reading the prompt back.
	 *
	 * Throws when every attempt failed, or when this reasoner has given up. What
	 * it does not promise: a returned answer is text a model wrote, checked only
	 * for being non-empty, so the caller still has to make something small and
	 * typed out of it.
	 */
	think(about: string, prompt: { system: string; user: string }, ceiling?: number): Promise<string>;
	/**
	 * Why this reasoner stopped answering, or null while it is working.
	 *
	 * Set once the configuration is wrong, or once enough calls in a row have
	 * failed that the next one is not worth making. A caller checks it to tell a
	 * run that degraded from a run that never started: a hundred failing recaps
	 * is one broken model, not a hundred problems, and it should read that way.
	 */
	broken(): string | null;
};

/** Pull the text out, ignoring the thinking blocks. We asked for a conclusion. */
const textOf = (content: unknown[]): string =>
	content
		.filter((part): part is { type: "text"; text: string } => {
			const it = part as { type?: unknown; text?: unknown };
			return it.type === "text" && typeof it.text === "string";
		})
		.map((part) => part.text)
		.join("\n")
		.trim();

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function reasoner(options: {
	role: Role;
	stream: Stream;
	model: Model<Api>;
	thinking?: ThinkingLevel;
	tally: Tally;
	signal?: AbortSignal;
	/** Attempts per question, including the first. */
	attempts?: number;
	/** Consecutive failed questions before this reasoner stops trying. */
	patience?: number;
	/** Backoff before the second attempt. Doubled after that. Zero in tests. */
	backoffMs?: number;
}): Reasoner {
	const named = `${options.model.provider}/${options.model.id}`;
	const attempts = options.attempts ?? 3;
	const patience = options.patience ?? 3;
	const backoff = options.backoffMs ?? 500;
	let consecutive = 0;
	let gaveUp: string | null = null;

	/** One attempt. Recorded whether it worked, because a failed call still costs. */
	async function once(about: string, prompt: { system: string; user: string }, ceiling: number): Promise<string> {
		const began = Date.now();
		const base = {
			role: options.role,
			about,
			model: named,
			ceiling,
			...(options.thinking ? { thinking: options.thinking } : {}),
		};
		let reply: Awaited<ReturnType<ReturnType<Stream>["result"]>>;
		try {
			reply = await options
				.stream(
					options.model,
					{ systemPrompt: prompt.system, messages: [{ role: "user", content: prompt.user }] },
					{
						maxTokens: ceiling,
						// "off" is the absence of thinking, not a level to ask for.
						...(options.thinking && options.thinking !== "off" ? { reasoning: options.thinking } : {}),
						...(options.signal ? { signal: options.signal } : {}),
					},
				)
				.result();
		} catch (error) {
			options.tally.record({ ...base, ms: Date.now() - began, failed: String(error) });
			throw error;
		}

		const usage = reply.usage as { input: number } | undefined;
		const text = textOf(reply.content);
		const wrong =
			reply.stopReason === "error" || reply.stopReason === "aborted"
				? `${named} ${reply.stopReason}: ${reply.errorMessage ?? "no reason given"}`
				: !text
					? `${named} returned no text for ${about}`
					: null;
		options.tally.record({
			...base,
			ms: Date.now() - began,
			...(usage ? { usage: usage as never } : {}),
			...(reply.stopReason === "length" ? { truncated: true } : {}),
			...(wrong ? { failed: wrong } : {}),
		});
		if (wrong) throw new Error(wrong);
		return text;
	}

	return {
		named,
		broken: () => gaveUp,
		async think(about, prompt, ceiling = CEILING[options.role]) {
			if (gaveUp) throw new Error(`${named} stopped answering: ${gaveUp}`);
			const failures: string[] = [];
			for (let attempt = 1; attempt <= attempts; attempt++) {
				try {
					const text = await once(about, prompt, ceiling);
					consecutive = 0;
					return text;
				} catch (error) {
					const why = String(error);
					failures.push(why);
					// A settled problem gives the same answer every time. Stop now,
					// and stop this reasoner, so one bad configuration is reported
					// once rather than once per question.
					if (!transient(why)) {
						gaveUp = why;
						break;
					}
					if (attempt < attempts) await wait(backoff * 2 ** (attempt - 1));
				}
			}
			consecutive += 1;
			if (!gaveUp && consecutive >= patience) {
				gaveUp = `${consecutive} questions in a row failed. Last: ${failures.at(-1)}`;
			}
			throw new Error(`${named} failed ${about} after ${failures.length}: ${failures.join(" | ")}`);
		},
	};
}
