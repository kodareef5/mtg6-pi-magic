/**
 * Choices the baseline rules would not offer, and the cards that add them
 * (docs/examples/baseline-overrides.md): an extra land play, lands from another
 * zone, flash, and "you may play that card". Read from a world, so the table and
 * a seat's view agree on what is offered.
 */
import { matches, type Seen, type World } from "./selectors.ts";
import type { Registration, Selector } from "./language.ts";
import type { SeatId } from "./types.ts";
import type { Zone } from "./syntax.ts";
import type { Note } from "./table.ts";

/** Only the named incarnation and allowed face receive a permission. */
export const permissions = (world: World, seat: SeatId, object: Seen, turn: number, face?: number) =>
	world.notes.filter((note): note is Extract<Note, { kind: "permit" }> => note.kind === "permit" && note.who === seat && note.fromTurn <= turn &&
		note.on.id === object.id && note.on.incarnation === object.incarnation && (!note.faces || note.faces.some((allowed) => allowed === (face ?? 0))));

/** A normal route and each distinct granted alternative price. Two alternative costs cannot combine. */
export function castingPrices(world: World, seat: SeatId, object: Seen, turn: number, face?: number, alternative = false): { mana?: string; permission?: string }[] {
	const permitted = permissions(world, seat, object, turn, face);
	const normal = object.zone === "hand" && object.owner === seat || !!object.copy && playable(world, seat, object, turn, false, face) || permitted.some((note) => note.mana === undefined);
	const prices: { mana?: string; permission?: string }[] = normal ? [{}] : [];
	if (!alternative) for (const note of permitted) if (note.mana !== undefined && !prices.some((price) => price.mana === note.mana)) prices.push({ mana: note.mana, permission: note.id });
	return prices;
}

/** What this seat's permanents permit it. Additional assumed registrations
 * support labelled forecasts, without adding an object or resolving a spell. */
export function allowance(world: World, seat: SeatId, assumed: readonly Registration[] = []): { lands: number; landsFrom: Zone[]; flash: Selector[] } {
	const found = { lands: 1, landsFrom: ["hand"] as Zone[], flash: [] as Selector[] };
	const current = world.objects.filter((object) => object.zone === "battlefield" && object.controller === seat)
		.flatMap((object) => world.read(object)?.registrations ?? []);
	for (const registration of [...current, ...assumed]) {
		if (registration.kind !== "permit") continue;
		found.lands += registration.lands ?? 0;
		for (const zone of registration.landsFrom ?? []) if (!found.landsFrom.includes(zone as Zone)) found.landsFrom.push(zone as Zone);
		if (registration.flash) found.flash.push(registration.flash);
	}
	return found;
}

/**
 * Whether this seat may play this card from where it is: its own hand, a land
 * from a zone a permanent opens, or a card a `permit` note names from this turn on.
 */
export function playable(world: World, seat: SeatId, object: Seen, turn: number, land: boolean, face?: number): boolean {
	if (object.copy) {
		const source = world.objects.find((one) => one.id === object.copy!.source.id && one.incarnation === object.copy!.source.incarnation);
		return object.zone === "exile" && !!source?.prepared && source.zone === "battlefield" && source.controller === seat && face === object.copy.face;
	}
	if (object.zone === "hand") return object.owner === seat;
	if (land && object.owner === seat && allowance(world, seat).landsFrom.includes(object.zone)) return true;
	return permissions(world, seat, object, turn, face).some((note) => !land || note.mana === undefined);
}

/** A spell this seat may cast as though it had flash, read as it will be on the stack, where a flash selector looks unless it says otherwise. */
export const flashed = (world: World, seat: SeatId, object: Seen) =>
	allowance(world, seat).flash.some((selector) => matches({ world, controller: seat }, { ...object, zone: "stack" }, { zones: ["stack"], ...selector }, world.read(object)));
