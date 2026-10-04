/** Exact model requests and replies for diagnosing a run. Contains private seat data. */
import type { Inference } from "./sit.ts";

export type CallTrace = {
	id: number;
	at: number;
	kind: "classify" | "reason";
	model: string;
} & (
	| { event: "request"; request: unknown; settings: { reasoning?: string; maxTokens?: number; temperature?: number } }
	| { event: "reply"; result: unknown }
	| { event: "error"; error: string }
);

/** Capture before dispatch, including retries. Provider auth and transport settings stay in Pi. */
export function traceInference(inference: Inference, record: (event: CallTrace) => void): Inference {
	let calls = 0;
	async function call<T>(kind: CallTrace["kind"], model: { provider: string; id: string }, request: unknown,
		settings: { reasoning?: string; maxTokens?: number; temperature?: number }, invoke: () => Promise<T>): Promise<T> {
		const base = { id: ++calls, kind, model: `${model.provider}/${model.id}` };
		record(structuredClone({ ...base, at: Date.now(), event: "request", request, settings }));
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
