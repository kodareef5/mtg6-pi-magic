/** The strategist's projected position, resources and reference tools. No hidden order is read.
 * Past 150 lines to keep the observed and forecast positions on the same complete readers. */
import type { Frame } from "../core/types.ts";
import type { SeenObject } from "../core/work.ts";
import type { Selector } from "../core/language.ts";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { say, type Brief } from "./brief.ts";
import { strategyBrief } from "./playbook.ts";
import { planningChoices } from "./strategy-actions.ts";
import type { Plan } from "../core/language.ts";
import type { Step } from "../core/steps.ts";
import type { Recap } from "./summary.ts";
import type { Lookup } from "./reason.ts";
import { intrinsic } from "../core/characteristics.ts";
import { sources } from "../core/funding.ts";
import { afterUntap, entersTapped } from "../core/budget.ts";
import { TURN } from "../core/steps.ts";
import { allowance } from "../core/permits.ts";
import { viewWorld } from "../core/selectors.ts";
import { odds, within } from "../core/odds.ts";
import { activeWatches } from "../core/triggers.ts";
import { useSources } from "../core/readiness.ts";
import { cardDefinition, decisionFacts } from "./strategy-position.ts";

/** Off-field cards have not installed their battlefield abilities. Keep their
 * base type/stats and any explicit terms, without claiming empty printed keywords. */
function characteristics(object: SeenObject) {
	if (!object.traits) return {};
	if (object.zone === "battlefield" || object.token) return { traits: object.traits };
	const { words, registrations, ...base } = object.traits;
	return { baseCharacteristics: base,
		...(words.length ? { explicitKeywords: words } : {}), ...(registrations.length ? { registrations } : {}) };
}

/** The seat's objects as the writer reads them: what each is and its state, with ids to point at. */
function objects(frame: Frame) {
	const listed = (frame.view.objects ?? []).filter((object) => object.zone !== "library").map((object) => ({
	id: object.id, incarnation: object.incarnation, name: object.card ?? object.token?.name ?? object.ability?.claim, zone: object.zone, owner: object.owner, controller: object.controller,
	...(object.tapped ? { tapped: true } : {}), ...(object.faceDown ? { faceDown: true } : {}),
	...(Object.keys(object.counters).length ? { counters: object.counters } : {}), ...(object.damage ? { damage: object.damage } : {}),
	...characteristics(object), ...(object.attached ? { attached: object.attached } : {}),
	...(object.summoningSick === undefined ? {} : { summoningSick: object.summoningSick }),
	...(object.entered === undefined ? {} : { entered: object.entered }), ...(object.position === undefined ? {} : { position: object.position }),
	...(object.ability ? { ability: object.ability } : {}),
	}));
	const zones = new Set(["battlefield", "hand", "stack", "exile", "graveyard", ...listed.map((one) => one.zone)]);
	return Object.fromEntries([...zones].map((zone) => [zone, {
		you: listed.filter((one) => one.zone === zone && one.controller === frame.seat),
		others: listed.filter((one) => one.zone === zone && one.controller !== frame.seat),
	}]));
}

function mana(frame: Frame): string {
	const only = (selector: Selector) => selector.types || selector.subtypes ? `only to cast a ${[...(selector.subtypes ?? []), ...(selector.types ?? [])].join(" or ")} spell` : `only on ${JSON.stringify(selector)}`;
	const describe = (yields: ReturnType<typeof sources>[number]["yields"]) => [...new Set(yields.map((one) =>
		`${one.colors.join("")}${one.spendOnly ? ` (${only(one.spendOnly)})` : ""}${one.sacrifice ? " (sacrificing it)" : ""}`))].join(" or ");
	const now = sources(frame);
	const floating = frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? [];
	const lines = [`Mana now: ${now.length ? now.map(({ object, yields }) => `${object.card ?? object.token?.name} (${object.id}) makes ${describe(yields)}`).join("; ") : "no untapped source"}` +
		`${floating.length ? `; floating ${floating.map((one) => one.color).join("")}` : ""}.`];
	lines.push(`Maximum mana from these sources and the pool now: ${floating.length + now.reduce((n, one) => n + Math.max(...one.yields.map((yielded) => yielded.colors.length)), 0)}; colors and spending restrictions still apply.`);
	const tapped = (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.controller === frame.seat && one.tapped);
	if (tapped.length) lines.push(`Already tapped, so unavailable for tap costs: ${tapped.map((one) => `${one.card ?? one.token?.name ?? "unknown"} (${one.id})`).join(", ")}.`);
	const left = Math.max(0, allowance(viewWorld(frame.view), frame.seat).lands - (frame.view.landsPlayed ?? 0));
	const lands = useSources(frame, { source: { zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "land" })
		.filter((object) => object.traits?.types.includes("land"));
	const land = (object: SeenObject) => {
		const card = object.card!, colors = intrinsic(object.traits);
		const registers = frame.view.work?.packages?.find((pack) => pack.card === card)?.registers;
		const entry = entersTapped(frame, object, registers);
		if (entry === "unknown") return `${card}: no package, so how it enters and what it makes are unknown until you write one`;
		const makes = [...colors, ...(registers ?? []).flatMap((one) => one.kind === "mana" ? [one.colors?.join("") ?? `any ${one.any ?? 1}`] : [])];
		return `${card}: ${entry === "conditional" ? "enters tapped under a condition" : `enters ${entry}`}, ${makes.length ? `makes ${makes.join(" or ")}` : "makes no mana itself"}`;
	};
	const from = (zone: string) => [...new Map(lands.filter((one) => one.zone === zone).map((one) => [one.card, one])).values()].map(land).join("; ") || "no land";
	lines.push(left ? `Land plays left this turn: ${left}. In hand: ${from("hand")}.${[...new Set(lands.filter((one) => one.zone !== "hand").map((one) => one.zone))].map((zone) => ` Permitted from ${zone}: ${from(zone)}.`).join("")}`
		: "No land play left this turn.");
	lines.push("Tap each source once: its yields are alternatives, not added together. Each step spends what earlier steps leave. A held source stays available for its response. A land that enters tapped makes nothing this turn.");
	return lines.join(" ");
}

export type Context = { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe; rules?: Rules;
	/** Benchmark experiment; ordinary planning keeps the saved examples inline. */
	policyExamples?: "lookup" };

/** Pregame decisions are the initial phase defaults, not paragraphs to rewrite on turn one. */
export function initialPlan(brief: Brief): Plan {
	return { objective: brief.objective ?? [say(brief.role), say(brief.route)].filter(Boolean).join(" "),
		guidance: say(brief.matchup) || say(brief.route), steps: [],
		phases: Object.entries(brief.steps ?? {}).flatMap(([step, sides]) => (["own", "opponent"] as const).flatMap((side) => {
			const guidance = say(sides?.[side]);
			return guidance ? [{ when: { active: side === "own" ? "self" as const : "opponent" as const, step: step as Step }, guidance }] : [];
		})) };
}

/** A forecast, separate from current facts: normal untap and no resource-changing reply. */
export function nextMana(frame: Frame): string {
	return mana(afterUntap(frame));
}

/** Whose turns are whose, by number: the table's global turns alternate, and a window on the wrong seat's turn never opens. */
function turns(frame: Frame): string {
	const at = frame.view.window;
	if (at.kind !== "turn" || (frame.view.players?.length ?? 2) !== 2) return "";
	const mine = at.active === frame.seat ? at.turn : at.turn + 1, next = (from: number) => [from, from + 2, from + 4].join(", ");
	return `Your turns are ${next(mine)}…; the opponent's are ${next(mine === at.turn ? at.turn + 1 : at.turn)}….`;
}

/**
 * Draw odds from this seat's view, as a tool: a named card, or every card of a type word, in our library or the
 * opponent's unknown cards. Library order is not tracked, and the answer says so.
 */
export function chancing(frame: Frame): Lookup {
	return {
		name: "odds",
		description: "Chances from what you can see. whose you: a card or type drawn within your next draws. whose opponent: a card or type in their hand now, and their next draw.",
		parameters: { type: "object", additionalProperties: false, required: ["whose"], properties: {
			whose: { type: "string", enum: ["you", "opponent"] }, card: { type: "string", description: "A card's exact name." },
			type: { type: "string", description: "A type or subtype word, such as land, creature, instant, Dragon." }, draws: { type: "integer", minimum: 1, maximum: 20 } } },
		answer(args) {
			const owner = args.whose === "opponent" ? frame.view.players?.find((one) => one.id !== frame.seat)?.id : frame.seat;
			const found = owner === undefined ? {} : odds(frame, owner), mine = owner === frame.seat;
			const word = String(args.type ?? "").toLowerCase();
			const names = args.card ? [String(args.card)] : word ? Object.keys(found).filter((name) => (frame.view.printed?.[name]?.type ?? "").toLowerCase().split(/[\s—-]+/).includes(word)) : [];
			const first = Object.values(found)[0];
			if (!first) return "There is no registered list to count from.";
			if (!names.length || names.some((name) => !found[name])) return `Name a card on ${mine ? "your" : "their"} list, or a type word that one of its cards has.`;
			const draws = Number(args.draws ?? 1), percent = (chance: number) => `${(100 * chance).toFixed(1)}%`;
			const line = (name: string) => `${name}: ${found[name]!.remaining} unaccounted` + (mine ? `, ${percent(within(found, [name], first.pool, draws))} within ${draws} draw${draws === 1 ? "" : "s"}`
				: `, ${percent(found[name]!.inHand)} in hand now, ${percent(found[name]!.draw)} their next draw`);
			const any = names.length > 1 ? [`Any of them: ${mine ? `${percent(within(found, names, first.pool, draws))} within ${draws} draw${draws === 1 ? "" : "s"}`
				: `${percent(within(found, names, first.pool, first.hand))} in hand now`}.`] : [];
			return [...names.slice(0, 15).map(line), ...any, `Basis: ${first.basis}.`].join("\n");
		},
	};
}

export function facts(frame: Frame, context: Context, more: Record<string, unknown> = {}, scope: "turn" | "response" | "preparation" = "turn"): string {
	const observed = frame;
	if (scope === "preparation" && frame.view.window.kind === "turn") {
		const projected = afterUntap(frame), { decision: _decision, refused: _refused, ...rest } = projected;
		frame = { ...rest, view: { ...projected.view,
			window: { kind: "turn", turn: frame.view.window.turn + 1, active: frame.seat, step: "upkeep", phase: "beginning" },
			remainingSteps: TURN.filter((step) => step !== "untap"),
			drawnAt: undefined, turnDraw: undefined, landsPlayed: 0, history: [], combat: null, purposes: [], actions: [],
		} };
	}
	// Pilot receipt windows do not define strategic history. Actions and history
	// carry the recorded events in both live and saved-position requests.
	const { work, done: _done, worked: _worked, objects: _objects, printed: _printed, table: _table, yours: _yours, since: _since, ...view } = frame.view;
	const at = frame.view.window;
	const decision = decisionFacts(frame, context.cards);
	const inHand = new Set(decision.yourHand.filter((one) => one.printed).map((one) => one.name));
	return JSON.stringify({
		brief: strategyBrief(context.brief, frame, scope === "response" ? "response" : "turn", context.policyExamples),
		...more,
		...(scope === "preparation" ? { positionBasis: {
			kind: "forecast", observedWindow: observed.view.window,
			assumptions: "Your next upkeep after normal untap, before the unknown draw or any upkeep effects. Your current permanents survive and untap; current characteristics and abilities are retained. Nonpersistent floating mana expires. This is not the current position or a prediction of the opponent's actions or intervening effects.",
			observedHistory: observed.view.history, observedActions: observed.view.actions,
		} } : { positionBasis: { kind: "observed" } }),
		notebook: work?.notebook ?? [],
		packages: (work?.packages ?? []).map((pack) => pack.card),
		cards: [...new Set((frame.view.objects ?? []).flatMap((object) => object.card ? [object.card] : []))]
			.flatMap((name) => { const card = !inHand.has(name) && cardDefinition(frame, name, context.cards); return card ? [card] : []; }),
		recaps: context.recaps?.slice(-3),
		// Background and prior intent precede the position they must answer.
		seat: frame.seat, turns: turns(frame),
		currentWindow: at.kind === "turn" ? { active: at.active === frame.seat ? "self" : "opponent", step: at.step } : undefined,
		mana: mana(frame), view, objects: objects(frame), watches: activeWatches(frame),
		choices: planningChoices(frame), refused: frame.refused,
		decisionFacts: decision,
	});
}
