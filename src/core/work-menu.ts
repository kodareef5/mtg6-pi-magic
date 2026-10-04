/** Menus a person or a classifier can use to inspect and finish private work. */
import { occurrence, overdue, pendingReviews, positionStamp } from "./agenda.ts";
import { brokenReserves, candidates, draftDue, refuseExecution, missedStep } from "./draft.ts";
import type { Frame, Option } from "./types.ts";
import type { WorkCommand } from "./work-language.ts";

export type WorkOption = Option & { tools?: WorkCommand[]; execute?: string };

export function workMenu(frame: Frame): WorkOption[] {
	const work = frame.view.work;
	if (!work || frame.decision?.situation !== "priority") return [];
	const menu: WorkOption[] = [];
	for (const task of work.tasks.filter((task) => overdue(task, frame))) {
		menu.push({ id: `work:expire:${task.id}`, label: `Acknowledge missed check: ${task.label}. This performs no card instruction.`, tools: [{ do: "task.expire", id: task.id }] });
	}
	if (work.request || pendingReviews(frame).length) return menu;
	for (const recipe of work.suggested) {
		const prepared = work.recipes.find((entry) => entry.id === recipe)!;
		const shows = `${prepared.guidance} Sequence: ${prepared.steps.map((step) => step.label).join("; ")}. Adoption opens the draft; bind, ready and execute advance it one step at a time.`;
		if (!work.draft || work.draft.next === work.draft.steps.length) menu.push({ id: `work:adopt:${recipe}`, label: `Open draft: ${prepared.label}. No card moves yet.`, shows, tools: [{ do: "draft.start", recipe }] });
		menu.push({ id: `work:dismiss:${recipe}`, label: `Considered; decline nominated recipe ${recipe}.`, shows, tools: [{ do: "suggestion.dismiss", recipe }] });
	}
	const draft = work.draft;
	if (!draft || draft.next === draft.steps.length || draft.parked === occurrence(frame)) return menu;
	if (!draftDue(draft, frame) && !brokenReserves(draft, frame).length && !missedStep(draft, frame)) return menu;
	const choices = candidates(draft, frame);
	const bound = choices.find((option) => option.id === draft.bound);
	if (!refuseExecution(draft, frame)) menu.push({ ...bound, id: "work:execute", label: `Execute ${bound!.label}. Later steps still wait for their opportunities.`, execute: draft.id });
	const bindingCurrent = draft.boundObjects?.every((ref) => (frame.view.objects ?? []).some((object) => object.id === ref.id && object.incarnation === ref.incarnation));
	for (const option of choices.filter((option) => option.id !== draft.bound || !bindingCurrent)) menu.push({ ...option, id: `work:bind:${option.id}`, label: `Bind ${option.label}. This edits the draft and moves no card.`, tools: [{ do: "draft.bind", option: option.id }] });
	if (bound && !brokenReserves(draft, frame).length && (draft.status !== "ready" || draft.readyStamp !== positionStamp(frame))) {
		menu.push({ ...bound, id: "work:ready", label: `Accept ${bound.label} as ready. Execution remains a separate choice.`, tools: [{ do: "draft.ready" }] });
	}
	menu.push(
		{ id: "work:park", label: "Considered; leave this draft for another opportunity in the game.", tools: [{ do: "draft.park" }] },
		{ id: "work:cancel", label: "Abandon the remaining draft. Completed actions stay completed.", tools: [{ do: "draft.cancel" }] },
		{ id: "work:rethink", label: "Request strategy for this draft. No card moves.", tools: [{ do: "plan.request", reason: `Reconsider ${draft.label}: ${brokenReserves(draft, frame).join("; ") || (missedStep(draft, frame) ? "its scheduled opportunity was missed" : "the prepared line needs thought")}` }] },
	);
	return menu;
}

/** A pass cannot silently bypass due attention. Other listed plays remain available. */
export function needsAttention(frame: Frame): boolean {
	if (frame.decision?.situation !== "priority" || !frame.view.work) return false;
	return !!frame.view.work.request || planDue(frame) || pendingReviews(frame).length > 0 || workMenu(frame).length > 0;
}

/**
 * A seat that asked to plan each turn plans once per turn of its own, after it
 * has drawn: no plan accepted since its turn began. Before its first plan it
 * waits for an explicit request.
 */
export function planDue(frame: Frame): boolean {
	const work = frame.view.work, at = frame.view.window;
	return !!work?.eachTurn && work.accepted !== undefined && at.kind === "turn" && at.active === frame.seat && at.step !== "upkeep" &&
		work.accepted < (frame.view.began ?? 0);
}

/** Why strategy is being asked now, if it is. */
export const planReason = (frame: Frame): string | undefined =>
	frame.view.work?.request ?? (planDue(frame) ? "Your turn has begun and you have drawn. Plan this turn and the opponent's next turn." : undefined);
