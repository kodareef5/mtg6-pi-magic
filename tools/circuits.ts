#!/usr/bin/env node
/** Reproducible choreography experiments. No network calls or credentials. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { exercise } from "./circuit-fixture.ts";
import { inspector } from "./circuit-view.ts";
import { abilityExercise } from "./ability-fixture.ts";

const { values } = parseArgs({ options: { out: { type: "string" }, quiet: { type: "boolean" } } });
const inspected: unknown[] = [];
for (const lost of [false, true]) {
	const run = await exercise(lost);
	const name = lost ? "lost-reservation" : "normal";
	if (!run.outcome || run.table.gaps.length) throw new Error(`${name}: ${run.table.gaps.join("; ") || "unfinished"}`);
	const lines = [
		`${name}: real table, authored strategy and classifier doubles; no paid calls.`,
		...run.trace.map((row) => `  Turn ${row.turn}, ${row.step}: ${row.event}`),
		`${run.plans} strategy calls; ${run.batches} review batches for ${run.concernQuestions} concerns; ${run.calls} classifier calls.`,
		`${run.table.work[0]!.draft!.next} draft steps executed; ${run.table.work[0]!.tasks.find((task) => task.id === "monitor")!.runs.length} upkeep reviews; ${run.table.gaps.length} gaps.`,
	];
	console.log((values.quiet ? [lines[0], ...lines.slice(-2)] : lines).join("\n"));
	inspected.push({ name, plans: run.plans, batches: run.batches, concernQuestions: run.concernQuestions, calls: run.calls, trace: run.trace, history: run.table.workLog });
	if (values.out) {
		mkdirSync(values.out, { recursive: true });
		writeFileSync(join(values.out, `${name}.txt`), lines.join("\n") + "\n");
		writeFileSync(join(values.out, `${name}.json`), JSON.stringify({ trace: run.trace, equipment: run.table.work[0], history: run.table.workLog, ledger: run.table.ledger }, null, 2) + "\n");
	}
}
const exchange = await abilityExercise();
if (!exchange.outcome || exchange.table.gaps.length) throw new Error(`Ability exchange: ${exchange.table.gaps.join("; ") || "unfinished"}`);
const summary = [
	"ability-exchange: established board fixture, real payments and stack; authored model doubles.",
	...exchange.trace.map((row) => `  Turn ${row.turn}, ${row.step}: ${row.event}`),
	`${exchange.plans} strategy calls; ${exchange.exchangeCalls} classifier calls through the exchange; 4 activations; 2 delegated draws; 2 discard choices; ${exchange.table.gaps.length} gaps.`,
];
console.log((values.quiet ? [summary[0], summary.at(-1)] : summary).join("\n"));
inspected.push({ name: "ability-exchange", plans: exchange.plans, batches: exchange.batches, concernQuestions: exchange.concernQuestions,
	calls: exchange.exchangeCalls, callScope: "through the ability exchange", trace: exchange.trace, history: exchange.history });
if (values.out) {
	writeFileSync(join(values.out, "ability-exchange.txt"), summary.join("\n") + "\n");
	writeFileSync(join(values.out, "ability-exchange.json"), JSON.stringify({ trace: exchange.trace, history: exchange.history, paused: exchange.paused, ledger: exchange.table.ledger }, null, 2) + "\n");
	writeFileSync(join(values.out, "index.html"), inspector(inspected));
	console.log(`Inspector: ${join(values.out, "index.html")}`);
}
