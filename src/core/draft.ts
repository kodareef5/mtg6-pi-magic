/** Preparing listed moves. A binding is editable; only execution moves the game. */
import { matches, occurrence, select, positionStamp, overdue, pendingReviews } from "./agenda.ts";
import type { Frame, Option } from "./types.ts";
import type { Draft } from "./work.ts";
import { procedureOptions } from "./procedures.ts";

export function candidates(draft: Draft, frame: Frame): Option[] {
	const step = draft.steps[draft.next];
	if (!step || !matches(step.when, frame)) return [];
	const { action } = step;
	if ("procedure" in action) return procedureOptions(draft, frame).map((choice) => choice.option);
	const objects = action.objects ? select(action.objects, frame) : null;
	return (frame.decision?.options ?? []).filter((option) =>
		(!action.option || option.id === action.option) && (!action.prefix || option.id.startsWith(action.prefix)) &&
		(!objects || objects.some((object) => option.objects?.some((ref) => ref.id === object.id && ref.incarnation === object.incarnation))),
	);
}

export function brokenReserves(draft: Pick<Draft, "reserves">, frame: Frame): string[] {
	return draft.reserves.flatMap((reserve) => {
		const found = (frame.view.objects ?? []).find((item) => item.id === reserve.object.id && item.incarnation === reserve.object.incarnation);
		return !found || (reserve.tapped !== undefined && reserve.tapped !== found.tapped)
			? [`${reserve.object.id}@${reserve.object.incarnation}: ${reserve.purpose}`] : [];
	});
}

export function draftDue(draft: Draft, frame: Frame): boolean {
	const step = draft.steps[draft.next];
	return !!step && draft.parked !== occurrence(frame) && matches(step.when, frame);
}

export function missedStep(draft: Draft, frame: Frame): boolean {
	const through = draft.steps[draft.next]?.when.throughTurn;
	return through !== undefined && frame.view.window.kind === "turn" && frame.view.window.turn > through;
}

export function refuseExecution(draft: Draft, frame: Frame): string | null {
	if (!draftDue(draft, frame)) return "This draft is waiting for another opportunity.";
	if (draft.status !== "ready") return "This draft has not been accepted as ready.";
	if (brokenReserves(draft, frame).length) return "A reserved resource changed; inspect or revise the draft.";
	if (draft.boundObjects?.some((ref) => !(frame.view.objects ?? []).some((object) => object.id === ref.id && object.incarnation === ref.incarnation))) return "A bound object changed incarnation; bind this step again.";
	if (!candidates(draft, frame).some((option) => option.id === draft.bound)) return "The bound move is no longer offered; bind it again.";
	if (draft.readyStamp !== positionStamp(frame)) return "The position changed; inspect and accept readiness again.";
	if (frame.view.work?.request) return "Strategy is still requested for this draft.";
	if (draft.bound === "pass" && (pendingReviews(frame).length || frame.view.work?.suggested.length || frame.view.work?.tasks.some((task) => overdue(task, frame)))) return "Other due work remains unconsidered before this pass.";
	return null;
}
