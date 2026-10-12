/** A Room's controller may pay for a locked door as a special action (116.2m).
 * No spell or activated ability goes on the stack. Its unlock can trigger one. */
import { faceFacts, room } from "./faces.ts";
import { manaChoices } from "./mana-cost.ts";
import { fundings, outputKey, paying } from "./funding.ts";
import { cardsIn, type Table } from "./table.ts";
import type { Frame } from "./types.ts";
import type { Move } from "./moves.ts";

export function unlocks(table: Table, frame: Frame): Move[] {
	if (table.cursor.active !== frame.seat || !["precombat-main", "postcombat-main"].includes(table.cursor.steps[0]!) || cardsIn(table, "stack").length) return [];
	return cardsIn(table, "battlefield").filter((object) => object.controller === frame.seat && !object.faceDown && room(table.printed[object.card ?? ""]))
		.flatMap((object) => ([0, 1] as const).filter((face) => !object.doors?.includes(face)).flatMap((face) => {
			const printed = faceFacts(table.printed[object.card!], face), costs = printed && manaChoices(printed.mana);
			return (costs ?? []).filter(cost => !cost.x).flatMap((cost, hybrid) => fundings(frame, cost).map(({ funding, shows }): Move => ({
				option: { id: `unlock:${object.id}@${object.incarnation}:${face}${costs!.length > 1 ? `:h${hybrid}` : ""}:${[...funding.paid, ...funding.taps.map((tap) => `${tap.source.id}${outputKey(tap)}${tap.life ? `~life${tap.life}` : ""}`)].join(",") || "free"}`,
					label: `Unlock ${printed!.name}`, shows: `Pay ${printed!.mana} as a special action. ${shows} This door's abilities become active; any unlock trigger then waits to go on the stack.`,
					objects: [{ id: object.id, incarnation: object.incarnation }, ...funding.taps.map((tap) => tap.source)] },
				changes: [...paying(funding, frame.seat, table.cursor.clock, 0), { do: "door", what: object.id, face, unlocked: true }], reason: "cost-payment",
			})));
		}));
}
