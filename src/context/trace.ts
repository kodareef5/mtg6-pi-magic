/** Exact model requests and replies for diagnosing a run. Contains private seat data. */
import type { Inference } from "./sit.ts";

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
	async function call<T>(kind: CallTrace["kind"], model: { provider: string; id: string; contextWindow?: number }, request: unknown,
		settings: { reasoning?: string; maxTokens?: number; temperature?: number }, invoke: () => Promise<T>): Promise<T> {
		const base = { id: ++calls, kind, model: `${model.provider}/${model.id}` };
		record(structuredClone({ ...base, at: Date.now(), event: "request", request, settings, size: requestSize(request, model.contextWindow) }));
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
