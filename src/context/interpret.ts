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
	"Each returned procedure names its requested use by the zero-based use index. Write use plus instructions and any claim, speed, cost, if, limit, targets or words it needs. Source, basis, timing and face are copied from that identified use; do not repeat those fields. Several variants can name the same use, but every requested use needs a procedure. Normal casts retain their accepted zones; the table still requires permission to play from the current zone.",
	"A permanent spell's trigger targets belong to its standing registration, not its cast. Preserve scoped bindings, timing and delayed effects. Do not replace an instruction with a promise to handle it later.",
	"Tokens must carry their complete abilities. Use activated registrations with cost and effect for token or granted stack abilities. Loyalty symbols use signed cost.loyalty, including zero, not a generic counter payment or a separate per-ability limit. Printed starting loyalty and token spec.loyalty supply entry counters. Read loyalty.md for Empower's token, chosen recipient and counter sequence.",
	"Name another token creator with token.controller, such as controller:target:0 after destroying that target. perform.who only names who accepts an instruction group; it does not change the meaning of you or the default token creator. Read token-abilities.md for Get Lost's ordered destruction and Maps.",
	"Preserve the printed instruction order. Information such as controller:target:0, owner:target:0 and target power reads last known information after an earlier instruction moves that target. Do not reorder life changes ahead of an exile to retain its controller.",
	"When an instruction puts a permanent onto the battlefield with counters, put those counters in that move's counters field. A separate counters instruction after entry is a different event and does not represent entering with them.",
	"One or two targets use one slot with count 2 and atLeast 1. target:0 names all chosen members of slot zero. Apply one printed instruction to the entire slot in one operation; do not split simultaneous damage or movement into separate instructions or target slots.",
	"Private inspection uses look, then selection within its bound window. Library arrangement uses order. Never move cards to a public zone as a substitute for looking at them, and never replace a required count with upTo. If an operation is missing, report unsupported instead of approximating it.",
	"Hand selections must name whose hand. A selection only binds objects when it has as; move the same bound name afterward. For an optional creature discard followed by two cards otherwise, bind the optional selection, condition the two-card branch on its absence, bind that branch separately, and discard its own binding. Read native-casting.md for the worked Winternight Stories branches and Harmonize payment.",
	"A library search must name its owner or controller, or a bound inspected subset. Optional searches use perform with who and may around the entire choose, move, shuffle sequence. Declining that group does not shuffle; accepting the search and finding no matching card still shuffles. Read optional-search.md. Do not use the selected-card binding to decide whether the player searched.",
	"Searching a hidden library for a stated quality permits finding none: use upTo even when the search itself is mandatory. After moving some looked-at cards away, order only members of that bound window still in the library, using every with zones [library] and is bound:<window>. Bindings follow cards that move; ordering the whole old binding can include other zones.",
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
	await writer.work(`interpret ${needed.card}`, { system: SYSTEM, user: JSON.stringify({ card: needed.card, printed, package: pack, needed: needed.uses.map((one, use) => ({ use, ...one })) }) }, {
		lookups: [exampleReference, ...lookups(universe, rules)], turns: 3,
		submit: {
			name: "submit", description: "Prepare these identified card uses without changing standing abilities. Acceptance does not establish rules legality.",
			parameters: { type: "object", properties: { procedures: { type: "array", items: { type: "object" } }, unsupported: { type: "array", items: { type: "string" } } }, required: ["procedures", "unsupported"], additionalProperties: false },
			check(args) {
				if (Object.keys(args).some((key) => !["procedures", "unsupported"].includes(key))) return "Submit only procedures and unsupported.";
				if (!Array.isArray(args.unsupported) || args.unsupported.some((one) => typeof one !== "string" || !one.trim())) return "unsupported is a list of quoted uses and missing operations, or [].";
				if (args.unsupported.length) { unsupported = args.unsupported as string[]; return null; }
				if (!Array.isArray(args.procedures)) return "procedures is a list of complete procedures.";
				const submitted: unknown[] = [], indexed = new Set<number>();
				for (const raw of args.procedures) {
					if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("use" in raw)) { submitted.push(raw); continue; }
					const { use, ...body } = raw as Record<string, unknown>;
					if (!Number.isInteger(use) || Number(use) < 0 || Number(use) >= needed.uses.length) return `use must be an index from 0 through ${needed.uses.length - 1}.`;
					if (Object.keys(body).some((key) => !["claim", "speed", "cost", "if", "limit", "targets", "instructions", "words"].includes(key)))
						return "An indexed procedure inherits source, basis, timing and face. Supply only its executable fields and optional claim.";
					indexed.add(Number(use)); submitted.push({ ...needed.uses[Number(use)], ...body });
				}
				if (needed.uses.length > 1 && !indexed.size) return "Name the use index on each procedure so separate requested modes cannot cover each other.";
				const done = new Set(needed.uses.map((one) => JSON.stringify(one)));
				const candidate = { ...pack, procedures: [...(pack.procedures ?? []), ...submitted],
					deferred: (pack.deferred ?? []).filter((one) => !done.has(JSON.stringify(one))) };
				const shape = problems(PackageSchema, candidate);
				if (shape.length) return shape.join("; ");
				const procedures = submitted as Procedure[], wrong = assessmentProblems(printed, candidate as Package);
				for (const [at, use] of needed.uses.entries()) for (const zone of use.source.zones!) {
					if (indexed.has(at)) continue;
					if (indexed.size) { wrong.push(`Requested use ${at} (${use.claim}) has no indexed procedure.`); break; }
					if (!procedures.some((one) => one.basis === use.basis && one.timing === use.timing && one.source.controller === use.source.controller
						&& one.face === use.face && one.source.face === use.source.face && one.source.tapped === use.source.tapped && one.source.zones?.includes(zone)))
						wrong.push(`${use.claim} needs a ${use.timing} procedure from ${zone} whose basis, timing, source.controller (${use.source.controller}) and source.tapped (${String(use.source.tapped)}) equal the requested use exactly.`);
				}
				if (procedures.some((one) => !needed.uses.some((use) => one.basis === use.basis && one.face === use.face && one.timing === use.timing))) wrong.push("Prepare only the requested uses; no unrelated procedures.");
				if (wrong.length) return wrong.join("; ");
				accepted = structuredClone(candidate as Package); return null;
			},
		},
	}, ASSESSMENT_CEILING);
	if (!accepted) throw new Error(`${needed.card} still needs preparation: ${unsupported.join("; ") || "no accepted procedures"}`);
	return accepted;
}
