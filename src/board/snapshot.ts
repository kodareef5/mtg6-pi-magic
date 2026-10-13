/**
 * The board as one viewer may see it, in Magic terms, for drawing. Built from a projected view,
 * so a hidden card never enters it: other hands are counts, face-down cards have no name.
 * Renderer-neutral and pure. A renderer decides layout and look; nothing here draws.
 */
import { createHash } from "node:crypto";
import type { SeatId, SeatView as View } from "../core/types.ts";
import type { SeenObject } from "../core/work.ts";

export type BoardCard = {
	/** The engine's object id: stable while the object stays in one zone. */
	id: string;
	/** Absent for a face-down or unknown card. */
	name?: string;
	token?: true;
	types: string[];
	tapped?: true;
	attacking?: true;
	blocking?: true;
	summoningSick?: true;
	power?: number;
	toughness?: number;
	damage?: number;
	counters?: Record<string, number>;
	/** Keywords and restriction words as they are now. */
	words?: string[];
	attachedTo?: string;
};
export type BoardSeat = {
	id: SeatId; name: string; deck?: string; life: number; library: number;
	/** Hand size; the cards themselves only for the viewer's own hand. */
	hand: number; handCards?: BoardCard[];
	battlefield: BoardCard[]; graveyard: BoardCard[]; exile: BoardCard[];
};
/** A spell or ability on the stack, top first, with what it targets. */
export type BoardStackItem = BoardCard & { controller: SeatId; claim?: string; targets: (string | { player: SeatId })[] };
export type BoardSnapshot = {
	viewer: SeatId | "spectator";
	turn?: number; active?: SeatId; step?: string; finished?: true;
	seats: BoardSeat[];
	stack: BoardStackItem[];
	/** Who attacks whom and what blocks each attacker, by object id, from declaration to the end of combat. */
	combat?: { attacker: string; defending: SeatId; blockers: string[] }[];
};

/**
 * What a viewer's board shows, as a short key: the same board, card for card,
 * has the same key. Engine ids are left out, so the key says nothing the board
 * does not: an id names a card's place in its registered list even face down.
 */
export const boardKey = (snapshot: BoardSnapshot): string => createHash("sha256")
	.update(JSON.stringify([snapshot.seats, snapshot.stack], (key, value) => key === "id" || key === "attachedTo" || key === "targets" ? undefined : value))
	.digest("base64url").slice(0, 16);

/** `seats` names each seat and its deck; the view supplies everything else. */
export function boardSnapshot(view: View, seats: readonly { id: SeatId; name: string; deck?: string }[], viewer: SeatId | "spectator"): BoardSnapshot {
	const objects = view.objects ?? [];
	const combat = view.combat ?? undefined;
	const attacking = new Set(combat?.attackers.map((one) => `${one.id}@${one.incarnation}`));
	const blocking = new Set(combat?.blockers.map((one) => `${one.id}@${one.incarnation}`));
	const nameOf = (one: SeenObject): string | undefined => one.faceDown ? undefined : one.card ?? one.token?.name ??
		(one.ability ? objects.find((source) => source.id === one.ability!.source?.id)?.card ?? one.ability.claim : undefined);
	const card = (one: SeenObject): BoardCard => {
		const traits = one.traits, key = `${one.id}@${one.incarnation}`, name = nameOf(one);
		return { id: one.id, ...(name ? { name } : {}), ...(one.token ? { token: true as const } : {}), types: [...(traits?.types ?? [])],
			...(one.tapped ? { tapped: true as const } : {}), ...(attacking.has(key) ? { attacking: true as const } : {}), ...(blocking.has(key) ? { blocking: true as const } : {}),
			...(one.summoningSick ? { summoningSick: true as const } : {}),
			...(traits?.power !== undefined && one.zone === "battlefield" ? { power: traits.power, toughness: traits.toughness } : {}),
			...(one.damage ? { damage: one.damage } : {}), ...(Object.keys(one.counters ?? {}).length ? { counters: { ...one.counters } } : {}),
			...(traits?.words.length && one.zone === "battlefield" ? { words: [...traits.words] } : {}), ...(one.attached ? { attachedTo: one.attached.id } : {}) };
	};
	const zone = (seat: SeatId, name: string) => objects.filter((one) => one.zone === name && (name === "battlefield" ? one.controller === seat : one.owner === seat)).map(card);
	const window = view.window;
	return {
		viewer,
		...(window.kind === "turn" ? { turn: window.turn, active: window.active, step: window.step } : window.kind === "finished" ? { finished: true as const } : {}),
		seats: seats.map((seat) => {
			const facts = view.players?.find((one) => one.id === seat.id);
			return { id: seat.id, name: seat.name, ...(seat.deck ? { deck: seat.deck } : {}), life: facts?.life ?? 0, library: facts?.library ?? 0, hand: facts?.hand ?? 0,
				...(viewer === seat.id ? { handCards: zone(seat.id, "hand") } : {}),
				battlefield: zone(seat.id, "battlefield"), graveyard: zone(seat.id, "graveyard"), exile: zone(seat.id, "exile") };
		}),
		stack: objects.filter((one) => one.zone === "stack").sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((one) => ({
			...card(one), controller: one.controller, ...(one.ability?.claim ? { claim: one.ability.claim } : {}),
			targets: (one.ability?.targets ?? []).flat().map((aim) => "player" in aim ? { player: aim.player } : aim.id) })),
		...(combat?.attackers.length ? { combat: combat.attackers.map((one) => ({ attacker: one.id, defending: one.defending,
			blockers: combat.blockers.filter((block) => block.blocking.some((ref) => ref.id === one.id && ref.incarnation === one.incarnation)).map((block) => block.id) })) } : {}),
	};
}
