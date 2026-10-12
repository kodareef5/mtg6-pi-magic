/** Public action counts from recorded physical changes, without exposing the cards involved. */
import type { Receipt, Table } from "./table.ts";
import type { SeatId } from "./types.ts";

export type PhysicalAction = "descended" | "entered-face-down" | "turned-face-up" | "sacrificed";
export type PhysicalEvent = { kind: "physical"; action: PhysicalAction; by: SeatId };

/** 700.11 counts permanent cards arriving in the graveyard, even if they later leave.
 * Face-down entry and face-up special actions use event-time controllers, not current ones. */
export function physicalHistory(receipt: Receipt, printed: Table["printed"]): PhysicalEvent[] {
	if (receipt.reason === "game-setup") return [];
	const events: PhysicalEvent[] = [], objects = { ...receipt.before };
	for (const change of receipt.changes) {
		if (change.do === "move") {
			const was = objects[change.what];
			if (!was || was.zone === change.to && change.to !== "exile") continue;
			const controller = change.controller ?? was.owner;
			if (was.zone === "battlefield" && change.reason === "sacrifice") events.push({ kind: "physical", action: "sacrificed", by: was.controller });
			if (change.to === "graveyard" && was.card && !was.token && !was.copy &&
				/\b(Artifact|Battle|Creature|Enchantment|Land|Planeswalker)\b/.test(printed[was.card]?.type.split("—")[0] ?? ""))
				events.push({ kind: "physical", action: "descended", by: was.owner });
			if (change.to === "battlefield" && change.faceDown) events.push({ kind: "physical", action: "entered-face-down", by: controller });
			objects[was.id] = { ...was, zone: change.to, controller, faceDown: !!change.faceDown };
		}
		if (change.do === "turn-face-up") {
			const was = objects[change.what];
			if (was?.zone === "battlefield" && was.faceDown) {
				events.push({ kind: "physical", action: "turned-face-up", by: was.controller });
				objects[was.id] = { ...was, faceDown: false };
			}
		}
	}
	return events;
}
