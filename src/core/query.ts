/** Reading a seat's frame for a plan: whether a window is now, and which projected objects a query names. */
import type { Frame, SeatId, Window } from "./types.ts";
import type { SeenObject } from "./work.ts";
import type { Query, When } from "./work-language.ts";
import { STEPS, TURN, type Step } from "./steps.ts";

/** Tactical intent expires together, including holds without their own window. */
export function currentPlan(frame: Frame) {
	const plan = frame.view.work?.plan, at = frame.view.window;
	return plan && (plan.throughTurn === undefined || at.kind === "turn" && at.turn <= plan.throughTurn) ? plan : undefined;
}

/** Whether this window is now: whose turn, which step or phase, which turns. Only turn windows match. */
export function matches(when: When, frame: { seat: SeatId; view: { window: Window } }): boolean {
	const at = frame.view.window;
	if (at.kind !== "turn") return false;
	return (!when.active || when.active === "any" || (when.active === "self" ? at.active === frame.seat : at.active !== frame.seat)) &&
		(!when.step || when.step === at.step) && (!when.phase || when.phase === at.phase) &&
		(when.fromTurn === undefined || at.turn >= when.fromTurn) &&
		(when.throughTurn === undefined || at.turn <= when.throughTurn);
}

/** A window this turn has reached: the named side's turn at its step or phase or any later step. Released holds use it. */
export function reached(when: When, frame: { seat: SeatId; view: { window: Window } }): boolean {
	const at = frame.view.window;
	if (at.kind !== "turn" || when.throughTurn !== undefined && at.turn > when.throughTurn) return at.kind === "turn";
	if (when.fromTurn !== undefined && at.turn < when.fromTurn) return false;
	if (when.active && when.active !== "any" && (when.active === "self") !== (at.active === frame.seat)) return false;
	const first = when.step ?? TURN.find((step) => STEPS[step].phase === when.phase);
	return !first || TURN.indexOf(at.step as Step) >= TURN.indexOf(first);
}

/** Queries operate only on already projected objects. Missing names stay missing. */
export function select(query: Query, frame: Frame): SeenObject[] {
	return (frame.view.objects ?? []).filter((item) =>
		(!query.zones || query.zones.includes(item.zone)) &&
		(!query.controller || query.controller === "any" || (query.controller === "self" ? item.controller === frame.seat : item.controller !== frame.seat)) &&
		(!query.card || query.card === (item.card ?? item.token?.name)) && (query.tapped === undefined || query.tapped === item.tapped) &&
		(!query.ids || query.ids.includes(item.id)) &&
		(!query.types || query.types.some((type) => item.traits?.types.includes(type))) &&
		(!query.refs || query.refs.some((ref) => ref.id === item.id && ref.incarnation === item.incarnation)),
	).sort((a, b) => a.id.localeCompare(b.id));
}
