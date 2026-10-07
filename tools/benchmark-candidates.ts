/** Shared candidate experiment. Registration, receipts and explicit selection share one protocol.
 * Past 150 lines to keep the checked proposal and its instruction compiler together. */
import { createHash } from "node:crypto";
import { Type, type Static } from "typebox";
import { PlanSchema, problems, type Plan, type PlanOption } from "../src/core/language.ts";
import type { Frame } from "../src/core/types.ts";
import type { Reasoner, Lookup } from "../src/context/reason.ts";
import { actions, basePlan, equipment, submissionFields } from "../src/context/plan-edit.ts";
import { facts, type Context } from "../src/context/strategy-facts.ts";
import { actionFacts } from "../src/context/strategy-actions.ts";
import { planProblems } from "../src/core/work-tools.ts";
import { select } from "../src/core/query.ts";
import { STEPS, type Step } from "../src/core/steps.ts";
import { commitmentReceipt } from "./benchmark-receipt.ts";

const WINDOWS = ["precombat-main", "declare-attackers", "postcombat-main"] as const;
const finish = Type.String({ enum: ["pass", "ask", "unspecified"] });
const selection = Type.Object({ action: Type.String(), choices: Type.String({ description: "Explicit target, payment and resolution choices for this action, or empty when none are needed. No strategic rationale." }) }, { additionalProperties: false });
const schema = Type.Object({
	reason: Type.String({ description: "Why this line is useful, including damage, blocks and the alternative rejected. Audit only; the pilot never reads this field." }),
	beforeCombat: Type.Array(selection), attackers: Type.Array(Type.String(), { uniqueItems: true }), afterCombat: Type.Array(selection),
	completion: Type.Object({ beforeCombat: finish, attackers: finish, afterCombat: finish }, { additionalProperties: false }),
	responses: Type.String({ description: "Own-turn response policy, including when to pass priority while the stack resolves." }),
	triggers: Type.String({ description: "Own-turn trigger ordering and target choices; use current facts for conditional triggers." }),
	exceptions: Type.String({ description: "When the pilot should ask for help because the intended line no longer applies." }),
	holds: submissionFields.holds,
}, { additionalProperties: false });
type Candidate = Static<typeof schema>;

/** No historical declaration labels, duplicate attack representation or current-source filter. */
export function candidateCatalog(frame: Frame) {
	const all = actions(frame), seen = new Set<string>();
	const available = Object.fromEntries(Object.entries(all).filter(([key, one]) => {
		if (key.startsWith("worked:") || key.startsWith("step:") || key.startsWith("may:")) return false;
		if (!("procedure" in one.action) && one.action.prefix !== "land:") return false;
		const identity = JSON.stringify(one.action);
		if (seen.has(identity)) return false;
		seen.add(identity); return true;
	}));
	// Future permissions can make a visible land playable. Retain its selector
	// even when the current position does not yet allow that zone.
	for (const one of frame.view.objects ?? []) if (one.controller === frame.seat && one.card && one.traits?.types.includes("land") && ["hand", "graveyard", "exile"].includes(one.zone)) {
		available[`land ${one.card} from ${one.zone}`] ??= { label: `Play ${one.card} from ${one.zone}`,
			action: { prefix: "land:", objects: { zones: [one.zone], card: one.card } } };
	}
	// Casts bind a particular visible card; later attacks can name that card
	// across its zone changes without guessing a future incarnation.
	for (const [key, item] of Object.entries(available)) if ("procedure" in item.action && item.action.procedure.timing === "spell") {
		const procedure = item.action.procedure, bound = select(procedure.source, frame);
		if (!bound.length) continue;
		delete available[key];
		for (const source of bound) available[`${key} (${source.id}@${source.incarnation})`] = { ...item,
			action: { procedure: { ...procedure, source: { ...procedure.source, refs: [{ id: source.id, incarnation: source.incarnation }] } } } };
	}
	const attackers = Object.fromEntries((frame.view.objects ?? []).filter((one) => one.controller === frame.seat && one.traits?.types.includes("creature") &&
		["battlefield", "hand", "graveyard", "exile", "stack"].includes(one.zone)).map((one) => {
		return [`${one.card ?? one.token?.name} (${one.id}@${one.incarnation}, ${one.zone})`, { label: `Attack with ${one.card ?? one.token?.name}`,
			action: { prefix: "attack:", objects: { zones: ["battlefield"], controller: "self", ...(one.card ? { card: one.card } : {}),
				...(one.zone === "battlefield" ? { refs: [{ id: one.id, incarnation: one.incarnation }] } : { ids: [one.id] }) } } as PlanOption["action"],
			currentZone: one.zone, scope: one.zone === "battlefield" ? "Current creature; check tapped state and sickness." : "Intended future creature after ordinary cast and resolution; no attack eligibility is promised." }];
	}));
	return { available, attackers };
}

/** Only own main/combat windows change. Other policies retain ordinary production behavior. */
export function compileCandidate(frame: Frame, candidate: Candidate, catalog = candidateCatalog(frame)): Plan {
	const at = frame.view.window;
	if (at.kind !== "turn" || at.active !== frame.seat) throw new Error("Candidate execution needs the seat's current turn.");
	const base = basePlan(frame), when = (step: typeof WINDOWS[number]) => ({ active: "self" as const, step, fromTurn: at.turn, throughTurn: at.turn });
	const steps: PlanOption[] = [];
	const add = (key: string, choices: string, step: typeof WINDOWS[number], attack = false) => {
		const item = attack ? catalog.attackers[key] : catalog.available[key];
		if (!item) throw new Error(`Unknown ${attack ? "attacker" : "main action"}: ${key}.`);
		steps.push({ label: item.label, when: when(step), essential: true, action: structuredClone(item.action), ...(choices ? { purpose: choices } : {}) });
	};
	for (const one of candidate.beforeCombat) add(one.action, one.choices, WINDOWS[0]);
	for (const key of candidate.attackers) add(key, "", WINDOWS[1], true);
	for (const one of candidate.afterCombat) add(one.action, one.choices, WINDOWS[2]);
	const outside = <T extends { when?: PlanOption["when"] }>(one: T): T[] => {
		const window = one.when ?? {};
		if (window.active === "opponent") return [one];
		const opponents = window.active === "self" || window.fromTurn === window.throughTurn && window.fromTurn !== undefined && (window.fromTurn - at.turn) % 2 === 0
			? [] : [{ ...one, when: { ...window, active: "opponent" as const } }];
		return [...opponents, ...Object.entries(STEPS).filter(([step, info]) => !WINDOWS.includes(step as typeof WINDOWS[number]) &&
			(!window.step || window.step === step) && (!window.phase || window.phase === info.phase))
			.map(([step]) => ({ ...one, when: { ...window, active: "self" as const, step: step as Step } }))];
	};
	const outsideAction = (one: PlanOption) => one.when.active === "opponent" || !!one.when.step && !WINDOWS.includes(one.when.step as typeof WINDOWS[number]);
	const phases = WINDOWS.map((step, index) => {
		const completion = candidate.completion[(["beforeCombat", "attackers", "afterCombat"] as const)[index]!];
		return { when: when(step), guidance: [
			index === 1 ? "Declare the selected attackers as one set; their listing order does not rank them." : "Execute the selected steps in order. Wait for pending stack work before a step that requires it empty.",
			completion === "pass" ? `After every selected step is recorded complete, ${index === 1 ? "finish the attacker declaration" : "pass to the next phase"}.` : completion === "ask" ? "After these steps, ask for help before ending this window." : "No completion policy was supplied. An empty or finished list grants no permission to pass.",
			candidate.responses, candidate.triggers, candidate.exceptions,
		].filter(Boolean).join(" ") };
	});
	return { objective: "Execute the selected commitments and their explicit policies.", guidance: "Use the current window's instructions and the recorded step status.",
		steps: [...steps, ...base.steps.filter(outsideAction)], holds: structuredClone(candidate.holds) as Plan["holds"],
		may: (base.may ?? []).filter(outsideAction), askWhen: base.askWhen,
		phases: [...(base.phases ?? []).flatMap(outside), ...phases] };
}

/** Both arms differ only in the number requested. Three replies include final selection. */
export async function candidatePlan(frame: Frame, context: Context, writer: Reasoner, count: 1 | 2) {
	const catalog = candidateCatalog(frame), records: { id: string; reply: number; candidate: Candidate; plan: Plan; receipt: ReturnType<typeof commitmentReceipt>; problems: string[] }[] = [];
	const keyed = { ...schema, properties: { ...schema.properties,
		beforeCombat: Type.Array({ ...selection, properties: { ...selection.properties, action: Type.String({ enum: Object.keys(catalog.available) }) } }),
		afterCombat: Type.Array({ ...selection, properties: { ...selection.properties, action: Type.String({ enum: Object.keys(catalog.available) }) } }),
		attackers: Type.Array(Type.String({ enum: Object.keys(catalog.attackers) }), { uniqueItems: true }),
	} };
	const batch = Type.Object({ candidates: Type.Array(keyed, { minItems: count, maxItems: count }) }, { additionalProperties: false });
	const attempts: unknown[] = [];
	const register: Lookup = { name: "register", description: "Register immutable proposals and read their commitment and resource receipts. This is information, not acceptance, execution or a proof of good play. Select on a later reply.", parameters: batch,
		answer(args, session) {
			try {
			if (records.some((one) => one.reply === session?.reply)) return "This reply already registered its candidates. Read those receipts before repairing or selecting on a later reply.";
			const wrong = problems(batch, args);
			if (wrong.length) { attempts.push({ reply: session?.reply, errors: wrong }); return JSON.stringify({ errors: wrong }); }
			const proposed = (args.candidates as Candidate[]).map((candidate) => {
				const plan = compileCandidate(frame, candidate, catalog);
				const shape = problems(PlanSchema, plan);
				if (shape.length) throw new Error(shape.join("; "));
				const id = createHash("sha256").update(JSON.stringify(candidate)).digest("hex").slice(0, 16);
				const receipt = commitmentReceipt(frame, plan);
				return { id, reply: session?.reply ?? 0, candidate: structuredClone(candidate), plan,
					receipt, problems: [...planProblems(frame, plan), ...receipt.conflicts] };
			});
			const distinct = new Set(proposed.map((one) => JSON.stringify({ before: one.candidate.beforeCombat, attackers: [...one.candidate.attackers].sort(), after: one.candidate.afterCombat, holds: one.candidate.holds })));
			if (distinct.size !== count) { attempts.push({ reply: session?.reply, errors: ["Candidates must choose distinct actions or resources."] }); return "Candidates must choose distinct actions or resources; different reasons alone do not make two lines."; }
			records.push(...proposed); attempts.push({ reply: session?.reply, registered: proposed.map((one) => one.id) });
			return JSON.stringify({ informational: true, candidates: proposed.map(({ id, candidate, receipt, problems }) => ({ id, commitments: candidate, receipt, problems })),
				next: "On a later reply, select an unchanged candidate id, or register repaired candidates and read their new receipts before selecting. Empty conflicts do not certify strategy, future effects or attack legality." });
			} catch (error) { attempts.push({ reply: session?.reply, errors: [String(error)] }); return JSON.stringify({ errors: [String(error)] }); }
		} };
	const availableFacts = actionFacts(frame, catalog.available);
	const system = `Prepare ${count} distinct candidate${count === 1 ? "" : "s"} for the remaining own turn using the complete supplied position and carried playbook. Choose useful development, attacks and explicit target, response, trigger, reserve, completion and exception policies. Register proposals, inspect their receipts, then submit one immutable candidate id on a later reply. A changed proposal needs its own receipt. You have at most three replies, including selection; unresolved exhaustion selects nothing. Accepted equipment is available even when an earlier action must supply its source. Attackers have one separate representation. Current sickness prevents attacking, not blocking. Compare combat against the visible opposing blockers. Payments are examples, not locked choices. Receipts do not simulate resolution or certify legality, future traits, damage or strategy. Reasons are kept for review and never sent to the pilot; execution choices belong in policies. Uncovered windows retain production policy. Do not infer a pass from an empty list.`;
	try {
		const selected = await writer.work(`candidate comparison ${count}`, { system, user: facts(frame, context, {
			priorIntent: basePlan(frame),
			actions: Object.fromEntries(Object.entries(catalog.available).map(([key, value]) => [key, availableFacts[key] ?? { ...value, scope: "Accepted equipment without a currently permitted source; an earlier action must supply it." }])), attackers: catalog.attackers,
		}), task: `Register ${count} candidate${count === 1 ? "" : "s"}, then select after reading the exact receipts.` }, {
			lookups: [register, equipment(frame, catalog.available)], turns: 3,
			submit: { name: "submit", description: "Select one unchanged candidate after reading its receipt on an earlier reply. Selection does not execute it or certify its strategy.",
				parameters: Type.Object({ id: Type.String() }, { additionalProperties: false }), check(args, session) {
					const one = records.find((one) => one.id === args.id && one.reply < (session?.reply ?? 0));
					return !one ? "Select an id whose receipt was returned on an earlier reply." : one.problems.length ? one.problems.join("; ") : null;
				} },
		});
		const chosen = records.find((one) => one.id === selected.id)!;
		return { plan: chosen.plan, selected: chosen.id, candidates: records, attempts };
	} catch (error) { throw Object.assign(new Error(String(error)), { candidates: records, attempts }); }
}
