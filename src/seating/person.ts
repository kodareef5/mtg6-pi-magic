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
 * A decision with one listed option is answered at once in every mode: that is
 * the person's standing choice, not the table's. Every pick says who made it,
 * so the ledger tells the person's moves from the autopilot's.
 */

import type { Answer, Player } from "../core/player.ts";
import type { Frame } from "../core/types.ts";

export type Mode = "suggest" | "auto" | "manual";

/** What the person is being asked: the frame, and the autopilot's pick when it has one. */
export type Asking = { frame: Frame; suggestion?: Extract<Answer, { kind: "pick" }> };

export type Person = ReturnType<typeof person>;

export function person(name: string, autopilot: Player | undefined, start: Mode, shown: (asking: Asking | null) => void) {
	let mode: Mode = autopilot ? start : "manual", asking: (Asking & { settle(answer: Answer): void }) | null = null, conceding = false, picks = 0;
	const pick = (frame: Frame, option: string, by?: "person"): Answer => ({ kind: "pick", option, actionId: `${name}-${frame.version}-${++picks}`, ...(by ? { by } : {}) });
	const settle = (answer: Answer) => { const now = asking; asking = null; shown(null); now?.settle(answer); };

	const player: Player = {
		name,
		async answer(frame) {
			if (conceding) return { kind: "concede", by: "person" };
			const options = frame.decision?.options ?? [];
			if (mode === "auto" && autopilot) return autopilot.answer(frame);
			let suggestion: Asking["suggestion"];
			if (mode === "suggest" && autopilot) {
				const proposed = await autopilot.answer(frame);
				if (proposed.kind !== "pick") return proposed;
				suggestion = proposed;
			}
			if (options.length === 1 && !frame.refused?.length) return suggestion ?? pick(frame, options[0]!.id, "person");
			// A newer ask replaces one the table withdrew; the person answers what is asked now.
			return new Promise<Answer>((resolve) => { asking = { frame, ...(suggestion ? { suggestion } : {}), settle: resolve }; shown(asking); });
		},
		observe(frame) { autopilot?.observe(frame); },
		reset() { asking = null; shown(null); autopilot?.reset?.(); },
		async close() { asking = null; await autopilot?.close(); },
	};

	return {
		player,
		mode: () => mode,
		asking: () => asking,
		/** Answer with a listed option by its number, from 1. */
		choose(number: number): string | null {
			const options = asking?.frame.decision?.options ?? [];
			const option = options[number - 1];
			if (!asking) return "Nothing is being asked of this seat.";
			if (!option) return `Choose 1 to ${options.length}.`;
			settle(pick(asking.frame, option.id, "person"));
			return null;
		},
		/** Take the autopilot's choice. */
		accept(): string | null {
			if (!asking) return "Nothing is being asked of this seat.";
			if (!asking.suggestion) return "The autopilot has no choice here; answer with a number.";
			settle(asking.suggestion);
			return null;
		},
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
