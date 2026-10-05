/**
 * What a decision model is shown for one decision.
 *
 * Nothing here writes to the table.
 * Past 150 lines to keep the packet contract beside the projection that fills it.
 */

import type { Rules } from "../core/rules.ts";
import type { Frame, SeatId, SeatView, Window } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { openingGuidance, say, type Brief } from "./brief.ts";
import { dial, type Route } from "./dial.ts";
import type { Recap } from "./summary.ts";
import { planState } from "../core/planning.ts";
import { matches } from "../core/query.ts";
import type { SeenObject } from "../core/work.ts";
import type { Printed } from "../core/printed.ts";
import { checklist, type ReviewItem } from "../core/review.ts";
import { summary } from "../core/announce.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { sources } from "../core/funding.ts";
import { openingHand } from "../core/pregame.ts";

/**
 * What the pregame and the commentator left behind, shared by every seat.
 *
 * One object for the whole table, held by reference, because the recaps grow as
 * the game runs and a seat that copied them at the start would read a stale
 * game. The briefs are per seat and a seat reads only its own.
 */
export type Chronicle = { briefs: Record<SeatId, Brief>; recaps: Recap[] };

/** The part of the seat's plan this decision needs: what it is for, what is due, and what would make it wrong. */
export type PlanSlice = {
	objective: string;
	/** The plan's whole guidance, where no phase script covers the window. */
	guidance?: string;
	/** The step due now, if any, then the next two waiting. */
	due?: string;
	next: string[];
	branches: string[];
	held: string[];
	/** Facts the plan named as reasons to stop, holding now. */
	stops: string[];
	done: string[];
	/** The phase script for this window: its goal, its decisions, its steps in order, and what justifies asking strategy again. */
	script?: { goal: string[]; guidance: string[]; steps: string[]; reevaluate: string[] };
};

/** An object as a pilot reads it: what it is and its state, without its registrations. */
export type Seen = { id: string; name: string; controller: SeatId; zone: string; tapped?: true; body?: string; counters?: Record<string, number>; damage?: number; words?: string[]; effect?: string[] };

export type Packet = {
	actor: SeatId;
	/** Opening and turn context are distinct; no phase is inferred from prose. */
	window: Window;
	/** The table revision this was built from. A later answer against it is stale. */
	version: number;
	/** The remaining obligation in one sentence: what still has to be settled. */
	obligation: string;
	/** Current hand counts and the keep/bottom obligation, without inferred future draws. */
	opening?: NonNullable<SeatView["opening"]> & { hand: ReturnType<typeof openingHand> };
	plan?: PlanSlice;
	/** Every option, at equal detail, already marked with what the plan says about it. */
	options: { id: string; label: string; shows?: string }[];
	/** What is available to spend, with each source's own restrictions kept. */
	resources: string[];
	known: string[];
	objects: Seen[];
	/** Source text for visible cards involved in this decision, kept apart from current traits. */
	cards: Record<string, Printed>;
	/** The pregame snippets that apply here: this window's, and a note for each card an option names. */
	guidance: string[];
	/** The public turn recaps: three sentences about the last three turns, not two hundred receipts. */
	lately: string[];
	/** The ways out that only change what this seat knows. Empty when nothing is answerable. */
	routes: Route[];
	/** What this seat asked for on this decision and was given. */
	learned?: string[];
	/** Why the answers already sent for this decision were not taken. Present only on a retry. */
	refused?: string[];
	resolution?: SeatView["resolution"];
	/** Considered, deferred and still-unreviewed uses. An assessment does not count as execution. */
	checklist?: ReviewItem[];
	/** The accepted use being completed, separate from the next phase's strategy. */
	resolving?: { claim: string; basis: string; remaining: string[]; objective?: string };
};

const seen = (object: SeenObject): Seen => {
	const traits = object.traits;
	return { id: object.id, name: object.card ?? object.token?.name ?? object.ability?.claim ?? "unknown", controller: object.controller, zone: object.zone,
		...(object.tapped ? { tapped: true as const } : {}), ...(traits?.power !== undefined ? { body: `${traits.power}/${traits.toughness}` } : {}),
		...(Object.keys(object.counters).length ? { counters: { ...object.counters } } : {}), ...(object.damage ? { damage: object.damage } : {}),
		...(traits?.words.length ? { words: [...traits.words] } : {}),
		...(object.ability ? { effect: [object.ability.basis, ...object.ability.instructions.map(summary)] } : {}) };
};

/** The due step's options first, then the live branches', then the rest: every option, in the order the plan wants them. */
function inPlanOrder<T extends { id: string }>(options: readonly T[], state: ReturnType<typeof planState>): T[] {
	if (!state) return [...options];
	const rank = new Map<string, number>();
	state.due.find((one) => one.candidates.length)?.candidates.forEach((option) => rank.set(option.id, 0));
	for (const branch of state.branches) for (const option of branch.candidates) if (!rank.has(option.id)) rank.set(option.id, 1);
	return [...options].sort((a, b) => (rank.get(a.id) ?? 2) - (rank.get(b.id) ?? 2));
}

/**
 * Build the packet.
 *
 * What goes in: the obligation, the options marked with the plan, the part of
 * the plan this window needs, and the public facts. What stays out: the deck
 * lists, card registrations, analysis the plan already settled, and anything
 * this seat has not earned. Equal detail per option, so a preference is never
 * manufactured by how an option is described.
 *
 * `context` is optional because a seat with no brief still has to be able to play.
 */
export function focus(
	frame: Frame,
	intent: Intent,
	context: { brief?: Brief; recaps?: readonly Recap[]; rules?: Rules; learned?: readonly string[] } = {},
): Packet {
	const { decision, seat, view, version, refused } = frame;
	if (!decision || decision.seat !== seat || intent.seat !== seat || intent.deck.seat !== seat) {
		throw new Error("A packet needs a decision and intent for its own seat");
	}
	if (view.window.kind === "finished") throw new Error("A finished game has no decision packet");

	// This window's snippet, and a note for each card an option names: the note is wanted where the card is a choice.
	const brief = context.brief;
	const named = decision.options.map((option) => `${option.label} ${option.shows ?? ""}`).join("\n");
	const step = view.window.kind === "turn" ? brief?.steps?.[view.window.step as keyof Brief["steps"]] : undefined;
	const guidance = [
		view.window.kind === "opening" ? openingGuidance(brief, view, seat) : say(step?.[view.window.kind === "turn" && view.window.active === seat ? "own" : "opponent"]),
		...Object.entries(brief?.cards ?? {}).filter(([card]) => named.includes(card)).map(([card, note]) => `${card}: ${say(note)}`),
	].filter((line) => line.length > 0);

	const state = planState(frame);
	// The window's script, when the plan has one: then the pilot reads it and not the whole plan, the brief or the recaps.
	const scripts = (state?.plan.phases ?? []).filter((one) => matches(one.when, frame));
	const dueAt = state?.due.find((one) => one.candidates.length)?.at, done = new Set(view.done ?? []);
	const plan = state && !view.resolution ? {
		objective: state.plan.objective,
		...(scripts.length ? {} : { guidance: state.plan.guidance }),
		...(dueAt !== undefined ? { due: state.plan.steps[dueAt]!.label } : {}),
		next: state.waiting.slice(0, 2).map((one) => one.label),
		branches: state.branches.map((one) => one.label),
		held: state.held.map((hold) => `${hold.objects.map((object) => object.card ?? object.id).join(", ")}: ${hold.purpose}`),
		stops: state.stops,
		done: (view.done ?? []).map((at) => state.plan.steps[at]?.label ?? `step ${at + 1}`),
		...(scripts.length ? { script: {
			goal: scripts.flatMap((one) => one.goal ? [one.goal] : []), guidance: scripts.map((one) => one.guidance),
			steps: state.plan.steps.flatMap((step, at) => matches(step.when, frame) ? [`${done.has(at) ? "Done" : at === dueAt ? "Now" : "Then"}: ${step.label}`] : []),
			reevaluate: scripts.flatMap((one) => one.reevaluate ?? []),
		} } : {}),
	} : undefined;
	const scripted = !!plan?.script, review = checklist(frame);
	const relevant = new Set((view.objects ?? []).filter((object) => object.zone === "battlefield" || object.zone === "stack" || (view.window.kind === "opening" && object.zone === "hand") ||
		decision.options.some((option) => option.objects?.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation)))
		.flatMap((object) => object.card ? [object.card] : []));
	for (const item of review) for (const card of item.cards) relevant.add(card);
	// A sacrificed source is no longer on the battlefield, but its public
	// ability and source text still belong to the response and resolution.
	for (const object of view.objects ?? []) if (object.ability) {
		const card = view.objects?.find((one) => one.id === object.ability!.source.id)?.card;
		if (card) relevant.add(card);
	}
	const resolving = view.resolution && view.objects?.find((one) => one.id === view.resolution!.object)?.ability;
	const available = sources(frame).map(({ object, yields }) => `${object.card ?? object.token?.name ?? object.id}: ${[...new Set(yields.map((one) =>
		`${one.colors.join("")}${one.spendOnly ? `, only on ${JSON.stringify(one.spendOnly)}` : ""}${one.sacrifice ? ", sacrificing it" : ""}`))].join(" or ")}`);
	return {
		actor: seat, window: structuredClone(view.window), version,
		obligation: decision.question,
		...(view.window.kind === "opening" && view.opening ? { opening: { ...view.opening, hand: openingHand(view, seat) } } : {}),
		...(plan ? { plan } : {}),
		...(review.length ? { checklist: review } : {}),
		options: inPlanOrder(decision.options, state).map(({ id, label, shows }) => ({ id, label, ...(shows ? { shows } : {}) })),
		resources: [...view.yours, ...(view.window.kind === "turn" ? [
			`Land plays left this turn: ${Math.max(0, allowance(viewWorld(view), seat).lands - (view.landsPlayed ?? 0))}. Putting a land onto the battlefield by an effect does not use a land play.`,
			`Mana sources usable now: ${available.join("; ") || "none"}.`,
		] : [])],
		known: [...view.table, ...view.since],
		objects: (view.objects ?? []).filter((object) => object.zone === "battlefield" || object.zone === "stack").map(seen),
		cards: Object.fromEntries(Object.entries(view.printed ?? {}).filter(([name]) => relevant.has(name)).map(([name, card]) => [name, structuredClone(card)])),
		...(view.resolution ? { resolution: structuredClone(view.resolution) } : {}),
		...(resolving ? { resolving: { claim: resolving.claim, basis: resolving.basis, remaining: view.resolution!.program.map((one) => summary(one.instruction)),
			...(state ? { objective: state.plan.objective } : {}) } } : {}),
		guidance: scripted || resolving ? [] : guidance,
		lately: scripted || resolving ? [] : [...(context.recaps ?? [])].slice(-3).map((recap) => `Turn ${recap.turn}: ${recap.line}`),
		routes: dial(decision, context.rules),
		...(context.learned?.length ? { learned: [...context.learned] } : {}),
		...(refused?.length ? { refused: [...refused] } : {}),
	};
}

/**
 * Whether to put conceding in front of a decision model.
 *
 * It is always available to the seat. Whether it is listed is a separate
 * question, and listing it when the game is live is how a model learns to quit
 * instead of think.
 *
 * List it when the result is already settled and only the stepping through is
 * left: a sequence on the table that ends the game whatever this seat does,
 * with several resolutions already passed and no seat objecting, or a loop with
 * no exit this seat can take. A model may then concede the way a chess player
 * resigns, to save the other seats the clicking.
 *
 * Leave it out otherwise. Another seat can still play badly, so a position that
 * merely looks lost is not lost, and the cheaper answer is to let the decision
 * model do the work.
 */
export function offerConcede(packet: Packet): boolean {
	void packet;
	throw new Error("offerConcede is unwritten: settled sequence or inescapable loop only.");
}
