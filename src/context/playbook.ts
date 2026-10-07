/** Pregame policies describe decisions. They neither implement cards nor certify a line. */
import { Type, type Static } from "typebox";

const text = Type.String({ minLength: 1 });
const object = <T extends Parameters<typeof Type.Object>[0]>(fields: T) => Type.Object(fields, { additionalProperties: false });
export const ExampleSchema = object({
	position: text,
	line: Type.Array(text, { minItems: 1 }),
	exception: text,
});
const Policy = object({
	when: text,
	priorities: Type.Array(text, { minItems: 1 }),
	reserve: text,
	reconsider: text,
	example: ExampleSchema,
});
export const PlaybookSchema = object({ sequencing: Policy, resources: Policy, responses: Policy, combat: Policy, recovery: Policy });
export type Playbook = Static<typeof PlaybookSchema>;
