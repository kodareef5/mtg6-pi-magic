/** A proposed use retains its accepted meaning while the seat selects its parts.
 * Feasibility reads projected resources; it neither chooses nor spends them. */
import { offerBases, offerCosts, paidActivation, targetCandidates, type OfferBase, type OfferCost } from "./announce.ts";
import { payable, paymentOptions } from "./payment-options.ts";
import { targetKey, type Chosen } from "./selectors.ts";
import type { Activation, LedgerRow } from "./table.ts";
import type { Procedure } from "./language.ts";
import type { Frame, ObjectRef, Option } from "./types.ts";

export type Announcement = {
	controller: number; source: ObjectRef; prefix: string; procedure: Procedure; permission?: string;
	x?: number; targets: Chosen[][]; selecting: Chosen[]; cost?: OfferCost; payment: string[];
	execution?: LedgerRow["execution"];
	/** Accepted plan whose guidance accompanies the selected use. */
	plan?: number;
};
export type AnnouncementOffer = { option: Option; announcement: Announcement };

/** A selected source is read again without substituting an equivalent object. */
export function* announcementBases(frame: Frame, draft: Announcement) {
	for (const base of offerBases({ ...draft.procedure, source: { ...draft.procedure.source, refs: [draft.source] } }, frame, draft.prefix)) {
		if (base.granted.permission === draft.permission && (draft.x === undefined || base.x === draft.x)) yield base;
	}
}

export function affordableCosts(base: OfferBase, frame: Frame, targets: Chosen[][]): OfferCost[] {
	return offerCosts({ ...base, scope: { ...base.scope, targets } }, frame).filter((way) =>
		payable(frame, { ...way.price, life: way.extra.paid.life }, new Set(way.extra.uses), base.spending));
}

/** Find one possible completion, without allocating every combination of targets.
 * The witness stays internal: no target or payment is selected for the seat. */
export function canAnnounce(base: OfferBase, frame: Frame, completed: Chosen[][] = [], selected: Chosen[] = []): boolean {
	const visit = (targets: Chosen[][], selected: Chosen[]): boolean => {
		const slot = base.slots[targets.length];
		if (!slot) return affordableCosts(base, frame, targets).length > 0;
		const minimum = slot.atLeast ?? (slot.upTo ? 0 : slot.count ?? 1), maximum = slot.count ?? 1;
		const pool = targetCandidates(slot, { ...base.scope, targets });
		if (selected.length > maximum || new Set(selected.map(targetKey)).size !== selected.length ||
			selected.some((one) => !pool.some((candidate) => targetKey(candidate) === targetKey(one)))) return false;
		const remaining = pool.filter((one) => !selected.some((old) => targetKey(old) === targetKey(one)));
		const fill = (at: number, chosen: Chosen[]): boolean => {
			if (chosen.length >= minimum && visit([...targets, chosen], [])) return true;
			if (chosen.length === maximum || chosen.length + remaining.length - at < minimum) return false;
			for (let next = at; next < remaining.length; next++) if (fill(next + 1, [...chosen, remaining[next]!])) return true;
			return false;
		};
		return fill(0, selected);
	};
	return visit(completed, selected);
}

/** Priority lists a source and accepted mode once, without X/target/payment products. */
export function announcementOffers(procedure: Procedure, frame: Frame, prefix: string): AnnouncementOffer[] {
	const found: AnnouncementOffer[] = [], seen = new Set<string>();
	for (const base of offerBases(procedure, frame, prefix)) {
		const key = `${base.source.id}@${base.source.incarnation}${base.granted.permission ? `:permit=${base.granted.permission}` : ""}`;
		if (seen.has(key) || !canAnnounce(base, frame)) continue;
		seen.add(key);
		const announcement: Announcement = { controller: frame.seat, source: base.sourceRef, prefix, procedure: base.procedure,
			...(base.granted.permission ? { permission: base.granted.permission } : {}), ...(!base.mana.x ? { x: 0 } : {}), targets: [], selecting: [], payment: [] };
		const option: Option = { id: `${prefix}:begin${procedure.face ? `:f${procedure.face}` : ""}:${key}`,
			label: `${procedure.claim} (${base.selected?.name ?? base.source.card ?? base.source.id})`, objects: [base.sourceRef],
			shows: [base.granted.mana ? `Permission ${base.granted.permission}: cast for ${base.granted.mana === "printed" ? `the printed ${base.selected?.mana}` : `${base.granted.mana} instead of the mana cost`}; normal timing and additional costs still apply.${base.granted.leavesStack ? ` Put it into ${base.granted.leavesStack} whenever it leaves the stack.` : ""}` : "",
				`Choose this use, then ${base.mana.x ? "X, " : ""}targets and payment. Nothing is spent until confirmed.`,
				`Mana before reductions: ${base.mana.generic} generic${base.mana.colors.map((color) => ` + {${color}}`).join("")}${base.mana.x ? ` + ${base.mana.x} times X` : ""}.`,
				...base.effects, `Claimed basis: ${procedure.basis}`].filter(Boolean).join(" "),
			announcement };
		found.push({ option, announcement });
	}
	return found;
}

/** The final accepted operation, after the seat has selected every required part. */
export function announcedActivation(frame: Frame, draft: Announcement): Activation | undefined {
	const base = announcementBases(frame, draft).next().value;
	if (!base || draft.x === undefined || draft.targets.length !== base.slots.length || !draft.cost) return;
	const menu = paymentOptions(frame, { ...draft.cost.price, life: draft.cost.extra.paid.life }, draft.payment, new Set(draft.cost.extra.uses), base.spending);
	if (!menu.complete) return;
	return { ...paidActivation(base, frame, draft.cost, menu.funding), targets: structuredClone(draft.targets) };
}
