/** The seat's tool vocabulary. JSON data, never executable model-written code. */
import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";
import { Defs, RefSchema, QuerySchema, WhenSchema, PackageDef, ProcedureDef, ProcedureSchema } from "./language.ts";

export { RefSchema, QuerySchema, WhenSchema, ProcedureSchema };
export type { Instruction, Procedure } from "./language.ts";

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });
/**
 * One cyclic schema for the whole tool vocabulary, so a procedure inside a
 * recipe and a package share the syntax's definitions and a model reading the
 * schema reads each definition once.
 */
const Vocabulary = { ...Defs, Procedure: ProcedureDef, Package: PackageDef,
	Task: object({
		id: text, label: text, when: WhenSchema,
		times: Type.Optional(Type.Integer({ minimum: 1 })),
		after: Type.Optional(object({ task: text, runs: Type.Integer({ minimum: 1 }) })),
		scope: QuerySchema, concepts: Type.Array(text), concerns: Type.Array(text, { minItems: 1 }),
		guidance: text, recipes: Type.Array(text),
	}),
	Step: object({
		label: text, when: WhenSchema,
		action: Type.Union([
			object({ option: Type.Optional(text), prefix: Type.Optional(text), objects: Type.Optional(QuerySchema) }),
			object({ procedure: Type.Ref("Procedure") }),
		]),
	}),
	Reserves: Type.Array(object({ object: RefSchema, purpose: text, tapped: Type.Optional(Type.Boolean()) })),
	Recipe: object({ id: text, label: text, guidance: text, steps: Type.Array(Type.Ref("Step"), { minItems: 1 }), reserves: Type.Ref("Reserves") }),
	Command: Type.Union([
		object({ do: Type.Literal("task.put"), task: Type.Ref("Task") }),
		object({ do: Type.Literal("task.cancel"), id: text }),
		object({ do: Type.Literal("recipe.put"), recipe: Type.Ref("Recipe") }),
		object({ do: Type.Literal("label.put"), object: RefSchema, role: text, purpose: text }),
		object({ do: Type.Literal("label.remove"), object: RefSchema, role: text }),
		object({ do: Type.Literal("review.answer"), task: text, occurrence: text, stamp: text, answers: Type.Record(Type.String(), text) }),
		object({ do: Type.Literal("task.expire"), id: text }),
		object({ do: Type.Literal("draft.start"), recipe: text }),
		object({ do: Type.Literal("draft.bind"), option: text }),
		object({ do: Type.Literal("draft.edit"), steps: Type.Array(Type.Ref("Step"), { minItems: 1 }), reserves: Type.Optional(Type.Ref("Reserves")), guidance: Type.Optional(text) }),
		object({ do: Type.Literal("draft.ready") }),
		object({ do: Type.Literal("draft.park") }),
		object({ do: Type.Literal("draft.cancel") }),
		object({ do: Type.Literal("suggestion.dismiss"), recipe: text }),
		object({ do: Type.Literal("plan.request"), reason: text }),
		/** What a permanent of this name registers when it enters under this seat's control. Replaces an earlier package. */
		object({ do: Type.Literal("package.put"), package: Type.Ref("Package") }),
		object({ do: Type.Literal("plan.accept"), objective: text }),
		/** The seat plans each of its own turns once it has drawn. */
		object({ do: Type.Literal("plan.each-turn") }),
	]),
	Commands: Type.Array(Type.Ref("Command"), { minItems: 1 }),
};
export const TaskSchema = Type.Cyclic(Vocabulary, "Task");
export const StepSchema = Type.Cyclic(Vocabulary, "Step");
export const RecipeSchema = Type.Cyclic(Vocabulary, "Recipe");
export const CommandSchema = Type.Cyclic(Vocabulary, "Command");
export const CommandsSchema = Type.Cyclic(Vocabulary, "Commands");
export type ObjectRef = Static<typeof RefSchema>;
export type Query = Static<typeof QuerySchema>;
export type When = Static<typeof WhenSchema>;
export type TaskSpec = Static<typeof TaskSchema>;
export type DraftStep = Static<typeof StepSchema>;
export type Recipe = Static<typeof RecipeSchema>;
export type WorkCommand = Static<typeof CommandSchema>;

/** Shape checking proves neither card meaning nor strategic quality. */
export function commands(value: unknown): WorkCommand[] {
	if (Check(CommandsSchema, value)) return value as WorkCommand[];
	if (!Array.isArray(value)) throw new Error("commands must be an array of work commands.");
	// Every failing command at once, each against the command it names: a union's
	// first errors describe an unrelated branch, and one error per try costs a call per error.
	const wrong = value.flatMap((tool, at) => {
		if (Check(CommandSchema, tool)) return [];
		const branch = Vocabulary.Command.anyOf.find((one) => tool && typeof tool === "object" && "do" in tool && one.properties.do.const === tool.do);
		if (!branch) return [`command ${at}: "do" must be one of ${Vocabulary.Command.anyOf.map((one) => one.properties.do.const).join(", ")}`];
		const errors = [...Errors(Type.Cyclic({ ...Vocabulary, Picked: branch }, "Picked"), tool)]
			.sort((a, b) => b.instancePath.length - a.instancePath.length).slice(0, 4)
			.map((error) => `${error.instancePath || "/"} ${error.message}${"allowedValues" in error.params ? ` (${(error.params.allowedValues as unknown[]).join(", ")})` :
				"requiredProperties" in error.params ? ` (${(error.params.requiredProperties as string[]).join(", ")})` : "additionalProperty" in error.params ? ` (${error.params.additionalProperty})` : ""}`);
		return [`command ${at} (${(tool as { do: string }).do}): ${[...new Set(errors)].join("; ")}`];
	});
	throw new Error(`${wrong.length} command${wrong.length === 1 ? " is" : "s are"} wrong. ${wrong.join(". ")}.`);
}
