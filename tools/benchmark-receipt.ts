/** Current facts beside commitments. This does not simulate the proposed line. */
import type { Frame, ObjectRef } from "../src/core/types.ts";
import type { Plan } from "../src/core/language.ts";
import { paymentForecast } from "../src/core/budget.ts";
import { select } from "../src/core/query.ts";
import { holds, viewWorld } from "../src/core/selectors.ts";
import { allowance } from "../src/core/permits.ts";
import { useSources } from "../src/core/readiness.ts";

export function commitmentReceipt(frame: Frame, plan: Plan) {
	const objects = frame.view.objects ?? [], forecast = paymentForecast(frame, plan);
	const name = (ref: ObjectRef) => ({ id: ref.id, incarnation: ref.incarnation, name: objects.find((one) => one.id === ref.id)?.card ?? objects.find((one) => one.id === ref.id)?.token?.name });
	const attacking = plan.steps.filter((one) => !("procedure" in one.action) && (one.action.prefix === "attack:" || one.action.option?.startsWith("attack:") && one.action.option !== "attack:done"));
	const selected = new Set(attacking.flatMap(({ action }) => "procedure" in action ? [] : action.objects
		? [...(action.objects.refs ?? []), ...select(action.objects, frame)].map((ref) => `${ref.id}@${ref.incarnation}`)
		: objects.filter((one) => action.option === `attack:${one.id}`).map((one) => `${one.id}@${one.incarnation}`)));
	const future = new Set(attacking.flatMap((one) => "objects" in one.action ? one.action.objects?.ids ?? [] : []));
	const creatures = objects.filter((one) => one.zone === "battlefield" && one.traits?.types.includes("creature"));
	const held = (plan.holds ?? []).map((one) => ({ purpose: one.purpose, objects: select(one.objects, frame).map(name),
		releasedNow: !!one.releaseWhen && holds({ world: viewWorld(frame.view), controller: frame.seat }, one.releaseWhen) }));
	return {
		...forecast,
		payments: forecast.payments.map((one) => ({ ...one, source: name(one.source),
			funding: { ...one.funding, taps: one.funding.taps.map((tap) => ({ ...tap, source: name(tap.source), disposition: tap.sacrifice ? "tap and sacrifice" : "tap" })) },
			untappedManaSourcesAfter: one.untappedManaSourcesAfter.map(name) })),
		currentCreatures: creatures.map((one) => ({ ...name(one), controller: one.controller, tapped: one.tapped, summoningSick: one.summoningSick, traits: one.traits,
			...(one.controller === frame.seat ? { commitment: selected.has(`${one.id}@${one.incarnation}`) ? "selected by an attack step; conditions and timing still apply" : "not selected by a specific attack step" } : {}) })),
		intendedEntries: plan.steps.flatMap((step) => {
			const action = step.action;
			const query = "procedure" in action ? action.procedure.timing === "spell" ? action.procedure.source : undefined : action.prefix === "land:" ? action.objects : undefined;
			return query ? select(query, frame).map((one) => ({ ...name(one), action: step.label, when: step.when,
				attackSelected: future.has(one.id) || selected.has(`${one.id}@${one.incarnation + ("procedure" in action ? 2 : 1)}`),
				status: "Proposed entry, dependent on successful resolution. Entry traits and attack eligibility are not certified." })) : [];
		}),
		holds: held,
		landPlaysLeftNow: allowance(viewWorld(frame.view), frame.seat).lands - (frame.view.landsPlayed ?? 0),
		permittedVisibleLands: useSources(frame, { source: { zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "land" })
			.filter((one) => one.traits?.types.includes("land")).map((one) => ({ ...name(one), zone: one.zone })),
	};
}
