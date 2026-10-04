/**
 * Choices the baseline rules would not offer, and the cards that add them
 * (docs/examples/baseline-overrides.md): an extra land play, lands from another
 * zone, flash, and "you may play that card". Read from a world, so the table and
 * a seat's view agree on what is offered.
 */
import { matches, type Seen, type World } from "./selectors.ts";
import type { Selector } from "./language.ts";
import type { SeatId } from "./types.ts";
import type { Zone } from "./syntax.ts";

/** What this seat's permanents permit it now. */
export function allowance(world: World, seat: SeatId): { lands: number; landsFrom: Zone[]; flash: Selector[] } {
	const found = { lands: 1, landsFrom: ["hand"] as Zone[], flash: [] as Selector[] };
	for (const object of world.objects) {
		if (object.zone !== "battlefield" || object.controller !== seat) continue;
		for (const registration of world.read(object)?.registrations ?? []) {
			if (registration.kind !== "permit") continue;
			found.lands += registration.lands ?? 0;
			for (const zone of registration.landsFrom ?? []) if (!found.landsFrom.includes(zone as Zone)) found.landsFrom.push(zone as Zone);
			if (registration.flash) found.flash.push(registration.flash);
		}
	}
	return found;
}

/**
 * Whether this seat may play this card from where it is: its own hand, a land
 * from a zone a permanent opens, or a card a `permit` note names from this turn on.
 */
export function playable(world: World, seat: SeatId, object: Seen, turn: number, land: boolean): boolean {
	if (object.zone === "hand") return object.owner === seat;
	if (land && object.owner === seat && allowance(world, seat).landsFrom.includes(object.zone)) return true;
	return world.notes.some((note) => note.kind === "permit" && note.who === seat && note.fromTurn <= turn &&
		note.on.id === object.id && note.on.incarnation === object.incarnation);
}

/** A spell this seat may cast as though it had flash, read as it will be on the stack. */
export const flashed = (world: World, seat: SeatId, object: Seen) =>
	allowance(world, seat).flash.some((selector) => matches({ world, controller: seat }, { ...object, zone: "stack" }, selector, world.read(object)));
