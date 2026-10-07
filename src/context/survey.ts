/**
 * Focused questions about one position, asked in parallel before the writer
 * plans: each card in hand, each of the seat's creatures, the opponent, their
 * next attack, the whole attack, removal and the other zones. Each answer is a short
 * reading of the supplied facts by the strategy model; no code judges the board,
 * and the writer is told the answers can be wrong.
 */
import type { Frame } from "../core/types.ts";
import type { Reasoner } from "./reason.ts";
import type { Universe } from "../core/cards.ts";
import { cardDefinition, decisionFacts } from "./strategy-position.ts";
import { mana } from "./strategy-facts.ts";

const SYSTEM = [
	"You answer one focused question about a Magic position for the seat's planner. Use only the supplied facts and card text; abilities are only those listed.",
	"Tapped creatures cannot block. Summoning-sick creatures can block but cannot attack or use tap abilities unless they have haste; a haste creature cast before combat attacks that turn.",
	"A second legendary permanent with the same name as one you control dies at once. A land still to be played this turn adds its mana.",
	"Damage at least equal to toughness kills. Write every sum out, such as 3 + 2 = 5 against toughness 4, and every mana total against the sources listed.",
	"Answer in at most six short lines of plain text. Do not write a plan or plan syntax. Your answer is advice the planner checks.",
].join("\n");

export type Survey = { hand: Record<string, string>; creatures: Record<string, string>; opponent?: string; defense?: string; attack?: string; zones?: string; removal?: string; failed?: string[] };

export async function surveyPosition(frame: Frame, forecast: boolean, reasoner: Pick<Reasoner, "think">, cards?: Universe): Promise<Survey> {
	const decision = decisionFacts(frame, cards);
	const inHand = new Set(decision.yourHand.map((one) => one.name));
	const visible = [...new Set((frame.view.objects ?? []).flatMap((one) => one.card && !inHand.has(one.card) ? [one.card] : []))]
		.flatMap((name) => { const card = cardDefinition(frame, name, cards); return card ? [card] : []; });
	const user = (question: string) => JSON.stringify({
		position: forecast ? "Your next turn, after your normal untap and before its unknown draw." : "The current position.",
		window: frame.view.window, you: frame.seat, facts: decision, mana: mana(frame), otherVisibleCards: visible,
	}) + `\nQUESTION: ${question}`;
	const asks: [string, string, string][] = [
		...[...inHand].map((name) => ["hand", name, `Your card ${name}. Can you cast or play it in this turn: its cost against your untapped sources and land plays? What would it change, alone and together with your other cards and creatures: damage, an attacker or blocker, removal, mana, cards? Could it swing or win the game?`] as [string, string, string]),
		...decision.yourCreatures.map((one) => ["creatures", `${one.name} ${one.id}`, `Your creature ${one.name} (${one.id}). Can it attack this turn? Which opposing creatures could block it, and what happens in each case? Its best use this turn: attack, block, hold, or tap for an ability.`] as [string, string, string]),
		["opponent", "", "The opponent: life, creatures and which are tapped, cards in hand, open mana. What can they do to you before and during their next turn? What can you exploit: low life, missing blockers, no flying or reach, a key creature to remove?"],
		["defense", "", "Their next attack: every creature that can attack you, its likely power, and the total against your life. Your blockers and the instants you could pay for on their turn, alone and combined: the damage each prevents. A trampler is reduced only by the blocker's toughness. The best blocks, and whether a chump block is needed."],
		["attack", "", "Your whole attack this turn: every creature that can attack, including haste creatures you can cast before combat and creature-lands you can animate without tapping them for mana. Total the damage, remove the largest attacker each untapped opposing creature can block, add burn you can pay for, and compare with their life. Is there a win, and in what order?"],
		["zones", "", "Your battlefield abilities, graveyard, exile and the stack: any ability, permission, untapped source or pending object that could materially change the game this turn? A land you can sacrifice to search for a land makes another land enter, so landfall triggers again; say in what order it pays off best."],
		["removal", "", "For each opposing creature that matters: which of your spells and abilities, alone or together, can kill or remove it this turn? Add the damage against its toughness and the costs against your untapped sources, and say whether spending them is worth it compared with leaving the mana unused."],
	];
	const survey: Survey = { hand: {}, creatures: {} };
	await Promise.all(asks.map(async ([kind, key, question]) => {
		try {
			const answer = (await reasoner.think(`survey ${kind}${key ? ` ${key}` : ""}`, { system: SYSTEM, user: user(question) }, 600)).trim();
			if (kind === "hand" || kind === "creatures") survey[kind][key] = answer;
			else survey[kind as "opponent"] = answer;
		} catch (error) {
			(survey.failed ??= []).push(`${kind}${key ? ` ${key}` : ""}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	return survey;
}
