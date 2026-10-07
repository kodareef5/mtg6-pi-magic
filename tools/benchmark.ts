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
import { workFrame } from "../src/core/work-tools.ts";
import { annotate, planState } from "../src/core/planning.ts";
import type { Plan } from "../src/core/language.ts";
import { checkPlan, type PlanCheck } from "./benchmark-checks.ts";
import { matchTable, matchup, universe } from "./matchup-fixture.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { aiSeat, changes } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { decisionApi, type DecisionApi } from "../src/context/model.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { planWork, prepareTurn } from "../src/context/strategy.ts";
import { reasoner } from "../src/context/reason.ts";
import { tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { usageReport, bill } from "../src/context/metrics.ts";
import type { Brief } from "../src/context/brief.ts";
import { paymentForecast } from "../src/core/budget.ts";
import { playProposal } from "./benchmark-play.ts";
import { candidatePlan } from "./benchmark-candidates.ts";

type Case = PlanCheck & { id: string; journal: string; version: number; seat: number; task: "pilot" | "prepare" | "amend" | "repair" | "plan"; property: string; winner?: number;
	prepared?: { file: string; name: string } };
const catalog = JSON.parse(readFileSync(join(import.meta.dirname, "benchmarks/positions.json"), "utf8")) as { journals: Record<string, string>; cases: Case[] };
const { values } = parseArgs({ options: { live: { type: "boolean" }, review: { type: "string" }, task: { type: "string" }, case: { type: "string", multiple: true },
	pilot: { type: "string", default: "jev" }, repeat: { type: "string", default: "1" }, out: { type: "string" }, play: { type: "boolean" },
	answers: { type: "string" }, through: { type: "string" }, arm: { type: "string", default: "production" } } });
if (!["production", "one", "two", "both", "examples-lookup", "examples-paired"].includes(values.arm!)) throw new Error("Use --arm production, one, two, both, examples-lookup or examples-paired.");
if (values.play && !values.live || values.answers && !values.play) throw new Error("--play requires --live; --answers requires --play.");
if (values.through && (!values.play || !/^\d+$/.test(values.through))) throw new Error("--through needs --play and a nonnegative turn boundary.");
const repeat = Number(values.repeat), pilots = values.pilot === "both" ? ["jev", "luna"] : [values.pilot!];
if (!Number.isInteger(repeat) || repeat < 1 || pilots.some((one) => !["jev", "luna"].includes(one))) throw new Error("Use a positive --repeat and --pilot jev, luna or both.");
const selected = catalog.cases.filter((one) => (!values.task || one.task === values.task) && (!values.case || values.case.includes(one.id)));
if (!selected.length || values.case?.some((id) => !selected.some((one) => one.id === id))) throw new Error("The requested benchmark cases were not found.");
if (values.play && selected.some((one) => one.task === "pilot")) throw new Error("--play continues plans; select preparation, amendment or repair cases.");
if (["one", "two", "both"].includes(values.arm!) && selected.some((one) => one.task === "pilot" || one.task === "prepare")) throw new Error("Candidate arms require current-turn planning cases.");
if (values.arm!.startsWith("examples-") && selected.some((one) => one.task === "pilot")) throw new Error("Example arms require planning cases.");
const savedAnswers = values.answers ? JSON.parse(readFileSync(values.answers, "utf8")) as { results: { id: string; iteration: number; arm?: string; plan?: Plan; answer?: { plan?: Plan } }[] } : undefined;
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
	return { one, frame, brief, prior, earlier };
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
const jev = parts.find((one) => one.role === "decide")!, luna = parts.find((one) => one.role === "strategy")!;
if (!jev.model || jev.off || !luna.model || luna.off) throw new Error("The prescribed Jev and Luna low models must both resolve.");
const out = values.out ?? `.pi/benchmarks/${Date.now()}`;
const source = { revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
	dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() };
if (["results.json", "calls.jsonl"].some((file) => existsSync(join(out, file)))) throw new Error("Choose a fresh --out directory; existing benchmark evidence will not be overwritten.");
mkdirSync(out, { recursive: true });
const measured = tally(), results: Record<string, unknown>[] = [], rules = loadRules(matchup.rules.path);
const inference = traceInference({ classify: (...args) => runtime.classify(...args), stream: (model, request, options) => runtime.streamSimple(model, request as never, options) as never },
	(event) => appendFileSync(join(out, "calls.jsonl"), JSON.stringify(event) + "\n"));
for (let iteration = 0; iteration < repeat; iteration++) for (const { one, frame, brief, prior, earlier } of positions) {
	// Alternate order so one model does not always receive the earlier request.
	for (const pilot of one.task !== "pilot" ? ["luna"] : iteration % 2 ? [...pilots].reverse() : pilots) {
	const pair = values.arm === "both" ? ["one", "two"] : values.arm === "examples-paired" ? ["production", "examples-lookup"] : [values.arm!];
	for (const arm of iteration % 2 ? [...pair].reverse() : pair) {
		const began = Date.now(), startCall = measured.spent().length, before = structuredClone(frame);
		let answer: unknown, passed = false, error: string | undefined, checks: ReturnType<typeof checkPlan> | undefined;
		let resources: ReturnType<typeof paymentForecast> | undefined, continuation: Awaited<ReturnType<typeof playProposal>> | undefined, decisionMs: number | undefined;
		try {
			const writer = reasoner({ role: one.task !== "pilot" ? "strategy" : "decide", seat: one.seat,
				model: luna.model as never, thinking: luna.thinkingLevel, stream: inference.stream, tally: measured, attempts: 1 });
			if (one.task !== "pilot") {
				const context = { brief, cards: universe, rules, ...(arm === "examples-lookup" ? { policyExamples: "lookup" as const } : {}) };
				if (savedAnswers) {
					const rows = savedAnswers.results.filter((row) => row.id === one.id && row.iteration === iteration && (row.arm ?? "production") === arm);
					const plan = rows[0]?.plan ?? rows[0]?.answer?.plan;
					if (rows.length !== 1 || !plan) throw new Error("The saved answer must identify exactly one plan for this case, arm and repetition.");
					answer = { plan, fromAnswers: values.answers };
				} else if (arm === "one" || arm === "two") answer = await candidatePlan(frame, context, writer, arm === "one" ? 1 : 2);
				else if (one.task === "prepare") answer = await prepareTurn(frame, context, writer);
				else {
					const result = await planWork(frame, context, writer, prior ? { plan: prior.plan } : undefined, earlier ? changes(earlier, frame).lines : undefined);
					const put = result.tools.find((tool) => tool.do === "plan.put");
					if (put?.do !== "plan.put") throw new Error("Amendment returned no accepted plan.");
					answer = { ...result, plan: put.plan };
				}
				const plan = (answer as { plan: Plan }).plan;
				checks = checkPlan(plan, one, frame);
				resources = paymentForecast(frame, plan);
				passed = checks.passed;
				decisionMs = Date.now() - began;
				if (values.play) {
					continuation = await playProposal({ journal: journals.get(one.journal)!, version: one.version, seat: one.seat, plan },
						{ out: join(out, `${one.id}-${iteration}${arm === "production" ? "" : `-${arm}`}`), inference, roster: parts, ...(values.through ? { throughTurn: Number(values.through) } : {}) });
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
				const seat = aiSeat({ name: "Benchmark", api, intent: startingIntent(one.seat), onGap: (note) => { throw new Error(note); }, rules,
					chronicle: { briefs: brief ? { [one.seat]: brief } : {}, recaps: [] },
					plan: async () => { throw new Error("This position requests strategy before it can be piloted."); } });
				try { answer = await seat.answer(frame); } finally { await seat.close(); }
				const pick = (answer as { kind: string; option?: string }).option, expected = one.expect!;
				const use = frame.decision!.options.find((option) => option.id === pick)?.use;
				const name = (ref: { id: string; incarnation: number }) => frame.view.objects?.find((o) => o.id === ref.id && o.incarnation === ref.incarnation)?.card;
				passed = expected.id ? pick === expected.id : !!use && name(use.source) === expected.source && (!expected.timing || use.timing === expected.timing) &&
					(!expected.target || use.targets.flat().some((target) => "id" in target && name(target) === expected.target));
			}
			if (!isDeepStrictEqual(frame, before)) throw new Error("Benchmark mutated the projected frame.");
		} catch (caught) { error = String(caught); if (caught && typeof caught === "object" && "candidates" in caught) answer = { candidates: caught.candidates, attempts: (caught as { attempts?: unknown }).attempts }; }
		const calls = measured.spent().slice(startCall), entry = { id: one.id, iteration, pilot, case: one, journal: catalog.journals[one.journal], property: one.property, passed: passed && !error,
			arm, ms: decisionMs ?? Date.now() - began, totalMs: Date.now() - began, calls: calls.length, answer, ...(checks ? { checks } : {}), ...(resources ? { resources } : {}),
			...(continuation ? { continuation } : {}), ...(error ? { error } : {}), usage: usageReport(calls) };
		results.push(entry); console.log(`${one.id} ${pilot} ${arm} ${entry.passed ? "PASS" : "FAIL"} ${entry.ms}ms ${calls.length} calls${error ? ` ${error}` : ""}`);
		writeFileSync(join(out, "results.json"), JSON.stringify({ manifest: "tools/benchmarks/positions.json", source, results, calls: measured.spent() }, null, 2) + "\n");
	}
	}
}
console.log(bill(measured.spent()).join("\n")); console.log(`Saved ${out}`);
process.exit(results.every((one) => one.passed) ? 0 : 1);
