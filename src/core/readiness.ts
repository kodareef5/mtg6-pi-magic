/** Known uses whose source is now available to this seat. No Oracle interpretation or table writes. */
import type { Decision, Frame } from "./types.ts";
import { select } from "./query.ts";
import { playable } from "./permits.ts";
import { viewWorld } from "./selectors.ts";

/** Availability means a visible source in an accepted scope, not affordable mana or a legal target. */
export function preparation(frame: Frame): NonNullable<Decision["preparation"]> {
	if (frame.view.window.kind !== "turn") return [];
	const world = viewWorld(frame.view), turn = frame.view.window.turn;
	return (frame.view.work?.packages ?? []).flatMap((pack) => {
		const uses = (pack.deferred ?? []).filter((use) => select(use.source, frame).some((source) =>
			use.timing !== "spell" || playable(world, frame.seat, source, turn, false)));
		return uses.length ? [{ card: pack.card, uses: structuredClone(uses) }] : [];
	});
}
