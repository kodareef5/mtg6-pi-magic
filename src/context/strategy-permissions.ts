/** Conditional land candidates from accepted permissions. No resolution or unknown card is simulated. */
import type { Frame } from "../core/types.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { isPrintedCast } from "../core/procedures.ts";
import { useSources } from "../core/readiness.ts";
import type { actions } from "./plan-edit.ts";

export function permissionForecasts(frame: Frame, available: ReturnType<typeof actions>, turn?: number) {
	const world = viewWorld(frame.view), now = allowance(world, frame.seat), seen = new Set<string>();
	return Object.entries(available).flatMap(([key, one]) => {
		if (!("procedure" in one.action)) return [];
		const use = one.action.procedure, card = use.source.card;
		if (!card || seen.has(card) || !frame.view.printed?.[card] || !isPrintedCast(use, card, frame.view.printed[card])) return [];
		const bound = useSources(frame, use, turn);
		const pack = frame.view.work?.packages?.find((one) => one.card === card);
		if (!bound.length || !pack?.registers.some((one) => one.kind === "permit" && (one.lands || one.landsFrom?.length))) return [];
		seen.add(card);
		const after = allowance(world, frame.seat, pack.registers);
		const opened = after.landsFrom.filter((zone) => !now.landsFrom.includes(zone));
		const candidates = (frame.view.objects ?? []).filter((one) => one.card && one.owner === frame.seat &&
			one.traits?.types.includes("land") && opened.includes(one.zone)).map((one) => ({ card: one.card, zone: one.zone,
			ref: { id: one.id, incarnation: one.incarnation },
			action: { prefix: "land:", objects: { zones: [one.zone], refs: [{ id: one.id, incarnation: one.incarnation }] } } }));
		return [{ after: { reuse: key, card, sources: bound.map((one) => ({ id: one.id, incarnation: one.incarnation })) },
			landsPerTurn: { now: now.lands, after: after.lands }, openedZones: opened, candidates,
			assumptions: "The named ordinary permanent cast resolves under your control and retains its accepted unconditional permissions. Candidates already exist in visible zones; land timing, remaining plays and intervening responses still matter. Unknown mills, draws, triggered instructions and conditional permissions are not forecast." }];
	});
}
