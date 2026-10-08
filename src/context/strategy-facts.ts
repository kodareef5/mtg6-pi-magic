/** The strategist's projected position, resources and reference tools. No hidden order is read. */
import type { Frame } from "../core/types.ts";
import type { SeenObject } from "../core/work.ts";
import type { Selector } from "../core/language.ts";
import type { Universe } from "../core/cards.ts";
import type { Rules } from "../core/rules.ts";
import { say, type Brief } from "./brief.ts";
import type { Plan } from "../core/language.ts";
import type { Recap } from "./summary.ts";
import type { Lookup } from "./reason.ts";
import { intrinsic } from "../core/characteristics.ts";
import { sources } from "../core/funding.ts";
import { afterUntap, entersTapped } from "../core/budget.ts";
import { TURN } from "../core/steps.ts";
import { allowance } from "../core/permits.ts";
import { holds, viewWorld } from "../core/selectors.ts";
import { odds, within } from "../core/odds.ts";
import { useSources } from "../core/readiness.ts";

export function mana(frame: Frame): string {
	return manaLines(frame).join(" ");
}

/** The seat's mana now, one statement per line: sources, maximum, tapped sources, land plays, and the tapping rule. */
export function manaLines(frame: Frame): string[] {
	const only = (selector: Selector) => selector.types || selector.subtypes ? `only to cast a ${[...(selector.subtypes ?? []), ...(selector.types ?? [])].join(" or ")} spell` : `only on ${JSON.stringify(selector)}`;
	const describe = (yields: ReturnType<typeof sources>[number]["yields"]) => [...new Set(yields.map((one) =>
		`${one.colors.join("")}${one.spendOnly ? ` (${only(one.spendOnly)})` : ""}${one.sacrifice ? " (sacrificing it)" : ""}`))].join(" or ");
	const now = sources(frame);
	const floating = frame.view.pools?.find((entry) => entry.seat === frame.seat)?.mana ?? [];
	const lines = [`Mana now: ${now.length ? now.map(({ object, yields }) => `${object.card ?? object.token?.name} (${object.id}@${object.incarnation}) makes ${describe(yields)}`).join("; ") : "no untapped source"}` +
		`${floating.length ? `; floating ${floating.map((one) => one.color).join("")}` : ""}.`];
	lines.push(`Maximum mana from these sources and the pool now: ${floating.length + now.reduce((n, one) => n + Math.max(...one.yields.map((yielded) => yielded.colors.length)), 0)}; colors and spending restrictions still apply.`);
	const tapped = (frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.controller === frame.seat && one.tapped);
	if (tapped.length) lines.push(`Already tapped, so unavailable for tap costs: ${tapped.map((one) => `${one.card ?? one.token?.name ?? "unknown"} (${one.id}@${one.incarnation})`).join(", ")}.`);
	const left = Math.max(0, allowance(viewWorld(frame.view), frame.seat).lands - (frame.view.landsPlayed ?? 0));
	const lands = useSources(frame, { source: { zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "land" })
		.filter((object) => object.traits?.types.includes("land"));
	const land = (object: SeenObject) => {
		const card = object.card!, colors = intrinsic(object.traits);
		const pack = frame.view.work?.packages?.find((one) => one.card === card), registers = pack?.registers;
		const entry = entersTapped(frame, object, registers);
		if (entry === "unknown") return `${card}: no package, so how it enters and what it makes are unknown until you write one`;
		const makes = [...colors, ...(registers ?? []).flatMap((one) => one.kind === "mana" ? [one.colors?.join("") ?? `any ${one.any ?? 1}`] : [])];
		// A condition is read against the board now; an earlier land this turn can change it.
		const own = registers?.find((one): one is Extract<NonNullable<typeof registers>[number], { kind: "enters" }> => one.kind === "enters" && !one.affects && !!one.tapped && !!one.if);
		const condition = entry === "conditional" && own?.if ? `would enter ${holds({ world: viewWorld(frame.view), controller: frame.seat }, own.if) ? "tapped" : "untapped"} on the board now ("${own.basis}")`
			: entry === "conditional" ? "enters tapped under a condition" : `enters ${entry}`;
		const uses = (pack?.procedures ?? []).filter((one) => one.source.zones?.includes("battlefield")).map((one) => `${one.claim} ("${one.basis}")`);
		return `${card}: ${condition}, ${makes.length ? `makes ${makes.join(" or ")}` : "makes no mana itself"}${uses.length ? `; on the battlefield it can also: ${uses.join("; ")}` : ""}`;
	};
	const from = (zone: string) => [...new Map(lands.filter((one) => one.zone === zone).map((one) => [one.card, one])).values()].map(land).join("; ") || "no land";
	const at = frame.view.window;
	lines.push(at.kind === "turn" && at.active !== frame.seat ? "No land play: lands are played only on your own turn."
		: left ? `Land plays left this turn: ${left}. In hand: ${from("hand")}.${[...new Set(lands.filter((one) => one.zone !== "hand").map((one) => one.zone))].map((zone) => ` Permitted from ${zone}: ${from(zone)}.`).join("")}`
		: "No land play left this turn.");
	lines.push("Tap each source once: its yields are alternatives, not added together. Each step spends what earlier steps leave. A held source stays available for its response. A land that enters tapped makes nothing this turn.");
	return lines;
}

export type Context = { brief?: Brief; recaps?: readonly Recap[]; cards?: Universe; rules?: Rules;
	/** Ask the focused board questions before the writer; seated games and benchmarks set it. */
	survey?: boolean };

/**
 * A fresh plan starts from the pregame objective with no phases. The pregame step notes reach the pilot
 * as its guidance in any window the plan leaves uncovered; as inherited phases they would stand as
 * scripts with no completion and outlive every window the writer replaces.
 */
export function initialPlan(brief: Brief): Plan {
	return { objective: brief.objective ?? [say(brief.role), say(brief.route)].filter(Boolean).join(" "),
		guidance: say(brief.matchup) || say(brief.route), steps: [] };
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

/** The position a session plans for: the observed frame, or for a preparation the labelled next-turn forecast. */
export function planningFrame(frame: Frame, scope: "turn" | "response" | "preparation"): Frame {
	if (scope !== "preparation" || frame.view.window.kind !== "turn") return frame;
	const projected = afterUntap(frame), { decision: _decision, refused: _refused, ...rest } = projected;
	return { ...rest, view: { ...projected.view,
		window: { kind: "turn", turn: frame.view.window.turn + 1, active: frame.seat, step: "upkeep", phase: "beginning" },
		remainingSteps: TURN.filter((step) => step !== "untap"),
		drawnAt: undefined, turnDraw: undefined, landsPlayed: 0, history: [], combat: null, purposes: [], actions: [],
	} };
}
