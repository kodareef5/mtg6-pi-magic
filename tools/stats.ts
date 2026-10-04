#!/usr/bin/env node
/**
 * Timing and cost across live runs, per role: how many calls, tokens in, read
 * from cache and out, what they cost, and how much of the run's wall time each
 * role took. Reads the `.result.json` files `npm run matchup` writes.
 *
 *   npm run stats                     every run in .pi/real-standard
 *   npm run stats -- <result.json>... the runs named
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Call = { role: string; about?: string; at?: number; ms: number; failed?: string; usage?: { input: number; output: number; cacheRead?: number; reasoning?: number; cost?: { total: number } } };
type Result = { seed: string; turn: number; outcome: unknown; elapsedMs: number; replayMatches: boolean; gaps: string[]; calls: Call[] };

const DIR = ".pi/real-standard";
const named = process.argv.slice(2);
const files = named.length ? named : readdirSync(DIR).filter((file) => file.endsWith(".result.json")).sort().map((file) => join(DIR, file));
const runs = files.map((file) => ({ file, ...(JSON.parse(readFileSync(file, "utf8")) as Result) }));
if (!runs.length) throw new Error(`No results in ${DIR}. Run npm run matchup first.`);

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
const quantile = (values: number[], q: number) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0; };
const pad = (cells: (string | number)[], widths: number[]) => cells.map((cell, at) => at ? String(cell).padStart(widths[at]!) : String(cell).padEnd(widths[at]!)).join("  ");
const WIDTHS = [10, 6, 10, 10, 8, 9, 9, 8, 8, 6];
const HEAD = ["role", "calls", "in", "cached", "out", "cost", "time", "median", "p90", "wall"];

/** One table: a row per role, then the total. `wall` is each role's call time as a share of the runs' wall time. */
function table(calls: Call[], wallMs: number): string[] {
	const roles = [...new Set(calls.map((call) => call.role))].sort();
	const row = (label: string, group: Call[]) => {
		const ms = group.map((call) => call.ms), sum = (pick: (call: Call) => number) => group.reduce((total, call) => total + pick(call), 0);
		const time = sum((call) => call.ms);
		return pad([label, group.length, sum((call) => call.usage?.input ?? 0), sum((call) => call.usage?.cacheRead ?? 0), sum((call) => call.usage?.output ?? 0),
			`$${sum((call) => call.usage?.cost?.total ?? 0).toFixed(3)}`, seconds(time), seconds(quantile(ms, 0.5)), seconds(quantile(ms, 0.9)),
			`${Math.round((100 * time) / wallMs)}%`], WIDTHS);
	};
	return [pad(HEAD, WIDTHS), ...roles.map((role) => row(role, calls.filter((call) => call.role === role))), row("total", calls)];
}

/** The wall time a group of calls spanned: from the first start to the last end. Overlapping calls are not summed. */
const span = (calls: Call[]) => { const timed = calls.filter((call) => call.at !== undefined); return timed.length ? Math.max(...timed.map((call) => call.at! + call.ms)) - Math.min(...timed.map((call) => call.at!)) : 0; };

for (const run of runs) {
	const turns = Math.max(1, run.turn - 1);
	const failed = run.calls.filter((call) => call.failed).length;
	const pregame = span(run.calls.filter((call) => call.role === "pregame"));
	console.log(`\n${run.file}`);
	console.log(`  seed ${run.seed}, ${run.outcome ? "finished" : "stopped"} on turn ${run.turn}, ${seconds(run.elapsedMs)} wall, ` +
		`replay ${run.replayMatches ? "matched" : "MISMATCH"}, ${run.gaps.length} gaps${failed ? `, ${failed} failed calls` : ""}`);
	console.log(`  pregame ${seconds(pregame)} before the first decision; then ${seconds((run.elapsedMs - pregame) / turns)} a turn, ` +
		`${seconds(run.calls.filter((call) => call.role === "strategy").reduce((sum, call) => sum + call.ms, 0) / turns)} of it waiting on strategy`);
	for (const line of table(run.calls, run.elapsedMs)) console.log(`  ${line}`);
	// What each chat call was for: pregame analysts and synthesis, turn plans and escalations.
	const kinds = new Map<string, Call[]>();
	for (const call of run.calls.filter((call) => call.role !== "decide")) kinds.set(`${call.role}: ${call.about ?? "?"}`, [...(kinds.get(`${call.role}: ${call.about ?? "?"}`) ?? []), call]);
	for (const [kind, calls] of [...kinds].sort()) console.log(`  ${kind.padEnd(34)} ${String(calls.length).padStart(4)} calls, median ${seconds(quantile(calls.map((call) => call.ms), 0.5))}`);
}
if (runs.length > 1) {
	const wall = runs.reduce((total, run) => total + run.elapsedMs, 0), turns = runs.reduce((total, run) => total + Math.max(1, run.turn - 1), 0);
	const calls = runs.flatMap((run) => run.calls);
	const cost = calls.reduce((total, call) => total + (call.usage?.cost?.total ?? 0), 0);
	console.log(`\nAll ${runs.length} runs: ${turns} turns, ${seconds(wall)} wall, ${seconds(wall / turns)} and $${(cost / turns).toFixed(3)} a turn`);
	for (const line of table(calls, wall)) console.log(`  ${line}`);
}
