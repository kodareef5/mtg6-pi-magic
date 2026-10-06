#!/usr/bin/env node
/** Render a saved run as a self-contained timeline. Legacy turns come from observed Jev requests. */
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { timeline } from "./game-timeline.ts";
import type { GameResult } from "./game-report.ts";
import type { TurnMark } from "../src/context/spend.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
	out: { type: "string", short: "o" }, trace: { type: "string" }, help: { type: "boolean" },
} });
if (values.help || positionals.length !== 1) {
	console.log("usage: npm run timeline -- result.json [-o timeline.html] [--trace calls.jsonl]\nUses the result's trace for older turn markers when present. Calls no models.");
	process.exit(values.help ? 0 : 1);
}
const file = positionals[0]!, result = JSON.parse(readFileSync(file, "utf8")) as GameResult;
const trace = values.trace ?? result.trace;
if (values.trace && !existsSync(values.trace)) throw new Error(`No trace at ${values.trace}.`);
const turns: TurnMark[] = [];
if (!result.timing?.turns?.length && trace && existsSync(trace)) {
	const lines = createInterface({ input: createReadStream(trace), crlfDelay: Infinity });
	for await (const line of lines) {
		const event = JSON.parse(line) as { event: string; kind: string; at: number; request?: { state?: { window?: { kind: string; turn: number; active: number } } } };
		if (event.event !== "request" || event.kind !== "classify") continue;
		const window = event.request?.state?.window;
		if (window?.kind !== "turn" || turns.at(-1)?.turn === window.turn && turns.at(-1)?.active === window.active) continue;
		turns.push({ at: event.at, turn: window.turn, active: window.active, source: "first-observed" });
	}
}
const out = values.out ?? file.replace(/(?:\.result)?\.json$/, "") + ".timeline.html";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, timeline(result, turns));
console.log(resolve(out));
