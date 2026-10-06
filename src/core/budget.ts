/**
 * The plan's arithmetic, read before it is accepted: the seat's next own turn
 * walked step by step, with what it has to spend.
 *
 * Land steps use the land plays left, and a land joins the sources unless it
 * enters tapped, by its package or another permanent's term. Each step takes a
 * card no earlier step took. A cast or an announcement must be payable from the
 * sources the steps before it left and the plan does not hold, floating mana
 * spent as it goes and gone once a step is in a later window. A permanent the
 * plan casts adds its package's extra land plays from then on. A branch must be
 * payable from what the steps leave, held sources included. Payments are tried
 * together: the first that fits one step may starve a later one, so every
 * different payment is tried before a conflict is named.
 *
 * Nothing is tapped and nothing is promised: every spell is assumed to resolve.
 * Where the arithmetic cannot be done honestly, an X cost, a reduction, mana a
 * procedure makes, a land whose entry is conditional, a search too large to
 * finish, the walk names no conflict rather than guess. It is a forecast: the
 * writer is told once, and the table's payment at the time is what decides.
 * Past 150 lines to keep the single-use preview and ordered payment search
 * beside their shared entry forecast and funding reader.
 */
import { symbols } from "./announce.ts";
import { fundings, sources, type Funding, type Price } from "./funding.ts";
import type { Plan, PlanOption, Procedure, Registration } from "./language.ts";
import { allowance, playable } from "./permits.ts";
import { select } from "./query.ts";
import { matches, viewWorld } from "./selectors.ts";
import { intrinsic } from "./characteristics.ts";
import { STEPS } from "./steps.ts";
import type { Frame } from "./types.ts";
import type { SeenObject } from "./work.ts";

type Act = { kind: "land" | "cast"; source?: SeenObject; named?: string; price?: Price; fixed?: Funding; unknown?: true };

/** Resource forecast only: normal untap, retained permanents and traits, no predicted draw or effects. */
export function afterUntap(frame: Frame): Frame {
	return { ...frame, view: { ...frame.view, began: Number.MAX_SAFE_INTEGER, landsPlayed: 0,
		objects: (frame.view.objects ?? []).map((object) => object.controller === frame.seat && object.zone === "battlefield"
			? { ...object, tapped: false, summoningSick: false } : object),
		pools: (frame.view.pools ?? []).map((pool) => ({ ...pool, mana: pool.mana.filter((mana) => mana.persists) })) } };
}

/** Price one use before sequencing it. A land preview is one named drop, not a prediction of resolved effects. */
export function manaBudget(frame: Frame, procedure: Procedure, source: SeenObject) {
	const cost = procedure.cost;
	const printed = cost?.mana ?? (procedure.timing === "spell" ? frame.view.printed?.[source.card ?? ""]?.mana : "{0}");
	const mana = printed === undefined ? undefined : symbols(printed);
	if (!mana || mana.x || cost?.reduce !== undefined || Object.keys(cost ?? {}).some((key) => !["mana", "tap"].includes(key)) || typeof cost?.tap === "object")
		return { scope: "Not priced: variable mana or additional costs require the offered payment." };
	const reserved = new Set(cost?.tap === true ? [source.id] : []);
	const spending = procedure.timing === "spell" ? { ...source, zone: "stack" as const } : source;
	const possible = (position: Frame) => fundings(position, mana, reserved, spending).length > 0;
	const world = viewWorld(frame.view), turn = frame.view.window.kind === "turn" ? frame.view.window.turn : 0;
	const lands = allowance(world, frame.seat).lands > (frame.view.landsPlayed ?? 0)
		? (frame.view.objects ?? []).filter((one) => one.traits?.types.includes("land") && one.zone !== "battlefield" && playable(world, frame.seat, one, turn, true)) : [];
	return { cost: stated(mana), payableBeforeNewResources: possible(frame),
		afterOneLand: [...new Map(lands.map((one) => [one.card, one])).values()].map((land) => {
			const registers = frame.view.work?.packages?.find((one) => one.card === land.card)?.registers;
			const entry = entersTapped(frame, land, registers);
			if (entry === "unknown" || entry === "conditional") return { card: land.card, entry, payable: "unknown" };
			const entered = { ...land, zone: "battlefield" as const, controller: frame.seat, entered: Number.MAX_SAFE_INTEGER, tapped: entry === "tapped",
				...(land.traits && registers ? { traits: { ...land.traits, registrations: registers } } : {}) };
			return { card: land.card, entry, payable: possible({ ...frame, view: { ...frame.view,
				objects: frame.view.objects!.map((one) => one.id === land.id ? entered : one) } }) };
		}),
		scope: "Mana only, before other actions spend sources; held sources are included. No intervening effects or further land plays are assumed. Timing, targets and source tap restrictions are separate.",
	};
}

export function budget(frame: Frame, plan: Plan): string[] {
	const at = frame.view.window;
	if (at.kind !== "turn") return [];
	const now = at.active === frame.seat;
	// Only two seats make "our next turn" one turn away.
	if (!now && (frame.view.players?.length ?? 2) !== 2) return [];
	const turn = now ? at.turn : at.turn + 1;
	// Conditional steps, such as "if I drew a land", are not counted: they may not happen.
	const ours = (one: PlanOption) => !one.if && one.when.active !== "opponent" && (one.when.fromTurn ?? 0) <= turn && turn <= (one.when.throughTurn ?? Infinity);

	// On a later turn every permanent of ours has untapped and none is new.
	// Floating mana that does not persist is gone by then.
	const lasting = (pools: Frame["view"]["pools"]) => (pools ?? []).map((pool) => ({ ...pool, mana: pool.mana.filter((mana) => mana.persists) }));
	let hypothetical = now ? frame : afterUntap(frame);
	const packages = new Map([...(frame.view.work?.packages ?? []), ...(plan.packages ?? [])].map((pack) => [pack.card, pack.registers]));
	const held = new Set((plan.holds ?? []).flatMap((hold) => select(hold.objects, frame).map((object) => object.id)));
	let plays = allowance(viewWorld(hypothetical.view), frame.seat).lands - (now ? frame.view.landsPlayed ?? 0 : 0);
	let honest = true;
	// A step that resolves instructions may put cards in hand: after it, a missing card is not a mistake.
	let drawing = false;
	let expired = false;
	const found: string[] = [];
	// Each step takes its own card: two land steps are two lands, and a card cast once is gone.
	const used = new Set<string>();
	let taken = false;
	const offBoard = (objects: SeenObject[]) => {
		const off = objects.filter((object) => object.zone !== "battlefield" && object.zone !== "stack");
		taken = off.length > 0 && off.every((object) => used.has(object.id));
		return off.find((object) => !used.has(object.id));
	};

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
		const offered = action.option ? frame.decision?.options.find((option) => option.id === action.option) : undefined;
		const timing = offered?.use?.timing;
		const kind = timing === "land" || id.startsWith("land:") ? "land"
			: timing === "spell" || timing === "stack" || id.startsWith("cast:") || id.startsWith("play:") ? "cast" : undefined;
		if (!kind) return undefined;
		const refs = offered?.use ? [offered.use.source] : offered?.objects;
		const selected = refs ? select({ refs }, hypothetical) : action.objects ? select(action.objects, hypothetical) : [];
		const source = timing === "stack" ? selected[0] : offBoard(selected);
		const named = action.objects?.card;
		if (kind === "land") return { kind, ...(source ? { source } : {}), ...(named ? { named } : {}) };
		if (offered?.use) {
			const { generic, colors, ...extra } = offered.use.cost;
			// An exact pick fixes its payment, including an alternative casting cost.
			// Extra costs and resource-producing effects need a fuller simulation.
			if (Object.keys(extra).length || offered.use.instructions.some((one) => one.do === "mana")) honest = false;
			return { kind, ...(source ? { source } : {}), price: { generic, colors },
				fixed: { paid: offered.use.paid, taps: offered.use.funding ?? [] } };
		}
		const mana = source?.card ? symbols(frame.view.printed?.[source.card]?.mana ?? "") : undefined;
		return { kind, ...(source ? { source } : {}), ...(named ? { named } : {}), ...(mana && !mana.x ? { price: { generic: mana.generic, colors: mana.colors } } : { unknown: true as const }) };
	};
	// First the sequence itself: cards held, land plays, what each land adds. Payments come after, tried together.
	type Item = { at: string; expired: boolean } & ({ kind: "land"; land: SeenObject } | { kind: "cast"; source: SeenObject; price: Price; fixed?: Funding; label: string });
	const items: Item[] = [];
	for (const [at, step] of plan.steps.entries()) {
		if (!ours(step)) continue;
		const act = read(step);
		if (!act) continue;
		const where = `steps[${at}] (${step.label})`;
		const drew = drawing;
		if ("procedure" in step.action && step.action.procedure.instructions.length) drawing = true;
		if (!act.source) {
			if (!drew && taken) found.push(`${where}: every card it names is already taken by an earlier step`);
			else if (act.named && !drew) found.push(`${where}: you hold no ${act.named} now in the stated source zone; cast or play only what you have, and put a card you might draw in a branch`);
			honest = false;
			continue;
		}
		used.add(act.source.id);
		// Floating mana empties at the end of each step: once a step is in a later window than now, it is gone.
		const window = frame.view.window;
		if (now && !expired && window.kind === "turn" && ((step.when.step && step.when.step !== window.step) || (step.when.phase && step.when.phase !== STEPS[window.step as keyof typeof STEPS]?.phase))) expired = true;
		if (act.kind === "land") {
			if (plays <= 0) { found.push(`${where}: no land play is left for it this turn`); continue; }
			plays -= 1;
			const registers = act.source.card ? packages.get(act.source.card) : undefined;
			const entry = entersTapped(hypothetical, act.source, registers);
			if (entry === "conditional" || entry === "unknown") honest = false;
			items.push({ at: where, expired, kind: "land", land: { ...act.source, zone: "battlefield", tapped: entry === "tapped", controller: frame.seat,
				...(act.source.traits && registers ? { traits: { ...act.source.traits, registrations: registers } } : {}) } });
			continue;
		}
		if (act.unknown) { honest = false; continue; }
		items.push({ at: where, expired, kind: "cast", source: act.source, price: act.price!, ...(act.fixed ? { fixed: act.fixed } : {}), label: step.label });
		// A permanent cast now permits more land plays from then on.
		for (const one of (act.source.card ? packages.get(act.source.card) : undefined) ?? []) if (one.kind === "permit") plays += one.lands ?? 0;
	}
	if (!honest) return found;

	// Then the payments: each cast from what the earlier ones left, trying other payments when a later step or a branch cannot be paid.
	// Responses on the opponent's turn must be paid from what the turn leaves; a branch on our own turn is an alternative, not an addition.
	const branches = (plan.may ?? []).flatMap((branch, at) => { const act = branch.when.active === "self" ? undefined : read(branch);
		return act?.kind === "cast" && act.source && !act.unknown ? [{ at: `may[${at}] (${branch.label})`, act }] : []; });
	let deepest: { depth: number; message: string } | undefined;
	const fail = (depth: number, message: string) => { if (!deepest || depth > deepest.depth) deepest = { depth, message }; return false; };
	const left = (position: Frame, spent: ReadonlySet<string>) => {
		const all = sources(position);
		const free = all.filter(({ object }) => !spent.has(object.id) && !held.has(object.id)), kept = all.filter(({ object }) => held.has(object.id) && !spent.has(object.id));
		return `${free.length ? `the steps before it leave ${free.map(({ object, yields }) => `${object.card ?? object.token?.name} (${[...new Set(yields.map((one) => one.colors.join("")))].join("/")})`).join(", ")}` : "the steps before it leave no untapped source"}` +
			`${kept.length ? `, and the plan holds ${kept.map(({ object }) => object.card ?? object.token?.name).join(", ")}` : ""}`;
	};
	const pool = (position: Frame) => position.view.pools?.find((one) => one.seat === frame.seat)?.mana ?? [];
	const drained = (position: Frame): Frame => ({ ...position, view: { ...position.view, pools: lasting(position.view.pools) } });
	// A position is its index, the sources spent and the mana left floating: one that failed once fails again.
	const failed = new Set<string>();
	let visits = 0;
	const go = (index: number, position: Frame, spent: ReadonlySet<string>): boolean => {
		const key = `${index}|${[...spent].sort().join(",")}|${pool(position).map((mana) => mana.id).sort().join(",")}`;
		if (failed.has(key)) return false;
		if (++visits > SEARCH) throw INCOMPLETE;
		const item = items[index];
		if (item?.expired) position = drained(position);
		const ok = ((): boolean => {
			if (!item) {
				// A branch is on the opponent's turn, when nothing floats; a hold may be what it is for, so held sources pay for it.
				const later = drained(position);
				for (const { at, act } of branches) if (!fundings(later, act.price!, spent, { ...act.source!, zone: "stack" }).length)
					return fail(index, `${at}: costs ${stated(act.price!)} but ${left(later, spent)}; keep a source for it with holds, or drop the branch`);
				return true;
			}
			if (item.kind === "land") return go(index + 1, { ...position, view: { ...position.view, objects: (position.view.objects ?? []).map((object) => object.id === item.land.id ? item.land : object) } }, spent);
			const reserved = new Set([...spent, ...held]);
			let paymentPosition = position;
			if (item.fixed) {
				const selected = new Set(item.fixed.taps.map((tap) => tap.source.id));
				for (const { object } of sources(position)) if (!selected.has(object.id)) reserved.add(object.id);
				paymentPosition = { ...position, view: { ...position.view, pools: (position.view.pools ?? []).map((one) => ({ ...one, mana: one.mana.filter((mana) => item.fixed!.paid.includes(mana.id)) })) } };
			}
			const ways = fundings(paymentPosition, item.price, reserved, { ...item.source, zone: "stack" })
				.filter((way) => !item.fixed || paymentKey(way.funding) === paymentKey(item.fixed));
			if (!ways.length) return fail(index, `${item.at}: costs ${stated(item.price)} but ${left(position, spent)}; reorder the steps, drop one, or release the hold`);
			// Payments that tap the same sources and spend the same kind of floating mana leave the same position: one of each is tried.
			const kind = (id: string) => { const mana = pool(position).find((one) => one.id === id); return `${mana?.color}${mana?.persists ? "+" : ""}${JSON.stringify(mana?.spendOnly ?? null)}`; };
			const distinct = new Map(ways.map((way) => [`${way.funding.taps.map((tap) => tap.source.id).sort().join(",")}|${way.funding.paid.map(kind).sort().join(",")}`, way]));
			return [...distinct.values()].some(({ funding }) => {
				const paid = new Set(funding.paid);
				const after = { ...position, view: { ...position.view, pools: (position.view.pools ?? []).map((one) => ({ ...one, mana: one.mana.filter((mana) => !paid.has(mana.id)) })) } };
				return go(index + 1, after, new Set([...spent, ...funding.taps.map((tap) => tap.source.id)]));
			});
		})();
		if (!ok) failed.add(key);
		return ok;
	};
	try {
		if (!go(0, hypothetical, new Set()) && deepest) found.push(deepest.message);
	} catch (error) {
		// Too many payments to try them all: no conflict is shown, so none is named.
		if (error !== INCOMPLETE) throw error;
	}
	return found;
}

/**
 * How a land would enter for this seat now: its own package's term, and every
 * permanent's on the battlefield that reaches it (Zhao's "nonbasic lands enter
 * tapped"). A land with no package and no basic land type is unknown.
 */
export function entersTapped(frame: Frame, land: SeenObject, registers?: Registration[]): "tapped" | "untapped" | "conditional" | "unknown" {
	const own = registers?.find((one): one is Extract<Registration, { kind: "enters" }> => one.kind === "enters" && !one.affects && !!one.tapped);
	const world = viewWorld(frame.view), entering = { ...land, zone: "battlefield" as const, controller: frame.seat };
	const others = (frame.view.objects ?? []).filter((holder) => holder.zone === "battlefield").flatMap((holder) =>
		(world.read(holder)?.registrations ?? []).filter((one): one is Extract<Registration, { kind: "enters" }> => one.kind === "enters" && !!one.affects && !!one.tapped &&
			matches({ world, controller: holder.controller, source: holder }, entering, one.affects, land.traits)));
	const terms = [...(own ? [own] : []), ...others];
	if (terms.some((one) => !one.if)) return "tapped";
	if (terms.length) return "conditional";
	return registers || intrinsic(land.traits).length ? "untapped" : "unknown";
}

/** Positions the payment search visits before it gives up without naming a conflict. */
const SEARCH = 5000;
const INCOMPLETE = new Error("The payment search is too large to finish.");

const stated = (price: Price) => `${price.generic ? `{${price.generic}}` : ""}${price.colors.map((color) => `{${color}}`).join("")}` || "{0}";
const paymentKey = (funding: Funding) => JSON.stringify({ paid: [...funding.paid].sort(),
	taps: funding.taps.map((tap) => `${tap.source.id}@${tap.source.incarnation}:${tap.colors.join("")}:${!!tap.sacrifice}`).sort() });
