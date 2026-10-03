/**
 * The pregame pass, and what it leaves behind.
 *
 * One wave of questions, asked at once, per seat. Not one question. A single
 * "tell me your strategy" call produces a paragraph that is then pasted into
 * every decision, which is the failure this file exists to avoid: a decision
 * about blocking does not want the mulligan reasoning, and a context window
 * carrying both answers neither well.
 *
 * So the unit of the pass is the unit of injection, not the unit of the deck.
 * Every answer is a snippet filed under where it will be read:
 *
 *   deck      what this deck does and cannot do. Read once per game
 *   combos    the pairs meant to work together, and the threat model
 *   opening   what a keepable hand looks like, and the named edge cases
 *   phases    one per phase with a real decision window. Read on that phase
 *   cards     one per card that earns a note. Read when that card is an option
 *
 * Card notes are keyed by name and cost nothing on a turn where the card never
 * appears, which is why they are per card rather than per group. Grouping the
 * creatures would produce one snippet that is injected whenever any creature is
 * an option, which is most turns, which is the paste-everywhere failure again.
 * A card earns a note mechanically, before a call is spent: a basic land does
 * not, because the engine already knows what it does.
 *
 * Past 150 lines because a reader asking "what is this seat told, and where did
 * it come from" wants the questions, the filing and the prompts in one place.
 */

import type { Card, Universe } from "../core/cards.ts";
import type { Policy } from "../core/intent.ts";
import type { Phase } from "../core/steps.ts";
import type { Seat } from "../core/table.ts";
import type { SeatId } from "../core/types.ts";
import type { Reasoner } from "./reason.ts";

/**
 * What a seat is told, filed by where it is read.
 *
 * Version rises when the pass runs again, so a snippet injected into a decision
 * is attributable to the pass that wrote it.
 */
export type Brief = {
	seat: SeatId;
	version: number;
	deck: string;
	combos: string;
	opening: string;
	/** By opponent seat id as a string, because a brief is written to disk. */
	against: Record<string, string>;
	phases: Partial<Record<Phase, string>>;
	/** By card name. */
	cards: Record<string, string>;
	/** Questions that failed. The game plays on without that snippet. */
	gaps: string[];
};

export const emptyBrief = (seat: SeatId): Brief => ({
	seat, version: 0, deck: "", combos: "", opening: "",
	against: {}, phases: {}, cards: {}, gaps: [],
});

/**
 * The phases a plan is worth writing for: the ones with a decision window a
 * seat can lose a game in. Untap and cleanup grant no priority, and the
 * beginning and ending phases are included because holding a response through
 * upkeep and discarding at end of turn are both real choices.
 */
const PHASES: Phase[] = ["beginning", "precombat-main", "combat", "postcombat-main", "ending"];

/**
 * Does this card need a note of its own?
 *
 * Mechanical, so no call is spent deciding. A basic land is excluded by name
 * rather than by text, because the engine supplies its mana ability and a note
 * saying "taps for green" is a snippet injected on most turns of the game for
 * nothing. A card with no rules text has nothing to explain either.
 *
 * Everything else earns one. A fifteen card nonland deck is fifteen small
 * concurrent calls once per game, and most of them are cheap.
 */
const BASIC = new Set(["Forest", "Island", "Mountain", "Plains", "Swamp", "Wastes"]);
export const needsNote = (card: Card): boolean =>
	!BASIC.has(card.name) && card.oracle.trim().length > 0;

/** One question, and where its answer is filed. */
type Ask = { key: string; about: string; user: string };

const deckLines = (deck: string[], universe: Universe): string[] => {
	const counted = new Map<string, number>();
	for (const name of deck) counted.set(name, (counted.get(name) ?? 0) + 1);
	return [...counted].sort().map(([name, n]) => {
		const card = universe.cards.get(name);
		if (!card) return `${n} ${name} (not in the card list)`;
		return `${n} ${name}  ${card.mana}  ${card.type}  ${card.stats}  ${card.oracle.replace(/\n/g, " / ")}`;
	});
};

/** Mana curve by converted cost, which is what a mulligan judgment rests on. */
const curve = (deck: string[], universe: Universe): string => {
	const buckets = new Map<number, number>();
	let lands = 0;
	for (const name of deck) {
		const card = universe.cards.get(name);
		if (!card) continue;
		if (card.type.includes("Land")) lands += 1;
		else buckets.set(card.cmc, (buckets.get(card.cmc) ?? 0) + 1);
	}
	const spells = [...buckets].sort((a, b) => a[0] - b[0]).map(([cmc, n]) => `${cmc}:${n}`);
	return `${deck.length} cards, ${lands} lands. Spells by cost: ${spells.join(" ") || "none"}.`;
};

/**
 * What the model is and is not being asked for.
 *
 * It names what the answer does not promise, because a plan written before the
 * first untap step is a plan about a game nobody has played yet. A snippet that
 * reads as a rule gets followed off a cliff; one that reads as a prior gets
 * revised.
 */
const SYSTEM = [
	"You are preparing one seat of a game of Magic: The Gathering before it starts.",
	"",
	"Write guidance that will be injected into one narrow decision later, so it has",
	"to be short and it has to be about something. Name cards and numbers. Say what",
	"to do and what would mean doing something else instead.",
	"",
	"What your answer does not promise. You have not seen the game. You do not know",
	"the opponent's cards, and you will not be told them. A plan here is a prior and",
	"not an instruction: the seat may read your snippet beside a board you did not",
	"imagine, and a line you did not mention stays legal and may be better. Say so",
	"where it matters rather than overclaiming.",
	"",
	"No preamble, no headings, no restating the question. Prose, a few lines.",
].join("\n");

/**
 * Build the wave.
 *
 * Every question is answerable from the deck list and the seat count alone, so
 * none waits on another and all of them go at once. That independence is a
 * design constraint rather than a convenience: a question that needed an
 * earlier answer would serialise the pass and double its wall time.
 *
 * What a seat is told about an opponent is what a seat is entitled to know. In
 * a real game that is the format and how many seats there are, not their cards.
 * `openLists` is for a benchmark where both lists are known on purpose, and it
 * is off unless somebody says otherwise, because a leak into a pregame brief
 * cannot be undone by a later ruling.
 */
export function asks(
	seat: Seat,
	others: Seat[],
	universe: Universe,
	options: { format: string; openLists?: boolean } ,
): Ask[] {
	const mine = deckLines(seat.deck, universe);
	const deck = `Your deck, ${options.format}:\n${mine.join("\n")}\n\n${curve(seat.deck, universe)}`;
	const asksOf: Ask[] = [
		{
			key: "deck",
			about: "deck strengths and weaknesses",
			user: `${deck}\n\nWhat does this deck do well, and what can it not do? Two or three lines.`,
		},
		{
			key: "combos",
			about: "combinations and threat model",
			user:
				`${deck}\n\nWhich cards here are meant to work together, and what is this deck ` +
				`built to beat? Name the pairs. If nothing combines, say so in one line rather ` +
				`than inventing an interaction.`,
		},
		{
			key: "opening",
			about: "mulligan guidance",
			user:
				`${deck}\n\nThere are ${others.length + 1} seats. Guide the opening.\n` +
				`What a keepable seven looks like, in cards and lands. How far to mulligan and ` +
				`when to stop. What to do with no land, and with lands only. How much the first ` +
				`two turns matter for this deck. Give the counts, not the theory.`,
		},
	];

	for (const other of others) {
		asksOf.push({
			key: `against:${other.id}`,
			about: `against seat ${other.id}`,
			user:
				`${deck}\n\n` +
				(options.openLists
					? `Seat ${other.id} is playing, and this is an open-list benchmark:\n` +
						`${deckLines(other.deck, universe).join("\n")}\n\nWhere is your deck ahead of theirs and where is it behind?`
					: `You are seated against ${others.length} opponent${others.length === 1 ? "" : "s"} ` +
						`in ${options.format}, and you have not seen their cards. What should this deck ` +
						`expect to be ahead of and behind in this format, and what early sign would ` +
						`tell you which? Do not guess a specific decklist.`),
		});
	}

	for (const phase of PHASES) {
		asksOf.push({
			key: `phase:${phase}`,
			about: `${phase} guidance`,
			user:
				`${deck}\n\nGuidance for the ${phase} phase with this deck. What this deck ` +
				`usually wants to do here, what it should hold back, and what on the board ` +
				`would change that. Two or three lines, and nothing that is true of every deck.`,
		});
	}

	const notable = [...new Set(seat.deck)]
		.map((name) => universe.cards.get(name))
		.filter((card): card is Card => !!card && needsNote(card));
	for (const card of notable) {
		asksOf.push({
			key: `card:${card.name}`,
			about: `note on ${card.name}`,
			user:
				`${deck}\n\nThis card: ${card.name}  ${card.mana}  ${card.type}  ${card.oracle}\n\n` +
				`Why is it in this deck, what is it for, and when is playing it wrong? Two lines.`,
		});
	}

	return asksOf;
}

/** File one answer under the slot its key names. */
function file(brief: Brief, key: string, answer: string): void {
	const [kind, rest] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
	if (key === "deck" || key === "combos" || key === "opening") brief[key] = answer;
	else if (kind === "against") brief.against[rest] = answer;
	else if (kind === "phase") brief.phases[rest as Phase] = answer;
	else if (kind === "card") brief.cards[rest] = answer;
	else brief.gaps.push(`No slot for ${key}`);
}

/**
 * Run the wave for one seat.
 *
 * A question that fails is a gap and the game starts without that snippet,
 * because a missing plan costs a seat some quality and a refused game costs it
 * everything.
 *
 * Every question failing is a different claim. A seat briefed on nothing is not
 * a seat with a thin plan, it is a seat whose model never answered, and a run
 * that reports that as a finished game is a run that broke without noticing. So
 * this throws when nothing came back at all, or when the reasoner has given up
 * because the configuration is wrong.
 */
export async function brief(
	seat: Seat,
	others: Seat[],
	universe: Universe,
	reasoner: Reasoner,
	options: { format: string; openLists?: boolean; version?: number },
): Promise<Brief> {
	const built = { ...emptyBrief(seat.id), version: options.version ?? 1 };
	const wave = asks(seat, others, universe, options);
	const answers = await Promise.all(
		wave.map(async (ask) => {
			try {
				return { key: ask.key, answer: await reasoner.think(ask.about, { system: SYSTEM, user: ask.user }) };
			} catch (error) {
				return { key: ask.key, failed: `${ask.about}: ${String(error)}` };
			}
		}),
	);
	let answered = 0;
	for (const got of answers) {
		if (got.failed) built.gaps.push(got.failed);
		else {
			answered += 1;
			file(built, got.key, got.answer!);
		}
	}
	const why = reasoner.broken();
	if (why) throw new Error(`Seat ${seat.id} has no brief: ${why}`);
	if (!answered) {
		throw new Error(`Seat ${seat.id} has no brief: all ${wave.length} questions failed. ${built.gaps[0] ?? ""}`.trim());
	}
	return built;
}

/**
 * The brief as this seat's deck policy.
 *
 * `Policy` is core, because a person at a seat wants a deck plan too. This is
 * the one place a brief becomes something the engine already holds, and it
 * carries only the deck-level lines: the phase and card snippets are injected
 * per decision and do not belong in a record read on every one of them.
 */
export const policyFrom = (brief: Brief): Policy => ({
	seat: brief.seat,
	winsBy: brief.deck,
	priorities: [brief.combos, ...Object.values(brief.against)].filter(Boolean),
});

