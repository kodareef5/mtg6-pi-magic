/**
 * The plan's arithmetic, read before it is accepted: the seat's next own turn
 * walked step by step, with what it has to spend.
 *
 * Land steps use the land plays left, and a land joins the sources unless it
 * enters tapped, by its package or another permanent's term. Each step takes a
 * card no earlier step took. Earlier land plays and ordinary permanent casts
 * supply later source bindings under successful resolution, with new identities.
 * A cast or an announcement must be payable from the
 * sources the steps before it left and the plan does not hold, floating mana
 * spent as it goes and gone once a step is in a later window. A permanent the
 * plan casts adds its package's extra land plays from then on. Branch funding
 * is advisory, read from what the selected payment leaves, held sources included.
 * Payments are tried together: the first that fits one step may starve a later
 * one, so every different payment is tried before a conflict is named.
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
import { fundings, sick, sources, type Funding, type Price } from "./funding.ts";
import type { Plan, PlanOption, Procedure, Registration } from "./language.ts";
import { allowance, playable } from "./permits.ts";
import { reached, select } from "./query.ts";
import { holds as condition, matches, viewWorld } from "./selectors.ts";
import { intrinsic } from "./characteristics.ts";
import { permanentSpell } from "./printed.ts";
import { STEPS, TURN, type Step } from "./steps.ts";
import type { Frame, ObjectRef } from "./types.ts";
import type { SeenObject } from "./work.ts";

type Act = { kind: "land" | "cast"; source?: SeenObject; named?: string; price?: Price; fixed?: Funding; unknown?: true; spell?: true; tap?: true; enters?: true };

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

/** Conflicts found within the resource forecast's scope. Empty does not certify a feasible line. */
export function budget(frame: Frame, plan: Plan): string[] {
	return paymentForecast(frame, plan).conflicts;
}

type Payment = { step: string; source: ObjectRef; funding: Funding; tapSource: boolean; untappedManaSourcesAfter: ObjectRef[] };
export type PaymentForecast = { conflicts: string[]; payments: Payment[]; responses: string[]; unchecked: string[]; scope: string };

/** One payment witness for the stated sequence, never a choice or a simulated resolution. */
export function paymentForecast(frame: Frame, plan: Plan): PaymentForecast {
	const report: PaymentForecast = { conflicts: [], payments: [], responses: [], unchecked: [],
		scope: "Resource forecast under normal untap and successful resolution. Ordinary land and permanent entries supply later sources, using accepted tapped-entry terms. Current attackers keep their current traits. No hidden cards, resolved instructions, triggers, counters, untaps or transformations are simulated. Payments show ordered actions; priced response branches are checked separately, not listed. Remaining sources are mana sources, not every untapped permanent. Payments are examples, not locked choices; timing, targets, future attackers and combat outcomes remain separate." };
	const at = frame.view.window;
	if (at.kind !== "turn") { report.unchecked.push("No turn window."); return report; }
	const now = at.active === frame.seat;
	// Only two seats make "our next turn" one turn away.
	if (!now && (frame.view.players?.length ?? 2) !== 2) { report.unchecked.push("Next-turn resources need two seats."); return report; }
	const turn = now ? at.turn : at.turn + 1;
	// Conditional steps, such as "if I drew a land", are not counted: they may not happen.
	const ours = (one: PlanOption) => !one.if && one.when.active !== "opponent" && (one.when.fromTurn ?? 0) <= turn && turn <= (one.when.throughTurn ?? Infinity);

	// On a later turn every permanent of ours has untapped and none is new.
	// Floating mana that does not persist is gone by then.
	const lasting = (pools: Frame["view"]["pools"]) => (pools ?? []).map((pool) => ({ ...pool, mana: pool.mana.filter((mana) => mana.persists) }));
	const initial = now ? frame : afterUntap(frame);
	let hypothetical = initial;
	const packages = new Map([...(frame.view.work?.packages ?? []), ...(plan.packages ?? [])].map((pack) => [pack.card, pack.registers]));
	// Release conditions use current facts; scheduled windows can advance without
	// simulating an effect. Unspecified windows retain the forecast's starting step.
	const scope = { world: viewWorld(hypothetical.view), controller: frame.seat };
	const heldAt = (when?: PlanOption["when"]) => {
		const step = when?.step ?? (when?.phase ? TURN.find((one) => STEPS[one].phase === when.phase) : undefined) ?? (now ? at.step as Step : "untap");
		const window = { ...at, turn, active: frame.seat, step, phase: STEPS[step].phase };
		return new Set((plan.holds ?? []).filter((hold) => (!hold.releaseWhen || !condition(scope, hold.releaseWhen)) &&
			(!hold.releaseAt || !reached(hold.releaseAt, { seat: frame.seat, view: { window } })))
			.flatMap((hold) => select(hold.objects, initial).map((object) => object.id)));
	};
	let plays = allowance(viewWorld(hypothetical.view), frame.seat).lands - (now ? frame.view.landsPlayed ?? 0 : 0);
	let honest = true;
	// A step that resolves instructions may put cards in hand: after it, a missing card is not a mistake.
	let drawing = false;
	let expired = false;
	const found = report.conflicts;
	// Each step takes its own card: two land steps are two lands, and a card cast once is gone.
	const used = new Set<string>();
	let taken = false;
	const offBoard = (objects: SeenObject[], original: SeenObject[]) => {
		const off = objects.filter((object) => object.zone !== "battlefield" && object.zone !== "stack");
		taken = original.length > 0 && original.every((object) => used.has(object.id));
		return off.find((object) => !used.has(object.id));
	};

	const read = (one: PlanOption): Act | undefined => {
		const action = one.action;
		if ("procedure" in action) {
			const procedure = action.procedure;
			if (procedure.timing === "mana" || procedure.instructions.some((instruction) => instruction.do === "mana")) honest = false;
			if (procedure.timing !== "land" && procedure.timing !== "spell" && !Object.keys(procedure.cost ?? {}).length) return undefined;
			const fromHand = procedure.timing === "land" || procedure.timing === "spell";
			const query = { ...procedure.source, zones: procedure.source.zones ?? [fromHand ? "hand" as const : "battlefield" as const] };
			const chosen = select(query, hypothetical);
			const source = fromHand ? offBoard(chosen, select(query, initial)) : chosen[0];
			const named = procedure.source.card;
			if (procedure.timing === "land") return { kind: "land", ...(source ? { source } : {}), ...(named ? { named } : {}) };
			const stated = procedure.cost?.mana ?? (procedure.timing === "spell" ? source?.card ? frame.view.printed?.[source.card]?.mana : undefined : "{0}");
			const mana = stated ? symbols(stated) : undefined;
			const unknown = !mana || mana.x > 0 || Object.keys(procedure.cost ?? {}).some((key) => !["mana", "tap"].includes(key)) || typeof procedure.cost?.tap === "object";
			return { kind: "cast", ...(source ? { source } : {}), ...(named ? { named } : {}), ...(mana && !unknown ? { price: { generic: mana.generic, colors: mana.colors } } : {}),
				...(procedure.timing === "spell" ? { spell: true } : {}), ...(procedure.cost?.tap === true ? { tap: true } : {}), ...(unknown ? { unknown: true as const } : {}),
				...(procedure.timing === "spell" && source?.card && permanentSpell(frame.view.printed?.[source.card]) && !procedure.instructions.length ? { enters: true } : {}) };
		}
		const id = action.option ?? action.prefix ?? "";
		const offered = action.option ? frame.decision?.options.find((option) => option.id === action.option) : undefined;
		const timing = offered?.use?.timing;
		const kind = timing === "land" || id.startsWith("land:") ? "land"
			: timing === "spell" || timing === "stack" || id.startsWith("cast:") || id.startsWith("play:") ? "cast" : undefined;
		if (!kind) return undefined;
		const refs = offered?.use ? [offered.use.source] : offered?.objects;
		const query = refs ? { refs } : action.objects;
		const selected = query ? select(query, hypothetical) : [];
		const source = timing === "stack" ? selected[0] : offBoard(selected, query ? select(query, initial) : []);
		const named = action.objects?.card;
		if (kind === "land") return { kind, ...(source ? { source } : {}), ...(named ? { named } : {}) };
		if (offered?.use) {
			const { generic, colors, ...extra } = offered.use.cost;
			// An exact pick fixes its payment, including an alternative casting cost.
			// Extra costs and resource-producing effects need a fuller simulation.
			if (Object.keys(extra).some((key) => key !== "tap") || offered.use.instructions.some((one) => one.do === "mana")) honest = false;
			return { kind, ...(source ? { source } : {}), price: { generic, colors },
				...(timing === "spell" ? { spell: true } : {}), ...(extra.tap ? { tap: true } : {}),
				...(timing === "spell" && source?.card && permanentSpell(frame.view.printed?.[source.card]) && !offered.use.instructions.length ? { enters: true } : {}),
				fixed: { paid: offered.use.paid, taps: offered.use.funding ?? [] } };
		}
		const mana = source?.card ? symbols(frame.view.printed?.[source.card]?.mana ?? "") : undefined;
		return { kind, spell: true, ...(source ? { source } : {}), ...(named ? { named } : {}), ...(mana && !mana.x ? { price: { generic: mana.generic, colors: mana.colors } } : { unknown: true as const }),
			...(source?.card && permanentSpell(frame.view.printed?.[source.card]) ? { enters: true } : {}) };
	};
	// First the sequence itself: cards held, land plays, what each land adds. Payments come after, tried together.
	type Item = { at: string; expired: boolean; when: PlanOption["when"] } & ({ kind: "entry"; source: SeenObject } | { kind: "attack"; source: SeenObject } | { kind: "cast"; source: SeenObject; price: Price; fixed?: Funding; label: string; spell?: true; tap?: true });
	const items: Item[] = [];
	const arrived = new Set<string>();
	const entered = (position: Frame, source: SeenObject): Frame => ({ ...position, view: { ...position.view,
		objects: (position.view.objects ?? []).map((one) => one.id === source.id ? source : one) } });
	const entry = (source: SeenObject, where: string, spell: boolean, when: PlanOption["when"]) => {
		const registers = (source.card ? packages.get(source.card) : undefined) ?? (spell ? [] : undefined);
		const state = entersTapped(hypothetical, source, registers);
		if (state === "conditional" || state === "unknown") honest = false;
		const object: SeenObject = { ...source, zone: "battlefield", incarnation: source.incarnation + (spell ? 2 : 1), controller: frame.seat,
			entered: Number.MAX_SAFE_INTEGER, tapped: state === "tapped", counters: {}, damage: 0,
			...(source.traits ? { traits: { ...source.traits, registrations: registers ?? [] }, summoningSick: source.traits.types.includes("creature") } : {}) };
		items.push({ at: where, expired, when, kind: "entry", source: object });
		hypothetical = entered(hypothetical, object);
		arrived.add(source.id);
	};
	for (const [at, step] of plan.steps.entries()) {
		if (!ours(step)) { if (step.if) report.unchecked.push(`steps[${at}]: conditional action not priced.`); continue; }
		const where = `steps[${at}] (${step.label})`;
		const movement = !("procedure" in step.action) && step.action;
		if (movement && (movement.prefix === "attack:" || movement.option?.startsWith("attack:") && movement.option !== "attack:done")) {
			const refs = movement.option && frame.decision?.options.find((one) => one.id === movement.option)?.objects;
			const selected = select(refs ? { refs } : movement.objects ?? {}, hypothetical);
			if (selected.length === 1 && !arrived.has(selected[0]!.id) && selected[0]!.zone === "battlefield" && selected[0]!.traits?.types.includes("creature"))
				items.push({ at: where, expired: true, when: step.when, kind: "attack", source: selected[0]! });
			else report.unchecked.push(`${where}: attack source depends on a future entry, transformation or selection.`);
			continue;
		}
		const act = read(step);
		if (!act) continue;
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
			entry(act.source, where, false, step.when);
			continue;
		}
		if (act.tap && arrived.has(act.source.id) && act.source.traits?.types.includes("creature")) {
			honest = false; report.unchecked.push(`${where}: a newly cast creature's tap ability depends on its entry characteristics.`);
		}
		if (act.unknown) { honest = false; continue; }
		items.push({ at: where, expired, when: step.when, kind: "cast", source: act.source, price: act.price!, ...(act.fixed ? { fixed: act.fixed } : {}),
			...(act.spell ? { spell: true } : {}), ...(act.tap ? { tap: true } : {}), label: step.label });
		// A permanent cast now permits more land plays from then on.
		if (act.spell) for (const one of (act.source.card ? packages.get(act.source.card) : undefined) ?? []) if (one.kind === "permit") plays += one.lands ?? 0;
		if (act.enters) entry(act.source, where, true, step.when);
	}
	// Then the payments: each cast from what the earlier ones left, trying other payments when a later step or a branch cannot be paid.
	// Responses on the opponent's turn must be paid from what the turn leaves; a branch on our own turn is an alternative, not an addition.
	const branches = (plan.may ?? []).flatMap((branch, index) => {
		const at = `may[${index}] (${branch.label})`;
		const lineHonest = honest;
		honest = true;
		const act = read(branch);
		const branchHonest = honest;
		honest = lineHonest;
		if (branch.when.active === "self") {
			if (act) report.unchecked.push(`${at}: own-turn alternative not priced with the ordered line.`);
			return [];
		}
		if (!branchHonest) { report.unchecked.push(`${at}: mana-producing instructions or additional costs are not forecast.`); return []; }
		if (act?.kind === "cast" && act.source && !act.unknown) return [{ at, act }];
		if (act) report.unchecked.push(`${at}: response payment needs a known source and priced cost.`);
		return [];
	});
	if (!honest) { report.unchecked.push("The line depends on unpriced costs, missing sources, mana-producing instructions or uncertain land entry. No complete payment witness."); return report; }
	let deepest: { depth: number; message: string } | undefined;
	const fail = (depth: number, message: string) => { if (!deepest || depth > deepest.depth) deepest = { depth, message }; return false; };
	const left = (position: Frame, spent: ReadonlySet<string>, held: ReadonlySet<string>) => {
		const all = sources(position);
		const free = all.filter(({ object }) => !spent.has(object.id) && !held.has(object.id)), kept = all.filter(({ object }) => held.has(object.id) && !spent.has(object.id));
		return `${free.length ? `the steps before it leave ${free.map(({ object, yields }) => `${object.card ?? object.token?.name} (${[...new Set(yields.map((one) => one.colors.join("")))].join("/")})`).join(", ")}` : "the steps before it leave no untapped source"}` +
			`${kept.length ? `, and the plan holds ${kept.map(({ object }) => object.card ?? object.token?.name).join(", ")}` : ""}`;
	};
	const pool = (position: Frame) => position.view.pools?.find((one) => one.seat === frame.seat)?.mana ?? [];
	const drained = (position: Frame): Frame => ({ ...position, view: { ...position.view, pools: lasting(position.view.pools) } });
	// A position is its index, the sources spent and the mana left floating: one that failed once fails again.
	const failed = new Set<string>();
	const spending = (act: { source?: SeenObject; spell?: true }) => act.spell ? { ...act.source!, zone: "stack" as const } : act.source!;
	const cannotTap = (position: Frame, source: SeenObject, spent: ReadonlySet<string>) => source.tapped || spent.has(source.id) || sick(position, source);
	let visits = 0, preferResponses = branches.length > 0, unfunded = false;
	const ref = (object: SeenObject): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
	const go = (index: number, position: Frame, spent: ReadonlySet<string>): boolean => {
		const key = `${index}|${[...spent].sort().join(",")}|${pool(position).map((mana) => mana.id).sort().join(",")}`;
		if (failed.has(key)) return false;
		if (++visits > SEARCH) throw INCOMPLETE;
		const item = items[index];
		const held = heldAt(item?.when);
		if (item?.expired) position = drained(position);
		const ok = ((): boolean => {
			if (!item) {
				// A branch is on the opponent's turn, when nothing floats; a hold may be what it is for, so held sources pay for it.
				const later = drained(position);
				const responses: string[] = [];
				for (const { at, act } of branches) {
					if (act.tap && cannotTap(later, act.source!, spent)) { responses.push(`${at}: its source cannot pay the tap cost after this example line`); continue; }
					if (!fundings(later, act.price!, new Set([...spent, ...(act.tap ? [act.source!.id] : [])]), spending(act)).length)
						responses.push(`${at}: costs ${stated(act.price!)} but ${left(later, spent, held)} under this example payment. This optional response is unfunded, not an ordered-step conflict.`);
				}
				if (preferResponses && responses.length) { unfunded = true; return false; }
				report.responses = responses;
				return true;
			}
			if (item.kind === "entry") return go(index + 1, entered(position, item.source), spent);
			if (item.kind === "attack") {
				if (cannotTap(position, item.source, spent)) return fail(index, `${item.at}: ${item.source.card ?? item.source.id} cannot attack while tapped, spent or summoning sick under the forecast's current traits`);
				return go(index + 1, position, item.source.traits!.words.includes("vigilance") ? spent : new Set([...spent, item.source.id]));
			}
			if (item.tap && (cannotTap(position, item.source, spent) || held.has(item.source.id))) return fail(index, `${item.at}: its source cannot pay the tap cost while spent, unavailable or held`);
			// Keep future declared attackers distinct even when funding groups otherwise
			// interchangeable sources. After a vigilant attack the source is free again.
			const attackers = items.slice(index + 1).flatMap((one) => one.kind === "attack" ? [one.source.id] : []);
			const reserved = new Set([...spent, ...held, ...attackers, ...(item.tap ? [item.source.id] : [])]);
			if (item.tap && attackers.includes(item.source.id)) return fail(index, `${item.at}: its tap cost spends a later planned attacker`);
			let paymentPosition = position;
			if (item.fixed) {
				const selected = new Set(item.fixed.taps.map((tap) => tap.source.id));
				for (const { object } of sources(position)) if (!selected.has(object.id)) reserved.add(object.id);
				paymentPosition = { ...position, view: { ...position.view, pools: (position.view.pools ?? []).map((one) => ({ ...one, mana: one.mana.filter((mana) => item.fixed!.paid.includes(mana.id)) })) } };
			}
			const ways = fundings(paymentPosition, item.price, reserved, spending(item))
				.filter((way) => !item.fixed || paymentKey(way.funding) === paymentKey(item.fixed));
			if (!ways.length) return fail(index, `${item.at}: costs ${stated(item.price)} but ${left(position, spent, held)}${attackers.length ? `; the later attacks also need ${attackers.join(", ")} untapped` : ""}; reorder the steps, drop one, or release the hold`);
			// Payments that tap the same sources and spend the same kind of floating mana leave the same position: one of each is tried.
			const kind = (id: string) => { const mana = pool(position).find((one) => one.id === id); return `${mana?.color}${mana?.persists ? "+" : ""}${JSON.stringify(mana?.spendOnly ?? null)}`; };
			const distinct = new Map(ways.map((way) => [`${way.funding.taps.map((tap) => tap.source.id).sort().join(",")}|${way.funding.paid.map(kind).sort().join(",")}`, way]));
			return [...distinct.values()].some(({ funding }) => {
				const paid = new Set(funding.paid);
				const after = { ...position, view: { ...position.view, pools: (position.view.pools ?? []).map((one) => ({ ...one, mana: one.mana.filter((mana) => !paid.has(mana.id)) })) } };
				const used = new Set([...spent, ...funding.taps.map((tap) => tap.source.id), ...(item.tap ? [item.source.id] : [])]);
				if (!go(index + 1, after, used)) return false;
				report.payments.unshift({ step: item.at, source: ref(item.source), funding, tapSource: !!item.tap,
					untappedManaSourcesAfter: sources(after).filter(({ object }) => !used.has(object.id)).map(({ object }) => ref(object)) });
				return true;
			});
		})();
		if (!ok) failed.add(key);
		return ok;
	};
	for (;;) {
		try {
			if (go(0, initial, new Set())) break;
			if (!preferResponses || !unfunded) { if (deepest) found.push(deepest.message); break; }
		} catch (error) {
			if (error !== INCOMPLETE) throw error;
			if (!preferResponses) { report.unchecked.push("The payment search exceeded its resource bound. No complete payment witness."); break; }
			report.unchecked.push("The response-preserving payment search exceeded its bound; the ordered line is checked separately.");
		}
		// Prefer a witness that funds every response separately. Optional responses
		// cannot reject an ordered line when that preference cannot be satisfied.
		preferResponses = false; visits = 0; deepest = undefined; failed.clear();
	}
	return report;
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
