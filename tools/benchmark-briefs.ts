/** Ordinary pregame outputs can vary advice while keeping the planning position fixed. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Frame } from "../src/core/types.ts";
import { PlanSchema, problems } from "../src/core/language.ts";
import type { Brief } from "../src/context/brief.ts";
import { PlaybookSchema } from "../src/context/playbook.ts";
import { initialPlan } from "../src/context/strategy-facts.ts";
import { basePlan } from "../src/context/plan-edit.ts";

export function readBriefs(file: string, decks: readonly string[]) {
	const text = readFileSync(file, "utf8");
	const saved = JSON.parse(text) as { decks: string[]; model: string; elapsedMs: number; briefs: (Brief | { seat: number; failed: string })[] };
	if (!isDeepStrictEqual(saved.decks, decks) || saved.model !== "gpt-6.1-sol:high" || !Array.isArray(saved.briefs))
		throw new Error("Brief comparison requires ordinary baseline pregame output with the pinned decks in seat order.");
	return { ...saved, file, hash: createHash("sha256").update(text).digest("hex") };
}

/** Refuse inherited tactical work; never clear it to manufacture a fresh comparison. */
export function freshBriefBase(frame: Frame): void {
	const marker = { objective: "Benchmark base origin", guidance: "No model receives this marker.", steps: [] };
	const { throughTurn: _scope, ...base } = basePlan(frame, undefined, false, marker);
	if (!isDeepStrictEqual(base, marker)) throw new Error("Brief comparison needs a naturally fresh planning base at this prefix.");
}

/** Failed preparation remains unresolved, never an empty or carried replacement. */
export function comparisonBrief(source: ReturnType<typeof readBriefs>, frame: Frame): Brief {
	freshBriefBase(frame);
	const found = source.briefs.filter((one) => one.seat === frame.seat);
	if (found.length !== 1) throw new Error(`Unresolved pregame: expected one brief for seat ${frame.seat}.`);
	const brief = found[0]!;
	if ("failed" in brief) throw new Error(`Unresolved pregame: ${brief.failed}`);
	if (brief.version !== 3 || !Array.isArray(brief.gaps) || brief.gaps.length)
		throw new Error(`Unresolved pregame: ${brief.gaps?.join("; ") || "invalid brief version or gap record"}`);
	const wrong = [...problems(PlaybookSchema, brief.policies), ...problems(PlanSchema, initialPlan(brief))];
	if (wrong.length) throw new Error(`Unresolved pregame: ${wrong.join("; ")}`);
	return brief;
}
