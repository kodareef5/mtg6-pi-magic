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
const Face = Type.Union([Type.Literal(0), Type.Literal(1)]);
const natural = Type.Integer({ minimum: 0 });
const positive = Type.Integer({ minimum: 1 });
const one = <const T extends string[]>(...values: T) => Type.Enum(values);
const name = Type.String({ pattern: "^[a-z][a-z0-9-]*$" });

export const ZONES = ["library", "hand", "battlefield", "graveyard", "stack", "exile", "command", "outside"] as const;
export const CARD_TYPES = ["artifact", "battle", "creature", "enchantment", "instant", "kindred", "land", "planeswalker", "sorcery"] as const;

const Zone = one(...ZONES);
const Color = one("W", "U", "B", "R", "G", "C");
/** "{2}{G}", "{X}{R}". Generic, colored and X symbols; the table parses them the way it parses a printed cost. */
const ManaCost = Type.String({ pattern: "^(\\{([0-9]+|[WUBRGCX])\\})+$" });
const Duration = one("end-of-turn", "end-of-combat", "while-source", "indefinite");
const DamageMode = Type.Union([Type.Literal("prevent"), Type.Literal("unpreventable")]);
const ManaDuration = one("end-of-combat", "end-of-turn");
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
	Type.String({ pattern: "^(this|attached|event:object|event:objects|event:source|event:recipient|target:[0-9]+|bound:[a-z][a-z0-9-]*)$" }),
	object({ top: Type.Ref("Amount"), of: Type.String({ pattern: "^(you|self|opponent|each-player|bound:[a-z][a-z0-9-]*|event:player)$" }) }),
	/** One window per named library, combined before motion for simultaneous effects. */
	object({ exceptBottom: Type.Ref("Amount"), of: Type.String({ pattern: "^(you|self|opponent|each-player|bound:[a-z][a-z0-9-]*|event:player)$" }) }),
]);
export const PlayerRef = Type.String({ pattern: "^(you|self|opponent|each-player|event:player|target:[0-9]+|bound:[a-z][a-z0-9-]*|controller:(this|attached|target:[0-9]+|event:object|event:source|bound:[a-z][a-z0-9-]*)|owner:(this|attached|target:[0-9]+|event:object|bound:[a-z][a-z0-9-]*))$" });
const Side = Type.Union([PlayerRef, Type.Literal("any")]);
const Range = object({ atLeast: Type.Optional(Type.Ref("Amount")), atMost: Type.Optional(Type.Ref("Amount")) });

/** Objects that exist and match. Each field narrows; a list field matches any of its members. */
const SelectorFields = {
	/** A printed name, as cards say "named" and plans name what they mean. */
	name: Type.Optional(Type.Union([text, object({ chosen: text })])),
	/** Shares a name with an object already named or bound by this effect. */
	nameOf: Type.Optional(ObjectRef),
	/** Default battlefield. */
	zones: Type.Optional(Type.Array(Zone, { minItems: 1 })),
	/** Who controls it on the battlefield or stack, and whose it is anywhere else. */
	controller: Type.Optional(Side),
	owner: Type.Optional(Side),
	types: Type.Optional(Type.Array(one(...CARD_TYPES), { minItems: 1 })),
	subtypes: Type.Optional(Type.Union([Type.Array(text, { minItems: 1 }), object({ chosen: text })])),
	supertypes: Type.Optional(Type.Array(one("basic", "legendary", "snow"), { minItems: 1 })),
	/** Any listed color; an empty list means colorless. C is a mana type, not a color. */
	colors: Type.Optional(Type.Array(one("W", "U", "B", "R", "G"), { uniqueItems: true })),
	/** Each word must be present. */
	words: Type.Optional(Type.Array(text, { minItems: 1 })),
	power: Type.Optional(Range),
	toughness: Type.Optional(Range),
	manaValue: Type.Optional(Range),
	/** Has the alternative Adventure characteristics, even when they are inactive (715.2a). */
	hasAdventure: Type.Optional(Type.Boolean()),
	tapped: Type.Optional(Type.Boolean()),
	token: Type.Optional(Type.Boolean()),
	attacking: Type.Optional(Type.Boolean()),
	blocking: Type.Optional(Type.Boolean()),
	/** Only attackers after blockers are declared: false means an unblocked attacker. */
	blocked: Type.Optional(Type.Boolean()),
	/** "Another": excludes the source. */
	other: Type.Optional(Type.Literal(true)),
	/** Exactly that object. */
	is: Type.Optional(ObjectRef),
	attachedTo: Type.Optional(ObjectRef),
	/** Cards the source exiled with `link` ("exiled with this"). */
	linked: Type.Optional(Type.Literal(true)),
};

/** The shared definitions every schema built on this syntax refers to, once. */
export const Defs = {
	Selector: object({ ...SelectorFields,
		/** Branches inherit the outer zone, or default to battlefield when it is omitted. Other fields still narrow. */
		any: Type.Optional(Type.Array(Type.Ref("Selector"), { minItems: 1 })),
		all: Type.Optional(Type.Array(Type.Ref("Selector"), { minItems: 1 })),
		not: Type.Optional(object({ types: SelectorFields.types, subtypes: SelectorFields.subtypes, supertypes: SelectorFields.supertypes, words: SelectorFields.words, colors: SelectorFields.colors, is: SelectorFields.is })),
		/** A stack object whose announced targets include one of these. */
		targeting: Type.Optional(Type.Ref("Selector")) }),

	/** A number, worked out when it is read. Never stored. */
	Amount: Type.Union([
		Type.Integer(),
		object({ count: Type.Ref("Selector") }),
		object({ aggregate: one("max", "min", "sum"), of: Type.Ref("Selector"), value: one("manaValue", "power", "toughness") }),
		object({ counters: text, on: ObjectRef }),
		/** Captured when the instruction is applied (608.2h, 701.10b). */
		object({ power: ObjectRef }),
		object({ toughness: ObjectRef }),
		object({ manaValue: ObjectRef }),
		/** The actual payment for this spell, or the spell this permanent resolved from. Uncast objects yield zero. */
		object({ manaSpent: ObjectRef, color: Type.Optional(Color) }),
		object({ colorsSpent: ObjectRef }),
		object({ bound: name }),
		object({ distinct: Type.Literal("card-types"), among: Type.Ref("Selector") }),
		object({ life: PlayerRef }),
		object({ startingLife: PlayerRef }),
		object({ event: Type.Literal("amount") }),
		/** This source-backed ability's current resolution number within the turn, starting at one. */
		object({ resolution: Type.Literal(true) }),
		object({ half: Type.Ref("Amount"), round: one("up", "down") }),
		/** This turn so far, read from what was recorded. */
		object({ history: one("cast", "attacked", "life-lost", "life-gained"), of: Type.Optional(Type.Ref("Selector")), by: Type.Optional(Side) }),
		/** The X announced for this spell or ability; a permanent remembers the X it was cast with (107.3m). */
		object({ x: Type.Literal(true) }),
		object({ sum: Type.Array(Type.Ref("Amount"), { minItems: 2 }) }),
		object({ negate: Type.Ref("Amount") }),
		/** How many turns that side has begun so far in the game, the current one included: "your first, second, or third turn". */
		object({ turns: one("self", "opponent") }),
	]),

	Condition: Type.Union([
		object({ amount: Type.Ref("Amount"), ...Range.properties }),
		/** The binding holds at least one object, or the optional instruction that made it was done. */
		object({ bound: name }),
		/** An information check may read a departed incarnation; motion still requires a live object. */
		object({ is: ObjectRef, matches: Type.Ref("Selector"), lastKnown: Type.Optional(Type.Literal(true)) }),
		object({ all: Type.Array(Type.Ref("Condition"), { minItems: 1 }) }),
		object({ any: Type.Array(Type.Ref("Condition"), { minItems: 1 }) }),
		object({ not: Type.Ref("Condition") }),
		object({ cast: ObjectRef, from: Type.Optional(Zone), by: Type.Optional(PlayerRef), paid: Type.Optional(name) }),
		/** The current battlefield incarnation entered during the current turn. */
		object({ enteredThisTurn: ObjectRef }),
		/** Whose turn it is: "if it's not your turn". */
		object({ turn: one("self", "opponent") }),
		object({ step: Step }),
	]),

	/** One target slot. An object, a player, or either ("any target" names both). */
	Target: object({
		object: Type.Optional(Type.Ref("Selector")),
		player: Type.Optional(Side),
		/** Default 1. */
		count: Type.Optional(positive),
		/** A positive minimum below count, such as one or two targets. Omit with upTo. */
		atLeast: Type.Optional(positive),
		/** "Up to": zero is legal (115.6). */
		upTo: Type.Optional(Type.Literal(true)),
	}),

	Cost: object({
		/** A signed loyalty-symbol cost, with the shared timing and once-per-permanent rule (606). */
		loyalty: Type.Optional(Type.Integer()),
		/** Omitted on a spell: its printed mana cost. */
		mana: Type.Optional(ManaCost),
		/** Named additional mana costs chosen for a spell, added after its base or alternative price. */
		additional: Type.Optional(Type.Array(object({ name, mana: ManaCost }), { minItems: 1 })),
		/** `true` taps the source. A choice taps other objects, such as crew's creatures with total power N or more. */
		tap: Type.Optional(Type.Union([Type.Literal(true), object({ choose: Type.Ref("Selector"), count: Type.Optional(positive), totalPower: Type.Optional(positive),
			upTo: Type.Optional(Type.Literal(true)), reduce: Type.Optional(Type.Literal("power")) })])),
		sacrifice: Type.Optional(Type.Union([ObjectRef, object({ choose: Type.Ref("Selector"), count: positive })])),
		/** Return controlled permanents to their owners' hands as payment. */
		return: Type.Optional(Type.Union([ObjectRef, object({ choose: Type.Ref("Selector"), count: positive })])),
		exile: Type.Optional(Type.Union([ObjectRef, object({ choose: Type.Ref("Selector"), count: positive, source: Type.Optional(Type.Literal(true)) }),
			/** Select any number of own graveyard cards meeting this total; do not enumerate their subsets. */
			object({ graveyard: Type.Ref("Selector"), totalManaValue: positive })])),
		life: Type.Optional(positive),
		/** A number of cards from hand, or this card ("Discard this card"). */
		discard: Type.Optional(Type.Union([positive, ObjectRef])),
		counters: Type.Optional(object({ kind: text, count: positive,
			/** Omitted removes counters; true puts them as payment, such as blight. */
			put: Type.Optional(Type.Literal(true)),
			/** Default source; otherwise pay on each distinct selected permanent. */
			on: Type.Optional(object({ choose: Type.Ref("Selector"), count: positive })) })),
		/** Choose public permanents or reveal hand cards as payment, such as behold. */
		show: Type.Optional(object({ choose: Type.Ref("Selector"), count: positive })),
		/** Generic mana this cost is reduced by, worked out as it is locked (601.2f). */
		reduce: Type.Optional(Type.Ref("Amount")),
	}),

	/** Characteristics an effect changes, applied in the layer walk (613). */
	Modification: object({
		types: Type.Optional(object({ set: Type.Optional(Type.Array(one(...CARD_TYPES))), add: Type.Optional(Type.Array(one(...CARD_TYPES))) })),
		colors: Type.Optional(object({ set: Type.Optional(Type.Array(one("W", "U", "B", "R", "G"), { uniqueItems: true })), add: Type.Optional(Type.Array(one("W", "U", "B", "R", "G"), { uniqueItems: true })) })),
		/** `of` names whose subtypes are set; setting a land's subtypes removes its other land abilities (305.7). */
		subtypes: Type.Optional(object({ set: Type.Optional(Type.Union([Type.Array(text), object({ chosen: text })])), add: Type.Optional(Type.Array(text)), of: Type.Optional(one("creature", "land", "artifact", "enchantment")), allCreatureTypes: Type.Optional(Type.Literal(true)) })),
		base: Type.Optional(object({ power: Type.Ref("Amount"), toughness: Type.Ref("Amount") })),
		power: Type.Optional(Type.Ref("Amount")),
		toughness: Type.Optional(Type.Ref("Amount")),
		words: Type.Optional(Type.Array(Type.String({ pattern: "^[^A-Z]+$", minLength: 1 }))),
		registers: Type.Optional(Type.Array(Type.Ref("Registration"))),
		loseAbilities: Type.Optional(Type.Literal(true)),
	}),

	/** Something that happened, as the table recorded it. */
	Event: Type.Object({
		on: one("enters", "leaves", "dies", "attacks", "attacked-with", "blocks", "cast", "targeted", "combat-damage", "damage", "step", "transforms", "unlocks", "counters", "keyword"),
		keyword: Type.Optional(one("scry", "surveil")),
		/** Positive counters put on a permanent, including entry; optionally cross a count from below. */
		counter: Type.Optional(text), reaches: Type.Optional(positive),
		/** Ordinal among all spells cast by that caster this turn, not only those matching of. */
		ordinal: Type.Optional(positive),
		face: Type.Optional(Face), fully: Type.Optional(Type.Literal(true)),
		of: Type.Optional(Type.Ref("Selector")),
		/** Who cast, attacked, or controls the targeting spell or ability. */
		by: Type.Optional(Side),
		from: Type.Optional(Type.Array(Zone)),
		to: Type.Optional(Type.Array(Zone)),
		step: Type.Optional(Step),
		whose: Type.Optional(Side),
		/** Damage to any player, or to the named side. */
		player: Type.Optional(Type.Union([Type.Literal(true), Side])),
		/** With damage, of names the recipient instead of the source. Each recipient is one occurrence. */
		received: Type.Optional(Type.Literal(true)),
		/** Omitted watches both combat and noncombat damage. */
		combat: Type.Optional(Type.Boolean()),
		/** "One or more": one trigger for the whole group. */
		batch: Type.Optional(Type.Literal(true)),
	}, { additionalProperties: false, if: { required: ["ordinal"] }, then: { properties: { on: { const: "cast" } } } }),

	Effect: object({ targets: Type.Optional(Type.Array(Type.Ref("Target"))), instructions: Type.Array(Type.Ref("Instruction")) }),
	/** A standing modal trigger chooses exactly one complete effect as it is put on the stack. */
	TriggerEffect: Type.Union([Type.Ref("Effect"), object({ modes: Type.Array(Type.Ref("Effect"), { minItems: 2 }) })]),

	TokenSpec: object({
		name: text, types: Type.Array(one(...CARD_TYPES), { minItems: 1 }), subtypes: Type.Optional(Type.Array(text)),
		/** A copied token keeps the original's mana cost; ordinary created tokens omit it. */
		mana: Type.Optional(ManaCost),
		supertypes: Type.Optional(Type.Array(one("legendary", "snow"))), colors: Type.Array(one("W", "U", "B", "R", "G"), { uniqueItems: true }),
		power: Type.Optional(Type.Integer()), toughness: Type.Optional(Type.Integer()),
		loyalty: Type.Optional(natural),
		words: Type.Optional(Type.Array(text)), registers: Type.Optional(Type.Array(Type.Ref("Registration"))),
	}),

	/** One step of resolution. `if` gates it, `as` binds its result, `may` makes it optional for its actor. */
	Instruction: Type.Union([
		/** Shared library keyword choices; completion is recorded after all their movement. */
		step({ do: Type.Literal("keyword"), name: one("scry", "surveil"), who: PlayerRef, count: Type.Ref("Amount") }),
		step({ do: Type.Literal("damage"), to: Type.Optional(Type.Union([ObjectRef, PlayerRef])), every: Type.Optional(Type.Ref("Selector")), amount: Type.Ref("Amount"), from: Type.Optional(ObjectRef) }),
		/** A global prevention rule. Bounded shields and prevention with additional effects are not represented. */
		step({ do: Type.Literal("damage-rule"), mode: DamageMode, combat: Type.Optional(Type.Boolean()), until: Duration }),
		step({ do: Type.Literal("fight"), a: ObjectRef, b: ObjectRef }),
		step({ do: Type.Literal("move"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), to: Zone,
			position: Type.Optional(one("top", "bottom")), tapped: Type.Optional(Type.Literal(true)), face: Type.Optional(Face), faceDown: Type.Optional(Type.Literal(true)),
			/** Exile until this battlefield incarnation leaves; return immediately to the original zone. */
			until: Type.Optional(object({ leaves: ObjectRef })),
			/** With as, bind how many moved objects came from this zone, before their incarnations change. */
			countFrom: Type.Optional(Zone),
			counters: Type.Optional(Type.Record(Type.String(), Type.Ref("Amount"))), controller: Type.Optional(PlayerRef),
			reason: Reason, link: Type.Optional(Type.Literal(true)) }, { allOf: [
				{ if: { required: ["countFrom"] }, then: { required: ["as"] } },
				{ if: { required: ["until"] }, then: { properties: { to: { const: "exile" } } } },
				{ if: { required: ["faceDown"] }, then: { properties: { to: { const: "exile" } }, not: { required: ["face"] } } },
			] }),
		step({ do: Type.Literal("destroy"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("choose"), who: PlayerRef, from: Type.Ref("Selector"), count: Type.Ref("Amount"), upTo: Type.Optional(Type.Literal(true)), reveal: Type.Optional(Type.Literal(true)) }),
		/** Choose from the pinned Oracle catalog, not registered decks or hidden objects; remember it on the named incarnation. */
		step({ do: Type.Literal("name-card"), who: PlayerRef, on: ObjectRef, key: name, types: Type.Optional(Type.Array(one(...CARD_TYPES), { minItems: 1 })) }),
		/** A private inspection binds exactly the inspected objects, not the whole hidden zone. */
		step({ do: Type.Literal("look"), who: PlayerRef, what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("reveal"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		/** Reorder a named library subset without changing its zone or incarnation. */
		step({ do: Type.Literal("order"), who: PlayerRef, what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), position: one("top", "bottom"), random: Type.Optional(Type.Literal(true)) }),
		/** Apply restriction words during announcement, before any player can respond. */
		step({ do: Type.Literal("spell-words"), who: PlayerRef, words: Type.Array(text, { minItems: 1 }), of: Type.Optional(Type.Ref("Selector")), next: Type.Optional(Type.Literal(true)), until: Duration }),
		/** Override the loyalty rules window, while keeping priority, costs and the once-per-turn allowance. */
		step({ do: Type.Literal("activation-timing"), who: PlayerRef, ability: Type.Literal("loyalty"), of: Type.Ref("Selector"), until: Duration }),
		/** Bind success only when every part of the stated cost is paid together. */
		step({ do: Type.Literal("pay"), who: PlayerRef, cost: Type.Ref("Cost") }),
		step({ do: Type.Literal("shuffle"), who: PlayerRef }),
		step({ do: Type.Literal("draw"), who: PlayerRef, count: Type.Ref("Amount") }),
		step({ do: Type.Literal("mill"), who: PlayerRef, count: Type.Ref("Amount") }),
		step({ do: Type.Literal("counters"), on: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), kind: text, amount: Type.Ref("Amount") }),
		step({ do: Type.Literal("life"), who: PlayerRef, amount: Type.Ref("Amount") }),
		step({ do: Type.Literal("mana"), who: PlayerRef, colors: Type.Optional(Type.Array(Color, { minItems: 1 })), any: Type.Optional(positive), times: Type.Optional(Type.Ref("Amount")), spendOnly: Type.Optional(Type.Ref("Selector")), until: Type.Optional(ManaDuration), spellWords: Type.Optional(Type.Array(text, { minItems: 1 })) }),
		step({ do: Type.Literal("tap"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("untap"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("transform"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")) }),
		step({ do: Type.Literal("door"), what: ObjectRef, action: one("unlock", "lock"), face: Type.Optional(Face) }),
		step({ do: Type.Literal("prepare"), what: ObjectRef, prepared: Type.Boolean() }),
		step({ do: Type.Literal("token"), count: Type.Ref("Amount"), spec: Type.Optional(Type.Ref("TokenSpec")), copy: Type.Optional(ObjectRef),
			except: Type.Optional(object({ power: Type.Integer(), toughness: Type.Integer() })), controller: Type.Optional(PlayerRef), tapped: Type.Optional(Type.Literal(true)), attacking: Type.Optional(Type.Literal(true)) },
			{ oneOf: [{ required: ["spec"], not: { anyOf: [{ required: ["copy"] }, { required: ["except"] }] } }, { required: ["copy"], not: { required: ["spec"] } }] }),
		/** Writes a public label on each affected object; `label` is its text, the claim when omitted. */
		step({ do: Type.Literal("modify"), what: Type.Optional(ObjectRef), every: Type.Optional(Type.Ref("Selector")), until: Duration, change: Type.Ref("Modification"), label: Type.Optional(text) }),
		/** "You may play that card": `from` "next-turn" for warp's "after the current turn has ended". */
		step({ do: Type.Literal("permit"), what: ObjectRef, who: PlayerRef, from: Type.Optional(one("now", "next-turn")),
			while: Type.Optional(Type.Ref("Condition")),
			until: Type.Union([Duration, object({ endOfNextTurn: PlayerRef })]),
			/** An alternative price grants casting only, not a land play or the printed price. */
			mana: Type.Optional(Type.Union([ManaCost, Type.Literal("printed")])), of: Type.Optional(Type.Ref("Selector")),
			/** A cast through this permission replaces every departure from the stack. */
			leavesStack: Type.Optional(Zone) }, { if: { required: ["leavesStack"] }, then: { required: ["mana"] } }),
		step({ do: Type.Literal("register"), on: ObjectRef, registration: Type.Ref("Registration") }),
		/** A delayed trigger (603.7). It fires once unless `until` gives it a span. */
		step({ do: Type.Literal("delay"), event: Type.Ref("Event"), effect: Type.Ref("Effect"), until: Type.Optional(Duration) }),
		/** "When you do" (603.12). `check` is its intervening if. */
		step({ do: Type.Literal("reflect"), check: Type.Optional(Type.Ref("Condition")), effect: Type.Ref("Effect") }),
		step({ do: Type.Literal("attach"), what: ObjectRef, to: ObjectRef }),
		step({ do: Type.Literal("counter"), what: ObjectRef, to: Type.Optional(one("graveyard", "exile")), unless: Type.Optional(object({ who: PlayerRef, pays: Type.Ref("Cost") })) }),
		/** One player accepts or declines an optional ordered group; each inner instruction keeps its own actor. */
		step({ do: Type.Literal("perform"), who: PlayerRef, instructions: Type.Array(Type.Ref("Instruction"), { minItems: 1 }) }),
		step({ do: Type.Literal("each"), players: one("each-player", "opponent"), instructions: Type.Array(Type.Ref("Instruction"), { minItems: 1 }) }),
	]),

	/** A public note on an object, quoting the text it carries out in `basis`. It lives while that object exists, unless `until` ends it sooner. */
	Registration: Type.Union([
		/** A battlefield ability reducing generic mana in matching spell costs, including alternative prices. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("cost"), cast: Type.Ref("Selector"), reduce: positive,
			from: Type.Optional(Type.Array(Zone, { minItems: 1, uniqueItems: true })), if: Type.Optional(Type.Ref("Condition")) }),
		/** Prevent matching damage, forbid prevention or add a fixed positive amount. */
		Type.Object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("damage-rule"), mode: Type.Union([DamageMode, Type.Literal("add")]), amount: Type.Optional(positive),
			combat: Type.Optional(Type.Boolean()), from: Type.Optional(Type.Ref("Selector")),
			to: Type.Optional(Type.Union([object({ object: Type.Ref("Selector") }), object({ player: PlayerRef })])), if: Type.Optional(Type.Ref("Condition")) },
			{ additionalProperties: false, if: { properties: { mode: { const: "add" } }, required: ["mode"] }, then: { required: ["amount"] }, else: { not: { required: ["amount"] } } }),
		/** Chapter numbers are supplied by the assessment; the table never parses Roman numerals. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("chapter"), numbers: Type.Array(positive, { minItems: 1, uniqueItems: true }), effect: Type.Ref("Effect") }),
		/** Extra instances of abilities the matching permanent has, never delayed or reflexive triggers (603.2d). */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("trigger-rule"), affects: Type.Ref("Selector"), additional: positive }),
		/** A triggered ability. `if` is its intervening if (603.4). */
		Type.Object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("watch"), event: Type.Ref("Event"), if: Type.Optional(Type.Ref("Condition")), effect: Type.Ref("TriggerEffect"),
			may: Type.Optional(Type.Literal(true)), limit: Type.Optional(Type.Union([Type.Literal("once-per-turn"), Type.Literal("once-per-turn-use")])) },
			{ additionalProperties: false, if: { properties: { limit: { const: "once-per-turn-use" } }, required: ["limit"] }, then: { required: ["may"] } }),
		/** A static ability. Applies while `if` holds, to whatever matches `affects` at each reading. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("continuous"), affects: Type.Ref("Selector"), change: Type.Ref("Modification"), if: Type.Optional(Type.Ref("Condition")) }),
		/** How a permanent enters (614.1c, 614.1d). `affects` omitted means the registering object itself. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("enters"), affects: Type.Optional(Type.Ref("Selector")), tapped: Type.Optional(Type.Literal(true)),
			prepared: Type.Optional(Type.Literal(true)),
			copy: Type.Optional(object({ of: Type.Ref("Selector"), may: Type.Optional(Type.Literal(true)),
				add: Type.Optional(object({ creatureTypes: Type.Optional(Type.Array(text)), words: Type.Optional(Type.Array(text)) })) })),
			choose: Type.Optional(object({ as: text, from: one("basic-land-type", "creature-type") })),
			counters: Type.Optional(Type.Record(Type.String(), Type.Ref("Amount"))), if: Type.Optional(Type.Ref("Condition")),
			/** Optional entry payments: life or choosing public permanents/revealing hand cards. Other entry costs remain unsupported. */
			unlessPay: Type.Optional(Type.Union([object({ life: positive }), object({ show: object({ choose: Type.Ref("Selector"), count: positive }) })])) }),
		/** "If it would die, exile it instead." */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("replace"), on: Type.Literal("dies"), to: Zone, until: Type.Optional(Duration) }),
		/** A mana ability, used while paying (605, 601.2g): `colors` once each, or `any` mana of one chosen color; `times` repeats it ("{G} for each Elf"). */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("mana"), cost: Type.Ref("Cost"), colors: Type.Optional(Type.Array(Color, { minItems: 1 })), any: Type.Optional(positive),
			times: Type.Optional(Type.Ref("Amount")), spendOnly: Type.Optional(Type.Ref("Selector")), until: Type.Optional(ManaDuration), spellWords: Type.Optional(Type.Array(text, { minItems: 1 })),
			/** "Activate only if you control an Island or a Swamp": the ability is usable while this holds. */
			if: Type.Optional(Type.Ref("Condition")) }),
		/** An ability carried by a permanent, including a token or a granted ability. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("activated"), cost: Type.Ref("Cost"), effect: Type.Ref("Effect"),
			speed: Type.Optional(Type.Literal("sorcery")), if: Type.Optional(Type.Ref("Condition")), limit: Type.Optional(Type.Literal("once-per-turn")) }),
		/** A choice the baseline rules would not offer: extra land plays, lands from a zone, flash. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("permit"), lands: Type.Optional(positive), landsFrom: Type.Optional(Type.Array(Zone, { minItems: 1 })), flash: Type.Optional(Type.Ref("Selector")),
			/** This card's owner may cast it from the named zones at this alternative mana price. */
			cast: Type.Optional(object({ from: Type.Array(Zone, { minItems: 1 }), mana: ManaCost, leavesStack: Type.Optional(Zone) })) }),
		/** A standing restriction on the named players' casting, optionally during a named player's turn. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("prohibit"), cast: PlayerRef, during: Type.Optional(PlayerRef), if: Type.Optional(Type.Ref("Condition")) }),
		/** Restrictions name sources in any zone; a mana exception preserves payment abilities. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("prohibit"), activate: Type.Ref("Selector"), exceptMana: Type.Optional(Type.Literal(true)), if: Type.Optional(Type.Ref("Condition")) }),
		/** A forbidden attacker/blocker pair. Both selectors read the registration's source. */
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("prohibit"), block: object({ attacker: Type.Ref("Selector"), blocker: Type.Ref("Selector") }) }),
		object({ basis: text, face: Type.Optional(Face), kind: Type.Literal("suppress"), event: Type.Ref("Event") }),
	]),
};

function step<T extends Parameters<typeof Type.Object>[0]>(fields: T, options: Parameters<typeof Type.Object>[1] = {}) {
	return Type.Object({ ...fields, if: Type.Optional(Type.Ref("Condition")), as: Type.Optional(name), may: Type.Optional(Type.Literal(true)) }, { additionalProperties: false, ...options });
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
export const ModificationSchema = of("Modification");
export const TokenSpecSchema = of("TokenSpec");

export const RefSchema = object({ id: text, incarnation: natural });
const seatSide = one("self", "opponent", "any");
/** Projected objects a seat can name: a procedure's source, a plan's option filter. */
export const QuerySchema = object({
	zones: Type.Optional(Type.Array(one("hand", "battlefield", "stack", "graveyard", "exile", "command", "dungeon"))),
	face: Type.Optional(Face), controller: Type.Optional(seatSide), card: Type.Optional(text), tapped: Type.Optional(Type.Boolean()),
	registered: Type.Optional({ ...text, description: "Requires an active activated registration with this exact basis; losing that ability removes this source." }),
	types: Type.Optional(Type.Array(one(...CARD_TYPES), { description: "Matches any listed current card type on a projected object. Other query fields still narrow the selection." })),
	refs: Type.Optional(Type.Array(RefSchema)),
	ids: Type.Optional(Type.Array(text)),
});
/** A window: whose turn, which step or phase, and inclusive table turn bounds. */
export const WhenSchema = object({
	active: Type.Optional({ ...seatSide, description: "Whose turn: self, opponent or any. Attack declarations are on self; blocks on opponent." }),
	step: Type.Optional({ ...Step, description: "One rules step. Omit for any step; do not write any. Combat is a phase, not a step." }),
	phase: Type.Optional(Type.String({ enum: [...new Set(Object.values(STEPS).map((step) => step.phase))], description: "A whole phase such as combat. Omit for any phase." })),
	fromTurn: Type.Optional(positive), throughTurn: Type.Optional(positive),
});

/**
 * An action a seat announces. Modes, kicker and warp are separate procedures
 * with their own claims; "choose one" is which procedure the seat announces.
 * Instructions on a permanent spell run after it enters, with `this` the permanent.
 */
export const ProcedureDef = object({
	source: QuerySchema, face: Type.Optional(Face), claim: text,
	/** The card text this procedure carries out, quoted. */
	basis: text,
	timing: one("spell", "land", "stack", "mana", "special"),
	/** A shared special action, paid through the same staged announcement. */
	special: Type.Optional(Type.Literal("plot")),
	/** An activation's "only as a sorcery", or `instant` on a spell to claim flash. Otherwise a spell's timing comes from its type line. */
	speed: Type.Optional(one("instant", "sorcery")),
	cost: Type.Optional(Type.Ref("Cost")),
	/** The seat's own statement that narrows when it is offered. */
	if: Type.Optional(Type.Ref("Condition")),
	limit: Type.Optional(Type.Literal("once-per-turn")),
	targets: Type.Optional(Type.Array(Type.Ref("Target"))),
	instructions: Type.Array(Type.Ref("Instruction")),
	words: Type.Optional(Type.Array(text)),
});
export const ProcedureSchema = Type.Cyclic({ ...Defs, Procedure: ProcedureDef }, "Procedure");

/**
 * A public label a player puts on its own object: "power doubled until end of
 * turn", "warped: exile at the next end step". With a `change` the layer walk
 * applies it; without one it is information for the players and the judge.
 * `modify` writes one of these too. Each ends by its lifetime.
 */
export const LabelSchema = Type.Cyclic({ ...Defs, Label: object({ text, until: Duration, change: Type.Optional(Type.Ref("Modification")) }) }, "Label");
export type Label = Static<typeof LabelSchema>;

/** A known cast or activation whose executable procedure has not yet been prepared. */
export const DeferredUseSchema = object({ claim: text, basis: text, source: QuerySchema, face: Type.Optional(Face), timing: one("spell", "stack") });
export type DeferredUse = Static<typeof DeferredUseSchema>;
/** Accepted registrations, shared mechanics and known uses for one card. Private until used. */
export const PackageDef = object({ card: text, registers: Type.Array(Type.Ref("Registration")),
	procedures: Type.Optional(Type.Array(Type.Ref("Procedure"))), assessed: Type.Optional(Type.Literal(true)),
	deferred: Type.Optional(Type.Array(DeferredUseSchema)),
	/** The model accepts the shared targetless permanent cast at its printed cost, with no extra instructions or spell properties. */
	printedCast: Type.Optional(Type.Boolean()), printedFaces: Type.Optional(Type.Array(Face, { uniqueItems: true })) });
export const PackageSchema = Type.Cyclic({ ...Defs, Procedure: ProcedureDef, Package: PackageDef }, "Package");

/**
 * A seat's plan for a stretch of play, and the only thing strategy writes.
 * `steps` is the line, in the order the table will ask; the pilot takes the
 * step that is due, including when only one option fits.
 * `may` holds standing branches, such as reactions and blocks, taken when
 * their window and `if` hold. `askWhen` names visible facts that mean the plan
 * no longer fits, so the seat asks for a new one instead of improvising.
 * `holds` names resources kept for a purpose; an option that spends one is
 * marked, never removed. `packages` corrects accepted card registrations and procedures.
 * `phases` is the pilot's script for each window, which it reads while the window is open.
 * A step marked `essential` is one the line cannot do without: when it cannot be
 * taken where it should be, the table asks for a new plan rather than passing.
 * `triggers` orders the seat's own triggers whenever several wait together: the
 * options that keep the order are marked, never chosen.
 */
export const PlanDefs = { ...Defs,
	Option: object({
		label: text, when: WhenSchema, if: Type.Optional(Type.Ref("Condition")), essential: Type.Optional(Type.Literal(true)),
		waitFor: Type.Optional(Type.Literal("empty-stack", { description: "Wait until the whole stack is empty before this commitment. Absence adds no prerequisite. This does not choose a pass or remove physical options." })),
		purpose: Type.Optional(Type.String({ minLength: 1, description: "What Jev does when it takes this step: targets, payment, searches, optional choices and what to leave unspent. A decision Jev must follow belongs here or in phase guidance; reasons belong in assessment." })),
		/** A listed table option by id or prefix and objects, or a procedure to announce. */
		action: Type.Union([
			object({ option: Type.Optional(text), prefix: Type.Optional(text), objects: Type.Optional(QuerySchema) }),
			object({ procedure: Type.Ref("Procedure") }),
		]),
	}),
	Procedure: ProcedureDef,
	Package: PackageDef,
	Plan: object({
		objective: text, guidance: text,
		/** Last table turn covered by this tactical plan. Omitted in legacy plans. */
		throughTurn: Type.Optional(Type.Integer({ minimum: 1 })),
		steps: Type.Array(Type.Ref("Option")),
		may: Type.Optional(Type.Array(Type.Ref("Option"))),
		/** A stop, watched at every decision or only in its window. */
		askWhen: Type.Optional(Type.Array(object({ label: text, when: Type.Optional(WhenSchema), if: Type.Ref("Condition") }))),
		holds: Type.Optional(Type.Array(object({ objects: QuerySchema, purpose: text, releaseWhen: Type.Optional(Type.Ref("Condition")),
			/** Released once this window is reached in the turn: its step or phase, or any later step. */
			releaseAt: Type.Optional(WhenSchema) }))),
		/**
		 * The pilot's script for a window, read while it is open: the goal, the decisions in it (what to do and why), and the
		 * few situations that justify asking strategy again. Anything else in the window is normal play.
		 */
		phases: Type.Optional(Type.Array(object({ when: WhenSchema, goal: Type.Optional(text), guidance: text,
			complete: Type.Optional(Type.Union([Type.Literal("pass"), Type.Literal("ask")])), reevaluate: Type.Optional(Type.Array(text)) }))),
		packages: Type.Optional(Type.Array(Type.Ref("Package"))),
		/** Standing trigger orders, used each time the listed triggers wait together, such as on every land entry. */
		triggers: Type.Optional(Type.Array(object({ when: Type.Optional(WhenSchema),
			resolve: Type.Array(QuerySchema, { minItems: 1, description: "The sources of your triggers in the order the triggers resolve: the first listed resolves first. A trigger whose source is not listed may go anywhere. One source names only its target." }),
			targets: Type.Optional(Type.Array(object({ source: QuerySchema,
				target: Type.Union([QuerySchema, Type.Literal("opponent"), Type.Literal("self")], { description: "The object this source's trigger targets, by query, or a player." }) }))),
			purpose: Type.Optional(Type.String({ minLength: 1, description: "Other choices for these triggers, as a step's purpose." })) }))),
	}),
};
export const PlanSchema = Type.Cyclic(PlanDefs, "Plan");
export const PlanOptionSchema = Type.Cyclic(PlanDefs, "Option");
export type Plan = Static<typeof PlanSchema>;
export type PlanOption = Static<typeof PlanOptionSchema>;

export type Selector = Static<typeof SelectorSchema>;
export type Amount = Static<typeof AmountSchema>;
export type Condition = Static<typeof ConditionSchema>;
export type Target = Static<typeof TargetSchema>;
export type Cost = Static<typeof CostSchema>;
export type GameEvent = Static<typeof EventSchema>;
export type Effect = Static<typeof EffectSchema>;
export type Instruction = Static<typeof InstructionSchema>;
export type Registration = Static<typeof RegistrationSchema>;
export type Modification = Static<typeof ModificationSchema>;
export type TokenSpec = Static<typeof TokenSpecSchema>;
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

/**
 * Every place a value is wrong, for a writer that can fix them all in one
 * answer: the deepest error under each item of each list, with the values or
 * fields the schema expected. Empty when the value matches.
 */
export function problems<T extends TSchema>(schema: T, value: unknown, limit = 12): string[] {
	if (Check(schema, value)) return [];
	const found: { path: string; text: string; branch?: string }[] = [];
	for (const error of Errors(schema, value)) {
		const path = error.instancePath || "/";
		const params = error.params as Record<string, unknown>;
		const detail = Array.isArray(params.allowedValues) ? ` (${params.allowedValues.join(", ")})` : Array.isArray(params.requiredProperties) ? ` (${params.requiredProperties.join(", ")})`
			: typeof params.additionalProperty === "string" ? ` (${params.additionalProperty})` : "";
		// A key no field allows: say so, and name the fields that do belong there.
		const parent = path.slice(0, path.lastIndexOf("/")) || "/", key = path.slice(path.lastIndexOf("/") + 1);
		const allowed = error.message === "schema is false" ? fieldsAt(schema, parent) : [];
		// On a union, "no such field" is usually another branch talking: ask the branch the value means.
		const inner = error.message === "schema is false" && !allowed.length ? branchProblems(schema, value, parent, key) : [];
		if (inner.length) { for (const line of inner) found.push({ path: line.split(" ")[0]!, text: line, branch: parent }); continue; }
		found.push({ path, text: error.message === "schema is false" ? `${parent} has no field "${key}"${allowed.length ? `; its fields are ${allowed.join(", ")}` : ""}` : `${path} ${error.message}${detail}` });
	}
	// Where a branch was chosen, the other branches' complaints there are noise.
	const chosen = [...new Set(found.flatMap((one) => one.branch ? [one.branch] : []))];
	const noise = (one: { path: string; text: string; branch?: string }) => !one.branch && chosen.some((at) => one.path === at || one.path.startsWith(`${at}/`)) ||
		one.text.endsWith("must be equal to constant") && found.some((other) => !other.text.endsWith("must be equal to constant") && one.path.startsWith(other.path));
	const meant = found.filter((one) => !noise(one));
	// Keep the most specific: drop a line whose place another line explains more deeply, and repeats.
	const deepest = meant.filter((one) => !meant.some((other) => other.path !== one.path && other.path.startsWith(one.path === "/" ? "/" : `${one.path}/`)));
	return [...new Set(deepest.map((one) => one.text))].slice(0, limit);
}

type Node = Record<string, unknown> | undefined;
const resolver = (schema: TSchema) => {
	const root = schema as { $defs?: Record<string, unknown> };
	return (node: unknown): Node => {
		const one = node as { $ref?: string } | undefined;
		return (one?.$ref ? root.$defs?.[one.$ref] : one) as Node;
	};
};

/** The schema node at a value path, following refs, list items, and the union branch whose fields the value uses. */
function nodeAt(schema: TSchema, value: unknown, path: string): { node: Node; value: unknown } {
	const resolve = resolver(schema);
	let node = resolve(schema), at = value;
	for (const step of path.split("/").filter(Boolean)) {
		if (node?.anyOf) node = pick(node.anyOf as unknown[], at, resolve);
		const properties = node?.properties as Record<string, unknown> | undefined;
		node = resolve(properties?.[step] ?? (/^\d+$/.test(step) ? node?.items : undefined));
		at = (at as Record<string, unknown> | undefined)?.[step];
	}
	return { node, value: at };
}
/**
 * The branch of a union the value means: the one whose constant field it
 * matches (an instruction's "do", a registration's "kind"), else the one whose
 * fields cover all of the value's keys.
 */
function pick(branches: unknown[], value: unknown, resolve: (node: unknown) => Node): Node {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>, resolved = branches.map(resolve);
	const named = resolved.filter((branch) => Object.entries((branch?.properties as Record<string, { const?: unknown }> | undefined) ?? {})
		.some(([key, field]) => field?.const !== undefined && record[key] === field.const));
	if (named.length === 1) return named[0];
	const keys = Object.keys(record);
	const fits = resolved.filter((branch) => keys.length && keys.every((key) => key in ((branch?.properties as object | undefined) ?? {})));
	return fits.length === 1 ? fits[0] : undefined;
}

/** The field names a schema allows at a value path, following refs and list items. Empty where it cannot tell. */
function fieldsAt(schema: TSchema, path: string): string[] {
	const { node } = nodeAt(schema, undefined, path);
	return node && !("anyOf" in node) ? Object.keys((node.properties as Record<string, unknown> | undefined) ?? {}) : [];
}

/** At a union, the problems of the branch the value means, or the one branch that has this field, with full paths. */
function branchProblems(schema: TSchema, value: unknown, path: string, key: string): string[] {
	const resolve = resolver(schema);
	const { node, value: here } = nodeAt(schema, value, path);
	if (!node?.anyOf) return [];
	const having = (node.anyOf as unknown[]).map(resolve).filter((branch) => key in ((branch?.properties as object | undefined) ?? {}));
	const branch = pick(node.anyOf as unknown[], here, resolve) ?? (having.length === 1 ? having[0] : undefined);
	if (!branch) return [];
	const defs = (schema as { $defs?: Record<string, TSchema> }).$defs ?? {};
	return problems(Type.Cyclic({ ...defs, Picked: branch as TSchema }, "Picked"), here).map((line) => line.startsWith("/ ") ? `${path}${line.slice(1)}` : `${path}${line}`);
}

/**
 * Writers often put a condition's bounds inside its amount:
 * {"amount": {"count": {...}, "atLeast": 1}}. That is unambiguous, so it is
 * read as {"amount": {"count": {...}}, "atLeast": 1} rather than refused.
 */
export function lifted<T>(value: T): T {
	if (Array.isArray(value)) return value.map(lifted) as T;
	if (!value || typeof value !== "object") return value;
	const entries = Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, lifted(inner)]));
	const amount = entries.amount as Record<string, unknown> | undefined;
	if (amount && typeof amount === "object" && !Array.isArray(amount) && ("atLeast" in amount || "atMost" in amount)) {
		// A bound written in both places is two meanings: it stays where it was, for the schema to refuse.
		const kept = Object.fromEntries((["atLeast", "atMost"] as const).filter((bound) => bound in amount && entries[bound] !== undefined).map((bound) => [bound, amount[bound]]));
		const moved = Object.fromEntries((["atLeast", "atMost"] as const).filter((bound) => bound in amount && entries[bound] === undefined).map((bound) => [bound, amount[bound]]));
		const { atLeast: _least, atMost: _most, ...rest } = amount;
		return { ...entries, amount: { ...rest, ...kept }, ...moved } as T;
	}
	return entries as T;
}
