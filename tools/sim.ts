#!/usr/bin/env node
// Play games without a session, write a journal each, print the counters.
//
// The core imports nothing from Pi, so this needs no harness. Inside one game
// everything is serial: one decision outstanding, and provider completion order
// never decides game order. Across games, parallel is free, because two games
// share only the card list and the rules and both are read only.
import { mkdirSync } from "node:fs";
import { parseArgs } from "node:util";

import { load as loadCards } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import { fork, read } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import { start } from "../src/core/table.ts";
import type { LedgerRow, Table } from "../src/core/table.ts";

type Run = {
	game: string;
	turns: number;
	winner: string;
	/** Decisions by why they went that way. A change that turns forced steps into
	 * asked ones costs money without losing a game, so these never merge. */
	why: Record<NonNullable<LedgerRow["why"]>, number>;
	calls: number;
	gaps: number;
	ms: number;
};

/** One line per game, so a long run is readable while it runs. */
const line = (r: Run) =>
	`${r.game}  ${String(r.turns).padStart(3)}t  ${r.winner.padEnd(16)} ` +
	`forced ${String(r.why.forced).padStart(5)}  delegated ${String(r.why.delegated).padStart(4)}  ` +
	`chosen ${String(r.why.chosen).padStart(4)}  declared ${String(r.why.declared).padStart(4)}  ` +
	`calls ${String(r.calls).padStart(4)}  gaps ${r.gaps}  ${r.ms}ms`;

function summarize(runs: Run[]) {
	const sum = (f: (r: Run) => number) => runs.reduce((n, r) => n + f(r), 0);
	const asked = sum((r) => r.why.chosen + r.why.declared);
	const auto = sum((r) => r.why.forced + r.why.delegated);
	const wins = new Map<string, number>();
	for (const r of runs) wins.set(r.winner, (wins.get(r.winner) ?? 0) + 1);
	console.log(`\n${runs.length} games, ${sum((r) => r.turns)} turns, ${sum((r) => r.ms)}ms`);
	console.log(`decisions: ${auto} taken by the table, ${asked} asked of a seat` +
		`${auto + asked ? `, ${((auto / (auto + asked)) * 100).toFixed(1)}% forced or delegated` : ""}`);
	console.log(`model calls: ${sum((r) => r.calls)}   gaps recorded: ${sum((r) => r.gaps)}`);
	for (const [who, n] of [...wins].sort((a, b) => b[1] - a[1])) console.log(`  ${who.padEnd(18)} ${n}`);
}

async function one(seed: string, from: string | undefined, out: string): Promise<Run> {
	/*
	 * 1. With --from, replay that journal prefix and play on from there. A
	 *    fixture is a journal prefix, so a benchmark needs no other format.
	 * 2. Without it, start a fresh table from the decks and this seed.
	 * 3. Open a journal at out/<seed>.jsonl and play, appending as it goes.
	 * 4. Count from the ledger rather than from anything the loop reports, so
	 *    the numbers come from the record and not from a narrator.
	 */
	void [seed, from, out, loadCards, standard, start, fork, read, play, {} as Table];
	throw new Error("one is unwritten. Four steps above.");
}

async function main() {
	const { values: a } = parseArgs({ options: {
		n: { type: "string", default: "1" }, from: { type: "string" }, seed: { type: "string" },
		out: { type: "string", short: "o", default: "games" }, jobs: { type: "string", short: "j", default: "1" },
		quiet: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
	if (a.help) return console.log(`usage: sim.ts [-n GAMES] [--from JOURNAL@VERSION] [--seed SEED] [-o DIR] [-j JOBS] [--quiet]

  -n 100              how many games
  --from game.jsonl@42  start every game from that journal prefix, which is what
                      a frozen benchmark setup is
  --seed S            the first seed; later games count up from it, so a run repeats
  -o DIR              where the journals land
  -j 4                games at once. Each game stays serial inside
  --quiet             the summary only

  Counters are read from each game's ledger. Measure the forced ratio against a
  real decider: a stub that answers everything the same way makes it look
  excellent while the real behaviour is nothing like it.`);

	const n = Number(a.n), jobs = Math.max(1, Number(a.jobs)), base = a.seed ?? String(Date.now());
	mkdirSync(a.out!, { recursive: true });
	const seeds = Array.from({ length: n }, (_, i) => `${base}-${i}`);
	const runs: Run[] = [];
	for (let i = 0; i < seeds.length; i += jobs) {
		const batch = await Promise.all(seeds.slice(i, i + jobs).map((s) => one(s, a.from, a.out!)));
		for (const r of batch) { runs.push(r); if (!a.quiet) console.log(line(r)); }
	}
	summarize(runs);
}
main();
