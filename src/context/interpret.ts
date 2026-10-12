/** Prepare an identified use when its source becomes available. Standing abilities stay accepted. */
import type { Frame } from "../core/types.ts";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { PackageSchema, ProcedureSchema, problems, type Package, type Procedure } from "../core/language.ts";
import { assessmentProblems } from "../core/assessment.ts";
import type { Reasoner } from "./reason.ts";
import { lookups } from "./brief.ts";
import { exampleIndex, exampleReference, registrationProblems, syntaxReference } from "./strategy.ts";
import { ASSESSMENT_CEILING } from "./spend.ts";

const SYSTEM = [
	"Physical turn history counts descended, entered-face-down and turned-face-up for by you or another side. Descent counts permanent cards reaching that player's graveyard from anywhere, even before this source entered or after those cards leave; tokens and nonpermanent cards do not count. Face-down entry and face-up special actions use the event-time controller without exposing the hidden identity. Read physical-history.md. These counts do not provide arbitrary past-characteristic queries or new face-up operations.",
	"A whole-library choose with an explicit owner starts a recorded search and privately shows all cards, even when it finds none. A bound inspected window is selection, not search. Watches use on keyword, keyword search, by for the searcher and whose for the library owner; whose event:player means their own library. Optional searches wrap choose, move and shuffle in perform with who and may. Read library-searches.md. Partial-library search replacements and simultaneous searches by multiple players remain unsupported.",
	"Prepare the identified uses of one Magic card. This is rules interpretation, not a strategic plan or a physical action.",
	"Read the full printed text, existing accepted equipment and requested uses. Return procedures for every requested use, including its modes, costs, targets, restrictions, instructions and durations. Do not change standing registrations or previously accepted procedures.",
	"Each returned procedure names its requested use by the zero-based use index. Write use plus instructions and any claim, speed, cost, if, limit, targets or words it needs. Source, basis, timing and face are copied from that identified use; do not repeat those fields. Several variants can name the same use, but every requested use needs a procedure. Normal casts retain their accepted zones; the table still requires permission to play from the current zone.",
	"A permanent spell's trigger targets belong to its standing registration, not its cast. Preserve scoped bindings, timing and delayed effects. Do not replace an instruction with a promise to handle it later.",
	"Separate additional mana from an alternative price. A kicked spell uses cost.additional with a distinct name and mana, such as [{name:kicker,mana:{4}}], while cost.mana states a base or alternative price. Named additional costs survive permission prices and apply before reductions; cast.paid reads the chosen instance after casting or permanent resolution. Read named-costs.md. This does not support nonmana costs inside additional or copying a spell's payment choices.",
	"Scry and surveil use keyword with name, who and count; completion is recorded after private choices and ordering. A plain look/move sequence cannot report the keyword event, and surveil is not mill. Read library-keywords.md. Simultaneous multi-player keyword choices remain unsupported.",
	"Rule-defined token abilities may quote their keyword rule's token text, such as 701.71a for Empower Jace. The creator's procedure quotes the card instruction granting that keyword; nested token text does not need to appear on that same card. This establishes attribution, not correctness.",
	"Tokens must carry their complete abilities. Use activated registrations with cost and effect for token or granted stack abilities. Loyalty symbols use signed cost.loyalty, including zero, not a generic counter payment or a separate per-ability limit. Printed starting loyalty and token spec.loyalty supply entry counters. Read loyalty.md for Empower's token, chosen recipient and counter sequence.",
	"Name another token creator with token.controller, such as controller:target:0 after destroying that target. perform.who only names who accepts an instruction group; it does not change the meaning of you or the default token creator. Read token-abilities.md for Get Lost's ordered destruction and Maps.",
	"Preserve the printed instruction order. Information such as controller:target:0, owner:target:0 and target power reads last known information after an earlier instruction moves that target. Do not reorder life changes ahead of an exile to retain its controller.",
	"A printed condition governing several instructions belongs on one perform group. Do not test cast history again after the spell changes zones: that new incarnation was not cast. Bind a moved card with move.as and use that bound reference for its next move. Read conditional-groups.md for Esper Origins. A binding follows this procedure's moves; it does not grant permission to follow an unrelated later incarnation.",
	"When an instruction puts a permanent onto the battlefield with counters, put those counters in that move's counters field. A separate counters instruction after entry is a different event and does not represent entering with them.",
	"Damage with as binds only recipients actually dealt positive damage, plus the total dealt after prevention. A later effect on a permanent dealt damage by this spell must use that binding, not the original target. Read damage.md for Torch the Tower. This binding does not implement damage redirection or bounded prevention shields.",
	"Returning a controlled permanent as payment uses cost.return, not a resolving move. blocked:false selects an unblocked attacker after blockers are declared; combine turn:self and step:declare-blockers conditions for sneak. Prepare ordinary and alternative casts separately, with their own instructions. Read return-payments.md for The Last Ronin's Technique and its tokens' chosen defenders; permanent-spell sneak entry retaining the returned attacker's defender remains unsupported.",
	"One or two targets use one slot with count 2 and atLeast 1. target:0 names all chosen members of slot zero. Apply one printed instruction to the entire slot in one operation; do not split simultaneous damage or movement into separate instructions or target slots.",
	"Any number of targets uses count any. An announced division uses divide Amount on that target slot, then a damage or counters instruction with amount {divided: slotIndex}. The seat assigns a positive share to every target before paying; zero total requires no targets. Do not replace an announced division with choices during resolution.",
	"To grant each affected card's owner its casting permission, use permit with who owner. Move the group together and bind its new incarnations first; owner:bound with several owners cannot pair each card with its own owner. Read casting-permissions.md. This permission grants neither flash nor a private look.",
	"A target slot's object and player fields offer alternatives. Omit player for a creature-only target. Token words use the exact supported terms in SYNTAX, such as can't block; a quoted sentence like This token can't block. is only a recorded word and enforces no restriction. Include printed token subtypes such as Treasure. Schema acceptance alone does not check these meanings.",
	"Nonland requires not.types:[land]. Listing the other permanent types still includes a land creature or artifact land. Keep every printed exclusion as an explicit selector restriction.",
	"A counter instruction that exiles a countered spell instead uses counter.to: exile, with unless for any payment. Do not counter into the graveyard and move it afterward. counter with as binds the old stack objects actually countered, not their later incarnations; source:bound:name reads an ability's source. Read counter-destinations.md and ability-counter.md. This records a chosen operation, not a legality ruling.",
	"Creating a token copy uses token with copy naming one source, instead of spec. It copies base terms and complete printed battlefield activations, not current power, counters or temporary granted abilities. Read token-copies.md for supported source shapes and Spree combinations. Entry copies use enters.copy with a targetless public battlefield or graveyard choice, additive or fixed exceptions, and a linked whenCopied trigger. Read entry-copies.md. Making an existing battlefield object become a copy and general spell copying remain unsupported; do not substitute modify or a guessed token.",
	"Private inspection uses look, then selection within its bound window. Library arrangement uses order. Never move cards to a public zone as a substitute for looking at them, and never replace a required count with upTo. If an operation is missing, report unsupported instead of approximating it.",
	"Face-down exile uses move with faceDown true after any instructed look. permit.while rechecks a live condition whenever the card is played; instruction.if checks only during resolution. Read face-down-exile.md for Flameshape, continuing private looks, and the unsupported captures in an ongoing condition. A play permission alone grants no look.",
	"Hand selections must name whose hand. A selection only binds objects when it has as; move the same bound name afterward. For an optional creature discard followed by two cards otherwise, bind the optional selection, condition the two-card branch on its absence, bind that branch separately, and discard its own binding. Read native-casting.md for the worked Winternight Stories branches and Harmonize payment.",
	"A library search must name its owner or controller. A bound inspected subset is a selection after a look, not a search. Optional searches use perform with who and may around the entire choose, move, shuffle sequence. Declining that group does not shuffle; accepting the search and finding no matching card still shuffles. Read optional-search.md. Do not use the selected-card binding to decide whether the player searched.",
	"Searching a hidden library for a stated quality permits finding none: use upTo even when the search itself is mandatory. After moving some looked-at cards away, order only members of that bound window still in the library, using every with zones [library] and is bound:<window>. Bindings follow cards that move; ordering the whole old binding can include other zones.",
	"For each player's simultaneous library movement, use one move with what {top: amount, of: each-player} or {exceptBottom: amount, of: each-player}. exceptBottom retains that many cards at each library's bottom. each expands sequentially and cannot represent simultaneous movement. Read library-windows.md; these refs grant no private look.",
	"Use the example and rules tools when needed. If the syntax cannot express a requested use, report unsupported. A failure leaves the physical decision pending. Acceptance checks syntax and coverage; it does not certify that your interpretation follows the rules.",
	"Submit procedures and unsupported. No prose answer is read. Correct all named problems after a refusal.",
	syntaxReference(), exampleIndex,
	"The complete procedure schema is checked locally. The submit tool stays shallow to avoid recursive expansion by providers.",
	JSON.stringify(ProcedureSchema),
	"A token.copy instruction can replace copiable power/toughness with fixed integers in except. Read token-copies.md for offspring. Sources with continuous base-setting abilities remain unsupported for this exception; a later modify instruction is not a copy exception.",
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
				const procedures = submitted as Procedure[], wrong = [...assessmentProblems(printed, candidate as Package), ...registrationProblems([candidate as Package])];
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
