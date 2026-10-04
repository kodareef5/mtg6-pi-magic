/** Reading a seat's frame for a plan: whether a window is now, and which projected objects a query names. */
import type { Frame } from "./types.ts";
import type { SeenObject } from "./work.ts";
import type { Query, When } from "./work-language.ts";

/** Whether this window is now: whose turn, which step or phase, which turns. Only turn windows match. */
export function matches(when: When, frame: Frame): boolean {
	const at = frame.view.window;
	if (at.kind !== "turn") return false;
	return (!when.active || when.active === "any" || (when.active === "self" ? at.active === frame.seat : at.active !== frame.seat)) &&
		(!when.step || when.step === at.step) && (!when.phase || when.phase === at.phase) &&
		(when.fromTurn === undefined || at.turn >= when.fromTurn) &&
		(when.throughTurn === undefined || at.turn <= when.throughTurn);
}

/** Queries operate only on already projected objects. Missing names stay missing. */
export function select(query: Query, frame: Frame): SeenObject[] {
	return (frame.view.objects ?? []).filter((item) =>
		(!query.zones || query.zones.includes(item.zone)) &&
		(!query.controller || query.controller === "any" || (query.controller === "self" ? item.controller === frame.seat : item.controller !== frame.seat)) &&
		(!query.card || query.card === item.card) && (query.tapped === undefined || query.tapped === item.tapped) &&
		(!query.refs || query.refs.some((ref) => ref.id === item.id && ref.incarnation === item.incarnation)),
	).sort((a, b) => a.id.localeCompare(b.id));
}
