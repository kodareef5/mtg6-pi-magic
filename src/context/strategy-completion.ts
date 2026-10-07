/** Writer coverage checks describe missing intent; they never supply a policy. */
import type { Plan } from "../core/language.ts";
import type { Frame, Window } from "../core/types.ts";
import { matches } from "../core/query.ts";
import { STEPS, TURN } from "../core/steps.ts";

export type CompletionScope = "turn" | "preparation" | "response";
type TurnWindow = Extract<Window, { kind: "turn" }>;

/** Current steps include inserted/repeated steps; future turns use the ordinary
 * schedule, not a prediction of skipped steps, effects or surviving objects. */
export function completionWindows(frame: Frame, throughTurn: number | undefined, scope: CompletionScope): TurnWindow[] {
	const at = frame.view.window;
	if (at.kind !== "turn") return [];
	if (throughTurn === undefined || !Number.isInteger(throughTurn)) throw new Error("Completion coverage needs a finite throughTurn scope.");
	if (scope === "response") return [at];
	const preparation = scope === "preparation", first = preparation ? at.turn + 1 : at.turn;
	const active = preparation ? frame.seat : at.active;
	const seats = frame.view.players?.map((one) => one.id) ?? [];
	const index = seats.indexOf(active);
	if (index < 0) throw new Error("Completion coverage needs the projected seat order.");
	const windows: TurnWindow[] = [];
	for (let turn = first; turn <= throughTurn; turn++) {
		const steps = !preparation && turn === first ? frame.view.remainingSteps ?? TURN.slice(TURN.indexOf(at.step)) : TURN;
		for (const step of new Set(steps)) {
			const currentPriority = !preparation && turn === first && step === at.step && frame.decision?.situation === "priority";
			if (!STEPS[step].priority && !currentPriority) continue;
			windows.push({ kind: "turn", turn, active: seats[(index + turn - first) % seats.length]!, step, phase: STEPS[step].phase });
		}
	}
	return windows;
}

export function completionProblems(plan: Plan, windows: TurnWindow[], seat: number): string[] {
	const missing: string[] = [], conflicting: string[] = [];
	for (const window of windows) {
		const choices = new Set((plan.phases ?? []).filter((one) => matches(one.when, { seat, view: { window } }))
			.flatMap((one) => one.complete ? [one.complete] : []));
		const label = `turn ${window.turn} (${window.active === seat ? "self" : "opponent"}) ${window.step}`;
		if (!choices.size) missing.push(label);
		else if (choices.size > 1) conflicting.push(label);
	}
	return [...(missing.length ? [`Completion missing for ${missing.join(", ")}. Supply phases with explicit complete: pass or ask; broad when values may cover several windows.`] : []),
		...(conflicting.length ? [`Conflicting pass and ask completion for ${conflicting.join(", ")}. Make the authored policies agree; no precedence is inferred.`] : [])];
}
