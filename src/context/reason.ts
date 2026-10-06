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
import { createHash } from "node:crypto";

import type { Api, Model, ThinkingLevel as Reasoning } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

import type { Role } from "./roles.ts";
import { CEILING, meter, type Tally } from "./spend.ts";

/** The part of Pi this uses. `ctx.modelRegistry` satisfies it, and a double can too. */
export type Stream = (
	model: Model<Api>,
	context: { systemPrompt?: string; messages: unknown[]; tools?: ToolSpec[] },
	options?: { reasoning?: Reasoning; maxTokens?: number; signal?: AbortSignal; sessionId?: string },
) => { result(): Promise<Reply> };
type Reply = { provider?: string; model?: string; role?: "assistant"; content: unknown[]; usage?: unknown; stopReason: string; errorMessage?: string };

/** A tool as the provider reads it: a name, what it is for, and JSON Schema parameters. */
export type ToolSpec = { name: string; description: string; parameters: object };
/** A tool our code answers while the model works, such as looking up a rule. */
export type Lookup = ToolSpec & { answer(args: Record<string, unknown>): string };
/** The one tool that ends the work. `check` says what is wrong with an answer, or null to take it. */
export type Submission = ToolSpec & { check(args: Record<string, unknown>): string | null };

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
	 * One task in a short conversation with tools. The model may call lookups,
	 * which are answered, and finishes by calling `submit`. An answer that is
	 * prose, cut off, or fails `check` goes back to the model with the problem
	 * named, up to `turns` replies in all. The final reply offers only submit,
	 * so reference lookups cannot consume the delivery slot. Returns accepted arguments.
	 */
	work(about: string, prompt: { system: string; user: string; task?: string }, tools: { submit: Submission; lookups?: Lookup[]; turns?: number; signal?: AbortSignal }, ceiling?: number): Promise<Record<string, unknown>>;
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
/** How long one request may take before it is abandoned and tried again. Generous: thinking takes time. */
const TIMEOUT: Record<Role, number> = { decide: 60_000, pregame: 240_000, strategy: 150_000, judge: 150_000, summary: 60_000 };

export function reasoner(options: {
	role: Role;
	stream: Stream;
	model: Model<Api>;
	thinking?: ThinkingLevel;
	tally: Tally;
	seat?: number;
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

	/** One request. Recorded whether it worked, because a failed call still costs. */
	async function call(about: string, system: string, messages: unknown[], ceiling: number, tools?: ToolSpec[], taskSignal?: AbortSignal): Promise<Reply> {
		taskSignal?.throwIfAborted();
		options.signal?.throwIfAborted();
		const began = Date.now();
		const prompt = createHash("sha256").update(system).update(JSON.stringify(tools ?? [])).digest("hex").slice(0, 16);
		const finish = meter(options.tally, {
			role: options.role,
			type: "chat",
			seat: options.seat,
			about,
			model: named,
			ceiling,
			at: began,
			prompt,
			...(options.thinking ? { thinking: options.thinking } : {}),
		});
		let reply: Awaited<ReturnType<ReturnType<Stream>["result"]>>;
		// A reply that never comes would stall the game forever: past the limit it is abandoned and tried again.
		const limit = new AbortController();
		const timer = setTimeout(() => limit.abort(new Error(`timed out after ${TIMEOUT[options.role] / 1000}s`)), TIMEOUT[options.role]);
		timer.unref();
		const signal = AbortSignal.any([limit.signal, ...[options.signal, taskSignal].filter((one): one is AbortSignal => !!one)]);
		let aborted: (() => void) | undefined;
		try {
			const pending = options
				.stream(
					options.model,
					{ systemPrompt: system, messages, ...(tools ? { tools } : {}) },
					{
						maxTokens: ceiling,
						// The cache key: calls with the same system prompt share a prefix, and a
						// provider that keys its prompt cache on the session reuses it only when told.
						sessionId: `pi-magic-${options.role}-${prompt}`,
						// "off" is the absence of thinking, not a level to ask for.
						...(options.thinking && options.thinking !== "off" ? { reasoning: options.thinking } : {}),
						signal,
					},
				)
				.result();
			reply = await Promise.race([pending, new Promise<never>((_, reject) => {
				aborted = () => reject(signal.reason);
				signal.addEventListener("abort", aborted, { once: true });
				if (signal.aborted) aborted();
			})]);
		} catch (error) {
			finish({
				...(taskSignal?.aborted ? { cancelled: true } : { failed: String(error) }) });
			throw error;
		} finally {
			clearTimeout(timer);
			if (aborted) signal.removeEventListener("abort", aborted);
		}

		const usage = reply.usage as { input: number } | undefined;
		const wrong = reply.stopReason === "error" || reply.stopReason === "aborted"
			? `${named} ${reply.stopReason}: ${reply.errorMessage ?? "no reason given"}`
			: !tools && !textOf(reply.content) ? `${named} returned no text for ${about}` : null;
		finish({
			...(reply.provider && reply.model ? { model: `${reply.provider}/${reply.model}` } : {}),
			...(usage ? { usage: usage as never } : {}),
			...(reply.stopReason === "length" ? { truncated: true } : {}),
			...(wrong ? { failed: wrong } : {}),
		});
		if (wrong) throw new Error(wrong);
		return reply;
	}

	/** Try a request again while its failure is transient; give up on a settled one. */
	async function retried<T>(about: string, request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
		if (gaveUp) throw new Error(`${named} stopped answering: ${gaveUp}`);
		const failures: string[] = [];
		for (let attempt = 1; attempt <= attempts; attempt++) {
			try {
				const answer = await request();
				consecutive = 0;
				return answer;
			} catch (error) {
				signal?.throwIfAborted();
				options.signal?.throwIfAborted();
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
	}

	return {
		named,
		broken: () => gaveUp,
		async think(about, prompt, ceiling = CEILING[options.role]) {
			return retried(about, async () => textOf((await call(about, prompt.system, [{ role: "user", content: prompt.user, timestamp: Date.now() }], ceiling)).content));
		},
		async work(about, prompt, tools, ceiling = CEILING[options.role]) {
			const specs = [...(tools.lookups ?? []), tools.submit].map(({ name, description, parameters }) => ({ name, description, parameters }));
			// The task comes last, where it is read most recently, after the facts it is about.
			const messages: unknown[] = [{ role: "user", content: prompt.user, timestamp: Date.now() },
				...(prompt.task ? [{ role: "user", content: prompt.task, timestamp: Date.now() }] : [])];
			const problems: string[] = [];
			for (let turn = 1; turn <= (tools.turns ?? 3); turn++) {
				tools.signal?.throwIfAborted();
				const finishing = turn === (tools.turns ?? 3) && !!tools.lookups?.length;
				if (finishing) messages.push({ role: "user", content: `This session's final reply is for ${tools.submit.name}. Reference lookups are closed. Submit your answer using the facts already returned; state any unresolved limitation in the answer's supported fields. Acceptance still depends on validation.`, timestamp: Date.now() });
				const available = finishing ? specs.filter((one) => one.name === tools.submit.name) : specs;
				const reply = await retried(about, () => call(about, prompt.system, messages, ceiling, available, tools.signal), tools.signal);
				messages.push(reply);
				const calls = reply.content.filter((part): part is { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> } =>
					(part as { type?: unknown }).type === "toolCall");
				const results: unknown[] = [];
				for (const used of calls) {
					const lookup = !finishing && tools.lookups?.find((one) => one.name === used.name);
					let answer: string;
					if (lookup) answer = lookup.answer(used.arguments);
					else if (used.name !== tools.submit.name) answer = `There is no tool named ${used.name}.`;
					else if (reply.stopReason === "length") answer = "Your answer was cut off at the output limit. Call submit again with a shorter answer.";
					else {
						// A check that throws on a malformed answer is one more problem to correct, not the end of the session.
						let problem: string | null;
						try { problem = tools.submit.check(used.arguments); } catch (error) { problem = `The answer could not be read: ${error instanceof Error ? error.message : String(error)}.`; }
						if (!problem) return used.arguments;
						answer = `Not accepted: ${problem} Fix that and call ${tools.submit.name} again with corrected arguments.`;
						problems.push(problem);
					}
					results.push({ role: "toolResult", toolCallId: used.id, toolName: used.name, content: [{ type: "text", text: answer }], isError: !lookup, timestamp: Date.now() });
				}
				if (!calls.length) {
					const why = reply.stopReason === "length" ? "Your reply was cut off at the output limit before you called the tool." : "You replied with text and did not call a tool.";
					problems.push(why);
					results.push({ role: "user", content: `${why} Call ${tools.submit.name} once with your whole answer as its arguments. Do not write the answer as text.`, timestamp: Date.now() });
				}
				messages.push(...results);
			}
			throw new Error(`${named} did not submit an accepted answer for ${about}: ${problems.join(" | ") || "it only looked things up"}`);
		},
	};
}
