/** Short writer answers expand to ordinary plans before they reach core.
 * Writer aliases, advertised fields and expansion stay together past 150 lines. */
import { Type, type Static } from "typebox";
import { PlanDefs, PlanSchema, QuerySchema, WhenSchema, lifted, problems, type Condition, type Plan, type PlanOption } from "../core/language.ts";
import type { Frame } from "../core/types.ts";
import type { Lookup } from "./reason.ts";
import { printedCast } from "../core/procedures.ts";
import { currentPlan, matches } from "../core/query.ts";
import { movementActions } from "./strategy-actions.ts";
import { permissionForecasts } from "./strategy-permissions.ts";
import { STEPS } from "../core/steps.ts";

// The writer can name a whole phase in step, or any step. Core receives the
// canonical window; conflicting step/phase claims remain invalid.
const phases = [...new Set(Object.values(STEPS).map((one) => one.phase))];
const WriterWhen = Type.Object({ ...WhenSchema.properties,
	step: Type.Optional(Type.String({ enum: [...Object.keys(STEPS), ...phases.filter((one) => !(one in STEPS)), "any"],
		description: "A rules step, or any to leave the step open. A whole phase such as combat is also accepted here and becomes phase; it must agree with an explicit phase." })),
}, { additionalProperties: false });

/** Conditions use selectors; action sources keep their distinct card query. */
function selectorAliases(value: unknown, condition = false): unknown {
	if (Array.isArray(value)) return value.map((one) => selectorAliases(one, condition));
	if (!value || typeof value !== "object") return value;
	const fields = Object.fromEntries(Object.entries(value).map(([key, one]) => [key, selectorAliases(one, condition || key === "if" || key === "releaseWhen")]));
	if (condition && "card" in fields && (!("name" in fields) || fields.name === fields.card)) {
		const { card, ...rest } = fields;
		return { ...rest, name: card };
	}
	return fields;
}

function writerChanges(value: unknown): unknown {
	const changed = lifted(selectorAliases(value));
	if (!changed || typeof changed !== "object" || Array.isArray(changed)) return changed;
	// A hold released by a window rather than a visible fact moves to releaseAt.
	const windowKeys = ["active", "step", "phase", "fromTurn", "throughTurn"];
	// Object queries say self where conditions accept you or self; the writer uses both.
	const query = (objects: unknown) => objects && typeof objects === "object" && (objects as { controller?: unknown }).controller === "you" ? { ...objects, controller: "self" } : objects;
	const holdsFixed = (list: unknown) => Array.isArray(list) ? list.map((hold) => hold?.objects ? { ...hold, objects: query(hold.objects) } : hold).map((one) => one?.releaseWhen && typeof one.releaseWhen === "object" && !Array.isArray(one.releaseWhen) &&
		Object.keys(one.releaseWhen).length && Object.keys(one.releaseWhen).every((key) => windowKeys.includes(key))
		? (({ releaseWhen, ...rest }) => ({ ...rest, releaseAt: releaseWhen }))(one) : one) : list;
	const triggersFixed = (list: unknown) => Array.isArray(list) ? list.map((one) => !one || typeof one !== "object" ? one : { ...one,
		...(Array.isArray(one.resolve) ? { resolve: one.resolve.map(query) } : {}),
		...(Array.isArray(one.targets) ? { targets: one.targets.map((aim: { source?: unknown; target?: unknown }) => aim && typeof aim === "object" ? { ...aim, source: query(aim.source), target: typeof aim.target === "string" ? aim.target : query(aim.target) } : aim) } : {}) }) : list;
	return Object.fromEntries(Object.entries(changed).map(([key, list]) => [key, key === "holds" ? holdsFixed(list) :
		["steps", "may", "phases", "askWhen", "triggers"].includes(key) && Array.isArray(list) ? (key === "triggers" ? triggersFixed(list) as unknown[] : list).map((one) => {
			if (one?.action?.objects) one = { ...one, action: { ...one.action, objects: query(one.action.objects) } };
			// purpose belongs to the step; written inside the action it means the same.
			if (one?.action && typeof one.action === "object" && "purpose" in one.action && one.purpose === undefined) {
				const { purpose, ...action } = one.action;
				one = { ...one, action, purpose };
			}
			if (!one?.when || typeof one.when !== "object" || Array.isArray(one.when)) return one;
			// An attack or block has one step it can happen in; a window that names no step or only combat means that step.
			const move = String(one.action?.prefix ?? one.action?.option ?? "");
			const declare = move.startsWith("attack:") ? "declare-attackers" : move.startsWith("block:") ? "declare-blockers" : undefined;
			if (declare && !one.when.step && (!one.when.phase || one.when.phase === "combat")) {
				const { phase: _phase, ...rest } = one.when;
				one = { ...one, when: { ...rest, step: declare } };
			}
			const { step, ...when } = one.when;
			if (step === "any") return { ...one, when };
			if (typeof step === "string" && !(step in STEPS) && phases.includes(step as typeof phases[number]) && (when.phase === undefined || when.phase === step))
				return { ...one, when: { ...when, phase: step } };
			return one;
		}) : list]));
}

// Reuse names an action already written by this seat, not a card implementation.
const Action = Type.Union([...PlanDefs.Option.properties.action.anyOf,
	Type.Object({ reuse: Type.String({ minLength: 1 }) }, { additionalProperties: false })]);
const { Plan: planFields, ...definitions } = PlanDefs;
export const ChangesSchema = Type.Cyclic({ ...definitions,
	Option: Type.Object({ ...PlanDefs.Option.properties, action: Action }, { additionalProperties: false }),
	Changes: Type.Object(Object.fromEntries(Object.entries(planFields.properties).map(([key, field]) => [key, Type.Optional(field)])), { additionalProperties: false }),
}, "Changes");

// Advertise the ordinary plan fields where the model writes them. Recursive
// card programs and conditions stay locally checked, without provider expansion.
const terms = Type.Object({}, { additionalProperties: true });
const submittedOption = Type.Object({ ...PlanDefs.Option.properties, when: WriterWhen, if: Type.Optional(terms),
	action: Type.Union([PlanDefs.Option.properties.action.anyOf[0]!,
		Type.Object({ reuse: Type.String({ minLength: 1 }) }, { additionalProperties: false }),
		Type.Object({ procedure: terms }, { additionalProperties: false })]),
}, { additionalProperties: false });
// objective and guidance are audit rationale that Jev never reads; the writer's assessment fills them, so a decision cannot hide there.
const Complete = Type.Union([Type.Literal("pass"), Type.Literal("ask")], { description: "ask: the pilot is told, on its help option, that the plan asks for help once this window's planned actions are done. pass: adds nothing; the pilot passes when nothing planned remains." });
const writtenPhase = Type.Object({ ...planFields.properties.phases.items.properties, when: WriterWhen, complete: Complete }, { additionalProperties: false, required: ["when", "guidance", "complete"] });
/** The opponent's whole next turn, as one policy Jev reads at every decision in it. It becomes a phase with no step. */
export const TheirTurn = Type.Object({
	guidance: Type.String({ minLength: 1, description: "What Jev does at every decision of the opponent's next turn, from upkeep to end step: which spell or ability to answer, with which card, target and mana, and what to block. Say plainly when nothing in hand answers anything." }),
	complete: Complete,
}, { additionalProperties: false, description: "Required. Your standing policy for the whole of the opponent's next turn. Phases for single steps add detail on top of it." });
export const submissionFields = {
	steps: Type.Array(submittedOption),
	holds: Type.Array(Type.Object({ ...planFields.properties.holds.items.properties, releaseWhen: Type.Optional(terms) }, { additionalProperties: false })),
	theirTurn: TheirTurn,
	phases: Type.Array(writtenPhase, { description: "Guidance for single windows. A phase replaces the inherited phase with the same window; other inherited phases stay." }),
	may: Type.Array(submittedOption),
	askWhen: Type.Array(Type.Object({ ...planFields.properties.askWhen.items.properties, when: Type.Optional(WriterWhen), if: terms }, { additionalProperties: false })),
	packages: Type.Array(terms),
	triggers: Type.Array(Type.Object({ ...planFields.properties.triggers.items.properties, when: Type.Optional(WriterWhen) }, { additionalProperties: false }),
		{ description: "Standing orders for your own triggers that wait together, such as the landfall triggers of each land entry. Jev puts them on the stack in reverse and the trigger that goes on now is marked." }),
};

/** A current response has a known window. The model chooses actions, not that metadata. */
export const ResponseSchema = Type.Object({
	current: Type.Array(Type.Object({ label: Type.String({ minLength: 1 }), purpose: Type.Optional(Type.String()),
		waitFor: PlanDefs.Option.properties.waitFor,
		action: Type.Union([PlanDefs.Option.properties.action.anyOf[0]!, Type.Object({ reuse: Type.String({ minLength: 1 }) }, { additionalProperties: false })]),
	}, { additionalProperties: false }), { minItems: 1 }),
	phases: Type.Optional(submissionFields.phases),
	holds: Type.Optional(Type.Array(Type.Object({ objects: QuerySchema, purpose: Type.String({ minLength: 1 }) }, { additionalProperties: false }))),
	triggers: Type.Optional(submissionFields.triggers),
}, { additionalProperties: false });

/** Advertise exact equipment keys while retaining declarations and selectors. Local validation remains authoritative. */
export function selectionFields(available: ReturnType<typeof actions>, response = false) {
	const reuse = Type.Object({ reuse: Type.String({ enum: Object.keys(available), description: "Copy an exact accepted action key, including its name and punctuation." }) }, { additionalProperties: false });
	const withKeys = (option: typeof submittedOption | typeof ResponseSchema.properties.current.items) => ({ ...option,
		properties: { ...option.properties, action: Type.Union([...option.properties.action.anyOf.filter((one) => !("reuse" in one.properties)), reuse]) } });
	return response ? { ...ResponseSchema.properties, current: Type.Array(withKeys(ResponseSchema.properties.current.items), { minItems: 1 }) }
		: { ...submissionFields, steps: Type.Array(withKeys(submittedOption)), may: Type.Array(withKeys(submittedOption)) };
}

/** Replace this window's unfinished steps, preserving the rest of the line. */
export function responseChanges(frame: Frame, base: Plan, changes: unknown) {
	const wrong = problems(ResponseSchema, changes);
	if (wrong.length) throw new Error(`The response does not match its schema: ${wrong.join("; ")}.`);
	const at = frame.view.window;
	if (at.kind !== "turn") throw new Error("A response needs a current turn window.");
	const { current, ...rest } = changes as Static<typeof ResponseSchema>;
	const when = { active: at.active === frame.seat ? "self" as const : "opponent" as const, step: at.step, fromTurn: at.turn, throughTurn: at.turn };
	return { ...rest, steps: [...current.map((one) => ({ ...one, when })), ...base.steps.filter((one) => !matches(one.when, frame))] };
}

/** The actions available to reuse, with readable labels and their complete accepted syntax. */
export function actions(frame: Frame, prepared?: Plan, turn?: number): Record<string, { label: string; action: PlanOption["action"] }> {
	const plan = prepared ?? currentPlan(frame);
	// Uses of cards this seat can hold: its registered list and anything it controls now. Numbering stays global so keys stay stable.
	const list = frame.view.decks?.find((one) => one.seat === frame.seat);
	const own = new Set([...Object.keys(list?.cards ?? {}), ...Object.keys(list?.sideboard ?? {}),
		...(frame.view.objects ?? []).flatMap((one) => one.controller === frame.seat && one.card ? [one.card] : [])]);
	const mine = (card: string) => !list || own.has(card);
	return Object.fromEntries([
		...Object.entries(movementActions(frame, turn)),
		...(plan?.steps ?? []).map((one, at) => [`step:${at} ${one.label}`, { label: one.label, action: one.action }]),
		...(plan?.may ?? []).map((one, at) => [`may:${at} ${one.label}`, { label: one.label, action: one.action }]),
		...(frame.view.work?.packages ?? []).flatMap((pack) => (pack.procedures ?? []).map((procedure) => ({ card: pack.card, procedure })))
			.flatMap(({ card, procedure }, at) => mine(card) ? [[`prepared:${at} ${procedure.claim}`, { label: procedure.claim, action: { procedure } }]] : []),
		...(frame.view.work?.packages ?? []).filter((pack) => pack.printedCast && frame.view.printed?.[pack.card] && mine(pack.card)).map((pack) =>
			[`printed:${pack.card}`, { label: `Cast ${pack.card} for its printed cost`, action: { procedure: printedCast(pack.card, frame.view.printed![pack.card]!) } }]),
	]);
}

/** Read accepted equipment beyond the current position without changing it or certifying its interpretation. */
export function equipment(frame: Frame, available: ReturnType<typeof actions>): Lookup {
	return { name: "equipment", description: "Read this seat's accepted package and reusable actions for a named card, including registered cards absent from the position. Ordinary permanent casts with unconditional land permissions include a conditional forecast of visible land candidates. These terms may contain interpretation errors; reading them neither prepares nor uses a card or simulates its resolution.",
		parameters: { type: "object", properties: { card: { type: "string" } }, required: ["card"], additionalProperties: false },
		answer: ({ card }) => {
			const named = Object.fromEntries(Object.entries(available).filter(([, one]) => ("procedure" in one.action ? one.action.procedure.source.card : one.action.objects?.card) === card));
			return JSON.stringify({ card, package: frame.view.work?.packages?.find((one) => one.card === card), actions: named,
				permissionForecasts: permissionForecasts(frame, named) });
		},
	};
}

/**
 * Fresh work starts from the pregame playbook. A midturn edit
 * starts from the unfinished steps, so an unchanged step cannot execute twice.
 * Existing packages live in work and need no repetition in the next answer.
 */
export function basePlan(frame: Frame, prepared?: Plan, nextTurn = false, playbook?: Plan): Plan {
	const at = frame.view.window;
	if (prepared && (prepared.throughTurn === undefined || at.kind === "turn" && at.turn <= prepared.throughTurn)) return structuredClone(prepared);
	const plan = currentPlan(frame);
	const fresh = nextTurn || !plan || plan.throughTurn === undefined && at.kind === "turn" && at.active === frame.seat &&
		(frame.view.work?.accepted === undefined || frame.view.work.accepted < (frame.view.began ?? 0));
	const done = new Set(frame.view.done ?? []);
	const base = structuredClone(fresh ? playbook ?? { objective: "Plan the current position.", guidance: "No tactical rationale supplied.", steps: [] }
		: { ...plan!, steps: plan!.steps.filter((_, n) => !done.has(n)) });
	delete base.packages;
	if (at.kind === "turn" && (fresh || base.throughTurn === undefined))
		base.throughTurn = nextTurn ? at.turn + 2 : at.active === frame.seat ? at.turn + 1 : at.turn;
	return base;
}

/** Require an explicit comparison in newly submitted plan conditions; legacy core replay is unchanged. */
export function conditionProblems(plan: Plan): string[] {
	const found: string[] = [];
	const check = (condition: Condition | undefined, where: string): void => {
		if (!condition) return;
		if ("amount" in condition && condition.atLeast === undefined && condition.atMost === undefined)
			found.push(`${where}: an amount condition needs atLeast or atMost. Without a bound it is always true, including when the amount is zero.`);
		if ("not" in condition) check(condition.not, `${where}.not`);
		for (const kind of ["all", "any"] as const) if (kind in condition)
			(condition as { all?: Condition[]; any?: Condition[] })[kind]!.forEach((one, at) => check(one, `${where}.${kind}[${at}]`));
	};
	for (const kind of ["steps", "may", "askWhen"] as const) (plan[kind] ?? []).forEach((one, at) => check(one.if, `${kind}[${at}].if`));
	(plan.holds ?? []).forEach((one, at) => check(one.releaseWhen, `holds[${at}].releaseWhen`));
	return found;
}

/** Merge changed fields and expand reused actions. This never writes private or physical state. */
/** Table move families a step's prefix may name. */
const MOVES = ["land:", "cast:", "play:", "use:", "plan:", "attack:", "block:", "assign:", "trigger:", "resolve:", "pass"];

/** A step whose prefix is no move family but exactly one available action's label means that action. */
export function labelled(changes: Record<string, unknown>, available: ReturnType<typeof actions>): Record<string, unknown> {
	const fix = (list: unknown) => !Array.isArray(list) ? list : list.map((one) => {
		const prefix = one?.action?.prefix;
		if (typeof prefix !== "string" || one.action.objects || MOVES.some((family) => prefix.startsWith(family) || family.startsWith(prefix))) return one;
		const keys = Object.entries(available).filter(([, found]) => found.label.trim().toLowerCase() === prefix.trim().toLowerCase()).map(([key]) => key);
		return keys.length === 1 ? { ...one, action: { reuse: keys[0] } } : one;
	});
	return { ...changes, ...("steps" in changes ? { steps: fix(changes.steps) } : {}), ...("may" in changes ? { may: fix(changes.may) } : {}), ...("current" in changes ? { current: fix(changes.current) } : {}) };
}

export function changedPlan(base: Plan, changes: unknown, available: ReturnType<typeof actions>): Plan {
	changes = writerChanges(changes);
	const wrong = problems(ChangesSchema, changes);
	if (wrong.length) throw new Error(`changes does not match the schema: ${wrong.join("; ")}.`);
	const plan = structuredClone({ ...base, ...changes as Partial<Plan> });
	// A phase replaces the inherited phase for the same window; the rest stay, so a rewrite cannot silently drop the opponent's turn.
	const phases = (changes as Partial<Plan>).phases;
	if (phases && !phases.length && base.phases?.length) throw new Error("phases [] would remove every window policy, including the opponent's turn. Omit phases to keep them, or write the windows that change: a phase replaces the inherited phase with the same when.");
	if (phases) {
		const key = (one: { when: unknown }) => JSON.stringify(one.when, Object.keys(one.when as object).sort());
		const written = new Map(phases.map((one) => [key(one), one]));
		plan.phases = structuredClone([...(base.phases ?? []).map((one) => written.get(key(one)) ?? one), ...phases.filter((one) => !(base.phases ?? []).some((old) => key(old) === key(one)))]);
	}
	// Preparation's packages have not reached work yet. An amendment adding a
	// new permanent must keep those pending packages as well as accepted ones.
	const added = (changes as Partial<Plan>).packages;
	if (added) plan.packages = [...(base.packages ?? []).filter((one) => !added.some((next) => next.card === one.card)), ...structuredClone(added)];
	const unknown = [...plan.steps, ...(plan.may ?? [])].flatMap((one) => "reuse" in one.action && !available[one.action.reuse as string] ? [String(one.action.reuse)] : []);
	if (unknown.length) throw new Error(`No reusable action for ${[...new Set(unknown)].map((key) => JSON.stringify(key)).join(", ")}. Copy exact keys under actions or read equipment for the card. No edit was applied.`);
	for (const one of [...plan.steps, ...(plan.may ?? [])]) {
		if (!("reuse" in one.action)) continue;
		const key = one.action.reuse as string, found = available[key];
		one.action = structuredClone(found!.action);
	}
	const shape = problems(PlanSchema, plan);
	if (shape.length) throw new Error(`The resulting plan does not match the schema: ${shape.join("; ")}.`);
	// Only conditions this answer wrote need a bound; inherited ones were accepted under older rules and are reported, not refused.
	const written = changes as Partial<Plan>;
	const conditions = conditionProblems({ objective: "", guidance: "", steps: written.steps ? plan.steps : [], ...(written.may ? { may: plan.may } : {}),
		...(written.askWhen ? { askWhen: plan.askWhen } : {}), ...(written.holds ? { holds: plan.holds } : {}) });
	if (conditions.length) throw new Error(conditions.join("; "));
	return plan;
}
