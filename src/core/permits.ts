/**
 * Choices the baseline rules would not offer, and the cards that add them
 * (docs/examples/baseline-overrides.md): an extra land play, lands from another
 * zone, flash, and "you may play that card". Read from a world, so the table and
 * a seat's view agree on what is offered.
 */
import { holds, matches, players, type Seen, type World } from "./selectors.ts";
import type { Registration, Selector } from "./language.ts";
import type { SeatId } from "./types.ts";
import type { Zone } from "./syntax.ts";
import type { Note } from "./table.ts";
import { faceFacts } from "./faces.ts";
import { printedTraits } from "./characteristics.ts";

/** Only the named incarnation and allowed face receive a granted permission.
 * A card's own standing permission is derived in its stated zone for its owner. */
export const permissions = (world: World, seat: SeatId, object: Seen, turn: number, face?: number) => [
	...world.notes.filter((note): note is Extract<Note, { kind: "permit" }> => note.kind === "permit" && note.who === seat && note.fromTurn <= turn &&
		note.on.id === object.id && note.on.incarnation === object.incarnation && (!note.faces || note.faces.some((allowed) => allowed === (face ?? 0))) &&
		(!note.of || permittedSpell(world, seat, object, face, note.of))),
	...(object.owner === seat ? world.read(object)?.registrations ?? [] : []).flatMap((one, at) => one.kind === "permit" && one.cast?.from.includes(object.zone as never) &&
		(one.face === undefined || one.face === (face ?? 0)) ? [{ id: `own:${object.id}@${object.incarnation}:${at}`, mana: one.cast.mana, leavesStack: one.cast.leavesStack as Zone | undefined }] : []),
];

function permittedSpell(world: World, controller: SeatId, object: Seen, face: number | undefined, selector: Selector): boolean {
	const printed = faceFacts(world.printed?.[object.card ?? ""], face);
	const source = { ...object, zone: "stack" as const, face: (face ?? 0) as 0 | 1 };
	return matches({ world, controller, source }, source, { zones: ["stack"], ...selector }, printed ? printedTraits(printed, object.card!) : world.read(source));
}

/** A printed-cost permission reads the chosen spell face, including its X symbols. */
export const permissionMana = (mana: string | undefined, printed: string | undefined) => mana === "printed" ? printed : mana;
type CastingPrice = { mana?: string; permission?: string; leavesStack?: Zone };

/** A normal route and each distinct granted alternative price. Two alternative costs cannot combine. */
export function castingPrices(world: World, seat: SeatId, object: Seen, turn: number, face?: number, alternative?: string): CastingPrice[] {
	const permitted = permissions(world, seat, object, turn, face);
	const normal = object.zone === "hand" && object.owner === seat || !!object.copy && playable(world, seat, object, turn, false, face) || permitted.some((note) => note.mana === undefined);
	const prices: CastingPrice[] = normal ? [{}] : [];
	for (const note of permitted) if (note.mana !== undefined && (!alternative || alternative === permissionMana(note.mana, faceFacts(world.printed?.[object.card ?? ""], face)?.mana)) &&
		!prices.some((price) => price.mana === note.mana && price.leavesStack === note.leavesStack))
		prices.push({ mana: note.mana, permission: note.id, ...(note.leavesStack ? { leavesStack: note.leavesStack } : {}) });
	return prices;
}

/** Read standing casting restrictions through the layer walk, so removal of abilities ends them. */
export function castRestrictions(world: World, seat: SeatId): string[] {
	return world.objects.filter((source) => source.zone === "battlefield").flatMap((source) => {
		const scope = { world, source, controller: source.controller };
		return (world.read(source)?.registrations ?? []).flatMap((registration) => registration.kind === "prohibit" && "cast" in registration &&
			players(scope, registration.cast).includes(seat) && (!registration.during || world.turn && players(scope, registration.during).includes(world.turn.active)) &&
			(!registration.if || holds(scope, registration.if)) ? [`${world.read(source)?.name ?? source.id}: ${registration.basis}`] : []);
	});
}

/** Activation restrictions follow the source in every zone, including a visible card in hand. */
export function activationRestrictions(world: World, object: Seen, mana = false): string[] {
	return world.objects.filter((source) => source.zone === "battlefield").flatMap((source) => {
		const scope = { world, source, controller: source.controller };
		return (world.read(source)?.registrations ?? []).flatMap((registration) => registration.kind === "prohibit" && "activate" in registration &&
			!(mana && registration.exceptMana) && (!registration.if || holds(scope, registration.if)) &&
			matches(scope, object, registration.activate, world.read(object), [object.zone])
			? [`${world.read(source)?.name ?? source.id}: ${registration.basis}`] : []);
	});
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
