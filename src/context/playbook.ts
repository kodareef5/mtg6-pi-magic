/** Pregame policies describe decisions. They neither implement cards nor certify a line. */
import { Type, type Static } from "typebox";
import type { Brief } from "./brief.ts";
import type { Frame } from "../core/types.ts";

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

/** A whole-turn question needs every strategic family, including contingencies.
 * Opening choices have already happened; phase scripts arrive through base.
 * Card notes follow visible identities, never a hidden library arrangement.
 */
export function strategyBrief(brief: Brief | undefined, frame: Frame, scope: "turn" | "response" = "turn") {
	if (!brief) return undefined;
	const visible = new Set((frame.view.objects ?? []).flatMap((object) => object.card ? [object.card] : []));
	const policies = brief.policies && (scope === "turn" ? brief.policies
		: { resources: brief.policies.resources, responses: brief.policies.responses, combat: brief.policies.combat });
	return { objective: brief.objective, role: brief.role,
		...(policies ? { policies: policies }
			: { route: brief.route, recovery: brief.recovery, matchup: brief.matchup, traps: brief.traps }), gaps: brief.gaps,
		cards: Object.fromEntries(Object.entries(brief.cards ?? {}).filter(([name]) => visible.has(name))),
	};
}
