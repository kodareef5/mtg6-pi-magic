/**
 * Where a seat is in its plan, read from its frame: which steps are due and
 * which listed options fit them, which standing branches apply, which stops
 * hold, and which resources are held. docs/PLANS.md.
 *
 * Progress comes from the ledger (`view.done`), never from equipment, so it
 * cannot tear and replay needs nothing new. Everything here reads; the loop
 * decides what to do with it.
 * Past 150 lines to keep matching, resource marks and execution credit together.
 */
import { variableResource } from "./resource-costs.ts";
import { holds as condition, targetKey, viewWorld, type Scope } from "./selectors.ts";
import { currentPlan, matches, reached, select } from "./query.ts";
import { procedureOptions, type ProcedureOption } from "./procedures.ts";
import type { Plan, PlanOption, Procedure } from "./language.ts";
import type { Frame, Option, SeatId } from "./types.ts";
import type { SeenObject } from "./work.ts";
import type { Activation, LedgerRow } from "./table.ts";
import { isDeepStrictEqual } from "node:util";
import { announcementOffers, type Announcement, type AnnouncementOffer } from "./announcement-options.ts";
import { faceFacts } from "./faces.ts";
import { tapObjects } from "./funding.ts";

/** A step or branch that applies now, and the listed options that fit it. */
export type Fit = { at: number; label: string; candidates: Option[]; waiting?: true };
export type PlanState = {
	/** The equipment revision that accepted this plan. */
	revision: number;
	plan: Plan;
	/** Steps whose window and condition hold, in order. An explicit stack wait keeps later steps later even when no option fits yet. */
	due: Fit[];
	/** Steps not yet taken and not due now, in plan order, with the listed options that would carry them out if taken now. */
	waiting: { at: number; label: string; candidates: Option[] }[];
	branches: Fit[];
	/** `askWhen` labels that hold now, and an essential step that should be taken here and cannot. */
	stops: string[];
	/** An essential step due before every step that can be taken now: the table does not take a later step for the seat past it. */
	unmet?: number;
	/** Unarmed stops that are false now, and so arm. */
	arming: string[];
	/** `users` are the visible objects a hold's `for` names: spending the reserve on one of them follows the plan. */
	held: { purpose: string; objects: SeenObject[]; for?: string[]; users?: SeenObject[] }[];
	/** The source of the use being prepared, when this question selects one of its parts. */
	using?: { id: string; incarnation: number };
	/** The seat whose plan this is. */
	seat: SeatId;
	/** Trigger orders whose window is open, with each listed source and target resolved to what it names now. */
	triggers: { sources: SeenObject[][]; targets: { source: SeenObject[]; target: SeenObject[] | { player: SeatId } }[]; purpose?: string }[];
	/** Current sources named by unfinished attacks in this turn's remaining combat. */
	attacks: { label: string; objects: SeenObject[] }[];
	/** The announcements due steps and branches offer, beside the table's own options. */
	procedures: ProcedureOption[];
	announcements?: AnnouncementOffer[];
	/** This question selects one part of the already chosen use. */
	preparing?: true;
	/** A later plan explicitly addresses the selected use; partial choices still have no execution credit. */
	amended?: true;
};

/** Ledger rows record which step or branch an action carried out. */
export type Execution = NonNullable<LedgerRow["execution"]>;

/** Holds concern resources paid or tapped, not every source or target a choice mentions. */
function spent(option: Option) {
	const use = option.use;
	if (!use) return option.spends ?? [];
	const cost = use.cost;
	return [...(use.timing === "spell" || use.timing === "land" || use.timing === "special" || cost.tap || cost.counters && !cost.counters.on ? [use.source] : []), ...(cost.counters?.on ?? []), ...(cost.shown ?? []),
		...(use.funding ?? []).flatMap(tapObjects), ...(cost.tapped ?? []), ...(cost.sacrificed ?? []),
		...(cost.exiled ?? []), ...(cost.discarded ?? []), ...(cost.returned ?? [])];
}

/** A card named by its full name or one of its faces, or a token by its name. Hidden objects match nothing. */
const named = (object: SeenObject, names: readonly string[]) => {
	const name = object.card ?? object.token?.name;
	return !!name && names.some((one) => one === name || name.split(" // ").includes(one));
};

/** A coarse payment index. Equal terms share a key regardless of object-key order;
 * collisions still require full equality, including instructions and restrictions. */
function activationKey(use: Activation): string {
	const cost = use.cost;
	return JSON.stringify([targetKey(use.source), use.controller, use.timing, use.claim, use.x,
		use.targets.map((set) => set.map(targetKey)), use.paid,
		use.funding?.map((tap) => [targetKey(tap.source), tap.colors]), cost.generic, cost.colors,
		[cost.tapped, cost.sacrificed, cost.exiled, cost.discarded, cost.shown, cost.counters?.on, cost.returned].map((refs) => refs?.map(targetKey))]);
}

/** Payments share immutable instruction, target and cost trees. Compare each
 * pair once within this matching pass, while still checking every root field. */
function activationEquality() {
	const pairs = new WeakMap<object, WeakMap<object, boolean>>();
	const equal = (a: unknown, b: unknown): boolean => {
		if (Object.is(a, b)) return true;
		if (!a || !b || typeof a !== "object" || typeof b !== "object" || !Object.isFrozen(a) || !Object.isFrozen(b)) return isDeepStrictEqual(a, b);
		let answers = pairs.get(a);
		if (!answers) { answers = new WeakMap(); pairs.set(a, answers); }
		const previous = answers.get(b);
		if (previous !== undefined) return previous;
		const answer = isDeepStrictEqual(a, b); answers.set(b, answer); return answer;
	};
	return (a: Activation, b: Activation) => {
		const keys = Object.keys(a) as (keyof Activation)[];
		return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
	};
}

function candidates(option: PlanOption, frame: Frame, prefix: string): { options: Option[]; procedures: ProcedureOption[]; announcements?: AnnouncementOffer[] } {
	const { action } = option;
	if ("procedure" in action) {
		if (frame.view.stagedAnnouncements || variableResource(action.procedure.cost)) {
			if (frame.decision?.situation !== "priority") return { options: [], procedures: [] };
			const starts = announcementOffers(action.procedure, frame, prefix), listed = frame.decision.options.filter((one) => one.announcement);
			const terms = (draft: Announcement) => {
				const { source, if: _if, limit: _limit, cost, ...procedure } = draft.procedure;
				const card = frame.view.objects?.find((one) => one.id === draft.source.id)?.card;
				const mana = cost?.mana ?? (procedure.timing === "spell" && card ? faceFacts(frame.view.printed?.[card], procedure.face)?.mana : undefined);
				return { ...procedure, cost: { ...cost, ...(mana ? { mana } : {}) }, source: draft.source, permission: draft.permission, registered: source.registered };
			};
			const matched = new Set<Option>(), announcements: AnnouncementOffer[] = [];
			for (const start of starts) {
				const same = listed.filter((one) => isDeepStrictEqual(terms(one.announcement!), terms(start.announcement)));
				if (same.length) same.forEach((one) => matched.add(one)); else announcements.push(start);
			}
			return { options: [...announcements.map((one) => one.option), ...listed.filter((one) => matched.has(one))], procedures: [], announcements };
		}
		const offered = procedureOptions(action.procedure as Procedure, frame, prefix);
		// Ordinary equipment can offer the same announcement under another id.
		// That listed option carries out the step when all accepted terms, targets
		// and payment match; a card name alone cannot identify its chosen mode.
		// The plan adds its own id only for an announcement nothing listed makes,
		// so one physical action is offered once.
		const listed = (frame.decision?.options ?? []).filter((one) => one.use);
		const indexed = new Map<string, Option[]>(), matched = new Set<Option>(), procedures: ProcedureOption[] = [];
		const equal = activationEquality();
		for (const one of listed) {
			const key = activationKey(one.use!), bucket = indexed.get(key);
			if (bucket) bucket.push(one); else indexed.set(key, [one]);
		}
		for (const choice of offered) {
			const same = (indexed.get(activationKey(choice.activation)) ?? []).filter((one) => equal(one.use!, choice.activation));
			if (same.length) for (const one of same) matched.add(one); else procedures.push(choice);
		}
		const equivalent = listed.filter((one) => matched.has(one));
		return { options: [...procedures.map((choice) => choice.option), ...equivalent], procedures };
	}
	const objects = action.objects ? select(action.objects, frame) : null;
	// A step that names only objects means playing them: it is not a discard, a resolution choice or a trigger that happens to name the same card.
	if (!action.option && !action.prefix && frame.decision?.situation !== "priority") return { procedures: [], options: [] };
	return { procedures: [], options: (frame.decision?.options ?? []).filter((listed) =>
		(!action.option || listed.id === action.option) && (!action.prefix || listed.id.startsWith(action.prefix)) &&
		(!objects || objects.some((object) => listed.objects?.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation)))) };
}

/** The seat's plan as it stands at this frame, or null without one. */
export function planState(frame: Frame): PlanState | null {
	const work = frame.view.work, current = currentPlan(frame), draft = frame.view.announcement;
	let plan = frame.view.announcementPlan ?? current;
	if (!work || !plan || work.planned === undefined) return null;
	let revision = draft?.plan ?? work.planned, progress = draft?.execution, amended = false, cancelling = false;
	const scope: Scope = { world: viewWorld(frame.view), controller: frame.seat };
	if (draft && current && work.planned !== draft.plan) {
		// Reuse native/plan matching with the selected use as the only root. A
		// replan can amend its policy, never replace its accepted card terms.
		const root: Option = { id: "pending-use", label: draft.procedure.claim, objects: [draft.source], announcement: draft };
		const pending = { ...frame, decision: { ...frame.decision!, options: [root] } };
		const cancels = (one: PlanOption) => "option" in one.action && one.action.option === "announce:cancel" &&
			candidates(one, frame, "cancellation").options.some(option => option.id === "announce:cancel");
		const fits = (one: PlanOption) => matches(one.when, frame) && (!one.if || condition(scope, one.if)) &&
			(cancels(one) || candidates(one, pending, "amendment").options.some((option) => option.id === root.id));
		const step = current.steps.findIndex(fits), branch = (current.may ?? []).findIndex(fits);
		if (step >= 0 || branch >= 0) {
			plan = current; revision = work.planned; amended = true;
			progress = { plan: revision, ...(step >= 0 ? { step } : { branch }) };
			cancelling = cancels(step >= 0 ? current.steps[step]! : current.may![branch]!);
		}
	}
	const done = new Set(amended ? [] : frame.view.done ?? []), at = frame.view.window;
	const held = (plan.holds ?? []).filter((hold) => (!hold.releaseWhen || !condition(scope, hold.releaseWhen)) && (!hold.releaseAt || !reached(hold.releaseAt, frame)))
		.map((hold) => ({ purpose: hold.purpose, objects: select(hold.objects, frame),
			...(hold.for ? { for: hold.for, users: (frame.view.objects ?? []).filter((one) => one.controller === frame.seat && named(one, hold.for!)) } : {}) }))
		.filter((hold) => hold.objects.length);
	const combat = at.kind === "turn" && at.active === frame.seat && (at.step === "declare-attackers" || frame.view.remainingSteps?.includes("declare-attackers"))
		? { ...frame, view: { ...frame.view, window: { ...at, step: "declare-attackers", phase: "combat" } } } as Frame : undefined;
	const attacks = combat ? plan.steps.flatMap((step, index) => {
		const action = step.action;
		if (done.has(index) || !matches(step.when, combat) || "procedure" in action || action.prefix !== "attack:" || !action.objects || step.if && !condition(scope, step.if)) return [];
		return [{ label: step.label, objects: select(action.objects, frame).filter((one) => one.zone === "battlefield" && one.controller === frame.seat) }];
	}) : [];
	if (frame.view.announcement) {
		const options = (frame.decision?.options ?? []).filter((one) => cancelling ? one.id === "announce:cancel" : !["announce:cancel", "announce:back", "announce:individual", "payment:cancel"].includes(one.id) &&
			!one.id.startsWith("announce:unpay:") && !one.id.startsWith("announce:remove-target:") && !one.id.startsWith("payment:remove:"));
		const fit = (at: number, label: string): Fit => ({ at, label, candidates: options });
		return { revision, plan, seat: frame.seat, preparing: true, using: draft!.source, ...(amended ? { amended: true as const } : {}), procedures: [], waiting: [], stops: [], arming: [], triggers: [], attacks,
			due: progress?.step !== undefined && plan.steps[progress.step] ? [fit(progress.step, plan.steps[progress.step]!.label)] : [],
			branches: progress?.branch !== undefined && plan.may?.[progress.branch] ? [fit(progress.branch, plan.may[progress.branch]!.label)] : [],
			held };
	}
	const open = (option: PlanOption) => matches(option.when, frame) && (!option.if || condition(scope, option.if));
	const procedures: ProcedureOption[] = [];
	const announcements: AnnouncementOffer[] = [];
	const opponent = frame.view.players?.find((one) => one.id !== frame.seat)?.id;
	const triggers = (plan.triggers ?? []).filter((one) => !one.when || matches(one.when, frame))
		.map((one) => ({ sources: one.resolve.map((query) => select(query, frame)),
			targets: (one.targets ?? []).flatMap((aim): PlanState["triggers"][number]["targets"] => aim.target === "self" ? [{ source: select(aim.source, frame), target: { player: frame.seat } }]
				: aim.target === "opponent" ? opponent === undefined ? [] : [{ source: select(aim.source, frame), target: { player: opponent } }]
				: [{ source: select(aim.source, frame), target: select(aim.target, frame) }]),
			...(one.purpose ? { purpose: one.purpose } : {}) }));
	const fit = (option: PlanOption, at: number, kind: "s" | "b"): Fit => {
		const found = candidates(option, frame, `plan:${revision}:${kind}${at}`);
		for (const procedure of found.procedures) procedures.push(procedure);
		for (const announcement of found.announcements ?? []) announcements.push(announcement);
		// Holds warn about spending; they cannot change which action was carried out.
		return { at, label: option.label, candidates: found.options,
			...(option.waitFor === "empty-stack" && frame.view.objects?.some((one) => one.zone === "stack") ? { waiting: true as const } : {}) };
	};
	// An attack step names a set: once this declaration has carried it out with one of its creatures, it stays open
	// until each creature it names has been picked or can no longer attack. Finished declarations close it, and a
	// later declaration that picks one of those creatures without the step does not reopen it.
	const picked = (frame.view.combat?.choosing ?? []).flatMap((pick) => "blocker" in pick ? [] : [pick.attacker]);
	const declaring = (step: PlanOption, at: number) => !!frame.view.declaring?.includes(at) && !("procedure" in step.action) && step.action.prefix === "attack:" && !!step.action.objects &&
		select(step.action.objects, frame).some((one) => picked.some((ref) => ref.id === one.id && ref.incarnation === one.incarnation));
	const due: Fit[] = [], waiting: PlanState["waiting"] = [];
	plan.steps.forEach((step, at) => {
		if (done.has(at)) {
			// Reopened for its remaining creatures only: finishing the declaration is a later step's action, not this one's.
			if (declaring(step, at) && open(step)) { const reopened = fit(step, at, "s"); due.push({ ...reopened, candidates: reopened.candidates.filter((one) => one.id !== "attack:done") }); }
			return;
		}
		if (open(step)) due.push(fit(step, at, "s"));
		else waiting.push({ at, label: step.label, candidates: candidates(step, frame, `plan:${revision}:w${at}`).options });
	});
	const branches = (plan.may ?? []).flatMap((branch, at) => open(branch) ? [fit(branch, at, "b")] : []).filter((one) => one.candidates.length || one.waiting);
	// An essential step with nothing listed for it, at a priority where it belongs: in its own step, or with no step named in a main phase.
	// Only with an empty stack: while a spell waits to resolve, passing so it can is the procedure, not a failed line.
	// Attacks and blocks are taken only in their declaration, never at a priority, so a priority cannot find one missing.
	const declares = (step: PlanOption) => !("procedure" in step.action) && /^(attack|block):/.test(step.action.prefix ?? step.action.option ?? "");
	const belongs = (step: PlanOption) => frame.decision?.situation === "priority" && at.kind === "turn" && !(frame.view.objects ?? []).some((object) => object.zone === "stack") && !declares(step) &&
		(step.when.step ? step.when.step === at.step : at.step === "precombat-main" || at.step === "postcombat-main");
	// Only the first essential step with nothing listed, and only before any step that can still be taken: a land step first may yet pay for it.
	const next = due.find((one) => one.candidates.length);
	const unmet = due.find((one) => plan.steps[one.at]!.essential && !one.candidates.length && (!next || one.at < next.at) && belongs(plan.steps[one.at]!));
	const blocked = unmet ? [`Step ${unmet.at + 1} cannot be taken now: ${unmet.label}`] : [];
	return {
		revision, seat: frame.seat, plan, due, waiting, branches, procedures, ...(announcements.length ? { announcements } : {}), ...(unmet ? { unmet: unmet.at } : {}),
		stops: [...(plan.askWhen ?? []).filter((stop) => !work.unarmed?.includes(stop.label) && (!stop.when || matches(stop.when, frame)) && condition(scope, stop.if)).map((stop) => stop.label), ...blocked],
		arming: (plan.askWhen ?? []).filter((stop) => work.unarmed?.includes(stop.label) && ((stop.when && !matches(stop.when, frame)) || !condition(scope, stop.if))).map((stop) => stop.label),
		held, triggers, attacks,
	};
}

/** A step's window in words: whose turn and which step. */
const scheduledFor = (when: PlanOption["when"]) => [when.active === "self" ? "your" : when.active === "opponent" ? "the opponent's" : "any",
	(when.step ?? when.phase ?? "turn").replace(/-/g, " ")].join(" ") + (when.fromTurn !== undefined ? ` from turn ${when.fromTurn}` : "");

/** An order in placement order, the trigger that goes on now first, with its named target. */
export const placed = (placement: readonly string[], aim?: string) => placement.map((name, at) => at ? name : `${name}${aim ? ` aiming at ${aim}` : ""} now`).join(", then ");
const same = (a: { id: string; incarnation: number }, b: { id: string; incarnation: number }) => a.id === b.id && a.incarnation === b.incarnation;
/** Whether a trigger option aims where the policy names its source's target, or undefined when the policy names none. */
function aims(policy: PlanState["triggers"][number], option: Option): boolean | undefined {
	const source = option.objects?.[0], rules = policy.targets.filter((aim) => source && aim.source.some((object) => same(object, source)));
	// A rule names what a trigger targets; a trigger that chooses no target, such as one whose payoff targets later, is not narrowed.
	if (!option.trigger?.targets.length || !rules.length) return undefined;
	return rules.some((aim) => option.trigger!.targets.some((chosen) => "player" in aim.target
		? "player" in chosen && chosen.player === (aim.target as { player: SeatId }).player
		: !("player" in chosen) && (aim.target as SeenObject[]).some((object) => same(object, chosen))));
}

/**
 * The plan's order for the waiting triggers these options put on: the triggers that go on the stack now and the
 * order they all go on in, last to resolve first. The first open policy that orders two or more of them applies.
 */
export function triggerOrder(state: PlanState, options: readonly Option[]): { now: string[]; placement: string[]; aim?: string; purpose?: string; aimed: (option: Option) => boolean; kept: boolean } | undefined {
	const waiting = [...new Map(options.flatMap((one) => one.trigger && one.objects?.[0] ? [[one.trigger.id, { ...one.trigger, source: one.objects[0] }] as const] : [])).values()]
		.sort((a, b) => a.id < b.id ? -1 : 1);
	for (const policy of state.triggers) {
		const ranked = waiting.map((one) => ({ one, rank: policy.sources.findIndex((objects) => objects.some((object) => object.id === one.source.id && object.incarnation === one.source.incarnation)) }))
			.filter((one) => one.rank >= 0);
		if (new Set(ranked.map((one) => one.rank)).size < 2) continue;
		const last = Math.max(...ranked.map((one) => one.rank));
		// A named target narrows the options that keep the order to those aiming at it; a trigger with none named keeps it with any target.
		const aimed = (option: Option) => aims(policy, option) !== false;
		const now = ranked.filter((one) => one.rank === last).map((one) => one.one.id);
		// Triggers of equal rank keep their trigger order, so every rendering of this order agrees whatever the options' order.
		const target = (source: { id: string; incarnation: number }) => policy.targets.filter((aim) => aim.source.some((object) => same(object, source)))
			.map((aim) => "player" in aim.target ? (aim.target.player === state.seat ? "you" : "the opponent") : aim.target.map((object) => `${object.card ?? object.token?.name ?? object.id} (${object.id}@${object.incarnation})`).join(" or "))[0];
		const sorted = [...ranked].sort((a, b) => b.rank - a.rank || (a.one.id < b.one.id ? -1 : 1)), first = sorted[0]!.one;
		const aim = first.targets.length ? target(first.source) : undefined;
		return { now, placement: sorted.map((one) => one.one.name), ...(aim ? { aim } : {}),
			...(policy.purpose ? { purpose: policy.purpose } : {}), aimed, kept: options.some((option) => option.trigger && now.includes(option.trigger.id) && aimed(option)) };
	}
}

/** The first due step an option carries out, or else a branch it carries out. Neither means it is off the plan. */
export function execution(state: PlanState, id: string): Execution | undefined {
	const fits = (one: Fit) => one.candidates.some((option) => option.id === id);
	const step = state.due.find(fits);
	if (step) return { plan: state.revision, step: step.at };
	const branch = state.branches.find(fits);
	return branch ? { plan: state.revision, branch: branch.at } : undefined;
}

/** Attack choices in one declaration form a set; finishing the declaration still follows them. */
export function laterStep(state: PlanState, at: number): boolean {
	const next = state.due.find((one) => one.candidates.length || one.waiting);
	if (!next || at <= next.at) return false;
	if (next.waiting) return true;
	const attack = (index: number) => {
		const action = state.plan.steps[index]!.action;
		return !("procedure" in action) && (action.prefix === "attack:" || !!action.option?.startsWith("attack:") && action.option !== "attack:done");
	};
	return !(attack(at) && state.due.filter((one) => one.at >= next.at && one.at <= at).every((one) => attack(one.at)));
}

/**
 * Every option the seat can take, marked with what the plan says about it:
 * the step or branch it carries out, and any held resource it spends. A mark
 * guides; nothing is removed.
 */
export function annotate(options: Option[], state: PlanState): Option[] {
	const order = triggerOrder(state, options);
	// A payment may belong to several branches but only the first matching step.
	// Index once: scanning each candidate list for each offered payment is quadratic.
	const due = new Map<string, string>(), waiting = new Map<string, string>(), branches = new Map<string, string[]>();
	for (const step of state.due) {
		const mark = state.preparing ? `Selects a part of plan step ${step.at + 1}; its target and payment policy is in the plan.` :
			`Plan step ${step.at + 1}${laterStep(state, step.at) ? ", out of order" : ""}: ${step.label}.${step.waiting ? " Waiting for the stack to empty." : ""}${state.plan.steps[step.at]!.purpose ? ` Choices: ${state.plan.steps[step.at]!.purpose}` : ""}`;
		for (const option of step.candidates) if (!due.has(option.id)) due.set(option.id, mark);
	}
	for (const step of state.waiting) {
		const mark = `Carries out plan step ${step.at + 1}, ${step.label}, which is scheduled for ${scheduledFor(state.plan.steps[step.at]!.when)}; it is not due now.`;
		for (const option of step.candidates) if (!waiting.has(option.id)) waiting.set(option.id, mark);
	}
	for (const branch of state.branches) {
		const mark = state.preparing ? `Selects a part of plan branch ${branch.at + 1}; its target and payment policy is in the plan.` :
			`Plan branch: ${branch.label}.${branch.waiting ? " Waiting for the stack to empty." : ""}${state.plan.may![branch.at]!.purpose ? ` Choices: ${state.plan.may![branch.at]!.purpose}` : ""}`;
		for (const id of new Set(branch.candidates.map(one => one.id))) {
			const marks = branches.get(id); if (marks) marks.push(mark); else branches.set(id, [mark]);
		}
	}
	return [...options, ...state.procedures.map((choice) => choice.option), ...(state.announcements ?? []).map((choice) => choice.option)].map((option) => {
		const marks: string[] = [];
		// Stated in placement order: the trigger named first is the one that goes on now.
		if (order && option.trigger && order.now.includes(option.trigger.id) && order.aimed(option))
			marks.push(`Your plan's trigger order puts this trigger on the stack now: ${placed(order.placement, order.aim)}.${order.purpose ? ` Choices: ${order.purpose}` : ""}`);
		// A named target counts whenever its trigger waits, alone included, unless the order puts that trigger on later.
		else if (option.trigger && (!order || order.now.includes(option.trigger.id)) && state.triggers.some((policy) => aims(policy, option)))
			marks.push("Aims where your plan's trigger targets name this trigger's target.");
		// An option that would carry out a step whose window has not come says so, so taking it now is not mistaken for the step.
		const step = due.get(option.id) ?? waiting.get(option.id);
		if (step) marks.push(step);
		if (option.id === "attack:done") {
			const unfinished = state.due.flatMap((one) => {
				if (one.candidates.some((candidate) => candidate.id === option.id)) return [];
				const attacks = one.candidates.filter((candidate) => candidate.id.startsWith("attack:"));
				return attacks.length ? [`step ${one.at + 1} (${attacks.map((candidate) => candidate.label).join(" or ")})`] : [];
			});
			if (unfinished.length) marks.push(`Finishing now leaves available plan steps unfinished: ${unfinished.join("; ")}.`);
		}
		for (const mark of branches.get(option.id) ?? []) marks.push(mark);
		const source = option.use?.source ?? option.announcement?.source ?? state.using;
		for (const hold of state.held) {
			const used = hold.objects.filter((object) => spent(option).some((ref) => ref.id === object.id && ref.incarnation === object.incarnation));
			// The reserve's own use spends it as planned; the mark says so rather than warning against the plan.
			const planned = !!source && !!hold.users?.some((one) => one.id === source.id && one.incarnation === source.incarnation);
			// One fact per held object factors across payments. A sentence per
			// subset grows with every combination of lands in a use's menu.
			for (const object of used) marks.push(planned
				? `Uses ${object.card ?? object.token?.name ?? object.id} (${object.id}@${object.incarnation}) from the reserve the plan holds for ${hold.for!.join(" or ")}: ${hold.purpose.replace(/\.$/, "")}.`
				: `Spends ${object.card ?? object.token?.name ?? object.id} (${object.id}@${object.incarnation}), which the plan holds for: ${hold.purpose.replace(/\.$/, "")}.`);
		}
		if (option.use) {
			const { cost, source, funding } = option.use;
			const taps = [...(funding ?? []).flatMap(tapObjects), ...(cost.tapped ?? []), ...(cost.tap ? [source] : [])];
			for (const attack of state.attacks) for (const object of attack.objects) if (taps.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation))
				marks.push(`This payment taps ${object.card ?? object.token?.name ?? object.id}, named by the remaining attack step "${attack.label}". It would need to untap before attacking.`);
		}
		return marks.length ? { ...option, notes: [...(option.notes ?? []), ...marks] } : option;
	});
}

/** Scoped work is accepted before upkeep choices, then reviewed after the draw.
 * Opening and unscoped legacy work retain their first post-draw priority deadline. */
export function planDue(frame: Frame): boolean {
	if (frame.view.announcement) return false;
	const work = frame.view.work, at = frame.view.window;
	if (!work?.eachTurn || at.kind !== "turn" || at.active !== frame.seat || at.step === "untap") return false;
	const decision = frame.decision;
	if (decision?.situation === "state-based" && decision.options.length === 1 ||
		decision?.situation === "turn-based" && decision.options.some((one) => one.id === "draw")) return false;
	const scoped = work.plan?.throughTurn !== undefined;
	// Read the recorded plan here: an expired plan still establishes this schedule.
	if (scoped && (work.accepted === undefined || work.accepted < (frame.view.began ?? 0))) return true;
	if (at.step === "upkeep" || at.step === "draw" && frame.view.drawnAt === undefined) return false;
	return (scoped || !frame.decision || frame.decision.situation === "priority") &&
		(work.accepted === undefined || work.accepted < (frame.view.drawnAt ?? frame.view.began ?? 0));
}

/**
 * Why strategy is being asked now, if it is. Only in a turn window: the opening
 * plan waits until the mulligans are done, so it is written for the hand kept.
 */
export function planReason(frame: Frame): string | undefined {
	if (frame.view.window.kind !== "turn") return;
	if (frame.view.work?.request) return frame.view.work.request;
	if (!planDue(frame)) return;
	const accepted = frame.view.work?.accepted;
	if (accepted === undefined || accepted < (frame.view.began ?? 0))
		return "Accept or amend this turn's plan from the current board and your matchup plan. Cover the rest of this turn and the opponent's next turn. Your draw is still unknown.";
	return "Review the unfinished line after this turn's draw; the situation names the card you drew. Keep completed work completed and cover the opponent's next turn.";
}
