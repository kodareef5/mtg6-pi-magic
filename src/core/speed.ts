/** Player speed outlives the permanent that started it. Its inherent trigger has no source (702.179). */
import { characteristics, has } from "./characteristics.ts";
import { cardsIn, playing, type Table, type Trigger } from "./table.ts";
import type { Change } from "./syntax.ts";

export const SPEED_BASIS = "702.179d: Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1. This ability triggers only once each turn.";

/** Starting speed is one state-based action per player, independent of the number of engines. */
export function startingSpeed(table: Table): Change[] {
	return playing(table).filter(player => player.speed === undefined && cardsIn(table, "battlefield").some(object =>
		object.controller === player.id && has(characteristics(table, object), "start your engines!")))
		.map(player => ({ do: "increase-speed", who: player.id, amount: 1 }));
}

/** Read actual losses, not net life change: simultaneous gain cannot erase a loss. */
export function speedTrigger(table: Table, changes: readonly Change[]): Omit<Trigger, "id"> | undefined {
	const player = playing(table).find(one => one.id === table.cursor.active);
	if (!table.cursor.turn || !player?.speed || player.speed >= 4) return;
	if (!changes.some(change => change.do === "change-life" ? change.who !== player.id && change.amount < 0 :
		change.do === "damage" && "player" in change.target && change.target.player !== player.id && change.amount > 0)) return;
	return { controller: player.id, basis: SPEED_BASIS, turn: table.cursor.turn, limit: "once-per-turn", event: {},
		check: { amount: { speed: "you" }, atMost: 3 }, effect: { instructions: [{ do: "increase-speed", who: "you", amount: 1 }] } };
}
