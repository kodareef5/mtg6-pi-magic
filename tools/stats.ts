#!/usr/bin/env node
/** The same game report for saved runs; no models are called. --json exposes exact aggregates. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { report, type GameResult } from "../src/context/report.ts";
import { bill, duration, usageReport } from "../src/context/metrics.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
	json: { type: "boolean" }, details: { type: "boolean" }, help: { type: "boolean" },
} });
if (values.help) {
	console.log("usage: npm run stats -- [--json | --details] [result.json ...]\nDefaults to .pi/real-standard/*.result.json. --details adds call purpose and latency.");
	process.exit(0);
}
const dir = ".pi/real-standard";
const files = positionals.length ? positionals : readdirSync(dir).filter((file) => file.endsWith(".result.json")).sort().map((file) => join(dir, file));
if (!files.length) throw new Error(`No results in ${dir}. Run npm run matchup first.`);
const runs = files.map((file) => {
	const result = JSON.parse(readFileSync(file, "utf8")) as GameResult;
	return { file, ...result, llm: usageReport(result.calls, (result.timing?.startedAt ?? 0) + result.elapsedMs) };
});
const calls = runs.flatMap((run) => run.calls);
const aggregate = {
	runs: runs.length, finished: runs.filter((run) => run.outcome).length,
	replayMismatches: runs.filter((run) => run.replayMatches === false).length,
	gaps: runs.reduce((sum, run) => sum + run.gaps.length, 0),
	elapsedMs: runs.reduce((sum, run) => sum + run.elapsedMs, 0), llm: usageReport(calls),
};
if (values.json) console.log(JSON.stringify({ schema: 1, runs, aggregate }, null, 2));
else {
	for (const run of runs) {
		console.log(`\n${run.file}\n${report(run).join("\n")}`);
		if (values.details) for (const one of run.llm.purposes) {
			console.log(`  ${one.role}: ${one.about} | ${one.calls} calls | median ${duration(one.medianMs)} p95 ${duration(one.p95Ms)} | ${one.input} in ${one.output} out`);
		}
	}
	if (runs.length > 1) console.log(`\nAll ${runs.length} runs: ${aggregate.finished} finished, ${aggregate.gaps} gaps, ${duration(aggregate.elapsedMs)} summed elapsed\n${bill(calls).join("\n")}`);
}
