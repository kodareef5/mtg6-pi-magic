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
	"When faces is present, every registration, procedure and deferred use names face 0 or 1 and quotes that face alone. Use source.face on battlefield activations so they require the active face or unlocked Room door. Spell face selects the characteristics and printed cost used to cast. printedCast selects face 0; printedFaces lists additional ordinary permanent faces. A transforming back face cannot be cast merely because it has a face number. Adventure exile, Omen shuffling, paid Room unlocks, ordinary Saga lore and final sacrifice, and Prepare's copy lifetime are shared mechanics. Read faces.md for their contract before adding card instructions that would duplicate them.",
	"registers describes ongoing abilities and entry behavior. A keyword such as flying is a continuous registration affecting this object with change.words. Include explicit affects.zones when that characteristic exists outside the battlefield, including stack for a creature spell's printed flying. Face-scoped terms belong only to that face; a battlefield-only conditional grant does not become a spell keyword. The table does not infer any keyword from card prose. Read cast-facts.md for the proposed-spell reading.",
	"A restriction sentence placed in change.words does not execute that restriction. Use prohibit for supported casting or activation bans; its activate selector names sources, and exceptMana preserves mana abilities only when the source grants that exception. Refuse unsupported restrictions instead of recording inert prose as a keyword.",
	"A battlefield ability that reduces matching spells by a fixed amount of generic mana uses a cost registration: cast selects the proposed stack spell, reduce is a positive integer, from optionally names its original zones, and if tests the source's condition. Read spell-costs.md for first-spell history and zone filters. This does not support plotting or activation cost reductions, colored reductions or increases; refuse those gaps instead of widening the spell rule.",
	"Use printedCast: true for an ordinary permanent cast: no targets, no X or unusual mana symbols, no additional costs, casting restrictions, spell properties or extra instructions. This selects the shared casting mechanic at the printed cost. Do not also write an ordinary casting procedure. Its registrations still supply the permanent's abilities on entry. Ordinary land plays need no procedure.",
	"procedures describes spell effects, alternative costs, nonmana activations and casts that need more than the shared printed cast. Use the exact card name in source.card; never use game object ids. For normal casts, use zones hand, graveyard and exile with controller any: the table checks ownership and earned play permissions. Alternative costs may restrict their source zones. Each mode or optional cost can have its own procedure.",
	"For a normal casting procedure, omit cost.mana: the printed cost is read from the card. Put spell properties such as can't be countered in procedure.words. A triggered ability's targets belong in its registration, not the casting procedure. Source coverage does not prove that printedCast is a correct assessment.",
	"A printed nonmana activated ability is a procedure with timing stack and source zones battlefield, controller self; it can remain deferred. Tokens and granted abilities carry complete activated registrations with cost and effect. Loyalty symbols use signed cost.loyalty; the shared timing and once-per-permanent allowance are automatic. Printed starting loyalty and token spec.loyalty supply entry counters. Mana abilities register as mana.",
	"When preparation is standing, prefer identifying spell effects, alternative costs and nonmana activated abilities in deferred rather than writing their procedures now. Each entry has claim, the full exact basis, source with card, zones and controller, and timing spell or stack. A later interpreter prepares them when a visible source enters that scope. For a normal spell use hand, graveyard and exile with controller any; the engine checks earned zone permissions. Narrow the source only when the ability requires it. When preparation is complete, write all procedures now: this seat has no runtime interpreter.",
	"Never defer standing behavior: keywords, static restrictions, replacements, entry behavior, mana abilities, triggers and granted permissions must have registrations before play. A delayed effect created by casting or activating belongs to that use's later procedure. A deferred use is an explicit unfinished obligation, not permission to ignore the ability or assume its cost or effect.",
	"A card that grants its owner a native alternative cast from another zone needs permit.cast with from, mana and any leavesStack replacement. Listing a graveyard use alone grants no permission and cannot trigger its readiness. Harmonize uses this standing permission plus an identified use whose later procedure supplies the optional tap and power reduction. Read native-casting.md. This registration cannot express conditional permissions or mandatory nonmana permission costs: report those unsupported. A condition on one deferred variant cannot restrict the other normal casts that would also receive an unconditional permission.",
	"Selectors without zones select the battlefield. State zones explicitly in spendOnly: mana for casting creature spells tests zones [\"stack\"], not battlefield; mana restricted to activating a permanent's abilities tests its battlefield source. Cast watches and cast history likewise need stack selectors. Preserve the printed restriction rather than broadening the mana to fix an empty match.",
	"Quote the complete source ability in each basis, including its conditions and restrictions. Each source paragraph must be covered by a registration, procedure or identified deferred use. Several terms may quote the same paragraph. A normal permanent cast does not cover any ability by itself. Do not use the card name or your claim as a source quote. Join separated quotations with literal ' ... ' in printed order. Each part must contain complete sentences or printed lines, not word fragments.",
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
				printedCast: { type: "boolean" }, printedFaces: { type: "array", items: { type: "integer", enum: [0, 1] } },
				deferred: { type: "array", items: { type: "object" } },
			}, required: ["registers", "procedures", "unsupported"], additionalProperties: false },
			check(args) {
				if (Object.keys(args).some((key) => !["registers", "procedures", "unsupported", "printedCast", "printedFaces", "deferred"].includes(key))) return "Submit only registers, procedures, unsupported, printedCast, printedFaces and deferred.";
				if (!Array.isArray(args.unsupported) || args.unsupported.some((one) => typeof one !== "string" || !one.trim())) return "unsupported is a list of quoted abilities and missing operations, or [].";
				if (args.unsupported.length) { unsupported = args.unsupported as string[]; return null; }
				const pack = { card, registers: args.registers, procedures: args.procedures, assessed: true,
					...(args.printedCast === undefined ? {} : { printedCast: args.printedCast }),
					...(args.printedFaces === undefined ? {} : { printedFaces: args.printedFaces }),
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
