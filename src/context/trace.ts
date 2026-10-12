/**
 * Exact model requests and replies for diagnosing a run. Contains private seat data.
 * A system prompt or tool list is written in full the first time a trace sees it and
 * as `{ sha256 }` after that; `expandTraces` restores every request from the whole file.
 */
import { createHash } from "node:crypto";
import type { Inference } from "./sit.ts";

/** The request fields that repeat across calls and are written once per trace. */
const SHARED = ["systemPrompt", "tools"] as const;
const digest = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
type Shared = { sha256: string };
const shared = (value: unknown): value is Shared => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && typeof (value as Shared).sha256 === "string";

/** Requests as sent: each `{ sha256 }` replaced by the full value written earlier in the same trace. */
export function expandTraces(events: readonly CallTrace[]): CallTrace[] {
	const seen = new Map<string, unknown>();
	return events.map((event) => {
		if (event.event !== "request" || !event.request || typeof event.request !== "object") return event;
		const request = { ...(event.request as Record<string, unknown>) };
		for (const key of SHARED) {
			const value = request[key];
			if (value === undefined) continue;
			if (shared(value)) {
				if (!seen.has(`${key}:${value.sha256}`)) throw new Error(`Trace request ${event.id} refers to a ${key} not written earlier in this trace.`);
				request[key] = seen.get(`${key}:${value.sha256}`);
			} else seen.set(`${key}:${digest(value)}`, value);
		}
		return { ...event, request };
	});
}

export type CallTrace = {
	id: number;
	at: number;
	kind: "classify" | "reason";
	model: string;
} & (
	| { event: "request"; request: unknown; settings: { reasoning?: string; maxTokens?: number; temperature?: number }; size: ReturnType<typeof requestSize> }
	| { event: "reply"; result: unknown }
	| { event: "error"; error: string }
);

/** Exact serialized bytes for diagnosis, not a token estimate or a provider limit. */
export function requestSize(request: unknown, contextWindow?: number) {
	const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value) ?? "").length;
	const { state, questions } = (request ?? {}) as { state?: Record<string, unknown>; questions?: unknown };
	return { bytes: bytes(request), ...(contextWindow === undefined ? {} : { catalogContextTokens: contextWindow }),
		...(state ? { kind: state.kind, inspection: state.inspection,
			stateBytes: Object.fromEntries(Object.entries(state).map(([key, value]) => [key, bytes(value)])), questionsBytes: bytes(questions) } : {}) };
}

/** Capture before dispatch, including retries. Provider auth and transport settings stay in Pi. */
export function traceInference(inference: Inference, record: (event: CallTrace) => void): Inference {
	let calls = 0;
	const written = new Set<string>();
	// The same assessment or strategy prompt goes with every call; writing it each time made one sweep's trace 3 GB.
	const once = (request: unknown) => {
		if (!request || typeof request !== "object" || Array.isArray(request)) return request;
		const compact = { ...(request as Record<string, unknown>) };
		for (const key of SHARED) {
			if (compact[key] === undefined) continue;
			const sha256 = digest(compact[key]);
			if (written.has(`${key}:${sha256}`)) compact[key] = { sha256 }; else written.add(`${key}:${sha256}`);
		}
		return compact;
	};
	async function call<T>(kind: CallTrace["kind"], model: { provider: string; id: string; contextWindow?: number }, request: unknown,
		settings: { reasoning?: string; maxTokens?: number; temperature?: number }, invoke: () => Promise<T>): Promise<T> {
		const base = { id: ++calls, kind, model: `${model.provider}/${model.id}` };
		record(structuredClone({ ...base, at: Date.now(), event: "request", request: once(request), settings, size: requestSize(request, model.contextWindow) }));
		try {
			const result = await invoke();
			record(structuredClone({ ...base, at: Date.now(), event: "reply", result }));
			return result;
		} catch (error) {
			record({ ...base, at: Date.now(), event: "error", error: String(error) });
			throw error;
		}
	}
	return {
		classify: (model, request, options) => call("classify", model, request,
			{ temperature: options?.temperature }, () => inference.classify(model, request, options)),
		stream: (model, request, options) => {
			const result = call("reason", model, request, { reasoning: options?.reasoning, maxTokens: options?.maxTokens },
				() => inference.stream(model, request, options).result());
			return { result: () => result };
		},
	};
}
