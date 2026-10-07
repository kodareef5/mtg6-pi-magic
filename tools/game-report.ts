/** One saved result and one rendering for matchup, smoke and /magic. No prompts or hidden card data. */
import { writeFileSync } from "node:fs";
import type { Table } from "../src/core/table.ts";
import type { Outcome } from "../src/core/types.ts";
import type { Planned } from "../src/context/seat.ts";
import type { Seated } from "../src/context/sit.ts";
import type { Spend, RunTiming } from "../src/context/spend.ts";
import { bill, duration, usageReport } from "../src/context/metrics.ts";
import { timeline } from "./game-timeline.ts";

export type GameResult = {
	/** Absent on older matchup results, which remain readable. */
	schema?: 1;
	seed: string; turn: number; outcome: Outcome | null; gaps: string[]; elapsedMs: number;
	calls: readonly Spend[]; planned?: Planned[];
	seats?: { id: number; name: string }[];
	timing?: RunTiming; fromVersion?: number; version?: number;
	replayMatches?: boolean; journal?: string; trace?: string; error?: string;
	reasons?: Record<string, number>;
	interruptions?: { stops: number; essential: number; help: number; rulings: number; unruled?: number; upheld: number };
	judged?: { cases: number; failed: number };
	plans?: { accepted: number; steps: number; branches: number };
	recaps?: number; dials?: Record<string, number>;
	llm?: ReturnType<typeof usageReport>;
};

/** Keep the compact report's measurements and its interactive view beside the journal. */
export function saveReport(path: string, result: GameResult): string[] {
	writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
	if (!result.calls.some((call) => call.at !== undefined)) return [`result    ${path}`];
	const html = path.replace(/(?:\.result)?\.json$/, "") + ".timeline.html";
	writeFileSync(html, timeline(result));
	return [`result    ${path}`, `timeline  ${html}`];
}

/** Calls and timings belong to this run. Decisions and rulings describe the retained game prefix. */
export function gameResult(table: Table, seated: Seated, extra: Pick<GameResult, "replayMatches" | "journal" | "trace" | "error"> = {}): GameResult {
	const now = seated.timing.finishedAt ?? Date.now();
	const calls = seated.tally.spent().map((call) => ({ ...call, ...(call.pending ? { ms: now - call.at! } : {}) }));
	const requests = table.workLog.flatMap((entry) => (entry.tools ?? []).flatMap((tool) => tool.do === "plan.request" ? [tool.reason] : []));
	return {
		schema: 1, seed: table.rng.seed, turn: table.cursor.turn, outcome: table.outcome, gaps: [...table.gaps],
		seats: table.seats.map(({ id, name }) => ({ id, name })), fromVersion: seated.fromVersion, version: table.ledger.length,
		timing: structuredClone(seated.timing), elapsedMs: now - seated.timing.startedAt, calls, planned: [...seated.planned],
		reasons: Object.fromEntries(["forced", "delegated", "chosen", "declared", "fallback"].map((why) => [why, table.ledger.filter((row) => row.why === why).length])),
		interruptions: {
			stops: requests.filter((reason) => reason.startsWith("Stop:") && !/^Stop: Step \d+ cannot be taken now/.test(reason)).length,
			essential: requests.filter((reason) => /^Stop: Step \d+ cannot be taken now/.test(reason)).length,
			help: requests.filter((reason) => reason.startsWith("The pilot asked")).length,
			rulings: table.rulings.filter((one) => one.ruling).length, unruled: table.rulings.filter((one) => !one.ruling).length, upheld: table.rulings.filter((one) => one.kept !== undefined).length,
		},
		judged: { ...seated.judged }, recaps: seated.chronicle.recaps.length, dials: { ...seated.dials },
		plans: {
			accepted: table.workLog.filter((entry) => entry.tools?.some((tool) => tool.do === "plan.put")).length,
			steps: table.ledger.filter((row) => row.execution?.step !== undefined).length,
			branches: table.ledger.filter((row) => row.execution?.branch !== undefined).length,
		},
		llm: usageReport(calls, now), ...extra,
	};
}

/** Refused card preparation still spent calls. Save them even though no player could start. */
export function preparationFailure(table: Table, error: unknown, began: number, paths: Pick<GameResult, "journal" | "trace"> = {}): GameResult {
	const details = error as { spends?: Spend[]; timing?: RunTiming; problem?: string } | null;
	const timing = details?.timing ?? { startedAt: began, finishedAt: Date.now() };
	const calls = details?.spends ?? [];
	return { schema: 1, seed: table.rng.seed, turn: table.cursor.turn, outcome: null, gaps: [...table.gaps],
		error: details?.problem ?? String(error), timing, elapsedMs: timing.finishedAt! - timing.startedAt,
		calls, llm: usageReport(calls, timing.finishedAt), ...paths };
}

export function report(result: GameResult): string[] {
	const { timing, interruptions: stops, reasons, plans } = result;
	const now = (timing?.startedAt ?? 0) + result.elapsedMs;
	const usage = result.llm ?? usageReport(result.calls, now);
	const byRole = (role: Spend["role"]) => usage.roles.find((one) => one.role === role)!.calls;
	const purpose = (about: string) => usage.purposes.find((one) => one.role === "decide" && one.about === about)?.calls ?? 0;
	const planned = result.planned ?? [];
	const waitedMs = planned.reduce((sum, one) => sum + one.waitedMs, 0);
	const preparations = planned.filter((one) => one.ready !== undefined);
	const preparationWait = preparations.reduce((sum, one) => sum + Math.max(0, (one.preparation?.finishedAt ?? 0) - (one.preparation?.neededAt ?? Infinity)), 0);
	const state = result.error ? "failed" : result.outcome ? "finished" : timing && !timing.finishedAt ? "waiting" : timing && !timing.playStartedAt ? "prepared" : "stopped";
	const outcome = result.outcome ? Object.entries(result.outcome.results).map(([seat, end]) => `${result.seats?.find((one) => String(one.id) === seat)?.name ?? `seat ${seat}`} ${end}`).join(", ") : "no outcome";
	const diff = (end: number | undefined, start: number | undefined) => end !== undefined && start !== undefined ? end - start : undefined;
	return [
		`game      ${result.seed} | ${state}, turn ${result.turn} | ${outcome}`,
		`health    replay ${result.replayMatches === undefined ? "unchecked" : result.replayMatches ? "matched" : "MISMATCH"}  gaps ${result.gaps.length}  fallback ${reasons?.fallback ?? "?"}`,
		`time      wall ${duration(result.elapsedMs)}  prepare ${duration(diff(timing?.preparedAt ?? (!timing?.playStartedAt ? timing?.finishedAt : undefined), timing?.startedAt))}  play ${duration(timing && !timing.playStartedAt ? 0 : diff(timing?.playEndedAt, timing?.playStartedAt))}  finish ${duration(diff(timing?.finishedAt, timing?.playEndedAt ?? timing?.preparedAt))}  strategy wait ${result.planned ? duration(waitedMs) : "?"}`,
		`scope     calls and waits: this run; game counters: retained prefix${result.fromVersion === undefined ? "" : ` (started at decision ${result.fromVersion}, now ${result.version})`}`,
		...(reasons ? [`decisions ${Object.entries(reasons).map(([why, n]) => `${why} ${n}`).join("  ")}`] : []),
		`jev       ${byRole("decide")} calls  ${purpose("pick")} picks  ${purpose("review")} reviews  ${byRole("decide") - purpose("pick") - purpose("review")} other`,
		`strategy  ${byRole("strategy")} calls  ${planned.length} sessions${plans ? `  ${plans.accepted} plans  ${plans.steps} steps  ${plans.branches} branches` : ""}${stops ? `; help ${stops.help}  stops ${stops.stops}  essential ${stops.essential}` : ""}`,
		`planning  ready ${preparations.filter((one) => one.ready).length}/${preparations.length}  unfinished wait ${preparations.some((one) => one.preparation) ? duration(preparationWait) : "?"}  timeouts ${result.calls.filter((one) => one.role === "strategy" && /timed out/.test(one.failed ?? "")).length}`,
		`judge     ${byRole("judge")} calls  ${result.judged?.cases ?? "?"} cases this run (${result.judged?.failed ?? "?"} failed); ${stops?.rulings ?? "?"} game rulings  ${stops?.unruled ?? 0} unruled cases  ${stops?.upheld ?? "?"} rollbacks`,
		`summary   ${byRole("summary")} calls  ${result.recaps ?? "?"} recaps; rule lookups ${result.dials ? Object.values(result.dials).reduce((sum, n) => sum + n, 0) : "?"}`,
		...bill(result.calls, now),
		...(result.error ? [`error     ${result.error}`] : []),
		...result.gaps.map((gap) => `gap       ${gap}`),
	];
}
