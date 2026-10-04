/**
 * The syntax a seat writes to use its cards. JSON data checked against these
 * schemas before anything moves; never model-written code. docs/SYNTAX.md
 * explains each shape and the rule it comes from.
 *
 * A card is not compiled into this. A seat writes the procedure it means to
 * announce now, and what a permanent registers when it enters. The table checks
 * the shape, conservation and visibility, not that the card says so.
 *
 * Past 150 lines because the shapes refer to each other: an effect holds
 * instructions, an instruction can hold an effect, a registration holds both.
 */
import { Type, type Static, type TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import { STEPS } from "./steps.ts";

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });
const natural = Type.Integer({ minimum: 0 });
const positive = Type.Integer({ minimum: 1 });
const one = <const T extends string[]>(...values: T) => Type.Enum(values);
const name = Type.String({ pattern: "^[a-z][a-z0-9-]*$" });

export const ZONES = ["library", "hand", "battlefield", "graveyard", "stack", "exile", "command", "outside"] as const;
export const CARD_TYPES = ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "land", "planeswalker", "sorcery"] as const;
/** Words the table acts on or marks. Any other lowercase word is recorded for players and the judge. */
export const ACTED = ["first strike", "double strike", "trample", "vigilance", "haste", "indestructible", "deathtouch"] as const;
export const MARKED = ["flying", "reach", "menace", "hexproof", "can't be blocked", "can't block", "can't be blocked by more than one creature"] as const;

const Zone = one(...ZONES);
const Color = one("W", "U", "B", "R", "G", "C");
/** "{2}{G}", "{X}{R}". Generic, colored and X symbols; the table parses them the way it parses a printed cost. */
const ManaCost = Type.String({ pattern: "^(\\{([0-9]+|[WUBRGCX])\\})+$" });
const Duration = one("end-of-turn", "end-of-combat", "while-source", "indefinite");
const Reason = one("resolve", "destroy", "sacrifice", "discard", "mill", "exile", "bounce", "counter");
const Step = Type.Enum(Object.keys(STEPS) as (keyof typeof STEPS)[]);

/**
 * What an instruction points at. `this` is the source; `target:N` the Nth
 * announced target; `bound:name` something an earlier instruction bound;
 * `event:*` the triggering event's object, objects, player or source; `attached`
 * what the source is attached to. Refs inside a delayed or reflexive effect
 * other than `event:*` are fixed when that trigger is created.
 */
export const ObjectRef = Type.Union([
	Type.String({ pattern: "^(this|attached|event:object|event:objects|event:source|target:[0-9]+|bound:[a-z][a-z0-9-]*)$" }),
	object({ top: positive, of: Type.String({ pattern: "^(you|opponent|bound:[a-z][a-z0-9-]*|event:player)$" }) }),
]);
export const PlayerRef = Type.String({ pattern: "^(you|opponent|each-player|event:player|target:[0-9]+|bound:[a-z][a-z0-9-]*|controller:(this|attached|target:[0-9]+|event:object|event:source)|owner:(this|attached|target:[0-9]+|event:object))$" });
const Side = Type.Union([PlayerRef, Type.Literal("any")]);
const Range = object({ atLeast: Type.Optional(Type.Integer()), atMost: Type.Optional(Type.Integer()) });

/** Objects that exist and match. Each field narrows; a list field matches any of its members. */
const SelectorFields = {
	/** A printed name, as cards say "named" and plans name what they mean. */
	name: Type.Optional(text),
	/** Default battlefield. */
	zones: Type.Optional(Type.Array(Zone, { minItems: 1 })),
	/** Who controls it on the battlefield or stack, and whose it is anywhere else. */
	controller: Type.Optional(Side),
	owner: Type.Optional(Side),
	types: Type.Optional(Type.Array(one(...CARD_TYPES), { minItems: 1 })),
	subtypes: Type.Optional(Type.Array(text, { minItems: 1 })),
	supertypes: Type.Optional(Type.Array(one("basic", "legendary", "snow"), { minItems: 1 })),
	/** Each word must be present. */
	words: Type.Optional(Type.Array(text, { minItems: 1 })),
	power: Type.Optional(Range),
	toughness: Type.Optional(Range),
	tapped: Type.Optional(Type.Boolean()),
	token: Type.Optional(Type.Boolean()),
	attacking: Type.Optional(Type.Boolean()),
	blocking: Type.Optional(Type.Boolean()),
	/** "Another": excludes the source. */
	other: Type.Optional(Type.Literal(true)),
	/** Exactly that object. */
	is: Type.Optional(ObjectRef),
	attachedTo: Type.Optional(ObjectRef),
	/** Cards the source exiled with `link` ("exiled with this"). */
	linked: Type.Optional(Type.Literal(true)),
};

const Defs = {
	Selector: object({ ...SelectorFields,
		not: Type.Optional(object({ types: SelectorFields.types, subtypes: SelectorFields.subtypes, supertypes: SelectorFields.supertypes, words: SelectorFields.words })),
		/** A stack object whose announced targets include one of these. */
		targeting: Type.Optional(Type.Ref("Selector")) }),

	/** A number, worked out when it is read. Never stored. */
	Amount: Type.Union([
		Type.Integer(),
		object({ count: Type.Ref("Selector") }),
		object({ counters: text, on: ObjectRef }),
		/** Captured when the instruction is applied (608.2h, 701.10b). */
		object({ power: ObjectRef }),
		object({ toughness: ObjectRef }),
		object({ bound: name }),
		object({ distinct: Type.Literal("card-types"), among: Type.Ref("Selector") }),
		object({ life: PlayerRef }),
		/** This turn so far, read from what was recorded. */
		object({ history: one("cast", "attacked", "life-lost", "life-gained"), of: Type.Optional(Type.Ref("Selector")), by: Type.Optional(Side) }),
		/** The X announced for this spell or ability; a permanent remembers the X it was cast with (107.3m). */
		object({ x: Type.Literal(true) }),
		object({ sum: Type.Array(Type.Ref("Amount"), { minItems: 2 }) }),
		object({ negate: Type.Ref("Amount") }),
	]),

	Condition: Type.Union([
		object({ amount: Type.Ref("Amount"), atLeast: Type.Optional(Type.Integer()), atMost: Type.Optional(Type.Integer()) }),
		/** The binding holds at least one object, or the optional instruction that made it was done. */
		object({ bound: name }),
		object({ is: ObjectRef, matches: Type.Ref("Selector") }),
		object({ all: Type.Array(Type.Ref("Condition"), { minItems: 1 }) }),
		object({ any: Type.Array(Type.Ref("Condition"), { minItems: 1 }) }),
		object({ not: Type.Ref("Condition") }),
	]),

	/** One target slot. An object, a player, or either ("any target" names both). */
	Target: object({
		object: Type.Optional(Type.Ref("Selector")),
		player: Type.Optional(Side),
		/** Default 1. */
		count: Type.Optional(positive),
		/** "Up to": zero is legal (115.6). */
		upTo: Type.Optional(Type.Literal(true)),
	}),

	Cost: object({
		/** Omitted on a spell: its printed mana cost. */
		mana: Type.Optional(ManaCost),
		/** `true` taps the source. A choice taps other objects, such as crew's creatures with total power N or more. */
		tap: Type.Optional(Type.Union([Type.Literal(true), object({ choose: Type.Ref("Selector"), count: Type.Optional(positive), totalPower: Type.Optional(positive) })])),
		sacrifice: Type.Optional(Type.Union([ObjectRef, object({ choose: Type.Ref("Selector"), count: positive })])),
		exile: Type.Optional(ObjectRef),
		life: Type.Optional(positive),
		/** A number of cards from hand, or this card ("Discard this card"). */
		discard: Type.Optional(Type.Union([positive, ObjectRef])),
		counters: Type.Optional(object({ kind: text, count: positive })),
		/** Generic mana this cost is reduced by, worked out as it is locked (601.2f). */
		reduce: Type.Optional(Type.Ref("Amount")),
	}),

	/** Characteristics an effect changes, applied in the layer walk (613). */
	Modification: object({
		types: Type.Optional(object({ set: Type.Optional(Type.Array(one(...CARD_TYPES))), add: Type.Optional(Type.Array(one(...CARD_TYPES))) })),
		/** `of` names whose subtypes are set; setting a land's subtypes removes its other land abilities (305.7). */
		subtypes: Type.Optional(object({ set: Type.Optional(Type.Array(text)), add: Type.Optional(Type.Array(text)), of: Type.Optional(one("creature", "land", "artifact", "enchantment")), allCreatureTypes: Type.Optional(Type.Literal(true)) })),
		base: Type.Optional(object({ power: Type.Ref("Amount"), toughness: Type.Ref("Amount") })),
		power: Type.Optional(Type.Ref("Amount")),
		toughness: Type.Optional(Type.Ref("Amount")),
		words: Type.Optional(Type.Array(Type.String({ pattern: "^[^A-Z]+$", minLength: 1 }))),
		registers: Type.Optional(Type.Array(Type.Ref("Registration"))),
		loseAbilities: Type.Optional(Type.Literal(true)),
	}),

	/** Something that happened, as the table recorded it. */
	Event: object({
		on: one("enters", "leaves", "dies", "attacks", "attacked-with", "blocks", "cast", "targeted", "combat-damage", "step"),
		of: Type.Optional(Type.Ref("Selector")),
		/** Who cast, attacked, or controls the targeting spell or ability. */
		by: Type.Optional(Side),
		from: Type.Optional(Type.Array(Zone)),
		to: Type.Optional(Type.Array(Zone)),
		step: Type.Optional(Step),
		whose: Type.Optional(Side),
		/** Combat damage to a player, rather than to anything. */
		player: Type.Optional(Type.Literal(true)),
		/** "One or more": one trigger for the whole group. */
		batch: Type.Optional(Type.Literal(true)),
	}),

	Effect: object({ targets: Type.Optional(Type.Array(Type.Ref("Target"))), instructions: Type.Array(Type.Ref("Instruction")) }),

	TokenSpec: object({
		name: text, types: Type.Array(one(...CARD_TYPES), { minItems: 1 }), subtypes: Type.Optional(Type.Array(text)),
		supertypes: Type.Optional(Type.Array(one("legendary", "snow"))), colors: Type.Array(Color),
		power: Type.Optional(Type.Integer()), toughness: Type.Optional(Type.Integer()),
		words: Type.Optional(Type.Array(text)), registers: Type.Optional(Type.Array(Type.Ref("Registration"))),
	}),

	/** One step of resolution. `if` gates it, `as` binds its result, `may` makes it optional for its actor. */
	Instruction: Type.Union([
		step({ do: Type.Literal("damage"), to: Type.Optional(Type.Union([ObjectRef, PlayerRef])), every: Type.Optional(Type.Ref("Selector")), amount: Type.Ref("Amount"), from: Type.Optional(ObjectRef) }),
		step({ do: Type.Literal("fight"), a: ObjectRef, b: ObjectRef }),
		step({ do: Type.Literal("move"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), to: Zone,
			position: Type.Optional(one("top", "bottom")), tapped: Type.Optional(Type.Literal(true)),
			counters: Type.Optional(Type.Record(Type.String(), Type.Ref("Amount"))), controller: Type.Optional(PlayerRef),
			reason: Reason, link: Type.Optional(Type.Literal(true)) }),
		step({ do: Type.Literal("destroy"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("choose"), who: PlayerRef, from: Type.Ref("Selector"), count: Type.Ref("Amount"), upTo: Type.Optional(Type.Literal(true)), reveal: Type.Optional(Type.Literal(true)) }),
		step({ do: Type.Literal("shuffle"), who: PlayerRef }),
		step({ do: Type.Literal("draw"), who: PlayerRef, count: Type.Ref("Amount") }),
		step({ do: Type.Literal("mill"), who: PlayerRef, count: Type.Ref("Amount") }),
		step({ do: Type.Literal("counters"), on: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), kind: text, amount: Type.Ref("Amount") }),
		step({ do: Type.Literal("life"), who: PlayerRef, amount: Type.Ref("Amount") }),
		step({ do: Type.Literal("mana"), who: PlayerRef, colors: Type.Optional(Type.Array(Color, { minItems: 1 })), any: Type.Optional(positive), times: Type.Optional(Type.Ref("Amount")), spendOnly: Type.Optional(Type.Ref("Selector")) }),
		step({ do: one("tap", "untap"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("token"), count: Type.Ref("Amount"), spec: Type.Ref("TokenSpec"), tapped: Type.Optional(Type.Literal(true)) }),
		/** Writes a public label on each affected object; `label` is its text, the claim when omitted. */
		step({ do: Type.Literal("modify"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), until: Duration, change: Type.Ref("Modification"), label: Type.Optional(text) }),
		/** "You may play that card": `from` "next-turn" for warp's "after the current turn has ended". */
		step({ do: Type.Literal("permit"), what: ObjectRef, who: PlayerRef, from: Type.Optional(one("now", "next-turn")), until: Duration }),
		step({ do: Type.Literal("register"), on: ObjectRef, registration: Type.Ref("Registration") }),
		/** A delayed trigger (603.7). It fires once unless `until` gives it a span. */
		step({ do: Type.Literal("delay"), event: Type.Ref("Event"), effect: Type.Ref("Effect"), until: Type.Optional(Duration) }),
		/** "When you do" (603.12). `check` is its intervening if. */
		step({ do: Type.Literal("reflect"), check: Type.Optional(Type.Ref("Condition")), effect: Type.Ref("Effect") }),
		step({ do: Type.Literal("attach"), what: ObjectRef, to: ObjectRef }),
		step({ do: Type.Literal("counter"), what: ObjectRef, unless: Type.Optional(object({ who: PlayerRef, pays: Type.Ref("Cost") })) }),
		step({ do: Type.Literal("each"), players: one("each-player", "opponent"), instructions: Type.Array(Type.Ref("Instruction"), { minItems: 1 }) }),
	]),

	/** A public note on an object, quoting the text it carries out in `basis`. It lives while that object exists, unless `until` ends it sooner. */
	Registration: Type.Union([
		/** A triggered ability. `if` is its intervening if (603.4). */
		object({ basis: text, kind: Type.Literal("watch"), event: Type.Ref("Event"), if: Type.Optional(Type.Ref("Condition")), effect: Type.Ref("Effect"),
			may: Type.Optional(Type.Literal(true)), limit: Type.Optional(Type.Literal("once-per-turn")) }),
		/** A static ability. Applies while `if` holds, to whatever matches `affects` at each reading. */
		object({ basis: text, kind: Type.Literal("continuous"), affects: Type.Ref("Selector"), change: Type.Ref("Modification"), if: Type.Optional(Type.Ref("Condition")) }),
		/** How a permanent enters (614.1c, 614.1d). `affects` omitted means the registering object itself. */
		object({ basis: text, kind: Type.Literal("enters"), affects: Type.Optional(Type.Ref("Selector")), tapped: Type.Optional(Type.Literal(true)),
			counters: Type.Optional(Type.Record(Type.String(), Type.Ref("Amount"))), if: Type.Optional(Type.Ref("Condition")) }),
		/** "If it would die, exile it instead." */
		object({ basis: text, kind: Type.Literal("replace"), on: Type.Literal("dies"), to: Zone, until: Type.Optional(Duration) }),
		/** A mana ability, used while paying (605, 601.2g): `colors` once each, or `any` mana of one chosen color; `times` repeats it ("{G} for each Elf"). */
		object({ basis: text, kind: Type.Literal("mana"), cost: Type.Ref("Cost"), colors: Type.Optional(Type.Array(Color, { minItems: 1 })), any: Type.Optional(positive),
			times: Type.Optional(Type.Ref("Amount")), spendOnly: Type.Optional(Type.Ref("Selector")) }),
		/** A choice the baseline rules would not offer: extra land plays, lands from a zone, flash. */
		object({ basis: text, kind: Type.Literal("permit"), lands: Type.Optional(positive), landsFrom: Type.Optional(Type.Array(Zone, { minItems: 1 })), flash: Type.Optional(Type.Ref("Selector")) }),
		object({ basis: text, kind: Type.Literal("suppress"), event: Type.Ref("Event") }),
	]),
};

function step<T extends Parameters<typeof Type.Object>[0]>(fields: T) {
	return object({ ...fields, if: Type.Optional(Type.Ref("Condition")), as: Type.Optional(name), may: Type.Optional(Type.Literal(true)) });
}

const of = <K extends keyof typeof Defs>(ref: K) => Type.Cyclic(Defs, ref);
export const SelectorSchema = of("Selector");
export const AmountSchema = of("Amount");
export const ConditionSchema = of("Condition");
export const TargetSchema = of("Target");
export const CostSchema = of("Cost");
export const EventSchema = of("Event");
export const EffectSchema = of("Effect");
export const InstructionSchema = of("Instruction");
export const RegistrationSchema = of("Registration");

export const RefSchema = object({ id: text, incarnation: natural });
const seatSide = one("self", "opponent", "any");
/** Projected objects a seat can name: a procedure's source, a plan's option filter. */
export const QuerySchema = object({
	zones: Type.Optional(Type.Array(one("hand", "battlefield", "stack", "graveyard", "exile", "command", "dungeon"))),
	controller: Type.Optional(seatSide), card: Type.Optional(text), tapped: Type.Optional(Type.Boolean()),
	refs: Type.Optional(Type.Array(RefSchema)),
});
/** A window: whose turn, which step or phase, and inclusive table turn bounds. */
export const WhenSchema = object({
	active: Type.Optional(seatSide), step: Type.Optional(Step),
	phase: Type.Optional(Type.String({ enum: [...new Set(Object.values(STEPS).map((step) => step.phase))] })),
	fromTurn: Type.Optional(positive), throughTurn: Type.Optional(positive),
});

/**
 * An action a seat announces. Modes, kicker and warp are separate procedures
 * with their own claims; "choose one" is which procedure the seat announces.
 * Instructions on a permanent spell run after it enters, with `this` the permanent.
 */
export const ProcedureSchema = Type.Cyclic({ ...Defs, Procedure: object({
	source: QuerySchema, claim: text,
	/** The card text this procedure carries out, quoted. */
	basis: text,
	timing: one("spell", "land", "stack", "mana"),
	/** An activation's "only as a sorcery", or `instant` on a spell to claim flash. Otherwise a spell's timing comes from its type line. */
	speed: Type.Optional(one("instant", "sorcery")),
	cost: Type.Optional(Type.Ref("Cost")),
	/** The seat's own statement that narrows when it is offered. */
	if: Type.Optional(Type.Ref("Condition")),
	limit: Type.Optional(Type.Literal("once-per-turn")),
	targets: Type.Optional(Type.Array(Type.Ref("Target"))),
	instructions: Type.Array(Type.Ref("Instruction")),
	words: Type.Optional(Type.Array(text)),
}) }, "Procedure");

/**
 * A public label a player puts on its own object: "power doubled until end of
 * turn", "warped: exile at the next end step". With a `change` the layer walk
 * applies it; without one it is information for the players and the judge.
 * `modify` writes one of these too. Each ends by its lifetime.
 */
export const LabelSchema = Type.Cyclic({ ...Defs, Label: object({ text, until: Duration, change: Type.Optional(Type.Ref("Modification")) }) }, "Label");
export type Label = Static<typeof LabelSchema>;

/** What a seat's permanent registers when it enters, by card name. Private until it is used. */
export const PackageSchema = Type.Cyclic({ ...Defs, Package: object({ card: text, registers: Type.Array(Type.Ref("Registration")) }) }, "Package");

/**
 * A seat's plan for a stretch of play: the options jev takes, in order, in their
 * windows. `steps` is the line. `may` holds standing alternatives jev may take
 * without asking when their window and `if` hold. `askWhen` names visible facts
 * that mean the plan no longer fits, so jev asks instead of improvising.
 */
const Defs2 = { ...Defs,
	Option: object({
		label: text, when: WhenSchema, if: Type.Optional(Type.Ref("Condition")),
		/** A listed table option by id or prefix and objects, or a procedure to announce. */
		action: Type.Union([
			object({ option: Type.Optional(text), prefix: Type.Optional(text), objects: Type.Optional(QuerySchema) }),
			object({ procedure: Type.Ref("Procedure") }),
		]),
	}),
	Procedure: ProcedureSchema.$defs.Procedure,
	Package: PackageSchema.$defs.Package,
	Plan: object({
		objective: text, guidance: text,
		steps: Type.Array(Type.Ref("Option")),
		may: Type.Array(Type.Ref("Option")),
		askWhen: Type.Array(object({ label: text, if: Type.Ref("Condition") })),
		packages: Type.Array(Type.Ref("Package")),
	}),
};
export const PlanSchema = Type.Cyclic(Defs2, "Plan");
export type Plan = Static<typeof PlanSchema>;

export type Selector = Static<typeof SelectorSchema>;
export type Amount = Static<typeof AmountSchema>;
export type Condition = Static<typeof ConditionSchema>;
export type Target = Static<typeof TargetSchema>;
export type Cost = Static<typeof CostSchema>;
export type GameEvent = Static<typeof EventSchema>;
export type Effect = Static<typeof EffectSchema>;
export type Instruction = Static<typeof InstructionSchema>;
export type Registration = Static<typeof RegistrationSchema>;
export type Procedure = Static<typeof ProcedureSchema>;
export type Package = Static<typeof PackageSchema>;

/**
 * Check a value and say where it is wrong. A union reports every branch it
 * tried; the deepest error is the one that names the field to repair.
 */
export function check<T extends TSchema>(schema: T, value: unknown, what: string): Static<T> {
	if (Check(schema, value)) return value as Static<T>;
	const deepest = [...Errors(schema, value)].sort((a, b) => b.instancePath.length - a.instancePath.length)[0];
	throw new Error(`${what}: ${deepest ? `${deepest.instancePath || "/"} ${deepest.message}` : "does not match the syntax"}.`);
}
