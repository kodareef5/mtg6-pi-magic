/**
 * A person at a seat. The table asks this player like any other; it holds the
 * ask until the person answers, by number or by taking the autopilot's choice.
 *
 * The autopilot is the seat's own model player, the one that would play the
 * seat alone. How much of the seat it plays is the person's mode, changed at
 * any time:
 *
 *   suggest  the autopilot proposes each choice and the person confirms it or
 *            picks another. Its planning, which moves no cards, goes through.
 *   auto     the autopilot answers; the person watches and can take over.
 *   manual   the person answers everything, and the autopilot is not asked.
 *
 * Preparing the known uses of a card is not a choice: the autopilot does it
 * in every mode. A question with one real option is answered at once unless
 * the autopilot owes the turn's plan first: the person's standing choice, not
 * the table's. Stepping back out of a use the seat started is not a real
 * option. Priority stops are the person's too: with smart stops the seat asks
 * in its own main phases and when another seat has something on the stack,
 * and passes elsewhere unless the autopilot wants to act. Every pick says who
 * made it, so the ledger tells the person's moves from the autopilot's.
 */

import { sameness } from "../core/funding.ts";
import { planReason } from "../core/planning.ts";
import type { Answer, Player } from "../core/player.ts";
import type { Frame, Option } from "../core/types.ts";

export type Mode = "suggest" | "auto" | "manual";
export type Stops = "smart" | "all";

/**
 * What the person is being asked: the frame, and the autopilot's pick when it
 * has one. `ask` numbers the questions shown, so an answer meant for one never
 * lands on the next.
 */
export type Asking = { frame: Frame; ask?: number; suggestion?: Extract<Answer, { kind: "pick" }> };

export type Person = ReturnType<typeof person>;

/** Options that step back or out of a use the seat started: never the reason a question needs a person. */
const ESCAPES = new Set(["announce:back", "announce:cancel", "payment:cancel", "announce:individual"]);
export const escape = (option: Option) => ESCAPES.has(option.id) || /^(announce:unpay|announce:remove-target|payment:remove):/.test(option.id);

const GONE = "That question was answered or withdrawn; answer the one asked now.";

const PAYING = /^(Confirm and pay|Add to payment):/, NAMED = / \((\d+-\d+|token-[\d-]+)\)/g, SPENT = /for \{([WUBRG])\}(?=;|$)/g;

/**
 * What tells two options apart, as far as the game goes. Objects are named by
 * everything this seat can see of them, as core groups mana sources, so two
 * untapped Forests are alike and a Forest that is now a 3/3 creature is not. A
 * payment's colours count as a whole: which source makes which colour does not
 * matter when the same mana is spent.
 */
function likeness(frame: Frame, option: Option): string {
	const seen = new Map((frame.view.objects ?? []).map((one) => [one.id, one])), alike = (id: string) => { const one = seen.get(id); return one ? sameness(frame, one) : id; };
	const objects = (option.objects ?? []).map((ref) => alike(ref.id)).join(",");
	if (!PAYING.test(option.label)) return `${option.label}|${objects}`;
	const spent = [...option.label.matchAll(SPENT)].map((match) => match[1]).sort().join("");
	return `${option.label.replace(NAMED, (_, id: string) => ` (${alike(id)})`).replace(SPENT, "for {*}")}|${spent}|${objects}`;
}

/**
 * The question as a person reads it, numbered from 1. Options that come to
 * the same thing are one line: two copies of a land to play, or payments that
 * tap alike permanents for the same mana. The line keeps the autopilot's
 * choice. A trigger leads with its card and target, and a listed move that
 * breaks a rule says so.
 */
export function menu(asking: Asking): { option: Option; label: string }[] {
	const lines = new Map<string, Option[]>();
	for (const option of asking.frame.decision?.options ?? []) {
		const key = likeness(asking.frame, option);
		lines.set(key, [...(lines.get(key) ?? []), option]);
	}
	const shown = [...lines.values()].map((same) => {
		const option = same.find((one) => one.id === asking.suggestion?.option) ?? same[0]!;
		let label = option.label;
		if (option.trigger) {
			const card = option.trigger.name.replace(/ \([^)]*\)$/, ""), prefix = `Put on the stack: ${card}: ${option.trigger.text}`;
			label = `Put ${card}'s trigger on the stack${option.label.startsWith(prefix) && option.label.length > prefix.length ? `: ${option.label.slice(prefix.length).trim()}` : ""}`;
		}
		const conflict = /Conflicts with [^.]*\./.exec(option.shows ?? "")?.[0];
		return { option, label: `${label}${conflict ? ` (${conflict.replace(/\.$/, "")})` : ""}` };
	});
	// A payment reads without object ids, unless two lines would then read the same.
	const plain = shown.map((line) => PAYING.test(line.label) ? line.label.replace(NAMED, "") : line.label);
	return shown.map((line, at) => plain.indexOf(plain[at]!) === plain.lastIndexOf(plain[at]!) ? { ...line, label: plain[at]! } : line);
}

/** `decides` is false for an autopilot that can only prepare: its roster has no decision model, so the person plays manual. */
export function person(name: string, autopilot: Player | undefined, start: Mode, shown: (asking: Asking | null) => void, decides = true) {
	const deciding = !!autopilot && decides;
	let mode: Mode = deciding ? start : "manual", stops: Stops = "smart", asking: (Asking & { settle(answer: Answer): void }) | null = null;
	let conceding = false, picks = 0, asks = 0, passingTurn: number | undefined, latest: Frame | undefined, told: string | undefined;
	// A question handed to the autopilot while it works the answer out; the person can take it back before it does.
	let handed: { open: Asking & { settle(answer: Answer): void } } | null = null;
	// Each ask, rewind and close moves `serial`: an answer worked out for an older one is never shown.
	let serial = 0;
	const pick = (frame: Frame, option: string, by?: "person"): Extract<Answer, { kind: "pick" }> => ({ kind: "pick", option, actionId: `${name}-${frame.version}-${++picks}`, ...(by ? { by } : {}) });
	const settle = (answer: Answer) => { const now = asking; asking = null; shown(null); now?.settle(answer); };
	const turnOf = (frame: Frame) => frame.view.window.kind === "turn" ? frame.view.window.turn : undefined;
	// The person's words reach the autopilot's strategy as a plan request, in a turn, once.
	const requesting = (frame: Frame) => !!told && !!autopilot && mode !== "manual" && frame.view.window.kind === "turn" &&
		!frame.refused?.some((why) => /requests for a new plan are spent/.test(why));
	const request = (frame: Frame): Answer => {
		const reason = `The person playing this seat asks: ${told} Plan the rest of this turn and the opponent's next turn to carry it out where the rules allow, and say in your assessment what you cannot do.`;
		told = undefined;
		return { kind: "work", tools: [{ do: "plan.request", reason }], revision: frame.view.work?.revision ?? 0, actionId: `${name}-told-${frame.version}-${++picks}` };
	};
	// Another seat's spell or ability waiting to resolve is a chance to respond, under any stops.
	const answerable = (frame: Frame) => (frame.view.objects ?? []).some((one) => one.zone === "stack" && one.controller !== frame.seat);
	/** Whether a priority question with a pass may go by without the person. */
	const passes = (frame: Frame) => {
		const window = frame.view.window;
		if (frame.decision?.situation !== "priority" || !frame.decision.options.some((one) => one.id === "pass") || answerable(frame)) return false;
		if (passingTurn !== undefined && passingTurn === turnOf(frame)) return true;
		const empty = !(frame.view.objects ?? []).some((one) => one.zone === "stack");
		return stops === "smart" && !(window.kind === "turn" && window.active === frame.seat && empty && /main$/.test(window.step));
	};

	const player: Player = {
		name,
		async answer(frame) {
			const mine = ++serial;
			latest = frame;
			if (passingTurn !== undefined && (passingTurn !== turnOf(frame) || answerable(frame))) passingTurn = undefined;
			if (conceding) return { kind: "concede", by: "person" };
			if (requesting(frame)) return request(frame);
			if (frame.decision?.preparation?.length && autopilot) return autopilot.answer(frame);
			// One real line left once options that come to the same thing are folded: nothing to choose.
			const real = menu({ frame }).filter((line) => !escape(line.option));
			const single = real.length === 1 && !frame.refused?.length;
			let suggestion: Asking["suggestion"];
			if (autopilot && (mode === "auto" || mode === "suggest" && (!single || planReason(frame)))) {
				const proposed = await autopilot.answer(frame);
				// Withdrawn while it thought: the table no longer waits on this answer.
				if (mine !== serial || proposed.kind !== "pick") return proposed;
				// The mode can change while it thinks: auto plays its pick, suggest shows it, manual drops it.
				if (mode === "auto") return proposed;
				if (mode === "suggest") suggestion = proposed;
			}
			if (single) return pick(frame, real[0]!.option.id, "person");
			// A stop the person has not asked for: pass, unless the autopilot sees something to do here.
			if (passes(frame) && (!suggestion || suggestion.option === "pass")) return suggestion ?? pick(frame, "pass", "person");
			// A newer ask replaces one the table withdrew; the person answers what is asked now.
			return new Promise<Answer>((resolve) => { asking = { frame, ask: ++asks, ...(suggestion ? { suggestion } : {}), settle: resolve }; shown(asking); });
		},
		// In manual mode the autopilot is not asked, and does not prepare in the background either.
		observe(frame) { latest = frame; if (mode !== "manual") autopilot?.observe(frame); },
		reset() { serial++; asking = null; handed = null; shown(null); autopilot?.reset?.(); },
		async close() { serial++; asking = null; handed = null; await autopilot?.close(); },
	};

	return {
		player,
		mode: () => mode,
		stops: () => stops,
		asking: () => asking,
		/** The seat's newest frame, asked or only observed. */
		latest: () => latest,
		/** Answer with a line of the menu by its number, from 1; with `ask`, only that question. */
		choose(number: number, ask?: number): string | null {
			if (!asking) return "Nothing is being asked of this seat.";
			if (ask !== undefined && ask !== asking.ask) return GONE;
			const lines = menu(asking), line = lines[number - 1];
			if (!line) return `Choose 1 to ${lines.length}.`;
			settle(pick(asking.frame, line.option.id, "person"));
			return null;
		},
		/** Take the autopilot's choice. */
		accept(ask?: number): string | null {
			if (!asking) return "Nothing is being asked of this seat.";
			if (ask !== undefined && ask !== asking.ask) return GONE;
			if (!asking.suggestion) return "The autopilot has no choice here; answer with a number.";
			settle(asking.suggestion);
			return null;
		},
		/** Pass now, or for the rest of this turn unless another seat puts something on the stack. */
		pass(rest: "now" | "turn", ask?: number): string | null {
			if (asking && ask !== undefined && ask !== asking.ask) return GONE;
			const frame = asking?.frame ?? latest;
			if (rest === "turn") passingTurn = frame && turnOf(frame);
			if (!asking) return rest === "turn" ? null : "Nothing is being asked of this seat.";
			if (!asking.frame.decision?.options.some((one) => one.id === "pass")) return rest === "turn" ? null : "This question has no pass.";
			settle(pick(asking.frame, "pass", "person"));
			return null;
		},
		setStops(next: Stops) { stops = next; },
		/**
		 * Switch modes. Handing an open question to the autopilot takes it from the
		 * person at once, so their clock stops while it thinks, and answers it.
		 */
		async switch(next: Mode): Promise<string | null> {
			if (next !== "manual" && !deciding) return autopilot ? "This seat's autopilot has no decision model; it only prepares cards." : "This seat has no autopilot.";
			mode = next;
			if (next !== "auto") {
				// Taken back while the autopilot thinks: the question is the person's again at once, and its late answer is dropped.
				const back = handed;
				handed = null;
				if (back && !asking) { asking = back.open; shown(asking); }
				return null;
			}
			const open = asking, mine = serial;
			if (!open) return null;
			const handoff = { open };
			handed = handoff;
			asking = null;
			shown(null);
			let answer: Answer | undefined;
			try { answer = open.suggestion ?? await autopilot!.answer(open.frame); } catch { answer = undefined; }
			// Taken back or withdrawn while it thought: nothing is owed from here.
			if (handed !== handoff || serial !== mine) return null;
			handed = null;
			if (answer) { open.settle(answer); return null; }
			asking = open;
			shown(open);
			return "The autopilot could not answer; the question is yours again.";
		},
		/**
		 * Tell the seat how to play, in words. The autopilot's strategy plans
		 * from them at the seat's next question, and the autopilot plays that
		 * plan: its suggestions in suggest mode, its moves in auto.
		 */
		tell(words: string): string | null {
			if (!deciding) return "This seat has no autopilot to tell.";
			if (mode === "manual") return "In manual mode the autopilot plans nothing. /magic mode suggest or auto, then tell it.";
			told = words.trim().slice(0, 1000);
			// An open question waits on the person; the request goes in its place, and the question comes back planned.
			if (asking && requesting(asking.frame)) settle(request(asking.frame));
			return null;
		},
		/** Concede now if asked, or at the next ask. */
		concede() { conceding = true; if (asking) settle({ kind: "concede", by: "person" }); },
	};
}
