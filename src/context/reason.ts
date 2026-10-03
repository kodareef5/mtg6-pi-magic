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
 * Every call is recorded. A role that answers well and costs four times as much
 * as the alternative is a choice somebody should get to make with the numbers in
 * front of them, which is the whole reason `spend.ts` exists.
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

export type Reasoner = {
	/** provider/id, for the gap text and the bill. */
	readonly named: string;
	/**
	 * One question, one answer, as text.
	 *
	 * `about` names what the call was for and lands in the bill, so two pregame
	 * questions are tellable apart without reading the prompt back.
	 */
	think(about: string, prompt: { system: string; user: string }, ceiling?: number): Promise<string>;
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

export function reasoner(options: {
	role: Role;
	stream: Stream;
	model: Model<Api>;
	thinking?: ThinkingLevel;
	tally: Tally;
	signal?: AbortSignal;
}): Reasoner {
	const named = `${options.model.provider}/${options.model.id}`;
	return {
		named,
		async think(about, prompt, ceiling = CEILING[options.role]) {
			const began = Date.now();
			const base = {
				role: options.role,
				about,
				model: named,
				ceiling,
				...(options.thinking ? { thinking: options.thinking } : {}),
			};
			try {
				const reply = await options
					.stream(
						options.model,
						{ systemPrompt: prompt.system, messages: [{ role: "user", content: prompt.user }] },
						{
							maxTokens: ceiling,
							// "off" is the absence of thinking, not a level to ask for.
							...(options.thinking && options.thinking !== "off"
								? { reasoning: options.thinking }
								: {}),
							...(options.signal ? { signal: options.signal } : {}),
						},
					)
					.result();
				const ms = Date.now() - began;
				const usage = reply.usage as { input: number } | undefined;
				options.tally.record({
					...base,
					ms,
					...(usage ? { usage: usage as never } : {}),
					...(reply.stopReason === "length" ? { truncated: true } : {}),
					...(reply.stopReason === "error" ? { failed: reply.errorMessage ?? "error" } : {}),
				});
				if (reply.stopReason === "error" || reply.stopReason === "aborted") {
					throw new Error(`${named} ${reply.stopReason}: ${reply.errorMessage ?? "no reason given"}`);
				}
				const text = textOf(reply.content);
				if (!text) throw new Error(`${named} returned no text for ${about}`);
				return text;
			} catch (error) {
				// Recorded either way. A failed call still took time and may have
				// been charged, and a bill that hides failures understates the run.
				if (!options.tally.spent().some((spend) => spend.about === about && spend.ms)) {
					options.tally.record({ ...base, ms: Date.now() - began, failed: String(error) });
				}
				throw error;
			}
		},
	};
}
