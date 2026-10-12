/** Recorded parameter choices for an unconfirmed announcement. No priority,
 * trigger placement or resource spending occurs between these decisions. */
import { commit } from "./commit.ts";
import { project } from "./view.ts";
import { aiming, targetCandidates } from "./announce.ts";
import { affordableCosts, announcedActivation, announcementBases, announcementPayments, canAnnounce, type Announcement } from "./announcement-options.ts";
import { paymentOptions } from "./payment-options.ts";
import { targetBounds } from "./targeting.ts";
import { amount, targetKey } from "./selectors.ts";
import type { LedgerRow, Table } from "./table.ts";
import type { Frame } from "./types.ts";
import type { Move, Pending } from "./moves.ts";
import { manaLabel } from "./mana-cost.ts";

export function beginAnnouncement(table: Table, draft: Announcement, choice: Pick<LedgerRow, "picked" | "offered" | "by" | "why" | "execution">): void {
	if (table.announcement || table.payment || table.entry || table.resolution || table.cursor.priority !== draft.controller)
		throw new Error("Finish the pending operation before choosing another use.");
	const frame: Frame = { seat: draft.controller, version: table.cursor.clock, view: project(table, draft.controller) };
	if (![...announcementBases(frame, draft)].some((base) => canAnnounce(base, frame))) throw new Error("This use has no available announcement.");
	const { execution, ...answer } = choice;
	const plan = execution?.plan ?? table.work[draft.controller]?.planned;
	const selected = { ...structuredClone(draft), ...(execution ? { execution: structuredClone(execution) } : {}), ...(plan !== undefined ? { plan } : {}) };
	table.ledger.push({ seq: table.ledger.length, clock: table.cursor.clock + 1, situation: "priority", seat: draft.controller,
		...structuredClone(answer), announcement: selected, ...(execution ? { preparing: structuredClone(execution) } : {}) });
	commit(table, [{ do: "announcement", announcement: selected }], "announcement");
}

export function announcing(table: Table): Pending | null {
	const draft = table.announcement;
	if (!draft) return null;
	const frame: Frame = { seat: draft.controller, version: table.cursor.clock, view: project(table, draft.controller) };
	const moves: Move[] = [];
	const choose = (id: string, label: string, announcement: Announcement | undefined, shows?: string) => moves.push({
		option: { id, label, objects: [draft.source], ...(shows ? { shows } : {}) }, changes: [{ do: "announcement", ...(announcement ? { announcement } : {}) }], reason: "announcement" });
	const bases = [...announcementBases(frame, draft)], base = bases[0];
	const divisions = base?.slots.flatMap((slot, group) => slot.divide === undefined ? [] :
		draft.targets[group]?.map((one, at) => ({ group, at, one, total: amount({ ...base.scope, targets: draft.targets }, slot.divide!) })) ?? []) ?? [];
	const dividing = divisions.find(one => one.one.amount === undefined);
	const rewindTargets = (): Announcement => ({ ...draft, targets: draft.targets.slice(0, -1).map(set => set.map(({ amount, ...one }) => one)),
		selecting: draft.targets.at(-1)!.map(({ amount, ...one }) => one) });
	const unassign = (group: number, at: number): Announcement => ({ ...draft, targets: draft.targets.map((set, slot) =>
		set.map((one, index) => slot === group && index === at ? (({ amount, ...ref }) => ref)(one) : one)) });
	const beforeTargets = () => {
		if (base?.hybrid !== undefined) choose("announce:back", "Return to choosing hybrid symbols", { ...draft, hybrid: undefined, selecting: [] });
		else if (base?.mana.x) choose("announce:back", "Return to choosing X", { ...draft, x: undefined, selecting: [] });
	};
	let preparing: NonNullable<Pending["preparing"]> = { stage: "cost" };
	let question = `Prepare ${draft.procedure.claim}. Nothing has been spent or cast.`;
	if (base?.mana.x && draft.x !== undefined) question += ` X = ${draft.x}.`;
	if (base?.hybrid !== undefined && draft.hybrid !== undefined) question += ` Chosen equivalent: ${manaLabel(base.mana, draft.x)} before reductions.`;
	if (base && draft.targets.length) question += ` ${aiming(draft.targets, base.world, frame.seat).join(" ")}`;
	if (!base) question += " Its source or permission is no longer available. Cancel to return to priority.";
	else if (draft.x === undefined) {
		preparing = { stage: "X" };
		question += " Choose X.";
		for (const x of [...new Set(bases.filter(one => canAnnounce(one, frame)).map(one => one.x))]) choose(`announce:x:${x}`, `Choose X = ${x}`, { ...draft, x });
	} else if (base.hybrid !== undefined && draft.hybrid === undefined) {
		preparing = { stage: "hybrid" };
		question += ` Choose the nonhybrid equivalent of ${base.manaText} before targets and cost reductions.`;
		for (const one of bases) if (canAnnounce(one, frame))
			choose(`announce:hybrid:${one.hybrid}`, `Use ${manaLabel(one.mana, draft.x)} before reductions`, { ...draft, hybrid: one.hybrid });
		if (base.mana.x) choose("announce:back", "Return to choosing X", { ...draft, x: undefined });
	} else if (draft.targets.length < base.slots.length) {
		preparing = { stage: "targets" };
		const at = draft.targets.length, slot = base.slots[at]!;
		const { maximum: count, minimum } = targetBounds(slot, { ...base.scope, targets: draft.targets });
		question += ` Choose target group ${at + 1}: ${minimum === count ? count : `${minimum} to ${count}`} targets. Selected ${draft.selecting.length}.`;
		const pool = targetCandidates(slot, { ...base.scope, targets: draft.targets });
		for (const target of pool) {
			if (draft.selecting.some((one) => targetKey(one) === targetKey(target))) continue;
			const selected = [...draft.selecting, target];
			if (!canAnnounce(base, frame, draft.targets, selected)) continue;
			const next = selected.length === count ? { ...draft, targets: [...draft.targets, selected], selecting: [] } : { ...draft, selecting: selected };
			const text = aiming([...draft.targets, [target]], base.world, frame.seat);
			choose(`announce:target:${targetKey(target)}`, text[at]!, next, text.slice(draft.targets.length + 1).join(" "));
			if ("id" in target) moves.at(-1)!.option.objects!.push(target);
		}
		for (const [at, target] of draft.selecting.entries()) choose(`announce:remove-target:${at}`, `Remove ${aiming([[target]], base.world, frame.seat)[0]}`,
			{ ...draft, selecting: draft.selecting.filter((_, index) => at !== index) });
		if (draft.selecting.length >= minimum && canAnnounce(base, frame, [...draft.targets, draft.selecting]))
			choose("announce:targets-done", "Finish this target group", { ...draft, targets: [...draft.targets, draft.selecting], selecting: [] });
		if (draft.targets.length) choose("announce:back", "Return to the previous target group", { ...draft, targets: draft.targets.slice(0, -1), selecting: draft.targets.at(-1)! });
		else beforeTargets();
	} else if (dividing) {
		preparing = { stage: "division" };
		const { group, at, one, total } = dividing, chosen = draft.targets[group]!;
		const left = total - chosen.reduce((sum, target) => sum + (target.amount ?? 0), 0), remaining = chosen.length - at - 1;
		const name = aiming([[one]], base.world, frame.seat)[0]!;
		question += ` Divide ${total} among target group ${group + 1}, at least one each. ${left} remains for ${remaining + 1} targets. Assign to ${name}`;
		for (let n = remaining ? 1 : left; n <= left - remaining; n++) {
			if (n > 0) choose(`announce:divide:${n}`, `Assign ${n} to ${name}`, { ...draft, targets: draft.targets.map((set, slot) =>
				set.map((target, index) => slot === group && index === at ? { ...target, amount: n } : target)) });
		}
		const previous = divisions[divisions.indexOf(dividing) - 1];
		choose("announce:back", previous ? "Return to the previous assigned amount" : "Return to the last target group",
			previous ? unassign(previous.group, previous.at) : rewindTargets());
	} else if (!draft.cost) {
		question += " Choose the additional resources and lock the cost.";
		for (const [at, cost] of affordableCosts(base, frame, draft.targets).entries()) {
			choose(`announce:cost:${at}`, `Lock cost: ${cost.price.generic} generic${cost.price.colors.map((color) => ` + {${color}}`).join("")}. ${cost.extra.shows || "No additional resources."}`, { ...draft, cost });
			moves.at(-1)!.option.objects!.push(...cost.extraRefs);
			moves.at(-1)!.option.spends = [...cost.extraRefs, ...(cost.cost.tap ? [draft.source] : []), ...(cost.cost.counters?.on ?? []), ...(cost.cost.shown ?? [])];
		}
		const last = divisions.at(-1);
		if (last) choose("announce:back", "Return to the last assigned amount", unassign(last.group, last.at));
		else if (draft.targets.length) choose("announce:back", "Return to the last target group", rewindTargets());
		else beforeTargets();
	} else {
		const complete = announcementPayments(frame, draft);
		if (complete?.length) {
			preparing = { stage: "mana", payments: true };
			question += " Choose a complete payment and confirm this use. Each option names its sources and what remains available. Choose sources individually to use other identities or mana abilities.";
			moves.push(...complete.map(one => ({ ...one, changes: [], reason: "announcement" as const })));
			choose("announce:individual", "Choose mana sources individually; spend nothing yet", { ...draft, paymentMode: "individual" });
		} else {
			const cost = draft.cost, menu = paymentOptions(frame, { ...cost.price, life: cost.extra.paid.life }, draft.payment, new Set(cost.extra.uses), base.spending, base.castFrom);
			preparing = { stage: "mana", selected: menu.chosen.map((one) => one.label), remainingMana: menu.remainingMana, missingColors: menu.missingColors, ready: menu.complete };
			question += ` Select mana sources one at a time for ${cost.price.generic} generic${cost.price.colors.map((color) => ` + {${color}}`).join("")}. Selected: ${preparing.selected!.join("; ") || "none"}. Still needs ${menu.remainingMana} mana${menu.missingColors.length ? `, including ${menu.missingColors.map((color) => `{${color}}`).join("")}` : ""}.`;
			for (const part of menu.next) {
				choose(`announce:pay:${part.id}`, `Add to payment: ${part.label}`, { ...draft, payment: [...draft.payment, part.id] }, `Keeps every source already selected and adds ${part.colors.length} mana. Nothing is spent yet.`);
				moves.at(-1)!.option.spends = part.funding.taps.map((one) => one.source);
				moves.at(-1)!.option.objects!.push(...part.funding.taps.map((one) => one.source));
			}
			for (const part of menu.chosen) choose(`announce:unpay:${part.id}`, `Undo selection: ${part.label}`, { ...draft, payment: draft.payment.filter((id) => id !== part.id) }, `Removes ${part.colors.length} mana from the pending payment; it will need ${menu.remainingMana + part.colors.length} mana again.`);
			const activation = announcedActivation(frame, draft);
			if (activation) moves.push({ option: { id: "announce:confirm", label: `Confirm ${draft.procedure.claim} and pay`, use: activation,
				objects: [draft.source, ...draft.targets.flat().flatMap((one) => "id" in one ? [one] : [])],
				shows: [...aiming(draft.targets, base.world, frame.seat), cost.extra.shows, ...menu.chosen.map((one) => one.label)].join(" ") }, activation, changes: [], reason: "announcement" });
		}
		choose("announce:back", "Return to choosing additional costs", { ...draft, cost: undefined, payment: [] });
	}
	choose("announce:cancel", "Cancel this use and return to priority; spend nothing", undefined);
	return { situation: "priority", seat: draft.controller, question, preparing, moves };
}
