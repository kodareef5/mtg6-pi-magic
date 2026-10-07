/** Paired review of a frozen proposal. Checked feedback is fixture evidence, not a simulator. */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Plan } from "../src/core/language.ts";
import type { Frame } from "../src/core/types.ts";
import type { Reasoner } from "../src/context/reason.ts";
import type { Context } from "../src/context/strategy-facts.ts";
import { planWork } from "../src/context/strategy.ts";
import { commitmentReceipt } from "./benchmark-receipt.ts";

type Position = { id: string; version: number; seat: number; journal: string };
type Receipt = ReturnType<typeof commitmentReceipt>;
export type RepairSource = { source: { revision: string; dirty: string }; results: {
	id: string; iteration: number; arm: string; case: Position; journal: string;
	answer?: { plan?: Plan }; commitment?: Receipt; error?: string;
}[] };
export type Counterexample = { assumptions: string[]; consequence: string; unchecked: string[]; inconclusive: boolean };
export type ReviewedReceipt = { id: string; iteration: number; hash: string; initial: "W" | "N" | "inconclusive"; counterexample: Counterexample; reviewedBy: string[] };
export type Frozen = { hash: string; plan: Plan; commitment: Receipt };

/** Identity covers the exact position, proposal and resource receipt, never just a session. */
export function freezeSource(source: RepairSource, position: Position, journal: string, iteration: number, frame: Frame): Frozen {
	if (!source.source.revision || source.source.dirty) throw new Error("Repair sources require a recorded clean revision.");
	const rows = source.results.filter((row) => row.id === position.id && row.iteration === iteration && row.arm === "production");
	const row = rows[0], plan = row?.answer?.plan;
	if (rows.length !== 1 || !row || row.error || !plan || !row.commitment || row.journal !== journal ||
		row.case.version !== position.version || row.case.seat !== position.seat || row.case.journal !== position.journal)
		throw new Error("Repair needs exactly one accepted production plan and receipt at this position and repetition.");
	const commitment = commitmentReceipt(frame, plan);
	if (!isDeepStrictEqual(JSON.parse(JSON.stringify(commitment)), JSON.parse(JSON.stringify(row.commitment)))) throw new Error("Frozen resource receipt differs from this reader or position.");
	const hash = createHash("sha256").update(JSON.stringify({ position: { id: position.id, version: position.version, seat: position.seat, journal }, plan, commitment })).digest("hex");
	return { hash, plan: structuredClone(plan), commitment };
}

export function checkedReceipt(rows: ReviewedReceipt[], id: string, iteration: number, hash: string): ReviewedReceipt {
	const matches = rows.filter((one) => one.id === id && one.iteration === iteration);
	const one = matches[0];
	if (matches.length !== 1 || !one || one.hash !== hash || !["W", "N", "inconclusive"].includes(one.initial) || !one.reviewedBy?.some((name) => name.trim()) ||
		!one.counterexample?.consequence?.trim() || !one.counterexample.assumptions?.length ||
		!Array.isArray(one.counterexample.unchecked) || typeof one.counterexample.inconclusive !== "boolean")
		throw new Error("The consequence must be reviewed and tied to this exact candidate hash.");
	return one;
}

export async function repairPlan(frame: Frame, context: Context, writer: Pick<Reasoner, "work">, frozen: Frozen, consequence?: Counterexample) {
	const feedback = { hash: frozen.hash, commitment: frozen.commitment, ...(consequence ? { counterexample: consequence } : {}) };
	const attempts: { submission: unknown; problem: string | null }[] = [];
	const requested = structuredClone(frame);
	requested.view.work = { ...requested.view.work!, request: "Review this frozen proposed line. No proposed action has executed. Confirm it with an empty update or amend the commitments and policies together. The receipt describes the original proposal only; it does not certify a revision or recommend another line. One reply is available." };
	try {
		const result = await planWork(requested, context, {
			work(about, prompt, protocol, ceiling) {
				return writer.work(about, { ...prompt, user: JSON.stringify({ ...JSON.parse(prompt.user), proposalReceipt: feedback }) }, {
					...protocol, turns: 1, submit: { ...protocol.submit, check(args, session) {
						const problem = protocol.submit.check(args, session);
						attempts.push({ submission: structuredClone(args), problem });
						return problem;
					} },
				}, ceiling);
			},
		}, { plan: frozen.plan });
		const put = result.tools.find((one) => one.do === "plan.put");
		if (put?.do !== "plan.put") throw new Error("Review returned no accepted plan.");
		return { ...result, plan: put.plan, repair: { feedback, attempts } };
	} catch (error) {
		throw Object.assign(new Error(String(error)), { repair: { feedback, attempts } });
	}
}
