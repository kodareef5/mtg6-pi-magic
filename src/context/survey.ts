/**
 * The first round of a strategy session: focused questions about one position,
 * asked in parallel. Every question reads the same game dossier and ends with
 * its own request, so the provider sees one shared prefix. Each answer is a list
 * of rated findings in one shape. No code evaluates the board; later rounds are
 * told the findings can be wrong.
 */
import type { Frame } from "../core/types.ts";
import type { Reasoner } from "./reason.ts";

/** The reading every strategy call applies to the dossier. */
export const RULES_OF_PLAY = [
	"Rules of play to apply when you read the board:",
	"- Tapped creatures cannot block.",
	"- Without haste, a creature cannot attack or pay a tap-symbol or untap-symbol cost unless you controlled it continuously since your turn began. It can still block (302.6, 702.10).",
	"- A creature normally blocks one attacker. Menace needs at least two blockers; flying needs flying or reach. Card abilities can change these restrictions.",
	"- A blocked attacker divides its power among its blockers, not full power to each (510.1c). Trample can assign excess to the player after assigning lethal damage to every blocker, accounting for marked damage and deathtouch (702.19). Without trample, a blocked attacker deals no damage to the player.",
	"- Marked damage adds up within the turn. Lethal damage destroys a creature unless indestructible or another effect prevents it; deathtouch can make 1 damage lethal (704.5g-h, 702.12).",
	"- If you control legendary permanents with the same name, you choose one to keep and put the rest in their owners' graveyards (704.5j).",
	"- A land you can still play this turn adds its mana once it is on the battlefield untapped.",
	"- Only abilities listed on a card or in its battlefield row exist.",
	"",
	"Write every sum out, such as 3 + 2 = 5 damage against toughness 4, or {1}{R} + {R} = 3 mana from three red sources.",
].join("\n");

/** Shared by every analyst in the first and second rounds. */
export const ANALYST_SYSTEM = [
	"You analyse one Magic position for a player and report to their coordinator, who writes the turn's plan. A fast pilot carries that plan out.",
	"",
	"The conversation gives you, in order:",
	"1. The player's projected position, mana, public deck lists and odds, card text and recent turns. Battlefield rows give current characteristics. Printed text states the card's abilities; registered triggers are accepted interpretations and can be wrong.",
	"2. Sometimes, work from other analysts, marked as such. It can be wrong too.",
	"3. Your request, last. Answer that request and nothing else.",
	"",
	RULES_OF_PLAY,
	"",
	"Your answer moves nothing and nothing checks it against the rules. The coordinator weighs it against the dossier.",
].join("\n");

export type Finding = { source: string; kind: "threat" | "opportunity" | "risk" | "resource"; what: string; relevance: number; when: "now" | "their turn" | "later"; ordering?: string };
export type Survey = { findings: Finding[]; failed?: string[] };

const FINDINGS = { name: "submit", description: "Submit the findings for your question, most relevant first.",
	parameters: { type: "object", additionalProperties: false, required: ["findings"], properties: {
		findings: { type: "array", minItems: 1, items: { type: "object", additionalProperties: false, required: ["kind", "what", "relevance", "when"], properties: {
			kind: { type: "string", enum: ["threat", "opportunity", "risk", "resource"] },
			what: { type: "string", minLength: 1, description: "The finding, with its arithmetic written out." },
			relevance: { type: "integer", minimum: 1, maximum: 5, description: "1 is minor, 5 decides the game." },
			when: { type: "string", enum: ["now", "their turn", "later"] },
			ordering: { type: "string", description: "The order of operations it depends on, or what to hold open." },
		} } },
	} },
	check: (args: Record<string, unknown>) => Array.isArray(args.findings) && args.findings.length ? null : "Submit at least one finding." };

const EXAMPLE = '{"kind": "opportunity", "what": "Their only untapped creature has no flying or reach, so your 3/3 flyer attacks unblocked: 3 damage takes them from 7 to 4.", "relevance": 4, "when": "now", "ordering": "Attack before casting the sorcery, so its mana stays open if they flash in a blocker."}';

const ask = (question: string) => [
	"## Your request",
	`Focused question. ${question}`,
	"",
	"Answer through submit with findings. Each finding is a threat, an opportunity, a risk or a resource, with:",
	"- what: the finding, with its arithmetic written out",
	"- relevance: 1 for minor, 5 when it decides the game",
	"- when: now, their turn, or later",
	"- ordering: the order of operations it depends on, or what to hold open, if any",
	"",
	"One finding, for its shape only:",
	EXAMPLE,
	"",
	"Give every finding that matters for this question, most relevant first. Do not write a plan.",
].join("\n");

/** The questions for this position: each card in hand, each of the seat's creatures, then the fixed six. */
export function questions(frame: Frame): [string, string][] {
	const objects = frame.view.objects ?? [];
	const hand = [...new Set(objects.filter((one) => one.zone === "hand" && one.controller === frame.seat && one.card).map((one) => one.card!))];
	const creatures = objects.filter((one) => one.zone === "battlefield" && one.controller === frame.seat && one.traits?.types.includes("creature"));
	return [
		...hand.map((card) => [`hand ${card}`, `Your card ${card}. Can you cast or play it in the planned turn, its cost against your untapped sources and land plays? What would it change, alone and together with your other cards and creatures? Is it better cast now, later this turn, or held for the opponent's turn?`] as [string, string]),
		...creatures.map((one) => [`creature ${one.card ?? one.token?.name} ${one.id}`, `Your creature ${one.card ?? one.token?.name} (${one.id}@${one.incarnation}). Can it attack this turn? Which opposing creatures could block it, and what happens in each case? What is its best use: attack, block, hold, or an ability?`] as [string, string]),
		["opponent", "The opponent. Their life, creatures and which are tapped, cards in hand, open mana, and the likely cards in hand from the odds. What can they do to you before and during their next turn? What can you exploit: low life, missing blockers, no flying or reach, a key creature to remove?"],
		["defense", "Their next attack. Every creature that can attack you, its likely power, and the total against your life. Your blockers and the instants you could pay for on their turn, alone and combined, and the damage each prevents. The best blocks, and whether you need a chump block."],
		["attack", "Your whole attack this turn. Every creature that can attack, haste creatures you can cast before combat and creature-lands you can animate without tapping them for mana included. Total damage through their best legal blocks, accounting for trample and double strike, add the burn you can pay for, and compare with their life. Is there a win, and in what order?"],
		["removal", "Removal. For each opposing creature that matters, which of your spells and abilities, alone or together, can kill or remove it this turn or on their turn? Add the damage against its toughness and the costs against your sources, and say whether spending them beats leaving the mana unused."],
		["ordering", "Orders of operations this turn. Land before or after spells, spells before or after combat, a fetch or land drop before or after a landfall payoff, and which mana to hold open for instants or blocks on the opponent's turn instead of spending it now. Rate each ordering that matters by what it gains."],
		["zones", "Your other resources. Battlefield abilities, graveyard, exile and the stack: any ability, permission, untapped source or pending object that could change the game? A land you can sacrifice to search for a land makes another land enter, so landfall triggers again."],
	];
}

export async function surveyPosition(frame: Frame, dossier: string, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Survey> {
	signal?.throwIfAborted();
	const survey: Survey = { findings: [] };
	await Promise.all(questions(frame).map(async ([source, question]) => {
		try {
			const answer = await reasoner.work(`survey ${source}`, { system: ANALYST_SYSTEM, user: dossier, task: ask(question) }, { submit: FINDINGS, turns: 2, signal }, 900);
			for (const one of answer.findings as Omit<Finding, "source">[]) survey.findings.push({ source, ...one });
		} catch (error) {
			signal?.throwIfAborted();
			(survey.failed ??= []).push(`${source}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	signal?.throwIfAborted();
	survey.findings.sort((a, b) => b.relevance - a.relevance || a.source.localeCompare(b.source));
	return survey;
}

/** The ranked findings as a section other rounds read. */
export function findingsSection(survey: Survey): string {
	return ["## Findings from focused questions", "Written by analysts who each answered one question about this position. Ranked by their relevance rating. They can be wrong; the dossier wins any disagreement.",
		survey.findings.length ? survey.findings.map((one, at) => `${at + 1}. Relevance ${one.relevance}, ${one.kind}, ${one.when}, from the ${one.source} question.\n${quoteLines(`${one.what}${one.ordering ? `\nOrdering: ${one.ordering}` : ""}`)}`).join("\n") : "No findings came back.",
		...(survey.failed?.length ? [`Questions that failed: ${survey.failed.join("; ")}.`] : [])].join("\n\n");
}

const quoteLines = (text: string) => text.trim().split("\n").map((line) => `   > ${line}`.trimEnd()).join("\n");
