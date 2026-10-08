/**
 * The second round: analysts with different outlooks each read the dossier and
 * the ranked findings and propose a whole line, in parallel and in one shape.
 * The coordinator then weighs them against the dossier and writes the plan. A
 * report is a model's proposal, never a move or a certified line.
 */
import type { Reasoner } from "./reason.ts";
import { ANALYST_SYSTEM, findingsSection, type Survey } from "./survey.ts";

export const PERSPECTIVES: Record<string, string> = {
	defender: "an expert defender. Survive and stabilize first: protect your life total and key permanents, and value blocks and instant-speed answers held for the opponent's turn",
	punisher: "an aggressive punisher. Maximize damage and pressure now: punish tapped or missing blockers and low life, and find lethal when it exists",
	planner: "a long-horizon planner. Set up the next two or three turns: develop engines, card and mana advantage, and a curve the opponent cannot keep up with",
	sequencer: "a sequencing specialist. Find the exact order of land, spells, abilities, combat and held mana that gets the most from this turn, including what to hold open",
	opponent: "the opponent looking at this board. Name the line from this player you would fear most and the mistake you hope they make, then propose that feared line",
	value: "a resource and removal analyst. Judge which trades, removal and spells are worth their cards and mana now, and which opposing creature must be answered first",
};

export type Report = { line: string[]; hold: string; opponentTurn: string; risks: string; outcome: string; confidence: number };
export type Reports = { reports: Record<string, Report>; failed?: string[] };

const REPORT = { name: "submit", description: "Submit your proposed line for this turn and the opponent's next turn.",
	parameters: { type: "object", additionalProperties: false, required: ["line", "hold", "opponentTurn", "risks", "outcome", "confidence"], properties: {
		line: { type: "array", minItems: 1, items: { type: "string" }, description: "Ordered actions for this turn in plain words: land, casts with targets, abilities, attackers, what stays home." },
		hold: { type: "string", description: "Mana, cards or creatures kept for the opponent's turn and why, or none." },
		opponentTurn: { type: "string", description: "Blocks and responses on their next turn." },
		risks: { type: "string", description: "What could go wrong and what would change the line." },
		outcome: { type: "string", description: "Expected life totals and board after this turn and theirs, with the arithmetic." },
		confidence: { type: "integer", minimum: 1, maximum: 5 },
	} },
	check: (args: Record<string, unknown>) => Array.isArray(args.line) && args.line.length ? null : "Submit at least one action in line." };

const EXAMPLE = '{"line": ["Play your land.", "Cast the 2-mana removal on their 3/3 blocker: 3 damage against toughness 3.", "Attack with both creatures: 3 + 2 = 5 damage, taking them from 9 to 4."], "hold": "One red source for the 1-mana burn spell on their turn.", "opponentTurn": "Block their 2/2 with your 2/1 only if they attack with it alone.", "risks": "A pump spell saves their blocker; then keep the second attacker home.", "outcome": "They go to 4 with no blocker; you stay at 12.", "confidence": 4}';

const ask = (outlook: string) => [
	"## Your request",
	`You are ${outlook}.`,
	"Propose the best line for this player from your outlook, for this turn and the opponent's next turn. Consider every order of operations that matters and whether holding mana open beats spending it. Check the findings above against the dossier before you rely on them.",
	"",
	"Answer through submit with:",
	"- line: ordered actions in plain words",
	"- hold: mana, cards or creatures kept for their turn and why",
	"- opponentTurn: your blocks and responses on their turn",
	"- risks: what could go wrong and what would change the line",
	"- outcome: life totals and board after both turns, with the arithmetic",
	"- confidence: 1 to 5",
	"",
	"A report, for its shape only:",
	EXAMPLE,
	"",
	"Do not write plan syntax.",
].join("\n");

export async function perspectiveReports(dossier: string, survey: Survey, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Reports> {
	signal?.throwIfAborted();
	const result: Reports = { reports: {} };
	const findings = findingsSection(survey);
	await Promise.all(Object.entries(PERSPECTIVES).map(async ([name, outlook]) => {
		try {
			result.reports[name] = await reasoner.work(`perspective ${name}`, { system: ANALYST_SYSTEM, user: dossier, task: `${findings}\n\n${ask(outlook)}` }, { submit: REPORT, turns: 2, signal }, 1200) as Report;
		} catch (error) {
			signal?.throwIfAborted();
			(result.failed ??= []).push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	signal?.throwIfAborted();
	return result;
}

const TITLES: Record<string, string> = { defender: "Defender", punisher: "Punisher", planner: "Long-horizon planner", sequencer: "Sequencer", opponent: "The opponent's view", value: "Removal and value analyst" };

/** The reports as a section the coordinator reads. */
export function reportsSection(reports: Reports): string {
	const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
	return ["## Reports from six outlooks", "Each analyst read the dossier and the findings and proposed a whole line from one outlook. They can be wrong and they disagree on purpose.",
		...Object.keys(PERSPECTIVES).flatMap((name) => {
			const one = reports.reports[name];
			return one ? [`### ${TITLES[name]}, confidence ${one.confidence}`, quote([...one.line.map((step, at) => `${at + 1}. ${step}`), `Hold: ${one.hold}`, `Their turn: ${one.opponentTurn}`, `Risks: ${one.risks}`, `Outcome: ${one.outcome}`].join("\n"))] : [];
		}),
		...(reports.failed?.length ? [`Reports that failed: ${reports.failed.join("; ")}.`] : [])].join("\n\n");
}
