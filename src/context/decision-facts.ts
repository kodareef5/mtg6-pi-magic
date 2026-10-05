/** Projected dependencies of an opening, use, response, combat or resolution question. */
import type { Frame, Option } from "../core/types.ts";
import type { ReviewItem } from "../core/review.ts";
import type { Selector } from "../core/language.ts";
import { matches, viewWorld } from "../core/selectors.ts";
import { select } from "../core/query.ts";

export function decisionFacts(frame: Frame, options: readonly Option[], attention: readonly ReviewItem[] = []) {
	const all = frame.view.objects ?? [], world = viewWorld(frame.view), reasons = new Map<string, Set<string>>();
	const add = (id: string, why: string) => { const set = reasons.get(id) ?? new Set(); set.add(why); reasons.set(id, set); };
	const opening = frame.view.window.kind === "opening";
	if (opening) all.filter((one) => one.zone === "hand" && one.owner === frame.seat).forEach((one) => add(one.id, "opening hand"));
	else {
		for (const option of options) for (const ref of option.objects ?? []) if (all.some((one) => one.id === ref.id && one.incarnation === ref.incarnation)) add(ref.id, "offered source, target or payment");
		for (const one of all) {
			if (attention.some((item) => item.cards.includes(one.card ?? ""))) add(one.id, "unfinished use needing a completion check");
			if (one.zone === "stack") add(one.id, "pending stack effect");
			if (frame.view.window.kind === "turn" && frame.view.window.phase === "combat" && one.zone === "battlefield" && one.traits?.types.includes("creature")) add(one.id, "combat participant or potential blocker");
		}
		for (const hold of frame.view.work?.plan?.holds ?? []) for (const one of select(hold.objects, frame)) add(one.id, "reserved resource");
	}
	// Read only structured selectors and references. Never interpret printed prose.
	const dependencies = (value: unknown, source?: typeof all[number]) => {
		if (!value || typeof value !== "object") return;
		if (Array.isArray(value)) { value.forEach((one) => dependencies(one, source)); return; }
		const object = value as Record<string, unknown>;
		if (typeof object.id === "string" && typeof object.incarnation === "number" && all.some((one) => one.id === object.id && one.incarnation === object.incarnation)) add(object.id, "bound object");
		for (const [key, term] of Object.entries(object)) {
			if (["every", "choose", "from", "affects", "object", "count", "of"].includes(key) && term && typeof term === "object" && !Array.isArray(term) && !("id" in term)) {
				for (const one of all) if (matches({ world, controller: source?.controller ?? frame.seat, ...(source ? { source } : {}) }, one, term as Selector)) add(one.id, "structured selector dependency");
			}
			dependencies(term, source);
		}
	};
	if (!opening) {
		dependencies(frame.view.resolution);
		for (const option of options) dependencies(option.use, all.find((one) => one.id === option.use?.source.id));
		// Standing effects can alter a use before it happens. Include their source
		// and dependencies, even when that source is not an offered target.
		for (const one of all.filter((one) => one.zone === "battlefield")) {
			const standing = (one.traits?.registrations ?? []).filter((one) => one.kind !== "mana" && one.kind !== "watch");
			if (standing.length) { add(one.id, "standing effect"); dependencies(standing, one); }
		}
		const visited = new Set<string>();
		for (;;) {
			const next = all.find((one) => reasons.has(one.id) && !visited.has(one.id));
			if (!next) break; visited.add(next.id);
			dependencies(next.ability, next);
			dependencies(next.attached, next);
			dependencies(next.traits?.registrations, next);
			for (const attachment of all) if (attachment.attached?.id === next.id && attachment.attached.incarnation === next.incarnation) add(attachment.id, "attachment");
		}
	}
	const objects = all.filter((one) => reasons.has(one.id));
	return { objects, reasons: Object.fromEntries([...reasons].map(([id, why]) => [id, [...why]])) };
}
