/** A proposed use retains its accepted meaning while the seat selects its parts.
 * Feasibility reads projected resources; it neither chooses nor spends them. */
import { offerBases, offerCosts, paidActivation, targetCandidates, type OfferBase, type OfferCost } from "./announce.ts";
import { targetBounds, validDivision } from "./targeting.ts";
import { payable, paymentOptions } from "./payment-options.ts";
import { completePayments } from "./complete-payments.ts";
import { targetKey, type Chosen } from "./selectors.ts";
import type { Activation, LedgerRow } from "./table.ts";
import type { Procedure } from "./language.ts";
import type { Frame, ObjectRef, Option } from "./types.ts";
import { manaLabel } from "./mana-cost.ts";
import { tapObjects } from "./funding.ts";

export type Announcement = {
	controller: number; source: ObjectRef; prefix: string; procedure: Procedure; permission?: string;
	x?: number; hybrid?: number; targets: Chosen[][]; selecting: Chosen[]; cost?: OfferCost; payment: string[];
	/** Recorded per announcement; absence preserves historical individual menus. */
	paymentMode?: "complete" | "individual";
	execution?: LedgerRow["execution"];
	/** Accepted plan whose guidance accompanies the selected use. */
	plan?: number;
};
export type AnnouncementOffer = { option: Option; announcement: Announcement };

/** A selected source is read again without substituting an equivalent object. */
export function* announcementBases(frame: Frame, draft: Announcement) {
	for (const base of offerBases({ ...draft.procedure, source: { ...draft.procedure.source, refs: [draft.source] } }, frame, draft.prefix)) {
		if (base.granted.permission === draft.permission && (draft.x === undefined || base.x === draft.x) &&
			(draft.hybrid === undefined || base.hybrid === draft.hybrid)) yield base;
	}
}

export function affordableCosts(base: OfferBase, frame: Frame, targets: Chosen[][]): OfferCost[] {
	return offerCosts({ ...base, scope: { ...base.scope, targets } }, frame).filter((way) =>
		payable(frame, { ...way.price, life: way.extra.paid.life }, new Set(way.extra.uses), base.spending, base.castFrom));
}

/** Find one possible completion, without allocating every combination of targets.
 * The witness stays internal: no target or payment is selected for the seat. */
export function canAnnounce(base: OfferBase, frame: Frame, completed: Chosen[][] = [], selected: Chosen[] = []): boolean {
	const visit = (targets: Chosen[][], selected: Chosen[]): boolean => {
		const slot = base.slots[targets.length];
		if (!slot) return affordableCosts(base, frame, targets).length > 0;
		const scope = { ...base.scope, targets }, pool = targetCandidates(slot, scope);
		const { minimum, maximum } = targetBounds(slot, scope, pool.length);
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
			...(base.granted.permission ? { permission: base.granted.permission } : {}), ...(!base.mana.x ? { x: 0 } : {}), targets: [], selecting: [], payment: [], paymentMode: "complete" };
		const option: Option = { id: `${prefix}:begin${procedure.face ? `:f${procedure.face}` : ""}:${key}`,
			label: `${procedure.claim} (${base.selected?.name ?? base.source.card ?? base.source.id})`, objects: [base.sourceRef],
			shows: [base.granted.mana ? `Permission ${base.granted.permission}: cast for ${base.granted.mana === "printed" ? `the printed ${base.selected?.mana}` : `${base.granted.mana} instead of the mana cost`}; normal timing and additional costs still apply.${base.granted.leavesStack ? ` Put it into ${base.granted.leavesStack} whenever it leaves the stack.` : ""}` : "",
				procedure.special === "turn-face-up" ? "Show this creature card, pay its mana cost and turn it face up without using the stack. Its incarnation, counters, damage and attachments stay. Entry abilities do not happen again." :
				procedure.special === "plot" ? "Exile this hand card as a special action, without using the stack. Its owner may cast it for no mana on a later turn, only in their main phase with an empty stack; additional costs still apply." : "",
				`Choose this use, then ${base.mana.x ? "X, " : ""}${base.hybrid !== undefined ? "hybrid symbols, " : ""}targets and payment. Nothing is spent until confirmed.`,
				`Mana before reductions: ${base.manaText ?? manaLabel(base.mana)}.`,
				...base.effects, `Claimed basis: ${procedure.basis}`].filter(Boolean).join(" "),
			announcement };
		found.push({ option, announcement });
	}
	return found;
}

/** The final accepted operation, after the seat has selected every required part. */
export function announcedActivation(frame: Frame, draft: Announcement): Activation | undefined {
	const base = announcementBases(frame, draft).next().value;
	if (!base || draft.x === undefined || base.hybrid !== undefined && draft.hybrid === undefined || draft.targets.length !== base.slots.length || !draft.cost) return;
	const menu = paymentOptions(frame, { ...draft.cost.price, life: draft.cost.extra.paid.life }, draft.payment, new Set(draft.cost.extra.uses), base.spending, base.castFrom);
	if (!menu.complete || !base.slots.every((slot, at) => validDivision(slot, draft.targets[at]!, { ...base.scope, targets: draft.targets }))) return;
	return { ...paidActivation(base, frame, draft.cost, menu.funding), targets: structuredClone(draft.targets) };
}

/** A complete payment confirms the already selected use in one voluntary pick. */
export function announcementPayments(frame: Frame, draft: Announcement) {
	if (draft.paymentMode !== "complete" || !draft.cost || draft.x === undefined) return undefined;
	const base = announcementBases(frame, draft).next().value;
	if (!base || base.hybrid !== undefined && draft.hybrid === undefined || draft.targets.length !== base.slots.length || !base.slots.every((slot, at) => validDivision(slot, draft.targets[at]!, { ...base.scope, targets: draft.targets }))) return undefined;
	const cost = { ...draft.cost.price, life: draft.cost.extra.paid.life };
	const menu = paymentOptions(frame, cost, draft.payment, new Set(draft.cost.extra.uses), base.spending, base.castFrom);
	return completePayments(frame, cost, menu)?.map((payment, at) => {
		const activation = { ...paidActivation(base, frame, draft.cost!, payment.funding), targets: structuredClone(draft.targets) };
		return { activation, option: { id: `announce:payment:${at}`, label: `Confirm and pay: ${payment.label}`, use: activation,
			objects: [draft.source, ...draft.targets.flat().flatMap(one => "id" in one ? [one] : []), ...draft.cost!.extraRefs, ...payment.funding.taps.flatMap(tapObjects)],
			shows: [draft.cost!.extra.shows, payment.leaves].filter(Boolean).join(" ") } };
	});
}
