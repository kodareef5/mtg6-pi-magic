/** Prepare an identified use when its source becomes available. Standing abilities stay accepted. */
import type { Frame } from "../core/types.ts";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { PackageSchema, ProcedureSchema, problems, type Package, type Procedure } from "../core/language.ts";
import { assessmentProblems } from "../core/assessment.ts";
import type { Reasoner } from "./reason.ts";
import { lookups } from "./brief.ts";
import { exampleIndex, exampleReference, syntaxReference } from "./strategy.ts";
import { ASSESSMENT_CEILING } from "./spend.ts";

const SYSTEM = [
	"Prepare the identified uses of one Magic card. This is rules interpretation, not a strategic plan or a physical action.",
	"Read the full printed text, existing accepted equipment and requested uses. Return procedures for every requested use, including its modes, costs, targets, restrictions, instructions and durations. Do not change standing registrations or previously accepted procedures.",
	"Keep each requested basis exactly. Each procedure names this card without object ids. Cover every requested source zone. Normal casts use hand, graveyard and exile; the table still requires permission to play the card from its current zone. Alternative costs can have narrower scopes when the request says so.",
	"A permanent spell's trigger targets belong to its standing registration, not its cast. Preserve scoped bindings, timing and delayed effects. Do not replace an instruction with a promise to handle it later.",
	"Use the example and rules tools when needed. If the syntax cannot express a requested use, report unsupported. A failure leaves the physical decision pending. Acceptance checks syntax and coverage; it does not certify that your interpretation follows the rules.",
	"Submit procedures and unsupported. No prose answer is read. Correct all named problems after a refusal.",
	syntaxReference(), exampleIndex,
	"The complete procedure schema is checked locally. The submit tool stays shallow to avoid recursive expansion by providers.",
	JSON.stringify(ProcedureSchema),
].join("\n\n");

export async function interpret(frame: Frame, writer: Pick<Reasoner, "work">, universe: Universe, rules?: Rules): Promise<Package> {
	const needed = frame.decision?.preparation?.[0];
	if (!needed) throw new Error("No known use needs preparation in this decision.");
	const pack = frame.view.work?.packages?.find((one) => one.card === needed.card), printed = frame.view.printed?.[needed.card];
	if (!pack || !printed) throw new Error(`${needed.card} has no accepted assessment in this seat's view.`);
	let accepted: Package | undefined, unsupported: string[] = [];
	await writer.work(`interpret ${needed.card}`, { system: SYSTEM, user: JSON.stringify({ card: needed.card, printed, package: pack, needed: needed.uses }) }, {
		lookups: [exampleReference, ...lookups(universe, rules)], turns: 3,
		submit: {
			name: "submit", description: "Prepare these identified card uses without changing standing abilities. Acceptance does not establish rules legality.",
			parameters: { type: "object", properties: { procedures: { type: "array", items: { type: "object" } }, unsupported: { type: "array", items: { type: "string" } } }, required: ["procedures", "unsupported"], additionalProperties: false },
			check(args) {
				if (Object.keys(args).some((key) => !["procedures", "unsupported"].includes(key))) return "Submit only procedures and unsupported.";
				if (!Array.isArray(args.unsupported) || args.unsupported.some((one) => typeof one !== "string" || !one.trim())) return "unsupported is a list of quoted uses and missing operations, or [].";
				if (args.unsupported.length) { unsupported = args.unsupported as string[]; return null; }
				if (!Array.isArray(args.procedures)) return "procedures is a list of complete procedures.";
				const done = new Set(needed.uses.map((one) => JSON.stringify(one)));
				const candidate = { ...pack, procedures: [...(pack.procedures ?? []), ...args.procedures],
					deferred: (pack.deferred ?? []).filter((one) => !done.has(JSON.stringify(one))) };
				const shape = problems(PackageSchema, candidate);
				if (shape.length) return shape.join("; ");
				const procedures = args.procedures as Procedure[], wrong = assessmentProblems(printed, candidate as Package);
				for (const use of needed.uses) for (const zone of use.source.zones!) {
					if (!procedures.some((one) => one.basis === use.basis && one.timing === use.timing && one.source.controller === use.source.controller
						&& one.source.tapped === use.source.tapped && one.source.zones?.includes(zone)))
						wrong.push(`${use.claim} needs a ${use.timing} procedure from ${zone} whose basis, timing, source.controller (${use.source.controller}) and source.tapped (${String(use.source.tapped)}) equal the requested use exactly.`);
				}
				if (procedures.some((one) => !needed.uses.some((use) => one.basis === use.basis && one.timing === use.timing))) wrong.push("Prepare only the requested uses; no unrelated procedures.");
				if (wrong.length) return wrong.join("; ");
				accepted = structuredClone(candidate as Package); return null;
			},
		},
	}, ASSESSMENT_CEILING);
	if (!accepted) throw new Error(`${needed.card} still needs preparation: ${unsupported.join("; ") || "no accepted procedures"}`);
	return accepted;
}
