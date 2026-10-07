/** A seat's checklist at one decision. Assessing an item neither takes it nor ends the window. */
import type { Frame, Option } from "./types.ts";
import { laterStep, planState } from "./planning.ts";
import { matches } from "./query.ts";
import type { Review } from "./work.ts";
import { select } from "./query.ts";
import { holds, viewWorld } from "./selectors.ts";
import { flashed } from "./permits.ts";
import type { PlanOption } from "./language.ts";

export type ReviewItem = {
	id: string;
	label: string;
	kind: "step" | "branch" | "phase";
	status: "available" | "later" | "waiting" | "condition-false" | "unavailable" | "open" | "recorded";
	options: string[];
	cards: string[];
	/** Unrecorded actions in a phase's current window; absent if it has no explicit steps. */
	remaining?: string[];
	judgment?: Review;
};

/** Only name the stack as a prerequisite when the accepted use requires it empty. */
function waitsForStack(option: PlanOption, frame: Frame): boolean {
	const action = option.action, world = viewWorld(frame.view);
	if (!(frame.view.objects ?? []).some((one) => one.zone === "stack")) return false;
	if ("procedure" in action) {
		if (action.procedure.timing === "land" || action.procedure.speed === "sorcery") return true;
		if (action.procedure.timing !== "spell" || action.procedure.speed === "instant") return false;
	} else {
		if ((action.prefix ?? action.option ?? "").startsWith("land:")) return true;
		if (!(action.prefix ?? action.option ?? "").startsWith("cast:")) return false;
	}
	const query = "procedure" in action ? action.procedure.source : action.objects;
	if (!query) return false;
	const sources = select(query, frame);
	return !!sources.length && sources.every((one) => {
		const printed = frame.view.printed?.[one.card ?? ""];
		return !!printed && !/\bInstant\b/.test(printed.type) && !flashed(world, frame.seat, one) &&
			!(frame.view.work?.packages ?? []).some((pack) => pack.card === one.card && pack.procedures?.some((use) => use.timing === "spell" && use.speed === "instant"));
	});
}

/** The checklist comes from projected facts and unfinished plans, never hidden cards or Oracle interpretation. */
export function checklist(frame: Frame): ReviewItem[] {
	const { view, decision } = frame;
	if (view.window.kind !== "turn" || !decision || !view.work ||
		!(decision.situation === "priority" || decision.options.some((one) => ["attack:done", "block:done"].includes(one.id)))) return [];
	const items: ReviewItem[] = [], state = planState(frame);
	const objects = view.objects ?? [], done = new Set(view.done ?? []);
	const add = (id: string, label: string, kind: ReviewItem["kind"], status: ReviewItem["status"], options: Option[], names: string[] = [], remaining?: string[]) => {
		const visible = new Set(objects.flatMap((object) => object.card ? [object.card] : []));
		const cards = [...new Set([...names, ...options.flatMap((one) => one.objects?.flatMap((ref) => {
			const card = objects.find((object) => object.id === ref.id && object.incarnation === ref.incarnation)?.card;
			return card ? [card] : [];
		}) ?? [])])].filter((card) => visible.has(card));
		const judgment = view.work?.reviews?.find((one) => one.item === id && one.at === frame.version && one.plan === view.work?.planned);
		items.push({ id, label, kind, status, options: options.map((one) => one.id), cards, ...(remaining ? { remaining } : {}), ...(judgment ? { judgment } : {}) });
	};
	const steps = state?.plan.steps.flatMap((one, at) => matches(one.when, frame) ? [{ at, label: one.label }] : []) ?? [];
	(state?.plan.phases ?? []).forEach((one, at) => {
		const remaining = steps.length ? steps.filter((one) => !done.has(one.at)).map((one) => one.label) : undefined;
		if (matches(one.when, frame)) add(`phase:${at}`, `Phase strategy: ${one.goal ?? one.guidance}`, "phase", remaining?.length === 0 ? "recorded" : "open",
			decision.options.filter((one) => !["pass", "attack:done", "block:done"].includes(one.id)), [],
			remaining);
	});
	const scope = { world: viewWorld(view), controller: frame.seat };
	for (const [kind, list] of [["step", state?.plan.steps ?? []], ["branch", state?.plan.may ?? []]] as const) list.forEach((one, at) => {
		if ((kind === "step" && done.has(at)) || !matches(one.when, frame)) return;
		const fit = (kind === "step" ? state?.due : state?.branches)?.find((one) => one.at === at);
		const card = "procedure" in one.action ? one.action.procedure.source.card : one.action.objects?.card;
		const status = one.if && !holds(scope, one.if) ? "condition-false"
			: kind === "step" && state && laterStep(state, at) ? "later"
				: fit?.waiting ? "waiting" : fit?.candidates.length ? "available" : waitsForStack(one, frame) ? "waiting" : "unavailable";
		add(`${kind}:${at}`, one.label, kind, status, fit?.candidates ?? [], card ? [card] : []);
	});
	return items;
}
