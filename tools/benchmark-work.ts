/** Record accepted reasoning separately from the resulting plan. Frozen analysis
 * lets a writer comparison reuse identical evidence without billing it again. */
import { createHash } from "node:crypto";
import type { Frame } from "../src/core/types.ts";
import type { Reasoner } from "../src/context/reason.ts";

export type WorkResult = { about: string; stage: "analysis" | "writing"; ms: number; reused?: true; answer?: Record<string, unknown>; error?: string };
export const positionKey = (frame: Frame): string => createHash("sha256").update(JSON.stringify(frame)).digest("hex");
const analysis = (about: string) => /^(survey |branch |perspective |growth$)/.test(about);

/** Reuse complete successful or failed analyst tasks, never a writer answer.
 * A different projected position or missing task is refused, not regenerated. */
export function recordWork(writer: Reasoner, frame: Frame, output: WorkResult[], saved?: { position: string; work: WorkResult[] }): Reasoner {
	if (saved && saved.position !== positionKey(frame)) throw new Error("Frozen analysis belongs to a different projected position.");
	return { ...writer, async work(about, ...args) {
		const began = Date.now(), stage = analysis(about) ? "analysis" : "writing";
		if (saved && stage === "analysis") {
			const found = saved.work.filter((one) => one.about === about && one.stage === stage);
			if (found.length !== 1 || !found[0]!.answer && !found[0]!.error) throw new Error(`Frozen analysis needs exactly one completed task for ${about}.`);
			const row = structuredClone(found[0]!);
			output.push({ ...row, ms: 0, reused: true });
			if (row.error) throw new Error(row.error);
			return structuredClone(row.answer!);
		}
		try {
			const answer = await writer.work(about, ...args);
			output.push({ about, stage, ms: Date.now() - began, answer: structuredClone(answer) });
			return answer;
		} catch (error) {
			output.push({ about, stage, ms: Date.now() - began, error: String(error) });
			throw error;
		}
	} };
}
