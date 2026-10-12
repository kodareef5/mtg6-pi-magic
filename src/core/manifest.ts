/** Manifest's public body and private, paid turn-face-up action (701.40, 708). */
import type { Printed } from "./printed.ts";
import { faceFacts } from "./faces.ts";
import type { Thing } from "./table.ts";
import type { Frame } from "./types.ts";
import type { Procedure } from "./language.ts";

/** The card, ignoring continuous effects, supplies the creature type and price. X is zero off the stack. */
export function faceUpCost(printed: Printed | undefined, object: Pick<Thing, "zone" | "faceDown" | "manifested">): string | undefined {
	const front = faceFacts(printed);
	return object.zone === "battlefield" && object.faceDown && object.manifested && front?.mana && /\bCreature\b/.test(front.type.split("—")[0]!)
		? front.mana.replaceAll("{X}", "{0}") : undefined;
}

/** Every adapter receives the same action, at either player's priority and with a stack present. */
export function faceUpUses(frame: Frame): { key: string; procedure: Procedure }[] {
	return (frame.view.objects ?? []).flatMap(object => {
		const mana = object.controller === frame.seat && faceUpCost(frame.view.printed?.[object.card ?? ""], object);
		return mana ? [{ key: `face-up:${object.id}@${object.incarnation}`, procedure: {
			claim: "Turn the manifested creature face up", basis: "701.40b: Show the creature card, pay its mana cost, then turn it face up.",
			timing: "special", special: "turn-face-up", source: { zones: ["battlefield"], controller: "self", refs: [{ id: object.id, incarnation: object.incarnation }] },
			cost: { mana }, instructions: [],
		} }] : [];
	});
}
