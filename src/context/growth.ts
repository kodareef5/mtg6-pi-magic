/**
 * The growth question: one analyst whose only job is finding this turn's ways
 * to grow the attack, through land entries and the triggers they cause, and
 * ranking them. It runs beside the focused questions and the branches. Its
 * arithmetic may be rough; nothing checks it, and the coordinator audits the
 * lines it ranks against the dossier.
 */
import type { Reasoner } from "./reason.ts";
import { ANALYST_SYSTEM } from "./survey.ts";

export type GrowthLine = { sequence: string[]; attacker: string; power: string; damage: number; theirLife: number; unsure?: string; costs?: string };
export type Growth = { entries: string; lines: GrowthLine[]; none?: string; failed?: string };

/** One analyst, so a longer answer than a branch, and longer to write. */
const CEILING = 1600, TIMEOUT = 35_000;

const LINE = { type: "object", additionalProperties: false, required: ["sequence", "attacker", "power", "damage", "theirLife"], properties: {
	sequence: { type: "array", minItems: 1, items: { type: "string" }, description: "The line in order: each cast with the sources that pay it, each land entry, each trigger with its target in the order it resolves." },
	attacker: { type: "string", description: "The creature that grows and the other attackers, with the blocks you expect." },
	power: { type: "string", description: "The grown attacker's power after each entry as base (printed power plus counters) + bonus, and each doubling, such as 4 + 3 = 7, doubled 14 (bonus 10)." },
	damage: { type: "integer", minimum: 0, description: "Rough damage to the opponent this turn through their best legal blocks." },
	theirLife: { type: "integer", description: "Their life after this turn." },
	unsure: { type: "string", description: "What you are unsure of." },
	costs: { type: "string", description: "What the line spends or gives up." },
} };

const GROWTH = { name: "submit", description: "Submit the growth lines you found, sorted by damage. Acceptance checks the shape, not the rules or the arithmetic.",
	parameters: { type: "object", additionalProperties: false, required: ["entries", "lines"], properties: {
		entries: { type: "string", description: "The land entries you can make this turn and how." },
		lines: { type: "array", items: LINE, description: "Your lines, the most damage first. Empty when nothing grows this turn." },
		none: { type: "string", description: "Only when nothing grows this turn: why, in one line." },
	} },
	check: (args: Record<string, unknown>) => {
		if (typeof args.entries !== "string") return "entries is text.";
		if (!Array.isArray(args.lines)) return "lines is a list.";
		for (const one of args.lines as Record<string, unknown>[]) {
			if (!Array.isArray(one?.sequence) || !one.sequence.length || one.sequence.some((row) => typeof row !== "string")) return "each line needs a sequence of text rows.";
			if (typeof one.attacker !== "string" || typeof one.power !== "string") return "attacker and power are text.";
			if (!Number.isInteger(one.damage) || Number(one.damage) < 0 || !Number.isInteger(one.theirLife)) return "damage and theirLife are integers.";
		}
		return args.none === undefined || typeof args.none === "string" ? null : "none is text.";
	} };

export const GROWTH_QUESTION = [
	"## Your request",
	"Growth question. Your only job: find this turn's ways to grow your attack, and rank them. Other analysts cover everything else.",
	"",
	"1. The land entries you can make. Go through each land you could play and each land you control. Playing it is one entry. An ability that sacrifices it to put another land onto the battlefield is one more, usable the turn it enters if you can pay its cost; mana from a land you just played counts. Add your plays left, extra plays a permission gives, lands you may play from your graveyard, and spells that put a land onto the battlefield. A mode that puts no land onto the battlefield makes no entry. Note lands that enter tapped.",
	"2. What each entry triggers: your landfall abilities now, and those of payoffs you could cast first. A payoff cast after an entry does not see that entry.",
	"3. Your candidate lines: which payoff to cast first and how to pay for it without tapping your attacker or a land whose {T} ability the line uses later, which entries in which order, the order and targets of the triggers each time, and which creature grows.",
	"4. For each line: the grown attacker's power after each entry, as its base (printed power plus counters) + its bonus until end of turn. A doubling adds the whole power to the bonus, and the bonus lasts the turn. For a 3-power creature: 3 + 0 = 3, doubled 6 (bonus 3); after a counter, 4 + 3 = 7, doubled 14 (bonus 10); with no new counter, 4 + 10 = 14, doubled 28 (bonus 24). Then the attackers: the creatures the board lists without summoning sickness, and any with haste; a creature you cast this turn has summoning sickness. Then their best blocks, the rough damage against their life, and what the line costs or gives up.",
	"",
	"Sort the lines by damage, the most first. Rough arithmetic is fine; say what you are unsure of. If nothing grows this turn, say so in none.",
	"",
	"Answer through submit. Do not write plan syntax.",
].join("\n");

export async function growthReport(dossier: string, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Growth> {
	signal?.throwIfAborted();
	try {
		const answer = await reasoner.work("growth", { system: ANALYST_SYSTEM, user: dossier, task: GROWTH_QUESTION }, { submit: GROWTH, turns: 2, signal, timeoutMs: TIMEOUT, attempts: 1, optional: true }, CEILING) as Growth;
		// Ordered by the damage the analyst claims, as it was asked to, whatever order it wrote.
		return { ...answer, lines: [...answer.lines].sort((a, b) => b.damage - a.damage) };
	} catch (error) {
		signal?.throwIfAborted();
		return { entries: "", lines: [], failed: error instanceof Error ? error.message : String(error) };
	}
}

/** The growth lines as the first section the coordinator reads. */
export function growthSection(found: Growth): string {
	const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
	if (found.failed) return `## Growth opportunities\nThe growth analyst did not answer: ${found.failed}.`;
	return ["## Growth opportunities",
		"From the growth analyst, whose only job is growing this turn's attack. Ordered by the damage it claims; nothing has checked this arithmetic, and a row can be wrong.",
		`Land entries it counts: ${found.entries || "not stated"}`,
		...(found.lines.length ? found.lines.map((one, at) => `### Line ${at + 1}. Claims ${one.damage} damage, their life ${one.theirLife}\n${quote([...one.sequence.map((row, n) => `${n + 1}. ${row}`),
			`Attackers: ${one.attacker}`, `Power: ${one.power}`, ...(one.costs ? [`Costs: ${one.costs}`] : []), ...(one.unsure ? [`Unsure: ${one.unsure}`] : [])].join("\n"))}`)
			: [`No growth line: ${found.none ?? "none given"}.`])].join("\n\n");
}
