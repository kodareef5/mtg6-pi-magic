/** Record each writer call's accepted answer or failure beside the resulting plan, for reading afterwards. */
import { createHash } from "node:crypto";
import type { Frame } from "../src/core/types.ts";
import type { Reasoner } from "../src/context/reason.ts";

export type WorkResult = { about: string; ms: number; answer?: Record<string, unknown>; error?: string };
export const positionKey = (frame: Frame): string => createHash("sha256").update(JSON.stringify(frame)).digest("hex");

export function recordWork(writer: Reasoner, output: WorkResult[]): Reasoner {
	return { ...writer, async work(about, ...args) {
		const began = Date.now();
		try {
			const answer = await writer.work(about, ...args);
			output.push({ about, ms: Date.now() - began, answer: structuredClone(answer) });
			return answer;
		} catch (error) {
			output.push({ about, ms: Date.now() - began, error: String(error) });
			throw error;
		}
	} };
}
