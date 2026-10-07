/**
 * Focused questions about one position, asked in parallel before the writer
 * plans: each card in hand, each of the seat's creatures, the opponent, their
 * next attack, the whole attack, removal, ordering and the other zones. Each
 * answer is a list of rated findings in one shape, so they can be pooled and
 * ranked. The strategy model reads the facts; no code evaluates the board, and
 * later rounds are told the findings can be wrong.
 */
import type { Frame } from "../core/types.ts";
import type { Reasoner } from "./reason.ts";
import type { Universe } from "../core/cards.ts";
import { cardDefinition, decisionFacts } from "./strategy-position.ts";
import { mana } from "./strategy-facts.ts";

export const READING = [
	"Use only the supplied facts and card text; abilities are only those listed.",
	"Tapped creatures cannot block. Summoning-sick creatures can block but cannot attack or use tap abilities unless they have haste; a haste creature cast before combat attacks that turn.",
	"A second legendary permanent with the same name as one you control dies at once. A land still to be played this turn adds its mana.",
	"Damage at least equal to toughness kills. Write every sum out, such as 3 + 2 = 5 against toughness 4, and every mana total against the sources listed.",
].join("\n");

const SYSTEM = `You answer one focused question about a Magic position for the seat's planner.\n${READING}\nSubmit findings: each one a threat, opportunity, risk or resource, with its relevance from 1 (minor) to 5 (decides the game), when it matters, and any ordering it depends on. Do not write a plan. Your findings are advice the planner checks.`;

export type Finding = { source: string; kind: "threat" | "opportunity" | "risk" | "resource"; what: string; relevance: number; when: "now" | "their turn" | "later"; ordering?: string };
export type Survey = { findings: Finding[]; failed?: string[] };

const FINDINGS = { name: "submit", description: "Submit the findings for this question, most relevant first.",
	parameters: { type: "object", additionalProperties: false, required: ["findings"], properties: {
		findings: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["kind", "what", "relevance", "when"], properties: {
			kind: { type: "string", enum: ["threat", "opportunity", "risk", "resource"] },
			what: { type: "string", minLength: 1, description: "The finding with its arithmetic written out." },
			relevance: { type: "integer", minimum: 1, maximum: 5 },
			when: { type: "string", enum: ["now", "their turn", "later"] },
			ordering: { type: "string", description: "The order of operations it depends on, or what to hold open, if any." },
		} } },
	} },
	check: (args: Record<string, unknown>) => Array.isArray(args.findings) && args.findings.length ? null : "Submit at least one finding." };

/** The compact position every question and report reads. */
export function compactFacts(frame: Frame, forecast: boolean, cards?: Universe) {
	const decision = decisionFacts(frame, cards);
	const inHand = new Set(decision.yourHand.map((one) => one.name));
	const visible = [...new Set((frame.view.objects ?? []).flatMap((one) => one.card && !inHand.has(one.card) ? [one.card] : []))]
		.flatMap((name) => { const card = cardDefinition(frame, name, cards); return card ? [card] : []; });
	return { position: forecast ? "Your next turn, after your normal untap and before its unknown draw." : "The current position.",
		window: frame.view.window, you: frame.seat, facts: decision, mana: mana(frame), otherVisibleCards: visible };
}

export async function surveyPosition(frame: Frame, forecast: boolean, reasoner: Pick<Reasoner, "work">, cards?: Universe): Promise<Survey> {
	const position = compactFacts(frame, forecast, cards), decision = position.facts;
	const asks: [string, string][] = [
		...[...new Set(decision.yourHand.map((one) => one.name))].map((name) => [`hand ${name}`, `Your card ${name}. Can you cast or play it in this turn: its cost against your untapped sources and land plays? What would it change, alone and together with your other cards and creatures: damage, an attacker or blocker, removal, mana, cards? Is it better cast now, later this turn, or held for the opponent's turn?`] as [string, string]),
		...decision.yourCreatures.map((one) => [`creature ${one.name} ${one.id}`, `Your creature ${one.name} (${one.id}). Can it attack this turn? Which opposing creatures could block it, and what happens in each case? Its best use: attack, block, hold, or tap for an ability.`] as [string, string]),
		["opponent", "The opponent: life, creatures and which are tapped, cards in hand, open mana. What can they do to you before and during their next turn? What can you exploit: low life, missing blockers, no flying or reach, a key creature to remove?"],
		["defense", "Their next attack: every creature that can attack you, its likely power, and the total against your life. Your blockers and the instants you could pay for on their turn, alone and combined: the damage each prevents. A trampler is reduced only by the blocker's toughness. The best blocks, and whether a chump block is needed."],
		["attack", "Your whole attack this turn: every creature that can attack, including haste creatures you can cast before combat and creature-lands you can animate without tapping them for mana. Total the damage, remove the largest attacker each untapped opposing creature can block, add burn you can pay for, and compare with their life. Is there a win, and in what order?"],
		["removal", "For each opposing creature that matters: which of your spells and abilities, alone or together, can kill or remove it this turn or on their turn? Add the damage against its toughness and the costs against your sources, and rate whether spending them beats leaving the mana unused."],
		["ordering", "Orders of operations this turn: land before or after spells, spells before or after combat, a fetch or land drop before or after a landfall payoff, and which mana to hold open for instants or blocks on the opponent's turn instead of spending it now. Rate each ordering that matters by what it gains."],
		["zones", "Your battlefield abilities, graveyard, exile and the stack: any ability, permission, untapped source or pending object that could materially change the game? A land you can sacrifice to search for a land makes another land enter, so landfall triggers again."],
	];
	const survey: Survey = { findings: [] };
	await Promise.all(asks.map(async ([source, question]) => {
		try {
			const answer = await reasoner.work(`survey ${source}`, { system: SYSTEM, user: `${JSON.stringify(position)}\nQUESTION: ${question}` }, { submit: FINDINGS, turns: 2 }, 900);
			for (const one of answer.findings as Omit<Finding, "source">[]) survey.findings.push({ source, ...one });
		} catch (error) {
			(survey.failed ??= []).push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	survey.findings.sort((a, b) => b.relevance - a.relevance);
	return survey;
}
