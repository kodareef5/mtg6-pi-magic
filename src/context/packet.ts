/**
 * What a decision model is shown for one decision.
 *
 * Nothing here writes to the table.
 * Past 150 lines to keep the packet contract beside the projection that fills it.
 */

import type { Rules } from "../core/rules.ts";
import type { Frame, SeatId, SeatView, Window } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { say, type Brief } from "./brief.ts";
import { dial, type Route } from "./dial.ts";
import type { Recap } from "./summary.ts";
import { planState } from "../core/planning.ts";
import type { SeenObject } from "../core/work.ts";

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
	guidance: string;
	/** The step due now, if any, then the next two waiting. */
	due?: string;
	next: string[];
	branches: string[];
	held: string[];
	/** Facts the plan named as reasons to stop, holding now. */
	stops: string[];
	done: string[];
};

/** An object as a pilot reads it: what it is and its state, without its registrations. */
export type Seen = { id: string; name: string; controller: SeatId; zone: string; tapped?: true; body?: string; counters?: Record<string, number>; damage?: number; words?: string[] };

export type Packet = {
	actor: SeatId;
	/** Opening and turn context are distinct; no phase is inferred from prose. */
	window: Window;
	/** The table revision this was built from. A later answer against it is stale. */
	version: number;
	/** The remaining obligation in one sentence: what still has to be settled. */
	obligation: string;
	plan?: PlanSlice;
	/** Every option, at equal detail, already marked with what the plan says about it. */
	options: { id: string; label: string; shows?: string }[];
	/** What is available to spend, with each source's own restrictions kept. */
	resources: string[];
	known: string[];
	objects: Seen[];
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
};

const seen = (object: SeenObject): Seen => {
	const traits = object.traits;
	return { id: object.id, name: object.card ?? object.token?.name ?? object.ability?.claim ?? "unknown", controller: object.controller, zone: object.zone,
		...(object.tapped ? { tapped: true as const } : {}), ...(traits?.power !== undefined ? { body: `${traits.power}/${traits.toughness}` } : {}),
		...(Object.keys(object.counters).length ? { counters: { ...object.counters } } : {}), ...(object.damage ? { damage: object.damage } : {}),
		...(traits?.words.length ? { words: [...traits.words] } : {}) };
};

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
		say(view.window.kind === "opening" ? brief?.opening : view.window.kind === "turn" ? step?.[view.window.active === seat ? "own" : "opponent"] : undefined),
		...Object.entries(brief?.cards ?? {}).filter(([card]) => named.includes(card)).map(([card, note]) => `${card}: ${say(note)}`),
	].filter((line) => line.length > 0);

	const state = planState(frame);
	const plan = state && {
		objective: state.plan.objective, guidance: state.plan.guidance,
		...(state.due[0] ? { due: state.due[0].label } : {}),
		next: state.waiting.slice(0, 2).map((one) => one.label),
		branches: state.branches.map((one) => one.label),
		held: state.held.map((hold) => `${hold.objects.map((object) => object.card ?? object.id).join(", ")}: ${hold.purpose}`),
		stops: state.stops,
		done: (view.done ?? []).map((at) => state.plan.steps[at]?.label ?? `step ${at + 1}`),
	};
	return {
		actor: seat, window: structuredClone(view.window), version,
		obligation: decision.question,
		...(plan ? { plan } : {}),
		options: decision.options.map(({ id, label, shows }) => ({ id, label, ...(shows ? { shows } : {}) })),
		resources: [...view.yours],
		known: [...view.table, ...view.since],
		objects: (view.objects ?? []).filter((object) => object.zone === "battlefield" || object.zone === "stack").map(seen),
		...(view.resolution ? { resolution: structuredClone(view.resolution) } : {}),
		guidance,
		lately: [...(context.recaps ?? [])].slice(-3).map((recap) => `Turn ${recap.turn}: ${recap.line}`),
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
