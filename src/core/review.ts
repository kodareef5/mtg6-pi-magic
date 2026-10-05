/** A seat's checklist at one decision. Assessing an item neither takes it nor ends the window. */
import type { Frame, Option } from "./types.ts";
import { planState } from "./planning.ts";
import { matches } from "./query.ts";
import type { Review } from "./work.ts";

export type ReviewItem = {
	id: string;
	label: string;
	kind: "step" | "branch" | "card" | "response" | "phase";
	options: string[];
	cards: string[];
	judgment?: Review;
};

/** The checklist comes from projected facts and unfinished plans, never hidden cards or Oracle interpretation. */
export function checklist(frame: Frame): ReviewItem[] {
	const { view, decision } = frame;
	if (view.window.kind !== "turn" || !decision || !view.work ||
		!(decision.situation === "priority" || decision.options.some((one) => ["attack:done", "block:done"].includes(one.id)))) return [];
	const items: ReviewItem[] = [], state = planState(frame), covered = new Set<string>(), sources = new Set<string>(), named = new Set<string>();
	const objects = view.objects ?? [];
	const add = (id: string, label: string, kind: ReviewItem["kind"], options: Option[], names: string[] = []) => {
		const visible = new Set(objects.flatMap((object) => object.card ? [object.card] : []));
		const cards = [...new Set([...names, ...options.flatMap((one) => one.objects?.flatMap((ref) => {
			const card = objects.find((object) => object.id === ref.id && object.incarnation === ref.incarnation)?.card;
			return card ? [card] : [];
		}) ?? [])])].filter((card) => visible.has(card));
		const judgment = view.work?.reviews?.find((one) => one.item === id && one.at === frame.version && one.plan === view.work?.planned);
		items.push({ id, label, kind, options: options.map((one) => one.id), cards, ...(judgment ? { judgment } : {}) });
		if (kind !== "phase") {
			options.forEach((one) => { covered.add(one.id); if (one.objects?.[0]) sources.add(`${one.objects[0].id}@${one.objects[0].incarnation}`); });
			if (kind === "step" || kind === "branch") names.forEach((name) => named.add(name));
		}
	};
	(state?.plan.phases ?? []).forEach((one, at) => {
		if (matches(one.when, frame)) add(`phase:${at}`, `Phase strategy: ${one.goal ?? one.guidance}`, "phase",
			decision.options.filter((one) => !["pass", "attack:done", "block:done"].includes(one.id)));
	});
	const stack = objects.filter((one) => one.zone === "stack");
	if (decision.situation === "priority" && stack.length) add("response", "Respond to the stack or let it resolve", "response", [], stack.flatMap((one) => one.card ? [one.card] : []));
	const done = new Set(view.done ?? []);
	for (const [kind, list] of [["step", state?.plan.steps ?? []], ["branch", state?.plan.may ?? []]] as const) list.forEach((one, at) => {
		if ((kind === "step" && done.has(at)) || !matches(one.when, frame)) return;
		const fit = (kind === "step" ? state?.due : state?.branches)?.find((one) => one.at === at);
		const card = "procedure" in one.action ? one.action.procedure.source.card : one.action.objects?.card;
		add(`${kind}:${at}`, one.label, kind, fit?.candidates ?? [], card ? [card] : []);
	});
	const uses = decision.options.filter((one) => !covered.has(one.id) && !["pass", "attack:done", "block:done"].includes(one.id));
	for (const object of objects) {
		if (sources.has(`${object.id}@${object.incarnation}`) || (object.card && named.has(object.card))) continue;
		const options = uses.filter((one) => one.objects?.[0]?.id === object.id && one.objects[0].incarnation === object.incarnation);
		const inHand = !stack.length && object.zone === "hand" && object.owner === frame.seat && view.window.active === frame.seat &&
			["precombat-main", "postcombat-main"].includes(view.window.step);
		if (options.length || inHand) add(`card:${object.id}@${object.incarnation}`, `Consider ${object.card ?? object.token?.name ?? "this object"}`, "card", options, object.card ? [object.card] : []);
	}
	return items;
}
