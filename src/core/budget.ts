/**
 * The plan's arithmetic, read before it is accepted: the seat's next own turn
 * walked step by step, with what it has to spend.
 *
 * Land steps use the land plays left, and a land joins the sources unless its
 * package says it enters tapped. A cast or an announcement must be payable from
 * the sources the steps before it left untapped and the plan does not hold. A
 * permanent the plan casts adds its package's extra land plays from then on. A
 * branch must be payable from what the steps leave.
 *
 * Nothing is tapped and nothing is promised: every spell is assumed to resolve.
 * Where the arithmetic cannot be done honestly, an X cost, a reduction, mana a
 * procedure makes, a land whose entry is conditional, the walk stops checking
 * costs rather than guess.
 */
import { symbols } from "./announce.ts";
import { fundings, sources, type Price } from "./funding.ts";
import type { Plan, PlanOption } from "./language.ts";
import { allowance } from "./permits.ts";
import { select } from "./query.ts";
import { viewWorld } from "./selectors.ts";
import type { Frame } from "./types.ts";
import type { SeenObject } from "./work.ts";

type Act = { kind: "land" | "cast"; source?: SeenObject; named?: string; price?: Price; unknown?: true };

export function budget(frame: Frame, plan: Plan): string[] {
	const at = frame.view.window;
	if (at.kind !== "turn") return [];
	const now = at.active === frame.seat;
	// Only two seats make "our next turn" one turn away.
	if (!now && (frame.view.players?.length ?? 2) !== 2) return [];
	const turn = now ? at.turn : at.turn + 1;
	const ours = (one: PlanOption) => one.when.active !== "opponent" && (one.when.fromTurn ?? 0) <= turn && turn <= (one.when.throughTurn ?? Infinity);

	// On a later turn every permanent of ours has untapped and none is new.
	let hypothetical: Frame = now ? frame : { ...frame, view: { ...frame.view, began: Number.MAX_SAFE_INTEGER,
		objects: (frame.view.objects ?? []).map((object) => object.controller === frame.seat && object.zone === "battlefield" ? { ...object, tapped: false } : object) } };
	const packages = new Map([...(frame.view.work?.packages ?? []), ...(plan.packages ?? [])].map((pack) => [pack.card, pack.registers]));
	const held = new Set((plan.holds ?? []).flatMap((hold) => select(hold.objects, frame).map((object) => object.id)));
	const spent = new Set<string>();
	let plays = allowance(viewWorld(hypothetical.view), frame.seat).lands - (now ? frame.view.landsPlayed ?? 0 : 0);
	let honest = true;
	// A step that resolves instructions may put cards in hand: after it, a missing card is not a mistake.
	let drawing = false;
	const found: string[] = [];
	const offBoard = (objects: SeenObject[]) => objects.find((object) => object.zone !== "battlefield" && object.zone !== "stack");

	const read = (one: PlanOption): Act | undefined => {
		const action = one.action;
		if ("procedure" in action) {
			const procedure = action.procedure;
			if (procedure.timing === "mana" || procedure.instructions.some((instruction) => instruction.do === "mana")) honest = false;
			if (procedure.timing !== "land" && procedure.timing !== "spell" && !procedure.cost?.mana) return undefined;
			const fromHand = procedure.timing === "land" || procedure.timing === "spell";
			const chosen = select({ ...procedure.source, zones: procedure.source.zones ?? [fromHand ? "hand" : "battlefield"] }, hypothetical);
			const source = fromHand ? offBoard(chosen) : chosen[0];
			const named = procedure.source.card;
			if (procedure.timing === "land") return { kind: "land", ...(source ? { source } : {}), ...(named ? { named } : {}) };
			const stated = procedure.cost?.mana ?? (source?.card ? frame.view.printed?.[source.card]?.mana : undefined);
			const mana = stated ? symbols(stated) : undefined;
			const unknown = !mana || mana.x > 0 || !!procedure.cost?.reduce;
			return { kind: "cast", ...(source ? { source } : {}), ...(named ? { named } : {}), ...(mana && !unknown ? { price: { generic: mana.generic, colors: mana.colors } } : {}), ...(unknown ? { unknown: true as const } : {}) };
		}
		const id = action.option ?? action.prefix ?? "";
		const kind = id.startsWith("land:") ? "land" : id.startsWith("cast:") || id.startsWith("play:") ? "cast" : undefined;
		if (!kind) return undefined;
		const direct = action.option ? id.split(":")[1]?.split("@")[0] : undefined;
		const source = offBoard(direct ? (hypothetical.view.objects ?? []).filter((object) => object.id === direct) as SeenObject[] : action.objects ? select(action.objects, hypothetical) : []);
		const named = action.objects?.card;
		if (kind === "land") return { kind, ...(source ? { source } : {}), ...(named ? { named } : {}) };
		const mana = source?.card ? symbols(frame.view.printed?.[source.card]?.mana ?? "") : undefined;
		return { kind, ...(source ? { source } : {}), ...(named ? { named } : {}), ...(mana && !mana.x ? { price: { generic: mana.generic, colors: mana.colors } } : { unknown: true as const }) };
	};
	const left = () => {
		const free = sources(hypothetical).filter(({ object }) => !spent.has(object.id) && !held.has(object.id));
		const kept = sources(hypothetical).filter(({ object }) => held.has(object.id) && !spent.has(object.id));
		return `${free.length ? `the steps before it leave ${free.map(({ object, yields }) => `${object.card ?? object.token?.name} (${[...new Set(yields.map((one) => one.colors.join("")))].join("/")})`).join(", ")}` : "the steps before it leave no untapped source"}` +
			`${kept.length ? `, and the plan holds ${kept.map(({ object }) => object.card ?? object.token?.name).join(", ")}` : ""}`;
	};
	const payable = (act: Act, except: Set<string>) => !act.price || fundings(hypothetical, act.price, except, act.source && { ...act.source, zone: "stack" }).length > 0;

	for (const [at, step] of plan.steps.entries()) {
		if (!ours(step)) continue;
		const act = read(step);
		if (!act) continue;
		const where = `steps[${at}] (${step.label})`;
		const drew = drawing;
		if ("procedure" in step.action && step.action.procedure.instructions.length) drawing = true;
		if (!act.source) {
			if (now && act.named && !drew) found.push(`${where}: you hold no ${act.named} now; cast or play only what you have, and put a card you might draw in a branch`);
			honest = false;
			continue;
		}
		if (act.kind === "land") {
			if (plays <= 0) { found.push(`${where}: no land play is left for it this turn`); continue; }
			plays -= 1;
			const registers = act.source.card ? packages.get(act.source.card) : undefined;
			const enters = registers?.find((one) => one.kind === "enters" && !one.affects && one.tapped);
			if (!registers && !act.source.traits?.types.includes("land")) honest = false;
			if (enters && "if" in enters && enters.if) honest = false;
			const land = { ...act.source, zone: "battlefield" as const, tapped: !!enters, controller: frame.seat,
				...(act.source.traits && registers ? { traits: { ...act.source.traits, registrations: registers } } : {}) };
			hypothetical = { ...hypothetical, view: { ...hypothetical.view, objects: (hypothetical.view.objects ?? []).map((object) => object.id === land.id ? land : object) } };
			continue;
		}
		if (act.unknown) { honest = false; continue; }
		if (!honest) continue;
		const ways = fundings(hypothetical, act.price!, new Set([...spent, ...held]), { ...act.source, zone: "stack" });
		if (!ways.length) { found.push(`${where}: costs ${stated(act.price!)} but ${left()}; reorder the steps, drop one, or release the hold`); honest = false; continue; }
		for (const tap of ways[0]!.funding.taps) spent.add(tap.source.id);
		// A permanent cast now permits more land plays from then on.
		for (const one of (act.source.card ? packages.get(act.source.card) : undefined) ?? []) if (one.kind === "permit") plays += one.lands ?? 0;
	}
	if (!honest) return found;
	for (const [at, branch] of (plan.may ?? []).entries()) {
		const act = read(branch);
		if (!act || act.kind !== "cast" || !act.source || act.unknown) continue;
		// A branch may be what a hold is for, so held sources pay for it.
		if (!payable(act, spent)) found.push(`may[${at}] (${branch.label}): costs ${stated(act.price!)} but ${left()}; keep a source for it with holds, or drop the branch`);
	}
	return found;
}

const stated = (price: Price) => `${price.generic ? `{${price.generic}}` : ""}${price.colors.map((color) => `{${color}}`).join("")}` || "{0}";
