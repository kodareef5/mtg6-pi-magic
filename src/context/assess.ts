/** Model-authored card meaning, completed before the first gameplay decision. */
import type { Universe } from "../core/cards.ts";
import type { Printed } from "../core/printed.ts";
import type { Rules } from "../core/rules.ts";
import { PackageSchema, problems, type Package } from "../core/language.ts";
import { assessmentProblems } from "../core/assessment.ts";
import { lookups } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import { exampleReference, syntaxReference } from "./strategy.ts";
import { ASSESSMENT_CEILING } from "./spend.ts";

const SYSTEM = [
	"Assess one registered Magic card before play. Return its complete accepted meaning in the table's syntax, not a strategic line.",
	"Use the supplied printed fields and full Oracle text. Account for every ability, including flying and other keywords, entry counters, mana, triggers, static effects, replacements and play permissions.",
	"registers describes ongoing abilities and entry behavior. A keyword such as flying is a continuous registration affecting this object with change.words. The table does not infer any keyword from card prose.",
	"procedures describes every normal cast, alternative cast and nonmana activated ability. Include a casting procedure for every nonland card, even an ordinary permanent. Use the exact card name in source.card; never use game object ids. For normal casts, use zones hand, graveyard and exile with controller any: the table checks ownership and earned play permissions. Alternative costs may restrict their source zones. Each mode or optional cost can have its own procedure.",
	"For a normal cast, omit cost.mana: the printed cost is read from the card. A non-Aura permanent's normal casting procedure has no instructions or targets; its package supplies its abilities as it enters. Put spell properties such as can't be countered in procedure.words. A triggered ability's targets belong in its registration. Ordinary land plays need no procedure.",
	"Quote the complete source ability in each basis, including its conditions and restrictions. Each source paragraph must be covered by at least one registration or procedure. Several terms may quote the same paragraph.",
	"Do not simplify an effect to fit. If the syntax cannot represent an ability, put its quoted text and the missing operation in unsupported. An incomplete assessment stops setup. Empty registers or procedures are fine when the card needs none of that kind.",
	"Acceptance checks structured syntax and source coverage. It does not prove that your interpretation follows the rules. Check timing, intervening conditions, targets, durations, payment restrictions and references. Look up a rule when needed.",
	"Call submit with registers, procedures and unsupported. No text answer is read. Correct all named problems together after a refusal.",
	syntaxReference(),
	"The complete package schema is checked locally; the tool uses a shallow schema to avoid recursive expansion by providers.",
	JSON.stringify(PackageSchema),
].join("\n\n");

export async function assessCard(card: string, printed: Printed, writer: Pick<Reasoner, "work">, universe: Universe, rules?: Rules): Promise<Package> {
	let accepted: Package | undefined;
	let unsupported: string[] = [];
	await writer.work(`assess ${card}`, { system: SYSTEM, user: JSON.stringify({ card, ...printed }) }, {
		lookups: [exampleReference, ...lookups(universe, rules)], turns: 3,
		submit: {
			name: "submit", description: "Submit this card's complete registrations and procedures, or name unsupported text. Acceptance is not a rules ruling.",
			parameters: { type: "object", properties: {
				registers: { type: "array", items: { type: "object" } }, procedures: { type: "array", items: { type: "object" } }, unsupported: { type: "array", items: { type: "string" } },
			}, required: ["registers", "procedures", "unsupported"], additionalProperties: false },
			check(args) {
				if (Object.keys(args).some((key) => !["registers", "procedures", "unsupported"].includes(key))) return "Submit only registers, procedures and unsupported.";
				if (!Array.isArray(args.unsupported) || args.unsupported.some((one) => typeof one !== "string" || !one.trim())) return "unsupported is a list of quoted abilities and missing operations, or [].";
				if (args.unsupported.length) { unsupported = args.unsupported as string[]; return null; }
				const pack = { card, registers: args.registers, procedures: args.procedures, assessed: true };
				const shape = problems(PackageSchema, pack);
				if (shape.length) return shape.join("; ");
				const checked = pack as Package;
				const wrong = assessmentProblems(printed, checked);
				if (wrong.length) return wrong.join("; ");
				accepted = structuredClone(checked); return null;
			},
		},
	}, ASSESSMENT_CEILING);
	if (!accepted) throw new Error(`${card} is not ready: ${unsupported.join("; ") || "no accepted assessment"}`);
	return accepted;
}
