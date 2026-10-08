/**
 * The pilot lab. Real logged Jev decisions are rebuilt from their game journals
 * and asked again, live, under the code in this checkout.
 *
 *   build   extract decisions from games and keep those whose first request
 *           rebuilds byte for byte under this code (no model calls)
 *   run     ask Jev about every item R times, a few decisions in flight at once
 *   report  compare runs on a gold set and list steady answers that changed
 *
 * Each item is one decision, run whole through the seat's own loop, inspection
 * stages and rule routes included. A reply is a model's pick, never a verdict
 * on the play; gold labels say which answers carry out the plan or the rules.
 * Past 150 lines so extraction, running and reporting share one item format.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { read, rowsOf } from "../src/core/journal.ts";
import { load as loadRules, type Rules } from "../src/core/rules.ts";
import { aiSeat } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { decisionApi, type DecisionApi } from "../src/context/model.ts";
import type { Brief } from "../src/context/brief.ts";
import { decisionFrame, position } from "./benchmark-positions.ts";
import { matchup } from "./matchup-fixture.ts";

export type Item = { id: string; game: string; journal: string; seat: number; clock: number; version: number; workAt: number; helpedAt?: number; refused?: string[];
	turn?: number; step?: string; kind: string; logged: { hash: string; stages: number; answer: string; label?: string } };
type Stage = { choice: string; labels: Record<string, string>; probabilities: Record<string, number>; bytes: number; model?: string };
type Gold = { item: string; category: string; accept: string[]; reason: string };

const sha = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const STOP = new Error("captured");
/** Routes and inspection continue a decision; any other choice ends it. */
const continues = (choice: string) => choice.startsWith("inspect:") || choice.startsWith("rules:");

/** One seat built as seating builds it, asking through `api`. Help is offered because a planner exists; this seat never plans. */
function seat(item: Pick<Item, "seat" | "helpedAt">, api: DecisionApi, brief: Brief | undefined, rules: Rules) {
	return aiSeat({ name: "Lab", judge: true, api, intent: startingIntent(item.seat), rules, chronicle: { briefs: brief ? { [item.seat]: brief } : {}, recaps: [] },
		onGap: (note) => { throw new Error(note); }, ...(item.helpedAt === undefined ? {} : { helpedAt: item.helpedAt }),
		plan: async () => { throw new Error("This decision requests strategy; it is not a pilot decision."); } });
}

/** The first request this checkout's seat sends for an item, without calling a model. */
export async function firstRequest(item: Item, rules: Rules): Promise<string> {
	const { table, brief } = position(item.journal, item.version, item.seat, item.workAt);
	let captured = "";
	const api: DecisionApi = { named: "capture", ask: async (request) => { captured = JSON.stringify(request); throw STOP; } };
	await seat(item, api, brief, rules).answer(decisionFrame(table, item.seat, { ...(item.refused ? { refused: item.refused } : {}) })).catch((error) => { if (error !== STOP) throw error; });
	return captured;
}

type Logged = { id: number; request: { state: Record<string, unknown>; questions: { pick: { criteria: Record<string, string> } } }; choice?: string; failed?: boolean };

/** Decisions in one game's calls log, each a run of requests from one seat at one clock until a choice ends it. */
function decisions(calls: string): Logged[][] {
	const requests = new Map<number, Logged>(), order: Logged[] = [];
	for (const line of readFileSync(calls, "utf8").split("\n").filter(Boolean)) {
		const event = JSON.parse(line);
		if (event.kind !== "classify") continue;
		if (event.event === "request") { const one = { id: event.id, request: event.request }; requests.set(event.id, one); order.push(one); continue; }
		const one = requests.get(event.id);
		if (one) { one.choice = event.result?.answers?.pick?.choice; one.failed = event.result?.stopReason !== "stop"; }
	}
	const groups: Logged[][] = [];
	for (const one of order) {
		const last = groups.at(-1)?.at(-1), state = one.request.state;
		if (last && !last.failed && last.choice && continues(last.choice) && last.request.state.actor === state.actor && last.request.state.version === state.version) groups.at(-1)!.push(one);
		else groups.push([one]);
	}
	return groups;
}

async function build(games: string[], out: string, rules: Rules) {
	const items: Item[] = [], dropped: string[] = [], seen = new Set<string>();
	for (const dir of games) {
		const journal = globSync(join(dir, "*.jsonl")).find((one) => !one.endsWith(".calls.jsonl"))!, calls = globSync(join(dir, "*.calls.jsonl"))[0]!;
		const { lines } = read(journal), rows = rowsOf(lines), game = basename(dir);
		const helped = new Map<string, number>();
		for (const group of decisions(calls)) {
			const first = group[0]!, final = group.at(-1)!, state = first.request.state as { actor: number; version: number; window: { turn?: number; step?: string }; kind: string; refused?: string[] };
			const key = `${state.actor}:${state.version}`, at = helped.get(key) ?? 0;
			if (final.choice === "ask:help") helped.set(key, at + 1);
			if (final.failed || !final.choice) { dropped.push(`${game} ${key}: no usable final answer`); continue; }
			const version = rows.filter((row) => (row.clock ?? 0) <= state.version).length;
			const recorded = lines.filter((line) => "work" in line && line.v === version).length;
			const logged = JSON.stringify(first.request), hash = sha(logged);
			const options = (final.request.state.options ?? []) as { id: string; label: string }[];
			const base: Item = { id: `${game}:${key}:${at}`, game, journal, seat: state.actor, clock: state.version, version, workAt: 0,
				...(at ? { helpedAt: state.version } : {}), ...(state.refused?.length ? { refused: state.refused } : {}),
				...(state.window.turn === undefined ? {} : { turn: state.window.turn }), ...(state.window.step ? { step: state.window.step } : {}), kind: state.kind,
				logged: { hash, stages: group.length, answer: final.choice, ...(options.find((one) => one.id === final.choice) ? { label: options.find((one) => one.id === final.choice)!.label } : {}) } };
			let match: Item | undefined;
			for (let workAt = 0; workAt <= recorded && !match; workAt++) {
				const candidate = { ...base, workAt };
				try { if (await firstRequest(candidate, rules) === logged) match = candidate; } catch { /* a cut that does not rebuild the decision */ }
			}
			if (!match) { dropped.push(`${game} ${key}: rebuilt request differs from the logged one`); continue; }
			if (seen.has(hash)) continue;
			seen.add(hash); items.push(match);
		}
		console.log(`${game}: ${items.filter((one) => one.game === game).length} items`);
	}
	writeFileSync(out, items.map((one) => JSON.stringify(one)).join("\n") + "\n");
	writeFileSync(out.replace(/\.jsonl$/, ".dropped.txt"), dropped.join("\n") + "\n");
	console.log(`${items.length} items kept, ${dropped.length} dropped (see ${out.replace(/\.jsonl$/, ".dropped.txt")})`);
}

/** A bounded pool: at most `limit` tasks in flight. */
async function pool<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
	const results: T[] = [];
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => { while (next < tasks.length) { const at = next++; results[at] = await tasks[at]!(); } }));
	return results;
}

async function run(items: Item[], repeat: number, limit: number, out: string, arm: string, rules: Rules) {
	const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
	const { cast, rosterFor } = await import("../src/context/roles.ts");
	const { tally } = await import("../src/context/spend.ts");
	const runtime = await ModelRuntime.create();
	const jev = cast(rosterFor({ every: { summary: "off" } }), { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") }).find((one) => one.role === "decide")!;
	if (!jev.model || jev.model.type !== "classifier") throw new Error(jev.problem ?? "Jev does not resolve to a classifier.");
	if (existsSync(join(out, "results.jsonl"))) throw new Error("Choose a fresh --out directory.");
	mkdirSync(out, { recursive: true });
	const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), dirty = execFileSync("git", ["status", "--porcelain", "src", "tools"], { encoding: "utf8" }).trim();
	writeFileSync(join(out, "meta.json"), JSON.stringify({ arm, revision, dirty, repeat, items: items.length, started: new Date().toISOString() }, null, 2) + "\n");
	const measured = tally();
	let done = 0;
	await pool(items.map((item) => async () => {
		const { table, brief } = position(item.journal, item.version, item.seat, item.workAt);
		const frame = decisionFrame(table, item.seat, { ...(item.refused ? { refused: item.refused } : {}) });
		await Promise.all(Array.from({ length: repeat }, async (_, iteration) => {
			const stages: Stage[] = [], began = Date.now();
			// Stages run one after another, so the last reply's model belongs to the stage being recorded.
			let model: string | undefined;
			const live = decisionApi(async (classifier, request, options) => {
				for (let attempt = 0; ; attempt++) {
					const result = await runtime.classify(classifier, request, options);
					model = `${result.provider}/${result.model}`;
					if (result.stopReason === "stop" || attempt === 3) return result;
					await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
				}
			}, jev.model as never, { tally: measured, seat: item.seat });
			const api: DecisionApi = { named: live.named, async ask(request, about) {
				const answers = await live.ask(request, about), pick = answers.pick as { choice: string; probabilities: Record<string, number> };
				const labels = Object.fromEntries(((request.state.options ?? []) as { id: string; label: string }[]).map((one) => [one.id, one.label]));
				stages.push({ choice: pick.choice, labels, probabilities: pick.probabilities, bytes: JSON.stringify(request).length, ...(model ? { model } : {}) });
				return answers;
			} };
			let answer = "error", error: string | undefined;
			try {
				const reply = await seat(item, api, brief, rules).answer(structuredClone(frame));
				answer = reply.kind === "pick" ? reply.option : reply.kind === "work" ? "ask:help" : reply.kind === "object" ? `object:${reply.row}` : reply.kind;
			} catch (caught) { error = String(caught); }
			const label = stages.at(-1)?.labels[answer];
			appendFileSync(join(out, "results.jsonl"), JSON.stringify({ item: item.id, arm, iteration, answer, ...(label ? { label } : {}), stages, ms: Date.now() - began, ...(error ? { error } : {}) }) + "\n");
		}));
		if (++done % 25 === 0) console.log(`${arm}: ${done}/${items.length} items`);
	}), limit);
	console.log(`${arm}: ${items.length} items x ${repeat} done, ${measured.spent().length} calls`);
}

type Row = { item: string; arm: string; iteration: number; answer: string; label?: string; stages: Stage[]; error?: string };
const accepts = (gold: Gold, row: Pick<Row, "answer" | "label">) => gold.accept.some((pattern) => pattern === row.answer || pattern.startsWith("/") && new RegExp(pattern.slice(1, pattern.lastIndexOf("/")), pattern.slice(pattern.lastIndexOf("/") + 1)).test(`${row.answer} ${row.label ?? ""}`));
const modal = (rows: Row[]) => { const counts = new Map<string, number>(); for (const one of rows) counts.set(one.answer, (counts.get(one.answer) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1])[0] ?? ["none", 0]; };

/** Per item: acceptable pick rate and the final stage's probability on acceptable answers. */
function score(rows: Row[], gold: Gold) {
	const rate = rows.filter((one) => accepts(gold, one)).length / rows.length;
	const mass = rows.reduce((sum, one) => {
		const last = one.stages.at(-1);
		return sum + (last ? Object.entries(last.probabilities).filter(([id]) => accepts(gold, { answer: id, ...(last.labels[id] ? { label: last.labels[id] } : {}) })).reduce((n, [, p]) => n + p, 0) : 0);
	}, 0) / rows.length;
	return { rate, mass, modal: accepts(gold, { answer: modal(rows)[0], label: rows.find((one) => one.answer === modal(rows)[0])?.label }) };
}

function report(dirs: string[], goldPath: string, items: Item[]) {
	const gold = existsSync(goldPath) ? JSON.parse(readFileSync(goldPath, "utf8")) as Gold[] : [];
	const runs = dirs.map((dir) => ({ dir, meta: JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as { arm: string; revision: string },
		rows: readFileSync(join(dir, "results.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Row) }));
	const byItem = (rows: Row[]) => { const grouped = new Map<string, Row[]>(); for (const one of rows) grouped.set(one.item, [...grouped.get(one.item) ?? [], one]); return grouped; };
	const lines = [`# Pilot lab report`, "", `Gold items: ${gold.length}. Runs: ${runs.map((one) => `${one.meta.arm} (${one.meta.revision.slice(0, 7)})`).join(", ")}.`, ""];
	const categories = [...new Set(gold.map((one) => one.category))].sort();
	lines.push(`| Category | n | ${runs.map((one) => `${one.meta.arm} rate / mass / modal`).join(" | ")} |`, `| --- | --- | ${runs.map(() => "---").join(" | ")} |`);
	for (const category of [...categories, "all"]) {
		const golds = gold.filter((one) => category === "all" || one.category === category);
		lines.push(`| ${category} | ${golds.length} | ${runs.map((run) => {
			const grouped = byItem(run.rows), scored = golds.flatMap((one) => grouped.get(one.item)?.length ? [score(grouped.get(one.item)!, one)] : []);
			const mean = (pick: (one: ReturnType<typeof score>) => number) => scored.length ? (scored.reduce((n, one) => n + pick(one), 0) / scored.length).toFixed(2) : "-";
			return `${mean((one) => one.rate)} / ${mean((one) => one.mass)} / ${mean((one) => Number(one.modal))}`;
		}).join(" | ")} |`);
	}
	const help = (run: (typeof runs)[number], warranted: boolean) => {
		const golds = gold.filter((one) => one.accept.includes("ask:help") === warranted), grouped = byItem(run.rows);
		const rows = golds.flatMap((one) => grouped.get(one.item) ?? []);
		return rows.length ? `${(rows.filter((one) => one.answer === "ask:help").length / rows.length).toFixed(2)} of ${rows.length}` : "-";
	};
	lines.push("", `| Help rate | ${runs.map((one) => one.meta.arm).join(" | ")} |`, `| --- | ${runs.map(() => "---").join(" | ")} |`,
		`| where help is wrong | ${runs.map((run) => help(run, false)).join(" | ")} |`, `| where help is right | ${runs.map((run) => help(run, true)).join(" | ")} |`);
	const size = (run: (typeof runs)[number]) => { const bytes = run.rows.flatMap((one) => one.stages.map((stage) => stage.bytes)).sort((a, b) => a - b); return bytes.length ? `${bytes[Math.floor(bytes.length / 2)]} / ${bytes.at(-1)}` : "-"; };
	const calls = (run: (typeof runs)[number]) => (run.rows.reduce((n, one) => n + one.stages.length, 0) / Math.max(1, run.rows.length)).toFixed(2);
	lines.push("", `| Requests | ${runs.map((one) => one.meta.arm).join(" | ")} |`, `| --- | ${runs.map(() => "---").join(" | ")} |`,
		`| median / max bytes | ${runs.map(size).join(" | ")} |`, `| Jev calls per decision | ${runs.map(calls).join(" | ")} |`,
		`| errors | ${runs.map((run) => run.rows.filter((one) => one.error).length).join(" | ")} |`);
	if (runs.length > 1) {
		const [control, ...variants] = runs, steady = byItem(control!.rows), labelled = new Set(gold.map((one) => one.item));
		for (const variant of variants) {
			const grouped = byItem(variant.rows), changed = [...steady].filter(([id, rows]) => !labelled.has(id) && modal(rows)[1] >= Math.ceil(rows.length * 0.8) && grouped.get(id)?.length && modal(grouped.get(id)!)[0] !== modal(rows)[0]);
			lines.push("", `## Steady control answers that changed in ${variant.meta.arm} (${changed.length})`, ...changed.map(([id, rows]) => `- ${id} (${items.find((one) => one.id === id)?.kind ?? "?"}, ${items.find((one) => one.id === id)?.step ?? ""}): ${modal(rows)[0]} -> ${modal(grouped.get(id)!)[0]}`));
		}
	}
	return lines.join("\n");
}

export async function corpus(argv: string[]) {
	const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: { corpus: { type: "string" }, items: { type: "string" }, gold: { type: "string" }, only: { type: "string" },
		repeat: { type: "string", default: "5" }, concurrency: { type: "string", default: "4" }, arm: { type: "string", default: "control" }, out: { type: "string" } } });
	const rules = loadRules(matchup.rules.path), mode = values.corpus;
	const load = (path: string) => readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Item);
	if (mode === "build") return build(positionals, values.out ?? ".pi/jev-lab/corpus.jsonl", rules);
	if (!values.items) throw new Error("--items names the corpus file.");
	let items = load(values.items);
	if (values.only === "gold") { const gold = new Set((JSON.parse(readFileSync(values.gold!, "utf8")) as Gold[]).map((one) => one.item)); items = items.filter((one) => gold.has(one.id)); }
	else if (values.only) { const listed = new Set(readFileSync(values.only, "utf8").split("\n").filter(Boolean)); items = items.filter((one) => listed.has(one.id)); }
	if (mode === "run") return run(items, Number(values.repeat), Number(values.concurrency), values.out ?? join(dirname(values.items), "runs", `${values.arm}-${Date.now()}`), values.arm!, rules);
	if (mode === "report") { const text = report(positionals, values.gold ?? "", items); if (values.out) writeFileSync(values.out, text + "\n"); console.log(text); return; }
	throw new Error("--corpus is build, run or report.");
}
