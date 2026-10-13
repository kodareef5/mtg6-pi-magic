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
 * A question with one real option is answered at once in every mode: the
 * person's standing choice, not the table's. Stepping back out of a use the
 * seat started is not a real option. Priority stops are the person's too:
 * with smart stops the seat asks in its own main phases and when another seat
 * has something on the stack, and passes elsewhere unless the autopilot wants
 * to act. Every pick says who made it, so the ledger tells the person's moves
 * from the autopilot's.
 */

import type { Answer, Player } from "../core/player.ts";
import type { Frame, Option } from "../core/types.ts";

export type Mode = "suggest" | "auto" | "manual";
export type Stops = "smart" | "all";

/** What the person is being asked: the frame, and the autopilot's pick when it has one. */
export type Asking = { frame: Frame; suggestion?: Extract<Answer, { kind: "pick" }> };

export type Person = ReturnType<typeof person>;

/** Options that step back or out of a use the seat started: never the reason a question needs a person. */
const ESCAPES = new Set(["announce:back", "announce:cancel", "payment:cancel", "announce:individual"]);
export const escape = (option: Option) => ESCAPES.has(option.id) || /^(announce:unpay|announce:remove-target|payment:remove):/.test(option.id);

/**
 * The question as a person reads it, numbered from 1. Payments that tap the
 * same permanents are one line, whatever colour pays the generic part or
 * whichever copy of a card taps; the line keeps the autopilot's choice, or the
 * colour the cost still needs. A trigger leads with its card and target, and a
 * listed move that breaks a rule says so.
 */
export function menu(asking: Asking): { option: Option; label: string }[] {
	const options = asking.frame.decision?.options ?? [], needs = new Set(/Still needs[^.]*/.exec(asking.frame.decision?.question ?? "")?.[0].match(/\{[WUBRG]\}/g) ?? []);
	const lines = new Map<string, Option[]>();
	for (const option of options) {
		const paying = /^(Confirm and pay|Add to payment):/.test(option.label);
		const key = paying ? option.label.replace(/ \((?:\d+-\d+|token-[\d-]+)\)/g, "").replace(/\{[WUBRG]\}/g, "{*}") : option.id;
		lines.set(key, [...(lines.get(key) ?? []), option]);
	}
	return [...lines.values()].map((same) => {
		const option = same.find((one) => one.id === asking.suggestion?.option) ?? same.find((one) => [...needs].some((color) => one.label.endsWith(`for ${color}`))) ?? same[0]!;
		let label = /^(Confirm and pay|Add to payment):/.test(option.label) ? option.label.replace(/ \((?:\d+-\d+|token-[\d-]+)\)/g, "") : option.label;
		if (option.trigger) {
			const card = option.trigger.name.replace(/ \([^)]*\)$/, ""), prefix = `Put on the stack: ${card}: ${option.trigger.text}`;
			label = `Put ${card}'s trigger on the stack${option.label.startsWith(prefix) && option.label.length > prefix.length ? `: ${option.label.slice(prefix.length).trim()}` : ""}`;
		}
		const conflict = /Conflicts with [^.]*\./.exec(option.shows ?? "")?.[0];
		return { option, label: `${label}${conflict ? ` (${conflict.replace(/\.$/, "")})` : ""}` };
	});
}

export function person(name: string, autopilot: Player | undefined, start: Mode, shown: (asking: Asking | null) => void) {
	let mode: Mode = autopilot ? start : "manual", stops: Stops = "smart", asking: (Asking & { settle(answer: Answer): void }) | null = null;
	let conceding = false, picks = 0, passingTurn: number | undefined, latest: Frame | undefined;
	const pick = (frame: Frame, option: string, by?: "person"): Extract<Answer, { kind: "pick" }> => ({ kind: "pick", option, actionId: `${name}-${frame.version}-${++picks}`, ...(by ? { by } : {}) });
	const settle = (answer: Answer) => { const now = asking; asking = null; shown(null); now?.settle(answer); };
	const turnOf = (frame: Frame) => frame.view.window.kind === "turn" ? frame.view.window.turn : undefined;
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
			latest = frame;
			if (passingTurn !== undefined && (passingTurn !== turnOf(frame) || answerable(frame))) passingTurn = undefined;
			if (conceding) return { kind: "concede", by: "person" };
			const options = frame.decision?.options ?? [], real = options.filter((one) => !escape(one));
			if (mode === "auto" && autopilot) return autopilot.answer(frame);
			if (real.length === 1 && !frame.refused?.length) return pick(frame, real[0]!.id, "person");
			let suggestion: Asking["suggestion"];
			if (mode === "suggest" && autopilot) {
				const proposed = await autopilot.answer(frame);
				if (proposed.kind !== "pick") return proposed;
				suggestion = proposed;
			}
			// A stop the person has not asked for: pass, unless the autopilot sees something to do here.
			if (passes(frame) && (!suggestion || suggestion.option === "pass")) return suggestion ?? pick(frame, "pass", "person");
			// A newer ask replaces one the table withdrew; the person answers what is asked now.
			return new Promise<Answer>((resolve) => { asking = { frame, ...(suggestion ? { suggestion } : {}), settle: resolve }; shown(asking); });
		},
		observe(frame) { latest = frame; autopilot?.observe(frame); },
		reset() { asking = null; shown(null); autopilot?.reset?.(); },
		async close() { asking = null; await autopilot?.close(); },
	};

	return {
		player,
		mode: () => mode,
		stops: () => stops,
		asking: () => asking,
		/** Answer with a line of the menu by its number, from 1. */
		choose(number: number): string | null {
			if (!asking) return "Nothing is being asked of this seat.";
			const lines = menu(asking), line = lines[number - 1];
			if (!line) return `Choose 1 to ${lines.length}.`;
			settle(pick(asking.frame, line.option.id, "person"));
			return null;
		},
		/** Take the autopilot's choice. */
		accept(): string | null {
			if (!asking) return "Nothing is being asked of this seat.";
			if (!asking.suggestion) return "The autopilot has no choice here; answer with a number.";
			settle(asking.suggestion);
			return null;
		},
		/** Pass now, or for the rest of this turn unless another seat puts something on the stack. */
		pass(rest: "now" | "turn"): string | null {
			const frame = asking?.frame ?? latest;
			if (rest === "turn") passingTurn = frame && turnOf(frame);
			if (!asking) return rest === "turn" ? null : "Nothing is being asked of this seat.";
			if (!asking.frame.decision?.options.some((one) => one.id === "pass")) return rest === "turn" ? null : "This question has no pass.";
			settle(pick(asking.frame, "pass", "person"));
			return null;
		},
		setStops(next: Stops) { stops = next; },
		/** Switch modes. Handing an open question to the autopilot answers it now. */
		async switch(next: Mode): Promise<string | null> {
			if (next !== "manual" && !autopilot) return "This seat has no autopilot.";
			mode = next;
			if (next === "auto" && asking) settle(asking.suggestion ?? await autopilot!.answer(asking.frame));
			return null;
		},
		/** Concede now if asked, or at the next ask. */
		concede() { conceding = true; if (asking) settle({ kind: "concede", by: "person" }); },
	};
}
