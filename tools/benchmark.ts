#!/usr/bin/env node
/** Saved decision probes. Default is offline validation; --live spends on explicit model comparisons.
 * A matching property is a narrow regression result, never a gameplay-strength score.
 * Past 150 lines so input validation, model accounting and result saving share one runner. */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { parseArgs, isDeepStrictEqual } from "node:util";
import { replay } from "../src/core/journal.ts";
import { workFrame, planProblems } from "../src/core/work-tools.ts";
import { project, sinceDecision } from "../src/core/view.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { PlanSchema, check, type Plan } from "../src/core/language.ts";
import { checkPlan, type PlanCheck } from "./benchmark-checks.ts";
import { matchTable, matchup, universe } from "./matchup-fixture.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { aiSeat, changes } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { decisionApi, type DecisionApi } from "../src/context/model.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { planWork, prepareTurn } from "../src/context/strategy.ts";
import { reasoner } from "../src/context/reason.ts";
import { tally, type Spend } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { usageReport, bill } from "../src/context/metrics.ts";
import type { Brief } from "../src/context/brief.ts";
import { rule } from "../src/context/ruling.ts";
import { paymentForecast } from "../src/core/budget.ts";
import { playProposal } from "./benchmark-play.ts";

type Case = PlanCheck & { id: string; journal: string; version: number; seat: number; task: "pilot" | "prepare" | "amend" | "repair" | "plan" | "continue" | "judge"; judgeRow?: number; legal?: boolean; objectionRow?: number; avoidObjection?: boolean; property: string; winner?: number; picks?: string[]; refused?: string[];
	pilotPolicy?: string; prepared?: { file: string; name: string } };
const { values } = parseArgs({ options: { positions: { type: "string" }, live: { type: "boolean" }, review: { type: "string" }, task: { type: "string" }, case: { type: "string", multiple: true },
	pilot: { type: "string", default: "jev" }, repeat: { type: "string", default: "1" }, out: { type: "string" }, play: { type: "boolean" },
	answers: { type: "string" }, through: { type: "string" }, decisions: { type: "string" }, "judge-attempts": { type: "string" } } });
const manifest = values.positions ?? join(import.meta.dirname, "benchmarks/positions.json");
const catalog = JSON.parse(readFileSync(manifest, "utf8")) as { journals: Record<string, string>; cases: Case[] };
if (values.play && !values.live || values.answers && !values.play) throw new Error("--play requires --live; --answers requires --play.");
if (values.through && (!values.play || !/^\d+$/.test(values.through))) throw new Error("--through needs --play and a nonnegative turn boundary.");
if (values.decisions && (!values.play || !/^[1-9]\d*$/.test(values.decisions))) throw new Error("--decisions needs --play and a positive recorded-decision boundary.");
if (values["judge-attempts"] && (!values.play || !/^[1-9]\d*$/.test(values["judge-attempts"]))) throw new Error("--judge-attempts needs --play and a positive limit.");
const repeat = Number(values.repeat), pilots = values.pilot === "both" ? ["jev", "luna"] : [values.pilot!];
if (!Number.isInteger(repeat) || repeat < 1 || pilots.some((one) => !["jev", "luna"].includes(one))) throw new Error("Use a positive --repeat and --pilot jev, luna or both.");
const selected = catalog.cases.filter((one) => (!values.task || one.task === values.task) && (!values.case || values.case.includes(one.id)));
if (!selected.length || values.case?.some((id) => !selected.some((one) => one.id === id))) throw new Error("The requested benchmark cases were not found.");
if (values.play && selected.some((one) => ["pilot", "judge"].includes(one.task))) throw new Error("--play continues plans; select preparation, amendment or repair cases.");
if (values.live && selected.some((one) => one.task === "continue") && (!values.play || values.answers)) throw new Error("Continuation cases require --play, without --answers: they resume the prefix's existing work.");
const savedAnswers = values.answers ? JSON.parse(readFileSync(values.answers, "utf8")) as { results: { id: string; iteration: number; plan?: Plan; answer?: { plan?: Plan } }[] } : undefined;
// Committed compressed journals stay outside the published package. Expand only
// the selected inputs and remove temporary copies even when a probe fails.
const scratch = mkdtempSync(join(tmpdir(), "magic-bench-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const journals = new Map<string, string>();
for (const one of selected) if (!journals.has(one.journal)) {
	const path = catalog.journals[one.journal];
	if (!path) throw new Error(`Unknown journal ${one.journal}.`);
	const to = join(scratch, `${one.journal}.jsonl`);
	writeFileSync(to, path.endsWith(".gz") ? gunzipSync(readFileSync(path)) : readFileSync(path));
	journals.set(one.journal, to);
}
const positions = selected.map((one) => {
	const path = catalog.journals[one.journal];
	if (!path) throw new Error(`Unknown journal ${one.journal}.`);
	const saved = replay(journals.get(one.journal)!, (header) => matchTable(header.seed), one.version, { cards: matchup.cards, rules: matchup.rules });
	const frame = workFrame(saved.table, one.seat);
	if (one.task === "pilot") frame.view = project(saved.table, one.seat, sinceDecision(saved.table, one.seat));
	// Supplied coverage changes only plan content, preserving the prefix's progress and physical facts.
	if (one.pilotPolicy) {
		if (one.task !== "pilot" || !frame.view.work?.plan) throw new Error("Supplied pilot coverage requires a pilot case with a plan.");
		const added = JSON.parse(readFileSync(one.pilotPolicy, "utf8")) as Partial<Pick<Plan, "steps" | "may" | "phases">>;
		if (Object.keys(added).some((key) => !["steps", "may", "phases"].includes(key))) throw new Error("Pilot coverage only appends steps, branches and phases.");
		const plan = structuredClone(frame.view.work.plan);
		for (const key of ["steps", "may", "phases"] as const) if (added[key]) Object.assign(plan, { [key]: [...(plan[key] ?? []), ...added[key]!] });
		check(PlanSchema, plan, "Supplied pilot coverage");
		const problems = planProblems(frame, plan);
		if (problems.length) throw new Error(problems.join("; "));
		frame.view.work.plan = plan;
	}
	if (one.refused) {
		if (one.task !== "pilot") throw new Error("Saved transient refusals apply only to a pilot question.");
		frame.refused = one.refused;
	}
	if (one.task === "pilot" && !frame.decision) throw new Error(`${one.id}: this seat has no decision at the recorded prefix.`);
	// Match the physical loop: accepted procedures and plan/resource marks are
	// part of the offered decision, not added by the player adapter.
	const state = one.task === "pilot" && planState(frame);
	if (state && frame.decision) frame.decision = { ...frame.decision, options: annotate(frame.decision.options, state) };
	const brief = saved.prepared.find((entry) => entry.seat === one.seat)?.made as Brief | undefined;
	const preparation = one.prepared && JSON.parse(readFileSync(one.prepared.file, "utf8"));
	const prior = preparation?.results.find((row: { name: string }) => row.name === one.prepared!.name) as { version: number; seat: number; plan: Plan } | undefined;
	if (one.task === "amend" && (!prior?.plan || prior.seat !== one.seat || preparation.source !== path || prior.version >= one.version)) throw new Error(`${one.id}: preparation does not match this position.`);
	const earlier = prior && workFrame(replay(journals.get(one.journal)!, (header) => matchTable(header.seed), prior.version, { cards: matchup.cards, rules: matchup.rules }).table, one.seat);
	if (one.task === "amend") frame.view.work = { ...frame.view.work!, request: "Review the prepared line after the draw against this current position." };
	if (one.task === "repair" && !frame.view.work?.request) throw new Error(`${one.id}: repair fixture needs a pending planning request.`);
	console.log(`${one.id}: ${one.task}, seat ${one.seat}, decision ${one.version}; ${one.property}`);
	return { one, frame, brief, prior, earlier, table: saved.table };
});
if (values.review) {
	if (values.live) throw new Error("--review checks saved answers offline; it cannot be combined with --live.");
	const saved = JSON.parse(readFileSync(values.review, "utf8")) as { results: { id?: string; name?: string; answer?: { plan?: Plan }; plan?: Plan }[] };
	const results = positions.map(({ one, frame }) => {
		if (one.task === "pilot") throw new Error("--review checks saved plans; select prepare, amend or repair cases.");
		const rows = saved.results.filter((row) => (row.id ?? row.name) === one.id);
		const checked = rows.map((row) => { const plan = row.plan ?? row.answer?.plan; return plan && checkPlan(plan, one, frame); });
		const passed = checked.length > 0 && checked.every((one) => one?.passed);
		console.log(`${one.id}: ${passed ? "PASS" : "FAIL"}, ${rows.length} saved answers; structure ${checked.filter((one) => one?.structure).length}/${rows.length}; prose flags ${checked.reduce((n, one) => n + (one?.prose.length ?? 0), 0)}`); return passed;
	});
	process.exit(results.every(Boolean) ? 0 : 1);
}
if (!values.live) process.exit(0);

const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const parts = cast(rosterFor({ every: { strategy: "gpt-6-luna:low", summary: "off" } }), { chat: await runtime.getAvailable(), classifiers: await runtime.getAvailableOfType("classifier") });
const jev = parts.find((one) => one.role === "decide")!, luna = parts.find((one) => one.role === "strategy")!, judging = parts.find((one) => one.role === "judge")!;
if (selected.some((one) => one.task === "judge") && (!judging?.model || judging.off || judging.model.type === "classifier")) throw new Error("Judge probes require the prescribed judge model.");
if (!jev.model || jev.off || !luna.model || luna.off) throw new Error("The prescribed Jev and Luna low models must both resolve.");
const out = values.out ?? `.pi/benchmarks/${Date.now()}`;
const source = { revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
	dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() };
if (["results.json", "calls.jsonl"].some((file) => existsSync(join(out, file)))) throw new Error("Choose a fresh --out directory; existing benchmark evidence will not be overwritten.");
mkdirSync(out, { recursive: true });
const measured = tally(), spent: Spend[] = [], results: Record<string, unknown>[] = [], rules = loadRules(matchup.rules.path);
const inference = traceInference({ classify: (...args) => runtime.classify(...args), stream: (model, request, options) => runtime.streamSimple(model, request as never, options) as never },
	(event) => appendFileSync(join(out, "calls.jsonl"), JSON.stringify(event) + "\n"));
for (let iteration = 0; iteration < repeat; iteration++) for (const { one, frame, brief, prior, earlier, table } of positions) {
	// Alternate order so one model does not always receive the earlier request.
	for (const pilot of one.task !== "pilot" ? ["luna"] : iteration % 2 ? [...pilots].reverse() : pilots) {
		const began = Date.now(), startCall = measured.spent().length, before = structuredClone(frame);
		let answer: unknown, passed = false, error: string | undefined, checks: ReturnType<typeof checkPlan> | undefined;
		let resources: ReturnType<typeof paymentForecast> | undefined, continuation: Awaited<ReturnType<typeof playProposal>> | undefined, decisionMs: number | undefined;
		try {
			const writer = reasoner({ role: one.task === "judge" ? "judge" : one.task !== "pilot" ? "strategy" : "decide", seat: one.seat,
				model: (one.task === "judge" ? judging : luna).model as never, thinking: (one.task === "judge" ? judging : luna).thinkingLevel, stream: inference.stream, tally: measured, attempts: 1 });
			if (one.task === "judge") {
				if (one.judgeRow === undefined || one.legal === undefined) throw new Error("Judge cases need judgeRow and legal.");
				answer = await rule(table, { row: one.judgeRow, raisedBy: one.seat, claim: "Check whether this complete blocking assignment satisfies declaration-time blocking restrictions." }, writer, { rules, universe });
				passed = (answer as { legal: boolean; remedy: string }).legal === one.legal && (answer as { remedy: string }).remedy === (one.legal ? "stand" : "rollback");
			} else if (one.task !== "pilot") {
				const context = { brief, cards: universe, rules };
				if (one.task === "continue") {
					if (!frame.view.work?.plan) throw new Error("Continuation needs an accepted plan in the prefix.");
					answer = { plan: frame.view.work.plan, fromPrefix: true };
				} else if (savedAnswers) {
					const rows = savedAnswers.results.filter((row) => row.id === one.id && row.iteration === iteration);
					const plan = rows[0]?.plan ?? rows[0]?.answer?.plan;
					if (rows.length !== 1 || !plan) throw new Error("The saved answer must identify exactly one plan for this case and repetition.");
					answer = { plan, fromAnswers: values.answers };
				} else if (one.task === "prepare") answer = await prepareTurn(frame, context, writer);
				else {
					const result = await planWork(frame, context, writer, prior ? { plan: prior.plan } : undefined, earlier ? changes(earlier, frame).lines : undefined);
					const put = result.tools.find((tool) => tool.do === "plan.put");
					if (put?.do !== "plan.put") throw new Error("Amendment returned no accepted plan.");
					answer = { ...result, plan: put.plan };
				}
				const plan = (answer as { plan?: Plan }).plan;
				if (!plan) throw new Error("Planning returned no accepted plan.");
				checks = checkPlan(plan, one, frame);
				resources = paymentForecast(frame, plan);
				passed = checks.passed;
				decisionMs = Date.now() - began;
				if (values.play) {
					continuation = await playProposal({ journal: journals.get(one.journal)!, version: one.version, seat: one.seat, ...(one.task === "continue" ? {} : { plan }) },
						{ out: join(out, `${one.id}-${iteration}`), inference, roster: parts, ...(values.through ? { throughTurn: Number(values.through) } : {}), ...(values.decisions ? { decisions: Number(values.decisions) } : {}), ...(values["judge-attempts"] ? { judgeAttempts: Number(values["judge-attempts"]) } : {}) });
					const game = continuation.result;
					passed = (one.winner === undefined ? passed : game.outcome?.results[one.winner] === "win") && !!game.replayMatches && !game.gaps.length && !game.reasons?.fallback && !game.error;
				}
			} else {
				const api: DecisionApi = pilot === "jev" ? decisionApi(inference.classify, jev.model as never, { tally: measured, seat: one.seat }) : {
					named: "benchmark Luna pilot", async ask(request) {
						const pick = request.questions.pick;
						if (pick?.type !== "choice") throw new Error("The pilot benchmark needs one choice question.");
						const ids = Object.keys(pick.criteria);
						const chosen = await writer.work("pilot comparison", { system: "Execute one interface choice under the supplied plan and facts. Use the same instructions and criteria as the classifier question. Return its exact id through submit. Do not write a new strategy. A valid id does not certify the play.", user: JSON.stringify(request) },
							{ submit: { name: "submit", description: "Select one offered id. No action is executed by this benchmark.", parameters: { type: "object", properties: { id: { type: "string", enum: ids } }, required: ["id"], additionalProperties: false },
								check: (args) => typeof args.id === "string" && ids.includes(args.id) ? null : "Choose a listed id." }, turns: 1 }, 256);
						// No probability calibration is claimed for this chat-model adapter.
						return { pick: { type: "choice", choice: String(chosen.id), probabilities: {}, confidence: 0 } };
					},
				};
				const seat = aiSeat({ name: "Benchmark", judge: parts.some((part) => part.role === "judge" && !part.off && !!part.model), api, intent: startingIntent(one.seat), onGap: (note) => { throw new Error(note); }, rules,
					chronicle: { briefs: brief ? { [one.seat]: brief } : {}, recaps: [] },
					plan: async () => { throw new Error("This position requests strategy before it can be piloted."); } });
				try { answer = await seat.answer(frame); } finally { await seat.close(); }
				const pick = (answer as { kind: string; option?: string }).option, expected = one.expect!;
				const use = frame.decision!.options.find((option) => option.id === pick)?.use;
				const name = (ref: { id: string; incarnation: number }) => frame.view.objects?.find((o) => o.id === ref.id && o.incarnation === ref.incarnation)?.card;
				passed = one.avoidObjection ? (answer as { kind: string }).kind !== "object" : one.objectionRow !== undefined ? (answer as { kind: string; row?: number }).kind === "object" && (answer as { row?: number }).row === one.objectionRow : one.picks ? !!pick && one.picks.includes(pick) : expected.id ? pick === expected.id : !!use && name(use.source) === expected.source && (!expected.timing || use.timing === expected.timing) &&
					(!expected.target || use.targets.flat().some((target) => "id" in target && name(target) === expected.target));
			}
			if (!isDeepStrictEqual(frame, before)) throw new Error("Benchmark mutated the projected frame.");
		} catch (caught) {
			error = String(caught);
		}
		const calls = [...measured.spent().slice(startCall), ...(continuation?.result.calls ?? [])];
		spent.push(...calls);
		const entry = { id: one.id, iteration, pilot, case: one, journal: catalog.journals[one.journal], property: one.property, passed: passed && !error,
			ms: decisionMs ?? Date.now() - began, totalMs: Date.now() - began, calls: calls.length, answer, ...(checks ? { checks } : {}), ...(resources ? { resources } : {}),
			...(continuation ? { continuation } : {}), ...(error ? { error } : {}), usage: usageReport(calls) };
		results.push(entry); console.log(`${one.id} ${pilot} ${entry.passed ? "PASS" : "FAIL"} ${entry.totalMs}ms ${calls.length} calls${error ? ` ${error}` : ""}`);
		writeFileSync(join(out, "results.json"), JSON.stringify({ manifest, source, results, calls: spent }, null, 2) + "\n");
	}
}
console.log(bill(spent).join("\n")); console.log(`Saved ${out}`);
process.exit(results.every((one) => one.passed) ? 0 : 1);
