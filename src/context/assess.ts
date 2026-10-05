/** Model-authored standing terms and an inventory of uses, prepared before dealing. */
import type { Universe } from "../core/cards.ts";
import type { Printed } from "../core/printed.ts";
import type { Rules } from "../core/rules.ts";
import { PackageSchema, problems, type Package } from "../core/language.ts";
import { assessmentProblems } from "../core/assessment.ts";
import { lookups } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import { exampleIndex, exampleReference, registrationProblems, syntaxReference } from "./strategy.ts";
import { ASSESSMENT_CEILING } from "./spend.ts";

const SYSTEM = [
	"Assess one registered Magic card before play. Prepare its standing behavior and identify every use. This is card interpretation, not a strategic line. Complete executable programs for all casts and activations are not required.",
	"Use the supplied printed fields and full Oracle text. Account for every ability, including flying and other keywords, entry counters, mana, triggers, static effects, replacements and play permissions.",
	"registers describes ongoing abilities and entry behavior. A keyword such as flying is a continuous registration affecting this object with change.words. The table does not infer any keyword from card prose.",
	"Use printedCast: true for an ordinary permanent cast: no targets, no X or unusual mana symbols, no additional costs, casting restrictions, spell properties or extra instructions. This selects the shared casting mechanic at the printed cost. Do not also write an ordinary casting procedure. Its registrations still supply the permanent's abilities on entry. Ordinary land plays need no procedure.",
	"procedures describes spell effects, alternative costs, nonmana activations and casts that need more than the shared printed cast. Use the exact card name in source.card; never use game object ids. For normal casts, use zones hand, graveyard and exile with controller any: the table checks ownership and earned play permissions. Alternative costs may restrict their source zones. Each mode or optional cost can have its own procedure.",
	"For a normal casting procedure, omit cost.mana: the printed cost is read from the card. Put spell properties such as can't be countered in procedure.words. A triggered ability's targets belong in its registration, not the casting procedure. Source coverage does not prove that printedCast is a correct assessment.",
	"A nonmana activated ability is a procedure with timing stack and source zones battlefield, controller self. It needs no registration kind. Its cost and instructions supply the ability. Mana abilities can register as mana.",
	"When preparation is standing, prefer identifying spell effects, alternative costs and nonmana activated abilities in deferred rather than writing their procedures now. Each entry has claim, the full exact basis, source with card, zones and controller, and timing spell or stack. A later interpreter prepares them when a visible source enters that scope. For a normal spell use hand, graveyard and exile with controller any; the engine checks earned zone permissions. Narrow the source only when the ability requires it. When preparation is complete, write all procedures now: this seat has no runtime interpreter.",
	"Never defer standing behavior: keywords, static restrictions, replacements, entry behavior, mana abilities, triggers and granted permissions must have registrations before play. A delayed effect created by casting or activating belongs to that use's later procedure. A deferred use is an explicit unfinished obligation, not permission to ignore the ability or assume its cost or effect.",
	"Selectors without zones select the battlefield. State zones explicitly in spendOnly: mana for casting creature spells tests zones [\"stack\"], not battlefield; mana restricted to activating a permanent's abilities tests its battlefield source. Cast watches and cast history likewise need stack selectors. Preserve the printed restriction rather than broadening the mana to fix an empty match.",
	"Quote the complete source ability in each basis, including its conditions and restrictions. Each source paragraph must be covered by a registration, procedure or identified deferred use. Several terms may quote the same paragraph. A normal permanent cast does not cover any ability by itself. Do not use the card name or your claim as a source quote. Join separated quotations with literal ' ... ', rather than inventing a contiguous quotation.",
	"Do not simplify an effect to fit. Before declaring an ability unsupported, read the relevant worked examples from the index below. Fetch several relevant examples in one reply if needed. They cover composed effects such as earthbend, behold, warp, search and linked exile. If an operation is still missing, put the quoted text and that operation in unsupported. An incomplete assessment stops setup. Empty registers or procedures are fine when the card needs none of that kind.",
	"Acceptance checks structured syntax and source coverage. It does not prove that your interpretation follows the rules. Check timing, intervening conditions, targets, durations, payment restrictions and references. Look up a rule when needed.",
	"Call submit with registers, procedures and unsupported, plus deferred for uses prepared later and printedCast: true when the shared ordinary cast applies. No text answer is read. Correct all named problems together after a refusal.",
	syntaxReference(),
	exampleIndex,
	"The complete package schema is checked locally; the tool uses a shallow schema to avoid recursive expansion by providers.",
	JSON.stringify(PackageSchema),
].join("\n\n");

export async function assessCard(card: string, printed: Printed, writer: Pick<Reasoner, "work">, universe: Universe, rules?: Rules, preparation: "standing" | "complete" = "standing"): Promise<Package> {
	let accepted: Package | undefined;
	let unsupported: string[] = [];
	await writer.work(`assess ${card}`, { system: SYSTEM, user: JSON.stringify({ card, ...printed, preparation }) }, {
		lookups: [exampleReference, ...lookups(universe, rules)], turns: 3,
		submit: {
			name: "submit", description: "Submit standing terms and a complete inventory of prepared or deferred uses, or name unsupported text. Acceptance is not a rules ruling.",
			parameters: { type: "object", properties: {
				registers: { type: "array", items: { type: "object" } }, procedures: { type: "array", items: { type: "object" } }, unsupported: { type: "array", items: { type: "string" } },
				printedCast: { type: "boolean" },
				deferred: { type: "array", items: { type: "object" } },
			}, required: ["registers", "procedures", "unsupported"], additionalProperties: false },
			check(args) {
				if (Object.keys(args).some((key) => !["registers", "procedures", "unsupported", "printedCast", "deferred"].includes(key))) return "Submit only registers, procedures, unsupported, printedCast and deferred.";
				if (!Array.isArray(args.unsupported) || args.unsupported.some((one) => typeof one !== "string" || !one.trim())) return "unsupported is a list of quoted abilities and missing operations, or [].";
				if (args.unsupported.length) { unsupported = args.unsupported as string[]; return null; }
				const pack = { card, registers: args.registers, procedures: args.procedures, assessed: true,
					...(args.printedCast === undefined ? {} : { printedCast: args.printedCast }),
					...(args.deferred === undefined ? {} : { deferred: args.deferred }) };
				const shape = problems(PackageSchema, pack);
				if (shape.length) return shape.join("; ");
				const checked = pack as Package;
				if (preparation === "complete" && checked.deferred?.length) return "This seat has no runtime interpreter. Prepare all identified uses now.";
				const wrong = [...assessmentProblems(printed, checked), ...registrationProblems([checked])];
				if (wrong.length) return wrong.join("; ");
				accepted = structuredClone(checked); return null;
			},
		},
	}, ASSESSMENT_CEILING);
	if (!accepted) throw new Error(`${card} is not ready: ${unsupported.join("; ") || "no accepted assessment"}`);
	return accepted;
}
