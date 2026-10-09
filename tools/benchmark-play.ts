/** Execute a saved proposal through the ordinary seats. A win is an observed outcome, not proof against every response. */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { fork, read, replay, reopen, save } from "../src/core/journal.ts";
import { editWork } from "../src/core/work-tools.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { play } from "../src/core/loop.ts";
import type { Plan } from "../src/core/language.ts";
import { seat, judgeFor, type Inference } from "../src/context/sit.ts";
import type { Cast } from "../src/context/roles.ts";
import { traceInference } from "../src/context/trace.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { gameResult, saveReport } from "./game-report.ts";
import { matchTable, matchup, universe } from "./matchup-fixture.ts";
import { checkPosition, type After } from "./benchmark-checks.ts";

export async function playProposal(input: { journal: string; version: number; seat: number; plan?: Plan; after?: After[] },
	options: { out: string; inference: Inference; roster: Cast[]; throughTurn?: number; decisions?: number; judgeAttempts?: number }) {
	mkdirSync(options.out, { recursive: true });
	const path = join(options.out, "game.jsonl"), trace = join(options.out, "calls.jsonl");
	const header = fork(input.journal, input.version, "benchmark", path);
	const original = replay(input.journal, (h) => matchTable(h.seed), input.version, { cards: matchup.cards, rules: matchup.rules });
	const copied = replay(path, (h) => matchTable(h.seed), undefined, { cards: matchup.cards, rules: matchup.rules });
	if (!isDeepStrictEqual(copied.table, original.table) || !isDeepStrictEqual(copied.prepared, original.prepared)) throw new Error("Benchmark clone differs from its prefix.");
	const table = copied.table, journal = reopen(path, header, table);
	if (input.plan) {
		const used = new Set(table.workLog.filter((entry) => entry.seat === input.seat).map((entry) => entry.actionId));
		let proposalId = "benchmark-proposal";
		for (let suffix = 1; used.has(proposalId); suffix++) proposalId = `benchmark-proposal:${suffix}`;
		editWork(table, input.seat, [{ do: "plan.put", plan: input.plan }], proposalId);
	}
	save(journal, table);
	const beganLines = read(path).lines.length;
	writeFileSync(trace, "", { flag: "wx", mode: 0o600 });
	const observed = traceInference(options.inference, (event) => {
		if (event.event === "request") save(journal, table);
		appendFileSync(trace, JSON.stringify(event) + "\n");
	});
	const seated = await seat(table, async () => options.roster, observed, universe,
		{ format: "standard", journal, rules: loadRules(matchup.rules.path), prepared: copied.prepared });
	const through = options.throughTurn ?? table.cursor.turn + (table.cursor.active === input.seat ? 1 : 2);
	const stop = new Error("Benchmark boundary");
	const beganAt = table.ledger.length;
	let stoppedBy: "gap" | "turn" | "decisions" | "judge-attempts" | undefined;
	let failure: unknown;
	seated.timing.playStartedAt = Date.now();
	try {
		await play(table, seated.players, seated.intents, {
			checkpoint: () => {
				save(journal, table);
				stoppedBy = table.gaps.length ? "gap" : options.judgeAttempts !== undefined && seated.judged.cases >= options.judgeAttempts ? "judge-attempts" : table.cursor.turn > through ? "turn"
					: !table.outcome && options.decisions !== undefined && table.ledger.length - beganAt >= options.decisions ? "decisions" : undefined;
				if (stoppedBy) throw stop;
			},
			judge: judgeFor(table, seated, journal),
			onTurnStart: (turn, active) => seated.timing.turns!.push({ at: Date.now(), turn, active, source: "recorded" }),
		});
	} catch (error) { if (error !== stop) failure = error; }
	finally {
		seated.timing.playEndedAt = Date.now();
		await Promise.all(Object.values(seated.players).map((one) => one.close()));
		save(journal, table);
	}
	if (!stoppedBy) while (!table.outcome && !nextDecision(table)) advance(table);
	const rebuilt = replay(path, (h) => matchTable(h.seed)).table;
	const compared = structuredClone(table);
	while (!compared.outcome && !nextDecision(compared)) advance(compared);
	const same = (one: typeof table) => ({ ledger: one.ledger, log: one.log, things: [...one.things], cursor: one.cursor,
		rulings: one.rulings, work: one.work, resolution: one.resolution, outcome: one.outcome?.results });
	seated.timing.finishedAt = Date.now();
	const result = gameResult(table, seated, { replayMatches: isDeepStrictEqual(same(compared), same(rebuilt)), journal: path, trace,
		...(failure ? { error: String(failure) } : {}) });
	const paths = saveReport(join(options.out, "game.result.json"), result);
	// Read the journal so a replacement later rolled back still counts as work
	// done after the initial plan. A later win may have required that repair.
	const replacementPlans = read(path).lines.slice(beganLines).flatMap((line) => "work" in line && line.work.seat === input.seat && line.work.tools?.some((tool) => tool.do === "plan.put")
		? [{ version: line.v, clock: line.work.clock }] : []);
	return { result, paths, cloneMatches: true, replacementPlans, throughTurn: through, ...(input.after ? { afterChecks: checkPosition(table.things.values(), input.after, !!table.outcome || stoppedBy === "turn") } : {}), ...(stoppedBy ? { stoppedBy } : {}),
		...(options.decisions === undefined ? {} : { decisionLimit: options.decisions }), decisions: table.ledger.length - beganAt, judgeAttempts: seated.judged.cases,
		...(options.judgeAttempts === undefined ? {} : { judgeAttemptLimit: options.judgeAttempts }) };
}
