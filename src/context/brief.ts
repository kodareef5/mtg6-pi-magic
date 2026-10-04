/**
 * The pregame: the deepest thinking a seat gets, done once per game.
 *
 * Four analysts per seat work at once, each on its own question, with both
 * registered lists in front of them and tools to look up a rule or a card. One
 * synthesis per seat then reconciles their findings into the brief. Both seats
 * prepare at the same time, so the wall time is the slowest analyst plus one
 * synthesis.
 *
 * The brief is filed by where it is read. Strategy reads all of it whenever it
 * plans. The pilot reads only the opening policy while it mulligans, the note
 * for the phase it is in on whose turn it is, and the notes for cards its
 * options name; pasting the whole brief into every decision is the failure this
 * shape exists to avoid.
 *
 * Past 150 lines because a reader asking "what was this seat told, and where
 * did it come from" wants the questions, the tools and the filing in one place.
 */
import { Type, type Static } from "typebox";
import type { Card, Universe } from "../core/cards.ts";
import { listed } from "../core/decks.ts";
import { problems } from "../core/language.ts";
import { splits } from "../core/odds.ts";
import { search, term, type Rules } from "../core/rules.ts";
import type { Phase } from "../core/steps.ts";
import type { Seat } from "../core/table.ts";
import type { SeatId } from "../core/types.ts";
import type { Lookup, Reasoner, Submission } from "./reason.ts";

const PHASES = ["beginning", "precombat-main", "combat", "postcombat-main", "ending"] as const satisfies readonly Phase[];
const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });

/** Where a brief is read, by field. */
const BriefSchema = Type.Cyclic({ Side: object({ own: Type.Optional(text), opponent: Type.Optional(text) }), Brief: object({
	/** Strategy: who must force the exchange at the start, and what changes that. */
	role: text,
	/** Strategy: the main route to a win, and the route when its key dependency fails. */
	route: text,
	recovery: text,
	/** Strategy: both clocks, the opposing threats and their windows, how to deny them. */
	matchup: text,
	/** The pilot, while it keeps or mulligans and bottoms. */
	opening: text,
	/** The pilot, for the phase it is in, on its own turn or the opponent's. */
	phases: object({ beginning: Type.Optional(Type.Ref("Side")), "precombat-main": Type.Optional(Type.Ref("Side")), combat: Type.Optional(Type.Ref("Side")),
		"postcombat-main": Type.Optional(Type.Ref("Side")), ending: Type.Optional(Type.Ref("Side")) }),
	/** The pilot, when an option names the card; strategy always. Only cards with a real choice or trap. */
	cards: Type.Record(Type.String(), text),
	/** Strategy: plays that look automatic and are wrong in this matchup. */
	traps: Type.Array(text),
}) }, "Brief");
export type Brief = Static<typeof BriefSchema> & { seat: SeatId; version: 2; gaps: string[] };

export const emptyBrief = (seat: SeatId): Brief => ({
	seat, version: 2, role: "", route: "", recovery: "", matchup: "", opening: "", phases: {}, cards: {}, traps: [], gaps: [],
});

/** A brief carried from a journal written before this shape is not used: reading it would mean guessing its fields. */
export const current = (made: unknown, seat: SeatId): Brief =>
	(made as { version?: number })?.version === 2 ? made as Brief : { ...emptyBrief(seat), gaps: ["The carried brief is an older shape and was not used."] };

const DESTINATIONS = ["role", "route", "recovery", "matchup", "opening", "phase", "card", "trap"] as const;
const FindingsSchema = object({
	conclusions: Type.Array(object({
		claim: text,
		/** Card facts, counts or rules this rests on. */
		evidence: Type.Array(text),
		assumptions: Type.Array(text),
		/** The visible fact that would change it. */
		changesWhen: text,
		destination: Type.Union(DESTINATIONS.map((one) => Type.Literal(one))),
		card: Type.Optional(text),
		phase: Type.Optional(Type.Union(PHASES.map((one) => Type.Literal(one)))),
		turn: Type.Optional(Type.Union([Type.Literal("own"), Type.Literal("opponent")])),
	}), { minItems: 1, maxItems: 10 }),
	/** What the analyst could not settle. */
	unsure: Type.Array(text),
});
type Findings = Static<typeof FindingsSchema>;

/** Does this card earn a note? A basic land or a card with no rules text has nothing to explain. */
const BASIC = new Set(["Forest", "Island", "Mountain", "Plains", "Swamp", "Wastes"]);
export const needsNote = (card: Card): boolean => !BASIC.has(card.name) && card.oracle.trim().length > 0;

const deckLines = (deck: string[], universe: Universe): string[] => {
	const counted = new Map<string, number>();
	for (const name of deck) counted.set(name, (counted.get(name) ?? 0) + 1);
	return [...counted].sort().map(([name, n]) => {
		const card = universe.cards.get(name);
		return card ? `${n} ${name}  ${card.mana}  ${card.type}  ${card.stats}  ${card.oracle.replace(/\n/g, " / ")}` : `${n} ${name} (not in the card list)`;
	});
};

/** The curve, and the opening-hand odds a mulligan rests on, computed rather than guessed. */
function numbers(deck: string[], universe: Universe): string {
	const cards = deck.map((name) => universe.cards.get(name)).filter((card): card is Card => !!card);
	const land = (card: Card) => card.type.includes("Land");
	const lands = cards.filter(land).length, cheap = cards.filter((card) => !land(card) && card.cmc <= 2).length;
	const buckets = new Map<number, number>();
	for (const card of cards) if (!land(card)) buckets.set(card.cmc, (buckets.get(card.cmc) ?? 0) + 1);
	const percent = (value: number) => `${(100 * value).toFixed(1)}%`;
	const byLands = splits([lands, deck.length - lands], 7);
	const playable = splits([lands, cheap, deck.length - lands - cheap], 7).filter(({ counts }) => counts[0]! >= 2 && counts[0]! <= 4 && counts[1]! >= 1)
		.reduce((sum, one) => sum + one.chance, 0);
	return [
		`${deck.length} cards, ${lands} lands. Spells by mana value: ${[...buckets].sort((a, b) => a[0] - b[0]).map(([cmc, n]) => `${cmc}:${n}`).join(" ")}.`,
		`Lands in an opening seven: ${byLands.map(({ counts, chance }) => `${counts[0]}: ${percent(chance)}`).join(", ")}.`,
		`Two to four lands and at least one spell costing two or less: ${percent(playable)}.`,
		"Exact odds for a random seven from the registered main deck, with no other assumption.",
	].join("\n");
}

const SYSTEM = [
	"You prepare one seat for a game of Magic: The Gathering, before it starts.",
	"You are one of four analysts working at once on separate questions. A writer then reconciles your findings into the seat's brief.",
	"The strategist reads the whole brief whenever it plans a turn. A fast pilot reads only a short note for the window it is in and notes for the cards in front of it.",
	"",
	"Both registered deck lists are public and given in full. They give composition, never a hand or the library order. Do not assume any other card.",
	"Think like a strong player preparing a matchup: roles and clocks, threats and their last answer windows, scarce resources, and plays that look automatic but are wrong here.",
	"Teach each default with the visible condition that reverses it. Never write a bare slogan such as always save removal.",
	"Every conclusion gives the claim, the card facts or numbers it rests on, what it assumes, and the visible fact that would change it. Say what you are unsure of instead of inventing certainty.",
	"",
	"You may look a rule or a card up with the tools. Then call submit once with your findings. Nothing you write as text is read.",
].join("\n");

const QUESTIONS = {
	deck: "DECK AND RESOURCES. What does your deck do: its engines and the pieces they depend on, the curve against the mana it can really make (restrictions included), recurring value, its weak draws, and its routes to a win.",
	matchup: "MATCHUP. Both clocks, the opponent's engines and threats with the windows in which they must be answered, the removal and protection exchanges, evasion, when the roles change, and how your sequencing can deny the conditions their key cards need.",
	opening: "OPENING. Keep, mulligan and bottom choices on the play and on the draw: what a keep needs, the borderline hands and the plan behind each, and what to bottom first. Use the computed odds.",
	challenge: "CHALLENGE. Find the mistakes a competent player of this deck is likely to make in this matchup: wrong shortcuts, missed response windows, resource conflicts, trigger order, and plays that look automatic but lose.",
} as const;

/** The tools an analyst may use. A miss answers "not found", so a lookup never ends the work. */
function lookups(universe: Universe, rules?: Rules): Lookup[] {
	const card: Lookup = { name: "card", description: "Look up a Standard card's text by its exact name.",
		parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"], additionalProperties: false },
		answer: (args) => { const found = universe.cards.get(String(args.name)); return found ? `${found.name}  ${found.mana}  ${found.type}  ${found.stats}\n${found.oracle}` : `No Standard card is named ${String(args.name)}.`; } };
	if (!rules) return [card];
	const rule: Lookup = { name: "rule", description: "Look up a Comprehensive Rules entry by number (such as 702.19b) or search it by words (such as trample).",
		parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
		answer: (args) => {
			const query = String(args.query).trim();
			const exact = rules.byRef.get(query) ?? term(rules, query);
			const hits = exact ? [exact] : search(rules, query, 5);
			return hits.length ? hits.map((entry) => `${entry.ref}  ${entry.text}`).join("\n") : `Nothing in the rules matches ${query}.`;
		} };
	return [card, rule];
}

/** The submit tool for a schema: its answer is `value`, checked against the schema and then by `extra`. */
const submission = <T>(schema: Parameters<typeof problems>[0], description: string, extra: (value: T) => string[] = () => []): Submission => ({
	name: "submit", description,
	parameters: { type: "object", properties: { value: pointers(schema) }, required: ["value"], additionalProperties: false },
	check: (args) => {
		const wrong = problems(schema, args.value);
		if (wrong.length) return `It does not match the schema: ${wrong.join("; ")}.`;
		const more = extra(args.value as T);
		return more.length ? more.join("; ") : null;
	},
});
/** JSON Schema as a provider reads it: a cyclic schema's bare refs become pointers into its `$defs`. */
const pointers = (schema: object): object => JSON.parse(JSON.stringify(schema).replace(/"\$ref":"([A-Za-z]+)"/g, '"$ref":"#/$defs/$1"'));

/** The facts every analyst reads: both lists in full, the computed numbers, the table. */
function facts(seat: Seat, others: Seat[], universe: Universe, format: string): string {
	const mine = listed(seat.deck.main);
	return [
		`You are seat ${seat.id} in a ${others.length + 1}-seat game of ${format}. Who plays first is not yet known.`,
		"", `Your registered deck:`, ...deckLines(mine, universe), "", numbers(mine, universe),
		...others.flatMap((other) => ["", `Seat ${other.id}'s public registered deck:`, ...deckLines(listed(other.deck.main), universe), "", numbers(listed(other.deck.main), universe)]),
	].join("\n");
}

/**
 * Prepare one seat: the four analysts at once, then the synthesis. A failed
 * analyst reaches the synthesis as a failure, never as an invented answer. The
 * brief fails only when the synthesis does, or when every analyst did.
 */
export async function brief(
	seat: Seat,
	others: Seat[],
	universe: Universe,
	reasoners: () => Pick<Reasoner, "work">,
	options: { format: string; rules?: Rules },
): Promise<Brief> {
	const user = facts(seat, others, universe, options.format);
	const tools = lookups(universe, options.rules);
	const findings = submission<Findings>(FindingsSchema, "Submit your findings for this question. Call it once.");
	const results = await Promise.all(Object.entries(QUESTIONS).map(async ([key, question]) => {
		try {
			const answer = await reasoners().work(`pregame ${key}`, { system: SYSTEM, user, task: `${question}\nSubmit at most ten conclusions.` },
				{ submit: findings, lookups: tools, turns: 6 }, ANALYST);
			return { key, findings: answer.value as Findings };
		} catch (error) { return { key, failed: String(error instanceof Error ? error.message : error) }; }
	}));
	const failed = results.flatMap((one) => "failed" in one ? [`${one.key}: ${one.failed}`] : []);
	if (failed.length === results.length) throw new Error(`Seat ${seat.id} has no brief: every analyst failed. ${failed[0]}`);

	const deck = new Set(Object.keys(seat.deck.main));
	const written = submission<Static<typeof BriefSchema>>(BriefSchema, "Submit the seat's brief. Call it once.",
		(value) => Object.keys(value.cards).filter((name) => !deck.has(name)).map((name) => `cards names ${name}, which is not in your deck`));
	const answer = await reasoners().work("pregame synthesis", { system: SYNTHESIS, user, task: [
		"The analysts' findings, by question:", JSON.stringify(Object.fromEntries(results.map((one) => [one.key, "findings" in one ? one.findings : { failed: one.failed }]))),
		"", "Write the brief now and submit it.",
	].join("\n") }, { submit: written }, SYNTHESIZED);
	return { ...(answer.value as Static<typeof BriefSchema>), seat: seat.id, version: 2, gaps: failed };
}

/** Output ceilings: an analyst thinks and looks things up; the synthesis writes every field. */
const ANALYST = 2000, SYNTHESIZED = 4000;

const SYNTHESIS = [
	"You write one seat's brief for a game of Magic: The Gathering from four analysts' findings, given after the deck lists.",
	"Reconcile them. Where they conflict, decide, or keep the disagreement as a condition when it depends on unknown play: do X unless Y.",
	"A missing or failed analyst stays missing: do not invent its part.",
	"",
	"The fields, and who reads them:",
	"- role: who must force the exchange at the start, and the visible facts that change it. Read by the strategist.",
	"- route: the main route to a win. recovery: the route when its key dependency fails. Read by the strategist.",
	"- matchup: both clocks, the opponent's threats with their last answer windows, and how to deny their key cards' conditions. Read by the strategist.",
	"- opening: the keep, mulligan and bottom policy on the play and on the draw. Read by the pilot while it mulligans.",
	"- phases: for each phase, a note for your own turn and one for the opponent's, only where there is something to do or avoid. One or two sentences each. Read by the pilot in that window.",
	"- cards: notes only for cards with a real choice or trap: when to play it, when not to, what to hold it for. Read by the pilot when an option names the card.",
	"- traps: plays that look automatic but are wrong in this matchup, each with the condition that makes it wrong. Read by the strategist.",
	"Every default comes with the visible condition that reverses it. Name cards and numbers. No preamble.",
	"",
	"Call submit once with the brief. Nothing you write as text is read.",
].join("\n");
