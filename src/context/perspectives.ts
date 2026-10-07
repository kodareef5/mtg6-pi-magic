/**
 * The second round: analysts with different outlooks each read the position and
 * the ranked findings and propose a whole line. They write in parallel and in
 * one shape; the coordinator then weighs them against the facts and writes the plan. A report
 * is a model's proposal, never a move or a certified line.
 */
import type { Reasoner } from "./reason.ts";
import { READING, type Survey } from "./survey.ts";

export const PERSPECTIVES: Record<string, string> = {
	defender: "an expert defender: survive and stabilize first, protect your life total and key permanents, value blocks and instant-speed answers held on the opponent's turn",
	punisher: "an aggressive punisher: maximize damage and pressure now, punish tapped or missing blockers and low life, and find lethal when it exists",
	planner: "a long-horizon planner: set up the next two or three turns, developing engines, card and mana advantage and a curve the opponent cannot keep up with",
	sequencer: "a sequencing specialist: the exact order of land, spells, abilities, combat and held mana that gets the most from this turn, including what to hold open",
	opponent: "the opponent looking at this board: name the line from this seat they would fear most, and the mistake they hope this seat makes, then propose that feared line",
	value: "a resource and removal analyst: which trades, removal and spells are worth their cards and mana now, and which opposing creature must be answered first",
};

export type Report = { line: string[]; hold: string; opponentTurn: string; risks: string; outcome: string; confidence: number };
export type Reports = { reports: Record<string, Report>; failed?: string[] };

const REPORT = { name: "submit", description: "Submit your proposed line for this turn and the opponent's next turn.",
	parameters: { type: "object", additionalProperties: false, required: ["line", "hold", "opponentTurn", "risks", "outcome", "confidence"], properties: {
		line: { type: "array", minItems: 1, items: { type: "string" }, description: "Ordered actions for this turn in plain words: land, casts with their targets, abilities, attackers, what stays home." },
		hold: { type: "string", description: "Mana, cards or creatures kept for the opponent's turn and the reason, or none." },
		opponentTurn: { type: "string", description: "Blocks and responses on their next turn." },
		risks: { type: "string", description: "What could go wrong and what would change the line." },
		outcome: { type: "string", description: "Expected life totals and board after this turn and theirs, with the arithmetic." },
		confidence: { type: "integer", minimum: 1, maximum: 5 },
	} },
	check: (args: Record<string, unknown>) => Array.isArray(args.line) && args.line.length ? null : "Submit at least one action in line." };

export async function perspectiveReports(position: object, survey: Survey, reasoner: Pick<Reasoner, "work">): Promise<Reports> {
	const result: Reports = { reports: {} };
	const user = JSON.stringify({ ...position, findings: survey.findings });
	await Promise.all(Object.entries(PERSPECTIVES).map(async ([name, outlook]) => {
		try {
			const system = `You are ${outlook}. Read the Magic position and the ranked findings from focused questions, which can be wrong. Propose the best line for this seat from your outlook.\n${READING}\nConsider every order of operations that matters and whether holding mana open beats spending it. Do not write plan syntax.`;
			result.reports[name] = await reasoner.work(`perspective ${name}`, { system, user }, { submit: REPORT, turns: 2 }, 1200) as Report;
		} catch (error) {
			(result.failed ??= []).push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	return result;
}
