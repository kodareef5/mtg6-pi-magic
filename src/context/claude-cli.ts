/** Explicit Pi provider for claude -p. Tools remain local Reasoner lookups, never CLI tools.
 * Each call starts with an isolated transcript; no Claude session or repository context crosses seats. */
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAssistantMessageEventStream, getCurrentSystemPrompt, getCurrentTools,
	type AssistantMessage, type Model, type Provider, type SimpleStreamOptions, type TranscriptContext, type Usage } from "@earendil-works/pi-ai";
import { claudeProcess } from "./claude-process.ts";

export const CLAUDE_PATTERN = "claude-cli/claude-haiku-5-5:medium";
const MODEL = "claude-haiku-5-5";
type CliResult = {
	modelUsage?: Record<string, { canonicalModel?: string }>;
	usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; output_tokens_details?: { thinking_tokens?: number } };
	total_cost_usd: number; is_error?: boolean; subtype?: string; result?: string; errors?: string[]; stop_reason?: string;
	structured_output?: { text?: unknown; calls?: unknown };
};
const zero = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
const BRIDGE = "Answer the supplied conversation as its assistant. The tools listed in the request are functions the host can execute. Return requested calls in calls, or a final answer in text. Do not claim that a returned call has run. The host validates and executes calls and supplies their results in the next request. You have no filesystem, network, or other tools. JSON shape validation does not establish factual or rules correctness.";

/** The optional executable is a subprocess test seam, not a shell command. */
export function claudeCli(command = "claude"): Provider<"claude-cli"> {
	const executable = () => [command, ...(command.includes("/") ? [] : (process.env.PATH ?? "").split(delimiter).map((dir) => join(dir, command)))]
		.find((path) => { try { accessSync(path, constants.X_OK); return true; } catch { return false; } });
	const model: Model<"claude-cli"> = { id: MODEL, name: "Haiku 5.5 (Claude CLI)", provider: "claude-cli", api: "claude-cli", baseUrl: "",
		reasoning: true, input: ["text"], contextWindow: 1_000_000, maxTokens: 128_000, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	function stream(model: Model<string>, context: TranscriptContext, options: SimpleStreamOptions = {}) {
		const events = createAssistantMessageEventStream();
		const reply: AssistantMessage = { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id,
			usage: zero(), stopReason: "stop", timestamp: Date.now() };
		void (async () => {
			try {
				const effort = options.reasoning ?? "medium";
				if (model.id !== MODEL || !["low", "medium", "high"].includes(effort)) throw new Error(`Unsupported Claude CLI model or effort: ${model.id}:${effort}`);
				const tools = getCurrentTools(context.messages);
				const schema = { type: "object", properties: { text: { type: "string" }, calls: { type: "array", items: {
					type: "object", properties: { name: { type: "string", ...(tools.length ? { enum: tools.map((tool) => tool.name) } : {}) },
						arguments: { type: "object", additionalProperties: true } }, required: ["name", "arguments"], additionalProperties: false },
					...(!tools.length ? { maxItems: 0 } : {}) } }, required: ["text", "calls"], additionalProperties: false };
				const payload = { tools, messages: context.messages.filter((one) => one.role !== "system") };
				const changed = await options.onPayload?.(payload, model);
				const result = await claudeProcess({ command: executable() ?? command, model: model.id, effort,
					system: `${getCurrentSystemPrompt(context.messages)}\n\n${BRIDGE}`, input: JSON.stringify(changed ?? payload), schema,
					maxTokens: options.maxTokens, signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 900_000), ...(options.signal ? [options.signal] : [])]), env: options.env }) as CliResult;
				// A CLI fallback or ambient model alias must never become an unchosen roster change.
				const models = Object.entries(result.modelUsage ?? {});
				if (!models.length && result.is_error) throw new Error(`Claude CLI ${result.subtype}: ${result.result || result.errors?.join("; ") || "request failed"}`);
				if (models.length !== 1 || models[0]![0] !== model.id || models[0]![1].canonicalModel !== model.id) throw new Error("Claude CLI returned an unrequested or unidentified model");
				const usage = result.usage, cost = result.total_cost_usd;
				if (!usage || ![usage.input_tokens, usage.output_tokens, usage.cache_read_input_tokens, usage.cache_creation_input_tokens, cost].every((n) => Number.isFinite(n) && n >= 0)) throw new Error("Claude CLI returned incomplete usage");
				reply.usage = { input: usage.input_tokens, output: usage.output_tokens, cacheRead: usage.cache_read_input_tokens,
					cacheWrite: usage.cache_creation_input_tokens, totalTokens: usage.input_tokens + usage.output_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
					...(Number.isFinite(usage.output_tokens_details?.thinking_tokens) ? { reasoning: usage.output_tokens_details?.thinking_tokens } : {}),
					cost: { ...zero().cost, total: cost }, costBasis: "list-estimate" } as Usage;
				if (result.is_error || result.subtype !== "success") throw new Error(`Claude CLI ${result.subtype}: ${result.result || result.errors?.join("; ") || "request failed"}`);
				const answer = result.structured_output;
				if (!answer || typeof answer.text !== "string" || !Array.isArray(answer.calls)) throw new Error("Claude CLI returned no structured answer");
				if (answer.text) reply.content.push({ type: "text", text: answer.text });
				for (const call of answer.calls) {
					if (!call || typeof call !== "object" || !tools.some((tool) => tool.name === call.name) || !call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) throw new Error("Claude CLI returned an invalid tool call");
					reply.content.push({ type: "toolCall", id: randomUUID(), name: call.name, arguments: call.arguments });
				}
				reply.stopReason = result.stop_reason === "max_tokens" ? "length" : answer.calls.length ? "toolUse" : "stop";
				events.push({ type: "start", partial: { ...reply, content: [] } });
				for (const [contentIndex, part] of reply.content.entries()) {
					if (part.type === "text") {
						events.push({ type: "text_start", contentIndex, partial: reply });
						events.push({ type: "text_delta", contentIndex, delta: part.text, partial: reply });
						events.push({ type: "text_end", contentIndex, content: part.text, partial: reply });
					} else if (part.type === "toolCall") {
						events.push({ type: "toolcall_start", contentIndex, partial: reply });
						events.push({ type: "toolcall_delta", contentIndex, delta: JSON.stringify(part.arguments), partial: reply });
						events.push({ type: "toolcall_end", contentIndex, toolCall: part, partial: reply });
					}
				}
				events.push({ type: "done", reason: reply.stopReason, message: reply });
			} catch (error) {
				reply.stopReason = options.signal?.aborted ? "aborted" : "error"; reply.errorMessage = String(error);
				events.push({ type: "error", reason: reply.stopReason, error: reply });
			} finally { events.end(); }
		})();
		return events;
	}
	return { id: model.provider, name: "Claude CLI", getModels: () => [model], stream, streamSimple: stream,
		auth: { apiKey: { name: "Claude CLI login", resolve: async () => executable() ? { auth: {}, source: "Login managed by claude" } : undefined } } };
}
