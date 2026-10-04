/** One announced creature or player target. Wider target restrictions need more terms. */
import type { Activation } from "./table.ts";
import type { Frame, SeatView } from "./types.ts";

export type Target = NonNullable<Activation["target"]>;

export function targets(rule: Activation["targetRule"], view: SeatView): { target: Target; label: string }[] {
	if (!rule) return [];
	return [
		...(rule !== "player" ? (view.objects ?? []).filter((object) => object.zone === "battlefield" && object.traits?.types.includes("creature") && !object.faceDown)
			.map((object) => ({ target: { id: object.id, incarnation: object.incarnation }, label: `${object.card} (${object.id}@${object.incarnation})` })) : []),
		...(rule !== "creature" ? (view.pools ?? []).map(({ seat }) => ({ target: { player: seat }, label: `seat ${seat}` })) : []),
	];
}

export const targetId = (target: Target): string => "player" in target ? `seat-${target.player}` : `${target.id}@${target.incarnation}`;

export function targetAvailable(accepted: Activation, frame: Pick<Frame, "view">): boolean {
	return !accepted.targetRule ? !accepted.target : !!accepted.target && targets(accepted.targetRule, frame.view)
		.some(({ target }) => targetId(target) === targetId(accepted.target!));
}
