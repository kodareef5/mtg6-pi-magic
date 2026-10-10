/** The seat's tool vocabulary. JSON data, never executable model-written code. */
import { Type, type Static } from "typebox";
import { Check, Errors } from "typebox/value";
import { PlanDefs, RefSchema, QuerySchema, WhenSchema, ProcedureSchema } from "./language.ts";

export { RefSchema, QuerySchema, WhenSchema, ProcedureSchema };
export type { Instruction, Procedure } from "./language.ts";

const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
const text = Type.String({ minLength: 1 });
/**
 * The strategist's own notes, kept across plans: topics, each as long as it needs, and the turn it was last
 * revised. The whole is budgeted (`NOTEBOOK_LIMIT`), and the strategist compacts it as it nears the limit.
 */
export const NotebookSchema = Type.Array(object({
	topic: Type.String({ minLength: 1, maxLength: 80 }),
	note: Type.String({ minLength: 1 }),
	since: Type.Integer({ minimum: 0 }),
}));
export type Notebook = Static<typeof NotebookSchema>;
/** Edits to the notebook: a topic written replaces that topic or joins it, an empty note retires it, a topic left out stands. */
export const NoteEditsSchema = Type.Array(object({ topic: Type.String({ minLength: 1, maxLength: 80 }), note: Type.String() }), { minItems: 1 });
export type NoteEdit = Static<typeof NoteEditsSchema>[number];
/** About 50k tokens of notes, in characters. */
export const NOTEBOOK_LIMIT = 200_000;
export const notebookSize = (notebook: Notebook = []) => notebook.reduce((sum, one) => sum + one.topic.length + one.note.length, 0);

/**
 * A notebook with edits applied: a topic written replaces that topic in place or joins at the end, an empty
 * note retires it. A changed note carries `turn`. Edits merge into whatever the notebook holds when accepted.
 */
export function noteEdits(notebook: Notebook = [], edits: readonly NoteEdit[], turn: number): Notebook {
	const notes = [...notebook];
	for (const { topic, note } of edits) {
		const at = notes.findIndex((one) => one.topic === topic);
		if (!note.trim()) { if (at >= 0) notes.splice(at, 1); continue; }
		if (at >= 0 && notes[at]!.note === note) continue;
		const revised = { topic, note, since: turn };
		if (at >= 0) notes[at] = revised; else notes.push(revised);
	}
	return notes;
}

/** One cyclic schema for the whole seat vocabulary, so a plan and a package share the syntax's definitions. */
const Vocabulary = { ...PlanDefs,
	Command: Type.Union([
		/** Accept a whole plan. It replaces the previous one; its packages join the seat's. */
		object({ do: Type.Literal("plan.put"), plan: Type.Ref("Plan") }),
		object({ do: Type.Literal("plan.request"), reason: text }),
		/** No new plan came: the one standing, if any, is flown as it is, and the request is closed. */
		object({ do: Type.Literal("plan.keep"), reason: text }),
		/** What a permanent of this name registers when it enters under this seat's control. Replaces an earlier package. */
		object({ do: Type.Literal("package.put"), package: Type.Ref("Package") }),
		/** Edit the strategist's notebook, topic by topic. */
		object({ do: Type.Literal("notebook.edit"), edits: NoteEditsSchema }),
		/** The seat plans each of its own turns once it has drawn. */
		object({ do: Type.Literal("plan.each-turn") }),
	]),
	Commands: Type.Array(Type.Ref("Command"), { minItems: 1 }),
};
export const CommandSchema = Type.Cyclic(Vocabulary, "Command");
export const CommandsSchema = Type.Cyclic(Vocabulary, "Commands");
export type ObjectRef = Static<typeof RefSchema>;
export type Query = Static<typeof QuerySchema>;
export type When = Static<typeof WhenSchema>;
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
