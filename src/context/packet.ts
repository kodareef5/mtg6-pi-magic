/** Question-specific projected context. Builders share facts, never table mutation.
 * Past 150 lines to keep the packet contract beside its projection and scope rules.
 */
import type { Rules } from "../core/rules.ts";
import type { Frame, SeatId, SeatView, Window } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { openingGuidance, say, type Brief } from "./brief.ts";
import { dial, type Route } from "./dial.ts";
import type { Recap } from "./summary.ts";
import { planState } from "../core/planning.ts";
import { matches } from "../core/query.ts";
import type { SeenObject } from "../core/work.ts";
import type { Printed } from "../core/printed.ts";
import { checklist, type ReviewItem } from "../core/review.ts";
import { summary } from "../core/announce.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { sources } from "../core/funding.ts";
import { openingHand } from "../core/pregame.ts";
import { activeWatches } from "../core/triggers.ts";
import { choices, inspect, type Choice, type Inspection, type Payment, type Use, type Funding } from "./choices.ts";
import { decisionFacts } from "./decision-facts.ts";

export type Chronicle = { briefs: Record<SeatId, Brief>; recaps: Recap[] };
export type PlanSlice = {
	objective: string; guidance?: string; due?: string; next: string[]; branches: string[]; held: string[]; stops: string[]; done: string[];
	script?: { goal: string[]; guidance: string[]; steps: string[]; reevaluate: string[] };
};
export type Seen = {
	id: string; incarnation: number; name: string; controller: SeatId; zone: string; position?: number;
	tapped?: true; summoningSick?: boolean; types?: string[]; subtypes?: string[]; body?: string;
	counters?: Record<string, number>; damage?: number; words?: string[]; effect?: string[];
	targets?: NonNullable<SeenObject["ability"]>["targets"]; source?: NonNullable<SeenObject["ability"]>["source"];
};
export type Packet = {
	actor: SeatId; window: Window; version: number; obligation: string;
	kind: string;
	opening?: NonNullable<SeatView["opening"]> & { hand: ReturnType<typeof openingHand>; retained?: { option: string; hand: ReturnType<typeof openingHand> }[] };
	retained?: { option: string; hand: ReturnType<typeof openingHand> }[];
	plan?: PlanSlice;
	options: Choice[]; uses: Record<string, Use>; payments: Record<string, Payment>; funding: Record<string, Funding>; pools: SeatView["pools"];
	resources: string[]; known: string[]; objects: Seen[];
	watches: ReturnType<typeof activeWatches>; cards: Record<string, Printed>;
	guidance: string[]; lately: string[]; routes: Route[]; learned?: string[]; refused?: string[];
	history?: SeatView["history"]; resolution?: SeatView["resolution"]; checklist?: ReviewItem[]; combat?: SeatView["combat"];
	resolving?: { claim: string; basis: string; remaining: string[]; objective?: string; purpose?: string; guidance?: string };
	inspection?: { stage: string; selected?: Use };
};

const seen = (object: SeenObject): Seen => {
	const traits = object.traits;
	return { id: object.id, incarnation: object.incarnation, name: object.card ?? object.token?.name ?? object.ability?.claim ?? "unknown", controller: object.controller, zone: object.zone,
		...(object.zone === "stack" ? { position: object.position } : {}),
		...(object.tapped ? { tapped: true as const } : {}), ...(traits?.power !== undefined ? { body: `${traits.power}/${traits.toughness}` } : {}),
		...(Object.keys(object.counters).length ? { counters: { ...object.counters } } : {}), ...(object.damage ? { damage: object.damage } : {}),
		...(traits?.words.length ? { words: [...traits.words] } : {}), ...(traits ? { types: [...traits.types], subtypes: [...traits.subtypes] } : {}),
		...(object.summoningSick === undefined ? {} : { summoningSick: object.summoningSick }),
		...(object.ability ? { effect: [object.ability.basis, ...object.ability.instructions.map(summary)],
			targets: structuredClone(object.ability.targets), source: { ...object.ability.source } } : {}) };
};

function inPlanOrder<T extends { id: string }>(options: readonly T[], state: ReturnType<typeof planState>): T[] {
	if (!state) return [...options];
	const rank = new Map<string, number>();
	state.due.find((one) => one.candidates.length)?.candidates.forEach((option) => rank.set(option.id, 0));
	for (const branch of state.branches) for (const option of branch.candidates) if (!rank.has(option.id)) rank.set(option.id, 1);
	return [...options].sort((a, b) => (rank.get(a.id) ?? 2) - (rank.get(b.id) ?? 2));
}

/** The same canonical grouping drives inspection and the question's facts. */
export function decisionChoices(frame: Frame) { return choices(inPlanOrder(frame.decision?.options ?? [], planState(frame))); }

export type Focus = { brief?: Brief; recaps?: readonly Recap[]; rules?: Rules; learned?: readonly string[]; review?: ReviewItem; inspection?: Inspection };
/** Select the question before its dependencies. Unrelated card text never enters a packet to be clipped later. */
export function focus(frame: Frame, intent: Intent, context: Focus = {}): Packet {
	const { decision, seat, view, version, refused } = frame;
	if (!decision || decision.seat !== seat || intent.seat !== seat || intent.deck.seat !== seat) throw new Error("A packet needs a decision and intent for its own seat");
	if (view.window.kind === "finished") throw new Error("A finished game has no decision packet");
	const state = planState(frame), review = context.review;
	const scripts = (state?.plan.phases ?? []).filter((one) => matches(one.when, frame));
	const dueAt = state?.due.find((one) => one.candidates.length)?.at, done = new Set(view.done ?? []);
	const plan = state && !view.resolution ? {
		objective: state.plan.objective, ...(scripts.length ? {} : { guidance: state.plan.guidance }),
		...(dueAt !== undefined ? { due: state.plan.steps[dueAt]!.label } : {}),
		next: state.waiting.map((one) => one.label), branches: state.branches.map((one) => one.label),
		held: state.held.map((hold) => `${hold.objects.map((object) => `${object.card ?? object.id} (${object.id}@${object.incarnation})`).join(", ")}: ${hold.purpose}`),
		stops: state.stops, done: (view.done ?? []).map((at) => state.plan.steps[at]?.label ?? `step ${at + 1}`),
		...(scripts.length ? { script: { goal: scripts.flatMap((one) => one.goal ? [one.goal] : []), guidance: scripts.map((one) => one.guidance),
			steps: state.plan.steps.flatMap((step, at) => matches(step.when, frame) ? [`${done.has(at) ? "Done" : at === dueAt ? "Now" : "Then"}: ${step.label}`] : []),
			reevaluate: scripts.flatMap((one) => one.reevaluate ?? []) } } : {}),
	} : undefined;
	const all = inPlanOrder(decision.options, state);
	const factored = choices(all), menu = context.inspection ? inspect(factored, context.inspection) : undefined;
	const offered = review && review.kind !== "response" ? all.filter((one) => review.options.includes(one.id))
		: context.inspection?.use ? all.filter((one, at) => factored.options[at]?.use === context.inspection!.use || !one.use) : all;
	const data = review ? choices(offered) : factored;
	const scoped = decisionFacts(frame, offered, review), names = new Set(scoped.objects.flatMap((one) => one.card ? [one.card] : []));
	for (const option of offered) for (const card of option.cards ?? []) names.add(card);
	const watches = view.window.kind === "opening" ? [] : activeWatches(frame);
	// A proposed action can cause new triggers. Their full source text and
	// watches belong to action/review questions, before those events happen.
	if (!view.resolution) for (const watch of watches) names.add(watch.source.name);
	for (const object of scoped.objects) if (object.ability) {
		const name = view.objects?.find((one) => one.id === object.ability!.source.id)?.card;
		if (name) names.add(name);
	}
	const step = view.window.kind === "turn" ? context.brief?.steps?.[view.window.step as keyof Brief["steps"]] : undefined;
	const guidance = [view.window.kind === "opening" ? openingGuidance(context.brief, view, seat)
		: say(step?.[view.window.kind === "turn" && view.window.active === seat ? "own" : "opponent"]),
		...Object.entries(context.brief?.cards ?? {}).filter(([card]) => names.has(card)).map(([card, note]) => `${card}: ${say(note)}`)].filter(Boolean);
	const ability = view.resolution && view.objects?.find((one) => one.id === view.resolution!.object)?.ability;
	const purpose = view.purposes?.find((one) => one.object.id === view.resolution?.object);
	const selection = view.window.kind === "opening" && view.window.action === "bottom" || decision.situation === "turn-based" && view.window.kind === "turn" && view.window.step === "cleanup";
	const available = !view.resolution && view.window.kind === "turn" ? sources(frame).map(({ object, yields }) =>
		`${object.card ?? object.token?.name ?? object.id} (${object.id}@${object.incarnation}): ${[...new Set(yields.map((one) => `${one.colors.join("")}${one.spendOnly ? `, only on ${JSON.stringify(one.spendOnly)}` : ""}${one.sacrifice ? ", sacrificing it" : ""}`))].join(" or ")}`) : [];
	const itemList = review ? [review] : checklist(frame);
	const listed = menu?.options ?? data.options;
	const used = new Set(listed.flatMap((one) => one.use ? [one.use] : []));
	const paid = new Set(listed.flatMap((one) => [one.payment, ...(one.alternatives ?? []).map((variant) => variant.payment)].filter((id): id is string => !!id)));
	const taps = new Set([...paid].flatMap((id) => data.payments[id]?.funding ?? []));
	const retained = selection ? offered.map((option) => ({ option: option.id,
		hand: openingHand({ ...view, objects: view.objects?.filter((one) => !option.objects?.some((ref) => ref.id === one.id && ref.incarnation === one.incarnation)) }, seat) })) : undefined;
	return {
		actor: seat, window: structuredClone(view.window), version, obligation: decision.question,
		kind: review ? `review:${review.kind}` : view.resolution ? "resolution" : view.window.kind === "opening" ? `opening:${view.window.action}` : decision.situation,
		...(view.opening ? { opening: { ...view.opening, hand: openingHand(view, seat), ...(retained ? { retained } : {}) } } : retained ? { retained } : {}),
		...(plan ? { plan } : {}), ...(itemList.length ? { checklist: structuredClone(itemList) } : {}),
		options: listed, uses: Object.fromEntries(Object.entries(data.uses).filter(([id]) => used.has(id))),
		payments: Object.fromEntries(Object.entries(data.payments).filter(([id]) => paid.has(id))),
		funding: Object.fromEntries(Object.entries(data.funding).filter(([id]) => taps.has(id))), pools: structuredClone(view.pools),
		...(menu ? { inspection: { stage: menu.stage, ...(menu.selected ? { selected: menu.selected } : {}) } } : {}),
		resources: view.resolution ? [] : [...view.yours, ...(view.window.kind === "turn" ? [
			`Land plays left: ${Math.max(0, allowance(viewWorld(view), seat).lands - (view.landsPlayed ?? 0))}. A resolving effect putting a land onto the battlefield does not use a land play.`,
			`Mana sources usable now: ${available.join("; ") || "none"}.`] : [])],
		known: [...(view.players ?? []).map((one) => `Seat ${one.id}: ${one.life} life, ${one.hand ?? "unknown"} cards in hand, ${one.library ?? "unknown"} in library.`), ...view.since,
			...(decision.situation === "trigger-order" ? view.table : [])],
		objects: scoped.objects.map(seen).sort((a, b) => a.zone === "stack" && b.zone === "stack" ? (a.position ?? 0) - (b.position ?? 0) : 0),
		watches: view.resolution ? watches.filter((one) => names.has(one.source.name)) : watches,
		cards: Object.fromEntries(Object.entries(view.printed ?? {}).filter(([name]) => names.has(name)).map(([name, card]) => [name, structuredClone(card)])),
		...(view.window.kind === "turn" ? { history: structuredClone(view.history ?? []) } : {}),
		...(view.combat ? { combat: structuredClone(view.combat) } : {}),
		...(view.resolution ? { resolution: structuredClone(view.resolution) } : {}),
		...(ability ? { resolving: { claim: ability.claim, basis: ability.basis, remaining: view.resolution!.program.map((one) => summary(one.instruction)),
			...(purpose ? { objective: purpose.objective, purpose: purpose.use, guidance: purpose.guidance } : state ? { objective: state.plan.objective } : {}) } } : {}),
		guidance: plan?.script || ability ? [] : guidance, lately: [], routes: dial(decision, context.rules),
		...(context.learned?.length ? { learned: [...context.learned] } : {}), ...(refused?.length ? { refused: [...refused] } : {}),
	};
}

export function offerConcede(packet: Packet): boolean {
	void packet;
	throw new Error("offerConcede is unwritten: settled sequence or inescapable loop only.");
}
