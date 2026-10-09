/** The planner chooses uses and resource policy; Jev binds an offered payment.
 * Source descriptions and choice diagnostics stay together past 150 lines. */
import type { Frame, Option } from "../core/types.ts";
import type { Plan, PlanOption } from "../core/language.ts";
import type { SeenObject } from "../core/work.ts";
import { matches, reached, select } from "../core/query.ts";
import { sources } from "../core/funding.ts";
import { useSources } from "../core/readiness.ts";
import { playable } from "../core/permits.ts";
import { afterUntap, manaBudget } from "../core/budget.ts";
import type { actions } from "./plan-edit.ts";
import { isDeepStrictEqual } from "node:util";
import { holds, viewWorld } from "../core/selectors.ts";

const sourceFact = (one: SeenObject) => ({ id: one.id, incarnation: one.incarnation, card: one.card ?? one.token?.name,
	zone: one.zone, controller: one.controller, tapped: one.tapped,
	...(one.traits ? { types: one.traits.types, power: one.traits.power, toughness: one.traits.toughness, words: one.traits.words } : {}),
	...(one.summoningSick === undefined ? {} : { summoningSick: one.summoningSick }) });

/** Bind a selector to current facts without deciding whether a later prerequisite will change them. */
function movementFacts(frame: Frame, action: PlanOption["action"]) {
	if ("procedure" in action || !action.objects) return {};
	const selected = select(action.objects, frame), combat = action.prefix === "attack:" || action.prefix === "block:";
	return { selectedNow: selected.map((one) => ({ ...sourceFact(one), ...(combat ? { obstaclesNow: [
		...(one.zone !== "battlefield" ? ["not on the battlefield"] : []),
		...(!one.traits?.types.includes("creature") ? ["not a creature"] : []),
		...(one.tapped ? ["tapped"] : []),
		...(action.prefix === "attack:" && one.summoningSick ? ["summoning sick"] : []),
	] } : {}) })), bindingScope: "Current source facts only. An earlier action may change them; naming a source does not establish a legal or useful future move." };
}

/** Visible land and combat selectors, ready to reuse without inventing button ids. */
export function movementActions(frame: Frame, turn?: number): ReturnType<typeof actions> {
	const entries: [string, ReturnType<typeof actions>[string]][] = [];
	const at = frame.view.window, theirs = turn === undefined && at.kind === "turn" && at.active !== frame.seat;
	for (const source of theirs ? [] : useSources(frame, { source: { zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "land" }, turn)) {
		if (!source.traits?.types.includes("land") || !source.card) continue;
		const label = `Play ${source.card} from ${source.zone}`;
		entries.push([`land ${source.card} from ${source.zone}`, { label, action: { prefix: "land:", objects: { zones: [source.zone], card: source.card } } }]);
	}
	for (const source of frame.view.objects ?? []) {
		if (source.zone !== "battlefield" || source.controller !== frame.seat || !source.traits?.types.includes("creature")) continue;
		for (const kind of ["attack", "block"] as const) {
			const label = `${kind === "attack" ? "Attack" : "Block"} with ${source.card ?? source.token?.name}`;
			entries.push([`${kind} ${source.id}@${source.incarnation}`, { label, action: { prefix: `${kind}:`,
				objects: { zones: ["battlefield"], controller: "self", refs: [{ id: source.id, incarnation: source.incarnation }] } } }]);
		}
	}
	return Object.fromEntries(entries);
}

/** A new literal must name a listed button. Future movement uses selectors or prepared uses. */
export function choiceProblems(frame: Frame, changes: Record<string, unknown>, nextTurn = false): string[] {
	const listed = new Set(["pass", "attack:done", "block:done", ...(!nextTurn ? frame.decision?.options.map((one) => one.id) ?? [] : [])]);
	const families = ["land:", "cast:", "play:", "use:", "plan:", "attack:", "block:", "assign:", "trigger:", "resolve:", "pass"];
	// An id that is a card name says plainly when no such card is in hand or on the battlefield.
	const absent = (id: string) => {
		const card = id.replace(/^printed:/, "");
		if (card.includes(":")) return "";
		return (frame.view.objects ?? []).some((one) => one.card === card && one.controller === frame.seat && (one.zone === "hand" || one.zone === "battlefield")) ? "" : ` ${card} is not in your hand or on your battlefield now.`;
	};
	return ["steps", "may", "current"].flatMap((field) => {
		const entries = changes[field];
		return !Array.isArray(entries) ? [] : entries.flatMap((one, at) => {
			const id = one?.action?.option;
			const prefix = one?.action?.prefix;
			return [
				...(typeof id !== "string" || listed.has(id) ? [] : [`${field}[${at}]: ${JSON.stringify(id)} is not a listed option id.${absent(id)} Reuse an action under actions, or use prefix with objects for a future land or combat action. Card names are not button ids.`]),
				...(typeof prefix !== "string" || families.some((family) => prefix.startsWith(family) || family.startsWith(prefix)) ||
					[...listed].some((id) => id.startsWith(prefix)) ? [] : [`${field}[${at}]: prefix ${JSON.stringify(prefix)} names no table move family. Use an accepted action.reuse for an activation, or an actual move prefix (${families.join(", ")}). Reading equipment supplies accepted uses for a future source.`]),
			];
		});
	});
}

/** Show source-bound uses and prior intent to repair; absent equipment remains a lookup. */
export function actionFacts(frame: Frame, available: ReturnType<typeof actions>, turn?: number) {
	let resources = turn === undefined ? frame : afterUntap(frame);
	if (turn !== undefined && resources.view.window.kind === "turn") resources = { ...resources,
		view: { ...resources.view, window: { ...resources.view.window, turn, active: frame.seat } } };
	const entries = Object.entries(available).map(([key, one]) => {
		const prior = key.startsWith("step:") || key.startsWith("may:");
		if (!("procedure" in one.action)) {
			if (!prior && one.action.objects && !select(one.action.objects, frame).length) return undefined;
			const offered = frame.decision?.options.find((option) => option.id === ("option" in one.action ? one.action.option : undefined));
			return [key, { ...one, ...movementFacts(resources, one.action), ...(offered?.use ? { fixedUse: offered.use }
				: one.action.option ? { availability: offered ? "Offered now" : "This exact pick is not offered now. Reuse a prepared use for a future cast; old pick ids do not follow zone changes or different payments." } : {}) }] as const;
		}
		const use = one.action.procedure;
		const { cost, instructions: _instructions, ...procedure } = use;
		const bound = useSources(frame, procedure, turn);
		const card = procedure.source.card;
		const visible = (frame.view.objects ?? []).filter((one) => one.card === card &&
			(one.zone === "battlefield" || one.zone === "stack" ? one.controller : one.owner) === frame.seat &&
			((procedure.source.zones ?? ["battlefield"]).includes(one.zone) || playable(viewWorld(frame.view), frame.seat, one,
				turn ?? (frame.view.window.kind === "turn" ? frame.view.window.turn : 0), !!one.traits?.types.includes("land"))));
		if (!bound.length && !prior && (procedure.timing !== "stack" || !visible.length)) return undefined;
		const mana = cost?.mana ?? (procedure.timing === "spell" && card ? frame.view.printed?.[card]?.mana : undefined);
		return [key, { ...procedure, sourcesNow: bound.map((one) => ({ id: one.id, incarnation: one.incarnation, zone: one.zone })),
			manaBudgets: bound.map((source) => ({ source: { id: source.id, incarnation: source.incarnation }, ...manaBudget(resources, use, source) })),
			...(turn === undefined ? {} : { permissionTurn: turn }),
			...(!bound.length ? { visibleSources: visible.map(sourceFact), availability: "No permitted source now. Earlier actions must satisfy the source's zone, permission and conditions before this use becomes available. This is accepted equipment, not an offered action or a forecast that it will work." } : {}),
			cost: { ...cost, mana: mana ?? (procedure.timing === "spell" ? "Read the bound source's printed cost" : "{0}") },
			costBasis: cost?.mana === undefined && procedure.timing === "spell" ? "printed mana cost" : "stated cost" }] as const;
	}).filter((one) => one !== undefined);
	return Object.fromEntries(entries.map(([key, description], at) => {
		const earlier = entries.find(([other, facts], n) => n < at && isDeepStrictEqual(available[key]!.action, available[other]!.action) && isDeepStrictEqual(description, facts));
		return [key, earlier ? { sameAs: earlier[0] } : description];
	}));
}

/** The displayed base refers to its reusable actions; executable bodies stay in equipment. */
export function planFacts(plan: Plan) {
	const options = (list: Plan["steps"], kind: string) => list.map((one, at) => ({ ...one, action: { reuse: `${kind}:${at} ${one.label}` } }));
	return { ...plan, steps: options(plan.steps, "step"), ...(plan.may ? { may: options(plan.may, "may") } : {}) };
}

/** Diagnose exact bindings in the old line without treating a future use as illegal. */
export function bindingFacts(frame: Frame, base: Plan, nextTurn = false) {
	if (nextTurn) frame = afterUntap(frame);
	const scope = { world: viewWorld(frame.view), controller: frame.seat };
	return {
		unoffered: base.steps.flatMap((step, at) => {
			if (!("option" in step.action) || !step.action.option || !matches(step.when, frame)) return [];
			const id = step.action.option;
			return frame.decision?.options.some((one) => one.id === id) ? [] : [{ step: at, label: step.label, option: id,
				fact: "Not offered at this decision. An earlier prerequisite may still enable it, but a stale payment or zone incarnation will not become valid. Use a prepared action for the intended cast." }];
		}),
		holds: (base.holds ?? []).map((hold) => ({ purpose: hold.purpose,
			releasedNow: !!hold.releaseWhen && holds(scope, hold.releaseWhen) || !!hold.releaseAt && reached(hold.releaseAt, frame), selected: select(hold.objects, frame).map(sourceFact) })),
	};
}

/**
 * Preserve every use, cost and target binding without enumerating payments in
 * the planning question. The pilot still receives every original option id.
 * Equality of accepted terms distinguishes modes; claims alone never merge them.
 */
export function planningChoices(frame: Frame) {
	const options = frame.decision?.options ?? [];
	const manaSources = sources(frame);
	const uses = new Map<string, { terms: Omit<NonNullable<Option["use"]>, "paid" | "funding" | "targets">; bindings: Map<string, NonNullable<Option["use"]>["targets"]>; notes: string[]; payments: number; left: number[] }>();
	for (const option of options) {
		if (!option.use) continue;
		const { paid: _paid, funding, targets, ...terms } = option.use;
		const notes = option.notes ?? [], key = JSON.stringify({ terms, notes });
		const use = uses.get(key) ?? { terms, bindings: new Map(), notes, payments: 0, left: [] as number[] };
		use.bindings.set(JSON.stringify(targets), targets);
		const spent = new Set([...(funding ?? []).map((tap) => tap.source.id), ...(terms.cost.tap ? [terms.source.id] : []),
			...[...(terms.cost.tapped ?? []), ...(terms.cost.sacrificed ?? []), ...(terms.cost.exiled ?? [])].map((ref) => ref.id)]);
		use.left.push(manaSources.filter(({ object }) => !spent.has(object.id)).length);
		use.payments += 1;
		uses.set(key, use);
	}
	return { options: options.filter((one) => !one.use), uses: [...uses.values()].map((use) => {
		const source = frame.view.objects?.find((one) => one.id === use.terms.source.id && one.incarnation === use.terms.source.incarnation);
		const { instructions: _instructions, ...terms } = use.terms;
		return { ...terms, card: source?.card, from: source?.zone, targets: [...use.bindings.values()], notes: [...use.notes],
			manaRequired: use.terms.cost.generic + use.terms.cost.colors.length,
			untappedSourcesAfterPayment: { minimum: Math.min(...use.left), maximum: Math.max(...use.left),
				scope: "Remaining current mana-source objects immediately after paying, before resolution or changes to their abilities. Floating mana is separate." },
			offeredCombinations: use.payments };
	}) };
}
