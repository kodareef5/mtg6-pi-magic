#!/usr/bin/env node
/** Bulk games of the pinned matchup on fresh seeds. One source game's card assessments and briefs are
 * carried into each new table, so the pregame is paid once. Seat 0 is always on the play, so odd seeds seat
 * Red first. Each game is its own matchup.ts process, two at a time by default, under a stall watchdog, and
 * the summary reads only the saved results. Past 150 lines so seeding, running and the table stay together. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { keep, open, replay, save } from "../src/core/journal.ts";
import { editWork } from "../src/core/work-tools.ts";
import { dealtTable, decks, matchup, universe } from "./matchup-fixture.ts";
import type { GameResult } from "./game-report.ts";
import { adherence, type Adherence } from "./adherence.ts";
import { collection } from "../src/core/decks.ts";
import { admittedAlpha } from "../src/core/packages.ts";

const { values: a } = parseArgs({ options: {
	games: { type: "string", default: "20" }, arm: { type: "string", default: "baseline" }, "seed-base": { type: "string" },
	source: { type: "string", default: ".pi/resume-20261007/scoped-full-game/next-version-gate-20261005-1791339573156.jsonl" },
	strategy: { type: "string" }, green: { type: "string" }, red: { type: "string" }, jobs: { type: "string", default: "2" },
	random: { type: "string" }, pool: { type: "string" }, alpha: { type: "boolean", default: false },
	turns: { type: "string", default: "40" }, stall: { type: "string", default: "300" }, out: { type: "string", default: ".pi/sim" },
	report: { type: "string" }, "seeds-only": { type: "boolean", default: false }, help: { type: "boolean", short: "h" } } });
if (a.help) {
	console.log(`usage: sim.ts [--games N] [--arm NAME] [--seed-base S] [--source V0.jsonl] [--random N [--pool A,B,C]] [--strategy P] [--green P] [--red P] [-j 2] [--out DIR]
       sim.ts --report DIR/ARM

  --games N        fresh seeds; odd ones seat Red first, so each list is on the play half the time
  --arm NAME       results land in OUT/NAME; the seeds in OUT/seeds, shared by every arm
  --seed-base S    seeds are S-0, S-1, ...; defaults to the clock
  --source J       the finished version-zero journal whose card assessments and briefs every game carries
  --strategy P     this arm's strategy model pattern, such as gpt-6.1-sol:high
  --random N       N fresh games on seeded random pairings from the pool instead of carried seeds; each pairing's first-named
                   deck is on the play, and odd games swap. Setup interprets cards and writes briefs live (stored packages first)
  --pool A,B,C     the decks random pairings draw from; default every collection deck with a web source
  --alpha          draw from admitted imported main decks; register no sideboards and journal those exact lists
  --green P        the strategy pattern for whichever seat plays the Green list; --red likewise. One roster facing another:
                   run the arm twice with the patterns swapped and count wins by roster, not by list
  --jobs N         games at once. Two: three games at once hit the strategy provider's rate limit
  --stall S        a game with no gameplay or inference trace activity this long is killed and counted as a stall
  --seeds-only     write the seed journals and stop, with no model call
  --report DIR     summarise saved results in DIR without playing

  Every game is one matchup.ts process. A finished arm prints one table and writes summary.md and summary.json
  beside the games. Replay parity and zero gaps are health, not strength; read missed wins from the journals.`);
	process.exit(0);
}

type Record_ = { seed: string; path: string; swapped: boolean; decks?: [string, string] };

/** New tables at new seeds, carrying card packages and briefs by deck, never dealt state or tactical work. */
function seedGames(base: string, n: number, source: string, dir: string): Record_[] {
	let carried: ReturnType<typeof replay> | undefined;
	mkdirSync(dir, { recursive: true });
	const records: (Record_ & { sha256: string })[] = [];
	for (let i = 0; i < n; i++) {
		const seed = `${base}-${i}`, swapped = i % 2 === 1, path = join(dir, `${seed}.jsonl`);
		if (!existsSync(path)) {
			carried ??= replay(source, dealtTable, 0, { cards: matchup.cards, rules: matchup.rules });
			const entrants = decks.map((one, at) => ({ name: at ? "Red" : "Green", deck: one }));
			const table = start(standard, swapped ? [...entrants].reverse() : entrants, seed, universe, { announcementsFrom: 0, excessManaFrom: 0, searchesFrom: 0, deathtouchFrom: 0, discardsFrom: 0 });
			const journal = open(path, { id: seed, format: "standard", seed, announcementsFrom: 0, excessManaFrom: 0, searchesFrom: 0, deathtouchFrom: 0, discardsFrom: 0, seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })),
				cards: matchup.cards, rules: matchup.rules, created: new Date().toISOString() });
			const prepared: { seat: number; made: unknown }[] = [];
			for (const seat of table.seats) {
				const from = carried.table.seats.find((one) => one.deck.name === seat.deck.name);
				if (!from) throw new Error(`The source game has no seat with the deck ${seat.deck.name}.`);
				const packages = carried.table.work[from.id]?.packages ?? [];
				// Assessments name card types, never a physical identity from the source game.
				if (packages.some((pack) => /"(?:refs|ids)":/.test(JSON.stringify(pack)))) throw new Error("A source-bound package cannot cross games.");
				editWork(table, seat.id, packages.map((pack) => ({ do: "package.put" as const, package: pack })), `carry-assessment-${seat.id}`);
				const made = carried.prepared.find((one) => one.seat === from.id)?.made;
				if (!made) throw new Error(`The source game has no brief for seat ${from.id}.`);
				prepared.push({ seat: seat.id, made: { ...(made as object), seat: seat.id } });
			}
			save(journal, table);
			for (const one of prepared) keep(journal, one.seat, one.made);
			const checked = replay(path, dealtTable);
			if (checked.table.ledger.length || Object.values(checked.table.work).some((work) => work?.plan?.steps.length)) throw new Error("Tactical work crossed seeds.");
		}
		records.push({ seed, path, swapped, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") });
	}
	writeFileSync(join(dir, "provenance.json"), JSON.stringify({ source, sourceVersion: 0, carries: "card packages and matchup briefs only, by deck; new core setup per seed; odd seeds seat Red first", records }, null, 2) + "\n");
	return records;
}

type Run = { seed: string; exit: number | null; stalled: boolean; startedAt: number; endedAt: number };

/** One game in its own process. Gameplay and inference activity both reset the stall deadline. */
function playOne(record: Record_, dir: string, options: { turns: string; stall: number; strategy?: string; green?: string; red?: string }): Promise<Run> {
	const log = join(dir, `${record.seed}.log`), out = join(dir, record.seed);
	mkdirSync(out, { recursive: true });
	const args = ["tools/matchup.ts", ...(record.decks ? ["--decks", record.decks.join(","), "--seed", record.seed] : ["--resume", record.path, "--version", "0"]), "--turns", options.turns, "--out", out,
		...(a.alpha ? ["--alpha"] : []),
		...(options.strategy ? ["--strategy", options.strategy] : []), ...(options.green ? ["--green", options.green] : []), ...(options.red ? ["--red", options.red] : [])];
	return new Promise((resolve) => {
		const fd = openSync(log, "a"), startedAt = Date.now();
		const child = spawn(process.execPath, args, { stdio: ["ignore", fd, fd], detached: true });
		let stalled = false;
		const watchdog = setInterval(() => {
			// Pregame can make many healthy calls before the first game action reaches the log.
			const activity = Math.max(statSync(log).mtimeMs, ...readdirSync(out).filter((name) => name.endsWith(".calls.jsonl"))
				.map((name) => statSync(join(out, name)).mtimeMs));
			if ((Date.now() - activity) / 1000 > options.stall) { stalled = true; try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already gone */ } }
		}, 30_000);
		child.on("exit", (code) => {
			clearInterval(watchdog); closeSync(fd);
			const run: Run = { seed: record.seed, exit: code, stalled, startedAt, endedAt: Date.now() };
			writeFileSync(join(out, "run.json"), JSON.stringify(run) + "\n");
			console.log(`${line(summarizeGame(out, record.swapped))}`);
			resolve(run);
		});
	});
}

/** Seeded random pairings from the pool: a small xorshift from the seed text, so a base name names the same games again. */
function randomGames(base: string, n: number, pool: string[], dir: string): Record_[] {
	if (pool.length < 2) throw new Error("A random pool needs at least two decks.");
	let x = [...`${base}`].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 2166136261) || 1;
	const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
	mkdirSync(dir, { recursive: true });
	const records: Record_[] = [];
	for (let i = 0; i < n; i++) {
		const first = pool[next() % pool.length]!;
		let second = pool[next() % pool.length]!;
		while (second === first) second = pool[next() % pool.length]!;
		const swapped = i % 2 === 1;
		records.push({ seed: `${base}-r${i}`, path: "", swapped, decks: swapped ? [second, first] : [first, second] });
	}
	writeFileSync(join(dir, "provenance.json"), JSON.stringify({ pool, games: records.map((one) => ({ seed: one.seed, decks: one.decks })), carries: "nothing; stored card packages are loaded by the matchup tool, briefs are written live" }, null, 2) + "\n");
	return records;
}

type Row = { seed: string; onPlay: string; winner: string; turn: number; wallMin: number; cost: number | null; strategyCalls: number; decideCalls: number;
	waitMin: number | null; help: number; gaps: number; replay: string; stalled: boolean; funding: string[]; plan?: Adherence };

/** Read one game's saved result. Funding problems are read from the failed calls, so a run short of credit says so. */
function summarizeGame(dir: string, swapped: boolean): Row {
	const file = readdirSync(dir).find((name) => name.endsWith(".result.json"));
	const run = existsSync(join(dir, "run.json")) ? JSON.parse(readFileSync(join(dir, "run.json"), "utf8")) as Run : undefined;
	const seed = dir.split("/").at(-1)!;
	if (!file) return { seed, onPlay: swapped ? "Red" : "Green", winner: run?.stalled ? "stalled" : "no result", turn: 0, wallMin: run ? (run.endedAt - run.startedAt) / 60_000 : 0, cost: null, strategyCalls: 0, decideCalls: 0, waitMin: null, help: 0, gaps: 0, replay: "?", stalled: !!run?.stalled, funding: [] };
	const result = JSON.parse(readFileSync(join(dir, file), "utf8")) as GameResult;
	const seats = result.seats ?? [];
	const winner = result.outcome ? seats.find((one) => result.outcome!.results[one.id] === "win")?.name ?? "draw" : result.error ? "failed" : run?.stalled ? "stalled" : "stopped";
	const role = (name: string) => result.llm?.roles.find((one) => one.role === name)?.calls ?? 0;
	const funding = [...new Set(result.calls.flatMap((call) => call.failed && /402|insufficient|credit|quota|429|rate limit|billing|payment|exceeded your/i.test(call.failed) ? [call.failed.slice(0, 120)] : []))];
	const journal = readdirSync(dir).find((name) => name.endsWith(".jsonl") && !name.endsWith(".calls.jsonl"));
	let plan: Adherence | undefined;
	try { plan = journal ? adherence(join(dir, journal)) : undefined; } catch { /* a torn or foreign journal reports no adherence */ }
	return { seed, onPlay: seats[0]?.name ?? "?", winner, turn: result.turn, wallMin: result.elapsedMs / 60_000, cost: result.llm?.total.cost ?? null, ...(plan ? { plan } : {}),
		strategyCalls: role("strategy"), decideCalls: role("decide"), waitMin: result.planned ? result.planned.reduce((sum, one) => sum + one.waitedMs, 0) / 60_000 : null,
		help: result.interruptions?.help ?? 0, gaps: result.gaps.length, replay: result.replayMatches === undefined ? "?" : result.replayMatches ? "yes" : "NO", stalled: !!run?.stalled, funding };
}

const line = (row: Row) => `${row.seed.padEnd(22)} play ${row.onPlay.padEnd(5)} ${row.winner.padEnd(9)} T${String(row.turn).padStart(2)}  ${row.wallMin.toFixed(1).padStart(5)}m  ` +
	`$${(row.cost ?? 0).toFixed(2)}  strategy ${String(row.strategyCalls).padStart(3)}  jev ${String(row.decideCalls).padStart(3)}  wait ${row.waitMin === null ? "?" : row.waitMin.toFixed(1) + "m"}  help ${row.help}  gaps ${row.gaps}  plan ${row.plan ? `${row.plan.onPlan}/${row.plan.due}` : "?"}  replay ${row.replay}${row.stalled ? "  STALLED" : ""}${row.funding.length ? "  FUNDING: " + row.funding[0] : ""}`;

const median = (xs: number[]) => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[Math.floor((s.length - 1) / 2)]! : 0; };

/** One table for an arm: strength by deck and by who was on the play, beside cost, time and health. */
function summarizeArm(dir: string): { rows: Row[]; markdown: string[] } {
	const rows = readdirSync(dir).filter((name) => { try { return statSync(join(dir, name)).isDirectory(); } catch { return false; } })
		.map((name) => summarizeGame(join(dir, name), false)).sort((p, q) => p.seed.localeCompare(q.seed, undefined, { numeric: true }));
	const unfinished = new Set(["stopped", "failed", "stalled", "no result"]);
	const finished = rows.filter((row) => !unfinished.has(row.winner));
	const names = [...new Set(rows.flatMap((row) => [row.onPlay, row.winner]))].filter((name) => !unfinished.has(name) && name !== "draw" && name !== "?").sort();
	const count = (pick: (row: Row) => boolean) => finished.filter(pick).length;
	const costs = rows.flatMap((row) => row.cost === null ? [] : [row.cost]);
	const markdown = [
		`| Measure | ${dir.split("/").at(-1)} |`, "| --- | --- |",
		`| Games finished / started | ${finished.length} / ${rows.length} |`,
		...names.map((name) => `| ${name} wins | ${count((row) => row.winner === name)} |`),
		`| Wins by the seat on the play | ${count((row) => row.winner === row.onPlay)} |`, `| Wins by the seat on the draw | ${count((row) => row.winner !== row.onPlay && row.winner !== "draw")} |`,
		`| Stopped, failed or stalled | ${rows.length - finished.length} (stalled ${rows.filter((row) => row.stalled).length}) |`,
		`| Median turns | ${median(finished.map((row) => row.turn))} |`, `| Median wall | ${median(finished.map((row) => row.wallMin)).toFixed(1)} min |`,
		`| Median strategy wait | ${median(finished.flatMap((row) => row.waitMin === null ? [] : [row.waitMin])).toFixed(1)} min |`,
		`| Median cost / total | $${median(costs).toFixed(2)} / $${costs.reduce((sum, cost) => sum + cost, 0).toFixed(2)} |`,
		`| Median strategy calls / Jev calls | ${median(finished.map((row) => row.strategyCalls))} / ${median(finished.map((row) => row.decideCalls))} |`,
		`| Plan adherence: on plan / due, passed over, deviated | ${["onPlan", "due", "passedOver", "deviated"].map((key) => rows.reduce((sum, row) => sum + (row.plan?.[key as keyof Adherence] ?? 0), 0)).reduce((text, n, i) => i === 1 ? `${text} / ${n}` : i === 2 ? `${text}, ${n}` : i === 3 ? `${text}, ${n}` : String(n), "")} |`,
		`| Help requests, total | ${rows.reduce((sum, row) => sum + row.help, 0)} |`, `| Gaps, total | ${rows.reduce((sum, row) => sum + row.gaps, 0)} |`,
		`| Replay mismatches | ${rows.filter((row) => row.replay === "NO").length} |`,
		...(rows.some((row) => row.funding.length) ? [`| FUNDING problems | ${rows.flatMap((row) => row.funding).slice(0, 3).join("; ")} |`] : []),
	];
	return { rows, markdown };
}

if (a.report) {
	const { rows, markdown } = summarizeArm(a.report);
	for (const row of rows) console.log(line(row));
	console.log(`\n${markdown.join("\n")}`);
	writeFileSync(join(a.report, "summary.md"), markdown.join("\n") + "\n");
	writeFileSync(join(a.report, "summary.json"), JSON.stringify(rows, null, 2) + "\n");
	process.exit(0);
}

if (a.alpha && !a.random) throw new Error("--alpha needs --random; a carried journal owns its registered lists.");
const jobs = Math.max(1, Number(a.jobs)), base = a["seed-base"] ?? `sim-${Date.now()}`;
const pool = a.pool ? a.pool.split(",").map((one) => one.trim()) : [...collection().values()].filter((one) => /^https?:/.test(one.source)).map((one) => one.name);
if (a.alpha) {
	const admitted = new Set(admittedAlpha(universe).map((one) => one.name));
	if (a.pool && pool.some((name) => !admitted.has(name))) throw new Error(`Alpha pool includes decks without standing coverage: ${pool.filter((name) => !admitted.has(name)).join(", ")}`);
	pool.splice(0, pool.length, ...pool.filter((name) => admitted.has(name)));
}
const games = a.random ? Number(a.random) : Number(a.games);
const records = a.random ? randomGames(base, games, pool, join(a.out!, a.arm!)) : seedGames(base, games, a.source!, join(a.out!, "seeds"));
console.log(a.random ? `${records.length} random pairings from ${pool.length} decks` : `${records.length} seeds under ${join(a.out!, "seeds")} from ${a.source} version 0`);
if (a["seeds-only"]) process.exit(0);
const arm = join(a.out!, a.arm!);
mkdirSync(arm, { recursive: true });
writeFileSync(join(arm, "arm.json"), JSON.stringify({ arm: a.arm, strategy: a.strategy ?? "roster default", ...(a.green ? { green: a.green } : {}), ...(a.red ? { red: a.red } : {}), turns: a.turns, jobs, seeds: base, games, startedAt: new Date().toISOString() }, null, 2) + "\n");
console.log(`Playing ${games} games into ${arm}, ${jobs} at a time${a.strategy ? `, strategy ${a.strategy}` : ""}${a.green ? `, Green on ${a.green}` : ""}${a.red ? `, Red on ${a.red}` : ""}`);
let next = 0;
await Promise.all(Array.from({ length: jobs }, async () => {
	for (let record = records[next++]; record; record = records[next++]) await playOne(record, arm, { turns: a.turns!, stall: Number(a.stall), ...(a.strategy ? { strategy: a.strategy } : {}), ...(a.green ? { green: a.green } : {}), ...(a.red ? { red: a.red } : {}) });
}));
const { rows, markdown } = summarizeArm(arm);
console.log(`\n${markdown.join("\n")}`);
writeFileSync(join(arm, "summary.md"), markdown.join("\n") + "\n");
writeFileSync(join(arm, "summary.json"), JSON.stringify(rows, null, 2) + "\n");
if (rows.some((row) => row.funding.length)) console.log("\nFUNDING: some calls failed for credit or quota. The API key needs money.");
