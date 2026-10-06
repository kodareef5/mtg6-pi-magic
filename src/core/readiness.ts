/** Known uses whose source is now available to this seat. No Oracle interpretation or table writes. */
import type { Decision, Frame } from "./types.ts";
import type { Procedure } from "./language.ts";
import { select } from "./query.ts";
import { playable } from "./permits.ts";
import { viewWorld } from "./selectors.ts";

/** Visible sources in the accepted zone with this seat's permission. Costs, targets and timing are separate. */
export function useSources(frame: Frame, use: Pick<Procedure, "source" | "timing">,
	turn = frame.view.window.kind === "turn" ? frame.view.window.turn : 0) {
	const played = use.timing === "spell" || use.timing === "land";
	const world = viewWorld(frame.view);
	return select({ ...use.source, zones: use.source.zones ?? [played ? "hand" : "battlefield"] }, frame)
		.filter((source) => (source.card || source.token) && (played
			? playable(world, frame.seat, source, turn, use.timing === "land")
			: (source.zone === "battlefield" || source.zone === "stack" ? source.controller : source.owner) === frame.seat));
}

/** Availability means a visible source in an accepted scope, not affordable mana or a legal target. */
export function preparation(frame: Frame): NonNullable<Decision["preparation"]> {
	if (frame.view.window.kind !== "turn") return [];
	return (frame.view.work?.packages ?? []).flatMap((pack) => {
		const uses = (pack.deferred ?? []).filter((use) => useSources(frame, use).length);
		return uses.length ? [{ card: pack.card, uses: structuredClone(uses) }] : [];
	});
}
