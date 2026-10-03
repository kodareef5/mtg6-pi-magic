/**
 * The card language, and the compiler that fills it in.
 *
 * Everything a card does, it does as a Change. Tapping a land to pay a cost,
 * dealing three damage, drawing a card, putting a counter on a creature: one
 * kind of object, differing only in who authorised it and when. A cost is a
 * list of Changes the actor completes before acting, an effect is a list that
 * happens on resolution, and that single idea is why the vocabulary is about 66
 * shapes rather than hundreds. design-ref/SYNTAX.md.
 *
 * This is core. A seat played by a person, a remote agent or an MCP client
 * still needs the table to know what a card does.
 *
 * Past 150 lines because it is one vocabulary. Zones, reasons, motions, ability
 * shapes and layers are the terms a card is written in, and a reader checking
 * whether a motion carries its reason should not have to find which of five
 * files holds the answer.
 */

import type { SeatId } from "./types.ts";

/**
 * The seven zones, plus two places we track as their own.
 *
 * The rules put a dungeon card in the command zone, 309.2b, and say outside the
 * game is not a zone at all. We give both their own name anyway, because one
 * extra member keeps every other rule simple and the alternative is a flag on
 * the command zone that every reader has to remember. The judge can cite 408.3
 * if it ever matters.
 */
export type Zone =
	| "library"
	| "hand"
	| "battlefield"
	| "graveyard"
	| "stack"
	| "exile"
	| "command"
	/** Dungeons. Not a permanent, leaves only by leaving the game. 309.2c. */
	| "dungeon"
	/** A sideboard, a dungeon not yet ventured into, anything wished for. */
	| "outside";

/**
 * Cards watch the reason, not the motion. Destroying, discarding, milling and
 * sacrificing are one motion with four reasons, and leaving the reason off is
 * the usual way to make a trigger silently not fire.
 */
export type Reason =
	| "cast"
	| "play-land"
	| "resolve"
	| "draw"
	| "discard"
	| "destroy"
	| "sacrifice"
	| "mill"
	| "exile"
	| "bounce"
	| "counter"
	| "cleanup-discard"
	| "state-based-action"
	| "cost-payment"
	| "game-setup";

/**
 * The motions this milestone needs. design-ref/SYNTAX.md section 2 lists all of
 * them. A motion arrives here when a milestone needs it, never in advance.
 */
export type Change =
	/** Control transitions are recorded too: a pass changes who can answer next. */
	| { do: "turn"; action: "pass" | "act"; who: SeatId; land?: boolean }
	| { do: "turn"; action: "complete" | "priority" | "end" }
	| { do: "opening"; action: "begin" | "round" }
	| { do: "opening"; action: "declare"; who: SeatId; choice: "keep" | "mulligan" }
	| { do: "opening"; action: "bottom"; who: SeatId }
	| { do: "move"; what: string; to: Zone; position?: "top" | "bottom"; reason: Reason }
	| { do: "tap" | "untap"; what: string }
	| { do: "shuffle"; whose: SeatId }
	/**
	 * A counter or flag that belongs to a seat rather than a card: poison,
	 * energy, experience, and "tried to draw from an empty library", 704.5b.
	 * One bucket with a key, because they behave the same.
	 */
	| { do: "mark-player"; who: SeatId; key: string; add: number }
	| { do: "change-life"; who: SeatId; amount: number; reason: Reason }
	| { do: "end-game"; who: SeatId; result: "win" | "lose" | "draw" };

/**
 * The five ability shapes. A spell is an activated ability whose cost includes
 * its mana cost; keeping it separate is a convenience, not a distinction. A
 * mana ability is detected structurally rather than guessed: its effect adds
 * mana, it has no target, and it is not a loyalty ability. That detection is
 * one of the concrete things this layer buys, because it decides whether an
 * opponent can respond.
 */
export type Ability =
	| { kind: "spell"; cost: unknown; effect: Change[] }
	| { kind: "activated"; cost: unknown; effect: Change[]; timing?: unknown; limit?: unknown }
	| { kind: "triggered"; on: unknown; condition?: unknown; effect: Change[]; limit?: unknown }
	| { kind: "static"; affects: unknown; modification: unknown; condition?: unknown }
	| { kind: "replacement"; on: unknown; instead: Change[] };

/**
 * The `unknown` fields above are the rest of the language, and its size is
 * measured rather than guessed: 31 event kinds cover 99.19% of every trigger in
 * Standard, with 17 selector properties, 10 operators and 8 amount forms.
 * design-ref/EXPRESSION-COVERAGE.md. They arrive at milestone two, typed, not
 * as a loose bag.
 */

/**
 * Where a continuous effect applies in the layer walk. 613 fixes the order and
 * it is not the order the effects were written in. A card says only which layer
 * it acts in; the engine walks them once.
 *
 * These are taken from 613.4 in rules/cr.tsv, not from design-ref/SYNTAX.md,
 * which lists counters as their own sublayer after modifiers and switching as a
 * fifth. 613.4c puts counters in 7c alongside ordinary modifiers, and 613.4d
 * makes switching the fourth and last. design-ref/WORKED-LOOPS.md section I.4
 * says the same, so the enum in the syntax document is the odd one out.
 *
 * The difference is observable: a flying counter and an ability-removing effect
 * order by timestamp within a layer, and a +1/+1 counter has to land in the
 * same layer as a +1/+1 until end of turn or the arithmetic comes out wrong.
 */
export type Layer =
	| "1-copy"
	| "2-control"
	| "3-text"
	| "4-type"
	| "5-color"
	| "6-ability"
	/** Characteristic-defining abilities that set power or toughness. 613.4a. */
	| "7a-cdc"
	/** Effects that set power or toughness to a value, including base. 613.4b. */
	| "7b-set"
	/** Effects and counters that modify power or toughness. 613.4c. */
	| "7c-modify"
	/** Effects that switch power and toughness. 613.4d. */
	| "7d-switch";

export type Compiled = {
	card: string;
	abilities: Ability[];
	/** Spans that could not be structured. The game continues and records them. */
	gaps: string[];
};

/**
 * Fill the forms by interrogation, never by generation.
 *
 * A model is asked narrow closed questions whose answers are picks from a list.
 * It is never asked to emit the whole record. That is the difference between a
 * checkable answer and a plausible one, and it is the entire reason this layer
 * exists: a model that would have invented a second green mana cannot, because
 * no question has that in its answer space.
 */
export function compile(card: string, text: string): Compiled {
	/*
	 *  1. Split the text into clauses and inventory them. A clause classified as
	 *     flavour is still an interpretation and stays attributable.
	 *  2. Per clause, in order: which shape, which event kind, which event
	 *     modifiers, which cost components, which effect motions, each motion's
	 *     selector, each amount's form, timing and limits, any decision points,
	 *     and for a static ability which layer.
	 *  3. Check the filled form before anything can move: every enumeration
	 *     value exists, every binding resolves to one declared earlier in the
	 *     same effect, every target is reachable from the actor's view, a mana
	 *     ability has no target and no stack use, costs and effects do not
	 *     consume the same thing twice, and a static modification names a layer.
	 *  4. Cache by card name. Reuse accepted facts across incarnations, but
	 *     rebind anything dynamic, such as a chosen type, for the new object.
	 *  5. A clause that will not structure is recorded as a gap, not a crash.
	 *     The gap log is the backlog for the next version of the language.
	 */
	void [card, text];
	throw new Error("compile is unwritten. Five steps above, and it interrogates.");
}
