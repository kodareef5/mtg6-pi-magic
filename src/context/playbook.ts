/** Pregame policies describe decisions. They neither implement cards nor certify a line. */
import { Type, type Static } from "typebox";
import type { Brief } from "./brief.ts";
import type { Frame } from "../core/types.ts";
import type { Lookup } from "./reason.ts";

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
export function strategyBrief(brief: Brief | undefined, frame: Frame, scope: "turn" | "response" = "turn", examples: "inline" | "lookup" = "inline") {
	if (!brief) return undefined;
	const visible = new Set((frame.view.objects ?? []).flatMap((object) => object.card ? [object.card] : []));
	const policies = brief.policies && (scope === "turn" ? brief.policies
		: { resources: brief.policies.resources, responses: brief.policies.responses, combat: brief.policies.combat });
	return { objective: brief.objective, role: brief.role,
		...(policies ? { policies: examples === "inline" ? policies : Object.fromEntries(Object.entries(policies).map(([family, policy]) =>
			[family, { ...policy, example: { lookup: "policyExample", family } }])) }
			: { route: brief.route, recovery: brief.recovery, matchup: brief.matchup, traps: brief.traps }), gaps: brief.gaps,
		cards: Object.fromEntries(Object.entries(brief.cards ?? {}).filter(([name]) => visible.has(name))),
	};
}

/** Lossless access to saved illustrations; no example describes the current board. */
export function policyExamples(brief: Brief | undefined): Lookup[] {
	const policies = brief?.policies;
	if (!policies) return [];
	return [{ name: "policyExample",
		description: "Read a saved pregame worked example by policy family, including its position, line and exception. It illustrates a policy; it does not describe the current position or certify a current line.",
		parameters: { type: "object", additionalProperties: false, required: ["family"], properties: { family: { type: "string", enum: Object.keys(policies) } } },
		answer(args) {
			const family = String(args.family);
			return Object.hasOwn(policies, family) ? JSON.stringify(policies[family as keyof Playbook].example) : "Choose a listed policy family.";
		},
	}];
}
