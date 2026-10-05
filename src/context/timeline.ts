/** Build an offline flame chart from measured requests, without carrying prompts into the page. */
import { readFileSync } from "node:fs";
import { usageReport } from "./metrics.ts";
import type { GameResult, TurnMark } from "./report.ts";

export function timelineData(result: GameResult, observed: TurnMark[] = []) {
	const timed = result.calls.filter((call) => call.at !== undefined);
	const start = result.timing?.startedAt ?? timed.reduce((first, call) => Math.min(first, call.at!), Infinity);
	if (!Number.isFinite(start)) throw new Error("This result has no request timestamps. A timeline cannot place its calls.");
	const end = result.timing?.finishedAt ?? timed.reduce((last, call) => Math.max(last, call.at! + call.ms), start + result.elapsedMs);
	const calls = timed.map((call, id) => ({
		id, role: call.role, about: call.about, model: call.model, thinking: call.thinking, seat: call.seat,
		start: call.at! - start, end: (call.pending ? end : call.at! + call.ms) - start,
		status: call.pending ? "pending" : call.cancelled ? "cancelled" : call.failed ? "failed" : call.truncated ? "truncated" : "complete",
		error: call.failed, usage: call.usage,
	})).sort((a, b) => a.start - b.start || a.id - b.id);
	const turns = (result.timing?.turns?.length ? result.timing.turns : observed).map((turn) => ({ ...turn, at: turn.at - start }));
	const roles = ["pregame", "strategy", "decide", "judge", "summary"];
	const groups = roles.flatMap((role) => [...new Set(calls.filter((call) => call.role === role).map((call) => call.seat))].map((seat) => {
		const group = calls.filter((call) => call.role === role && call.seat === seat);
		const ends: number[] = [];
		return { role, seat, calls: group.map((call) => {
			let lane = ends.findIndex((end) => end <= call.start);
			if (lane < 0) lane = ends.length;
			ends[lane] = call.end;
			return { ...call, lane };
		}), lanes: ends.length };
	}));
	const edges = calls.filter((call) => call.end > call.start).flatMap((call) => [{ at: call.start, delta: 1 }, { at: call.end, delta: -1 }]).sort((a, b) => a.at - b.at || a.delta - b.delta);
	let concurrent = 0, peak = 0;
	const concurrency = edges.map((edge) => { concurrent += edge.delta; peak = Math.max(peak, concurrent); return { at: edge.at, count: concurrent }; });
	return {
		seed: result.seed, start, origin: result.timing ? "run-start" : "first-request", elapsedMs: result.elapsedMs, spanMs: Math.max(1, end - start), groups, turns, concurrency, peak,
		outcome: result.outcome?.results ?? null, seats: result.seats ?? [], fromVersion: result.fromVersion,
		gaps: result.gaps, replayMatches: result.replayMatches, missingTimestamps: result.calls.length - timed.length,
		playAt: result.timing?.playStartedAt !== undefined ? result.timing.playStartedAt - start : calls.find((call) => call.role === "decide")?.start,
		playEnd: result.timing?.playEndedAt !== undefined ? result.timing.playEndedAt - start : undefined,
		llm: usageReport(result.calls, end),
	};
}

export function timeline(result: GameResult, observed: TurnMark[] = []): string {
	const template = readFileSync(new URL("./timeline.html", import.meta.url), "utf8");
	const script = readFileSync(new URL("./timeline-view.js", import.meta.url), "utf8");
	// JSON is inert data. A seed or error containing </script> cannot become page code.
	return template.replace("<!--GAME_DATA-->", () => JSON.stringify(timelineData(result, observed)).replace(/</g, "\\u003c"))
		.replace("<!--GAME_SCRIPT-->", () => script);
}
