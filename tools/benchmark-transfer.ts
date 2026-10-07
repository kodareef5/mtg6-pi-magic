/** Supplied alternatives isolate recognition from production plan writing. No line is installed here. */
import { createHash } from "node:crypto";
import type { Frame } from "../src/core/types.ts";
import type { Plan } from "../src/core/language.ts";
import type { Reasoner } from "../src/context/reason.ts";
import type { Context } from "../src/context/strategy-facts.ts";
import { planWork } from "../src/context/strategy.ts";

export type SuppliedLines = {
	projectionHash: string;
	assumptions: string[];
	candidates: { line: { land: string; casts: string[]; attackers: string[]; keepUntappedDuringPayment: string[] };
		payments: unknown[]; afterMain: unknown[] }[];
};
export const projectionHash = (frame: Frame): string => createHash("sha256").update(JSON.stringify(frame)).digest("hex");

/** Only public fixture fields enter the request. Private grading and witness plans stay outside it. */
export function suppliedChoices(frame: Frame, supplied: SuppliedLines, iteration: number) {
	if (supplied.projectionHash !== projectionHash(frame)) throw new Error("Supplied lines do not match this exact projected position.");
	if (!Number.isInteger(iteration) || iteration < 0 || supplied.candidates.length < 2 || !supplied.assumptions.length)
		throw new Error("Supplied lines require assumptions, alternatives and a nonnegative rotation.");
	const offset = iteration % supplied.candidates.length;
	const indices = supplied.candidates.map((_, index) => (index + offset) % supplied.candidates.length);
	return { assumptions: supplied.assumptions, candidates: indices.map((index, n) => {
		const one = supplied.candidates[index]!;
		return { id: String.fromCharCode(65 + n), line: one.line, payments: one.payments, afterMain: one.afterMain };
	}), indices };
}

const RECOGNIZE = "Select one supplied Magic turn line from the current facts and pregame policies. Prefer a win through the opponent's best visible blocks, otherwise prevent a visible loss, otherwise develop. Compare the casts, payments and proposed attackers. The hypothetical boards assume successful resolution without intervening responses; they are not the current position or certified outcomes. Select one listed id. This recognition control writes no plan, executes nothing and does not test candidate generation.";
const TRANSFER = "For this supplied-alternative diagnostic, select one listed candidate, name its id in audit guidance, and encode its commitments through the ordinary plan submission. Keep execution policies consistent with the selected actions and resources. If no candidate fits, explicitly say so and write your chosen line. Nothing is installed from a candidate id: only your submitted plan will be evaluated. The alternatives do not certify outcomes or playing strength.";

/** Both modes obtain their complete facts from the same production planWork call. */
export async function transferPlan(frame: Frame, context: Context, writer: Pick<Reasoner, "work">,
	supplied: SuppliedLines, iteration: number, mode: "recognize" | "transfer") {
	const { indices, ...evidence } = suppliedChoices(frame, supplied, iteration);
	const finished = Symbol("recognition returned without creating a plan");
	let selected: string | undefined;
	let plan: Plan | undefined;
	const attempts: { submission: unknown; problem: string | null }[] = [];
	try {
		const result = await planWork(frame, context, { async work(about, prompt, protocol, ceiling) {
			const user = JSON.stringify({ ...JSON.parse(prompt.user), suppliedAlternatives: evidence });
			if (mode === "recognize") {
				const ids = evidence.candidates.map((one) => one.id);
				const answer = await writer.work("supplied recognition", { system: RECOGNIZE, user, task: "Choose one listed candidate id through submit." }, {
					turns: 1, timeoutMs: protocol.timeoutMs, signal: protocol.signal,
					submit: { name: "submit", description: "Select one supplied candidate id. This makes no plan and takes no physical action.",
						parameters: { type: "object", properties: { id: { type: "string", enum: ids } }, required: ["id"], additionalProperties: false },
						check(args) {
							const problem = typeof args.id === "string" && ids.includes(args.id) && Object.keys(args).length === 1 ? null : "Choose one supplied id.";
							attempts.push({ submission: structuredClone(args), problem });
							return problem;
						} },
				}, ceiling);
				selected = String(answer.id);
				throw finished;
			}
			return writer.work(about, { ...prompt, user, task: `${prompt.task}\n${TRANSFER}` }, {
				...protocol, submit: { ...protocol.submit, check(args, session) {
					const problem = protocol.submit.check(args, session);
					attempts.push({ submission: structuredClone(args), problem });
					return problem;
				} },
			}, ceiling);
		} });
		const put = result.tools.find((one) => one.do === "plan.put");
		if (put?.do !== "plan.put") throw new Error("Transfer returned no accepted plan.");
		plan = put.plan;
	} catch (error) {
		if (error !== finished) throw Object.assign(new Error(String(error)), { transfer: { mode, indices, attempts } });
	}
	return { ...(plan ? { plan } : {}), transfer: { mode, indices, attempts,
		...(selected ? { selected, selectedIndex: indices[evidence.candidates.findIndex((one) => one.id === selected)] } : {}) } };
}
