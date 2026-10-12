#!/usr/bin/env node
/** Whole-game invariant tests have a separate lane; every other test runs by default. */
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { parseArgs } from "node:util";
import { availableParallelism } from "node:os";

const slow = new Set(["abilities.test.ts", "answers.test.ts", "context.test.ts", "game.test.ts", "journal.test.ts",
	"phases.test.ts", "plans.test.ts", "reason.test.ts", "rulings.test.ts"]);
const { values, positionals } = parseArgs({ allowPositionals: true, options: { concurrency: { type: "string" }, list: { type: "boolean" } } });
const mode = positionals[0] ?? "fast";
if (!["fast", "slow", "all"].includes(mode) || positionals.length > 1) throw new Error("Use test.ts [fast|slow|all] [--concurrency N] [--list]");
const files = readdirSync(new URL("../test/", import.meta.url), { recursive: true }).map(String).filter((name) => name.endsWith(".test.ts")).sort();
for (const file of slow) if (!files.includes(file)) throw new Error(`Slow test no longer exists: ${file}`);
const selected = files.filter((file) => mode === "all" || slow.has(file) === (mode === "slow"));
const concurrency = Number(values.concurrency ?? Math.min(8, availableParallelism()));
if (!Number.isSafeInteger(concurrency) || concurrency < 1) throw new Error("Test concurrency must be a positive integer");
if (values.list) console.log(selected.join("\n"));
else {
	console.log(`${mode}: ${selected.length}/${files.length} files, concurrency ${concurrency}`);
	const child = spawn(process.execPath, ["--test", `--test-concurrency=${concurrency}`, ...selected.map((file) => `test/${file}`)],
		{ cwd: new URL("../", import.meta.url), stdio: "inherit" });
	child.on("error", (error) => { console.error(error); process.exitCode = 1; });
	child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
