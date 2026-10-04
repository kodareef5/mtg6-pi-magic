/** The seat's tool vocabulary. JSON data, never executable model-written code. */
import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";
import { STEPS } from "./steps.ts";

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });
const natural = Type.Integer({ minimum: 0 });
const side = Type.Union([Type.Literal("self"), Type.Literal("opponent"), Type.Literal("any")]);
const enumeration = (values: string[]) => Type.String({ enum: values });
export const RefSchema = object({ id: text, incarnation: natural });
export const QuerySchema = object({
	zones: Type.Optional(Type.Array(enumeration(["hand", "battlefield", "stack", "graveyard", "exile", "command", "dungeon"]))),
	controller: Type.Optional(side), card: Type.Optional(text), tapped: Type.Optional(Type.Boolean()),
	refs: Type.Optional(Type.Array(RefSchema)),
});
export const WhenSchema = object({
	active: Type.Optional(side), step: Type.Optional(enumeration(Object.keys(STEPS))),
	phase: Type.Optional(enumeration([...new Set(Object.values(STEPS).map((step) => step.phase))])),
	fromTurn: Type.Optional(Type.Integer({ minimum: 1 })), throughTurn: Type.Optional(Type.Integer({ minimum: 1 })),
});
export const TaskSchema = object({
	id: text, label: text, when: WhenSchema,
	times: Type.Optional(Type.Integer({ minimum: 1 })),
	after: Type.Optional(object({ task: text, runs: Type.Integer({ minimum: 1 }) })),
	scope: QuerySchema, concepts: Type.Array(text), concerns: Type.Array(text, { minItems: 1 }),
	guidance: text, recipes: Type.Array(text),
});
export const ColorSchema = enumeration(["W", "U", "B", "R", "G", "C"]);
const player = Type.Union([Type.Literal("self"), Type.Literal("opponent")]);
export const InstructionSchema = Type.Union([
	object({ do: Type.Literal("damage"), amount: Type.Integer({ minimum: 1 }) }),
	object({ do: Type.Literal("mana"), who: player, colors: Type.Array(ColorSchema, { minItems: 1 }) }),
	object({ do: Type.Literal("draw"), who: player, count: Type.Integer({ minimum: 1 }) }),
	object({ do: Type.Literal("choose-move"), who: player, count: Type.Literal(1),
		from: enumeration(["hand", "battlefield", "graveyard"]), to: enumeration(["hand", "battlefield", "graveyard", "exile", "library"]),
		reason: enumeration(["discard", "sacrifice", "exile", "bounce"]) }),
	object({ do: Type.Literal("life"), who: player, amount: Type.Integer() }),
]);
export const ProcedureSchema = object({
	source: QuerySchema, claim: text, basis: text,
	timing: Type.Union([Type.Literal("mana"), Type.Literal("stack"), Type.Literal("spell"), Type.Literal("land")]),
	spell: Type.Optional(object({ speed: Type.Union([Type.Literal("instant"), Type.Literal("sorcery")]),
		destination: Type.Union([Type.Literal("battlefield"), Type.Literal("graveyard")]) })),
	target: Type.Optional(enumeration(["creature", "player", "creature-or-player"])),
	/** Omitted only by a spell or land: a spell then pays its printed mana cost. */
	cost: Type.Optional(object({ tap: Type.Boolean(), generic: natural, colors: Type.Array(ColorSchema) })),
	instructions: Type.Array(InstructionSchema),
	/** Permission for this seat's unique resolution continuations, never another seat's choice. */
	delegate: Type.Boolean(),
});
export const StepSchema = object({
	label: text, when: WhenSchema,
	action: Type.Union([
		object({ option: Type.Optional(text), prefix: Type.Optional(text), objects: Type.Optional(QuerySchema) }),
		object({ procedure: ProcedureSchema }),
	]),
});
/** One ability of a named card, in procedure terms. */
export const InterpretationSchema = object({ id: text, procedure: ProcedureSchema });

export const RecipeSchema = object({
	id: text, label: text, guidance: text, steps: Type.Array(StepSchema, { minItems: 1 }),
	reserves: Type.Array(object({ object: RefSchema, purpose: text, tapped: Type.Optional(Type.Boolean()) })),
});
export const CommandSchema = Type.Union([
	object({ do: Type.Literal("task.put"), task: TaskSchema }),
	object({ do: Type.Literal("task.cancel"), id: text }),
	object({ do: Type.Literal("recipe.put"), recipe: RecipeSchema }),
	object({ do: Type.Literal("label.put"), object: RefSchema, role: text, purpose: text }),
	object({ do: Type.Literal("label.remove"), object: RefSchema, role: text }),
	object({ do: Type.Literal("review.answer"), task: text, occurrence: text, stamp: text, answers: Type.Record(Type.String(), text) }),
	object({ do: Type.Literal("task.expire"), id: text }),
	object({ do: Type.Literal("draft.start"), recipe: text }),
	object({ do: Type.Literal("draft.bind"), option: text }),
	object({ do: Type.Literal("draft.edit"), steps: Type.Array(StepSchema, { minItems: 1 }), reserves: Type.Optional(RecipeSchema.properties.reserves), guidance: Type.Optional(text) }),
	object({ do: Type.Literal("draft.ready") }),
	object({ do: Type.Literal("draft.park") }),
	object({ do: Type.Literal("draft.cancel") }),
	object({ do: Type.Literal("suggestion.dismiss"), recipe: text }),
	object({ do: Type.Literal("plan.request"), reason: text }),
	object({ do: Type.Literal("interpretation.put"), interpretation: InterpretationSchema }),
	/** Card text the vocabulary cannot express. The card is not offered and the table records a gap. */
	object({ do: Type.Literal("interpretation.missing"), card: text, text }),
	object({ do: Type.Literal("plan.accept"), objective: text }),
]);
export const CommandsSchema = Type.Array(CommandSchema, { minItems: 1 });
export type ObjectRef = Static<typeof RefSchema>;
export type Query = Static<typeof QuerySchema>;
export type When = Static<typeof WhenSchema>;
export type TaskSpec = Static<typeof TaskSchema>;
export type DraftStep = Static<typeof StepSchema>;
export type Recipe = Static<typeof RecipeSchema>;
export type Instruction = Static<typeof InstructionSchema>;
export type Procedure = Static<typeof ProcedureSchema>;
export type Interpretation = Static<typeof InterpretationSchema>;
export type WorkCommand = Static<typeof CommandSchema>;

/** Shape checking proves neither card meaning nor strategic quality. */
export function commands(value: unknown): WorkCommand[] {
	if (!Check(CommandsSchema, value)) {
		// A union's first errors can describe an unrelated tool. Report the
		// selected command so a retry can repair the field that actually failed.
		const at = Array.isArray(value) ? value.findIndex((tool) => !Check(CommandSchema, tool)) : -1;
		const tool = at < 0 ? undefined : (value as unknown[])[at];
		const schema = CommandSchema.anyOf.find((branch) => tool && typeof tool === "object" && "do" in tool && branch.properties.do.const === tool.do);
		if (schema) throw new Error(`Seat tool ${at}: ${JSON.stringify(Errors(schema, tool).slice(0, 3))}`);
		throw new Error(`Seat tools: ${JSON.stringify(Errors(CommandsSchema, value).slice(0, 3))}`);
	}
	return value as WorkCommand[];
}
