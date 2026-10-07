/** Physical changes, their reasons, and the layer vocabulary. Prepared procedures
 * supply instructions as needed; the table never compiles a deck's card text.
 */

import type { ObjectRef, SeatId } from "./types.ts";
import type { Activation, Combat, Mana, Note, Resolution, Trigger } from "./table.ts";
import type { Bound, Chosen } from "./selectors.ts";
import type { Registration, Selector, TokenSpec } from "./language.ts";

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
	| "activate"
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
	| "combat"
	| "game-setup";

/**
 * The motions this milestone needs. design-ref/archive/SYNTAX.md section 2 lists all of
 * them. A motion arrives here when a milestone needs it, never in advance.
 */
export type Change =
	/** Control transitions are recorded too: a pass changes who can answer next. */
	| { do: "turn"; action: "pass" | "act"; who: SeatId; land?: boolean }
	| { do: "turn"; action: "complete" | "priority" | "end" }
	| { do: "opening"; action: "begin" | "round" }
	| { do: "opening"; action: "declare"; who: SeatId; choice: "keep" | "mulligan" }
	| { do: "opening"; action: "bottom"; who: SeatId }
	/**
	 * `registers`, `tapped`, `counters` and `controller` are how it enters the
	 * battlefield: part of the motion, never a step after it (614.1c-d).
	 */
	| { do: "move"; what: string; to: Zone; position?: "top" | "bottom"; reason: Reason; registers?: Registration[];
		tapped?: true; counters?: Record<string, number>; controller?: SeatId }
	/** A token made on the battlefield (111.1). */
	| { do: "token"; id: string; spec: TokenSpec; controller: SeatId; tapped?: true }
	/** Shown to every seat. Nothing moves. */
	| { do: "reveal"; what: string }
	| { do: "tap" | "untap"; what: string }
	| { do: "add-mana"; who: SeatId; colors: Mana["color"][]; spendOnly?: Selector }
	| { do: "spend-mana"; who: SeatId; ids: string[] }
	| { do: "damage"; source: string; target: ObjectRef | { player: SeatId }; amount: number; combat?: true }
	| { do: "activate"; what: string; id: string; ability: Activation }
	| { do: "resolution"; action: "begin"; what: string; source: ObjectRef; program: Resolution["program"]; illegal: string[]; lost?: boolean;
		bound?: Resolution["bound"]; optional?: true }
	/** The seat accepts target restrictions, or continues with the warned targets. No instruction is carried out. */
	| { do: "resolution"; action: "targets"; what: string; illegal: string[] }
	/**
	 * Finish the current instruction, or record one pick of a `choose` that has
	 * more to pick. `bind` keeps what it did for later instructions, and follows
	 * what it moved under names bound earlier (400.7); `expand`
	 * puts an `each` in its place; `follow` is the permanent a spell became.
	 */
	| { do: "resolution"; action: "next"; what: string; pick?: ObjectRef; bind?: Record<string, Bound>;
		expand?: Resolution["program"]; follow?: ObjectRef; abort?: boolean; accept?: true }
	/** A reflexive trigger made during resolution waits for the next priority (603.12). */
	| { do: "trigger"; action: "wait"; trigger: Trigger }
	/**
	 * A waiting trigger goes on the stack with its targets as `id`, or, with no
	 * legal targets, is removed (603.3d).
	 */
	| { do: "trigger"; action: "put"; trigger: string; id?: string; ability?: Activation; was?: Pick<Trigger, "source" | "basis" | "turn"> }
	| { do: "shuffle"; whose: SeatId }
	/** Counters of one kind put on or, negative, removed. */
	| { do: "counters"; what: string; kind: string; amount: number }
	/** Attach to an object, or unattach with no `to`. */
	| { do: "attach"; what: string; to?: ObjectRef }
	/** Write on the notepad: a label, a registration added after entry, a link. Its id and timestamp come from the clock. */
	| { do: "note"; note: DistributiveOmit<Note, "id" | "written"> }
	/** A token outside the battlefield ceases to exist (704.5d). */
	| { do: "cease"; what: string }
	/** The finished declaration of attackers, one group (508.1). With none, there are no blockers or damage (508.8). */
	| { do: "attack"; attackers: Combat["attackers"] }
	/** The finished declaration of blockers, one group (509.1). */
	| { do: "block"; blockers: Combat["blockers"] }
	/**
	 * Bookkeeping inside a combat step: one pick toward a declaration, one
	 * creature's damage division, or the first-strike step beginning, which adds
	 * a second damage step after it.
	 */
	| { do: "combat"; action: "choose" | "remove"; pick: Combat["choosing"][number] }
	| { do: "combat"; action: "assign"; source: ObjectRef; division: { to: Chosen; amount: number }[] }
	| { do: "combat"; action: "strike"; first: ObjectRef[] }
	/**
	 * A counter or flag that belongs to a seat rather than a card: poison,
	 * energy, experience, and "tried to draw from an empty library", 704.5b.
	 * One bucket with a key, because they behave the same.
	 */
	| { do: "mark-player"; who: SeatId; key: string; add: number }
	| { do: "change-life"; who: SeatId; amount: number; reason: Reason }
	| { do: "end-game"; who: SeatId; result: "win" | "lose" | "draw" };

/**
 * Where a continuous effect applies in the layer walk. 613 fixes the order and
 * it is not the order the effects were written in. A card says only which layer
 * it acts in; the engine walks them once.
 *
 * These are taken from 613.4 in rules/cr.tsv, not from design-ref/archive/SYNTAX.md,
 * which lists counters as their own sublayer after modifiers and switching as a
 * fifth. 613.4c puts counters in 7c alongside ordinary modifiers, and 613.4d
 * makes switching the fourth and last. design-ref/archive/WORKED-LOOPS.md section I.4
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

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
