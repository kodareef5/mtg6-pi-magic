/**
 * A seat answered by a decision model.
 *
 * Three jobs, three calls, in this order: the intent prepares, the packet
 * focuses, the model picks an id. See AGENTS.md in this directory for why they
 * stay apart.
 *
 * This seat is deliberately incapable of most of what a seat may do. It picks
 * from the list and nothing else: it cannot declare a motion, cannot delegate
 * and cannot object, because none of those have handlers yet. A person or a
 * remote agent at the same seat can do all of them. That asymmetry is this
 * file's limit, not the table's.
 */

import type { Answer, Player } from "../core/player.ts";
import type { Frame } from "../core/types.ts";
import type { Intent } from "../core/intent.ts";
import { asState, chose, type DecisionApi, type Question } from "./model.ts";
import { focus, type Chronicle, type Packet } from "./packet.ts";

export type AiSeatOptions = {
	name: string;
	api: DecisionApi;
	/** This seat's plan. Held by the core, filled by whoever holds the seat. */
	intent: Intent;
	/**
	 * The brief and the recaps, by reference so the recaps stay current. Absent
	 * is a seat playing with no plan, which still plays.
	 */
	chronicle?: Chronicle;
	/** Recorded on the table when an answer comes back unusable. */
	onGap(note: string): void;
	/**
	 * Called once per request, before it is made.
	 *
	 * Before, not after. A request that failed is a request that was made, and
	 * counting on the way back reported an attempted call as no call at all.
	 */
	onAsk?(packet: Packet): void;
};

/** One question per decision, so the key is fixed and the answer is unambiguous. */
const KEY = "pick";

/**
 * The packet as a choice question.
 *
 * Equal detail per option. A brilliant line described richly beside a waste of
 * resources described in three words manufactures a preference without any
 * analysis, so every criterion is built the same way from the same fields.
 *
 * The instructions say what is true and what has to be settled. They do not say
 * what is good: advice here would make every seat play the same way and would
 * hide the alternatives the packet just spent its space listing.
 */
export function question(packet: Packet): Question {
	const lines = [
		packet.obligation,
		"",
		...packet.known,
		...(packet.resources.length ? ["", ...packet.resources] : []),
		...(packet.lately.length ? ["", "Recently:", ...packet.lately] : []),
		// The plan, then the priorities it serves, then what is only assumed.
		// Guidance before priorities because a snippet written for this window
		// is more specific than a deck-level ordering, and more specific wins.
		...(packet.guidance.length ? ["", "The plan for this seat here:", ...packet.guidance] : []),
		...(packet.priorities.length ? ["", "This seat's priorities, in order:", ...packet.priorities] : []),
		...(packet.assumed.length ? ["", "Assumed, not known:", ...packet.assumed] : []),
		...(packet.refused?.length ? ["", "An earlier answer was not taken:", ...packet.refused] : []),
		"",
		"Answer with one of the listed ids. The options are every move the table",
		"built and checked, and nothing outside the list can be played here. The plan",
		"above was written before this board existed: where it does not fit what you",
		"can see, the listed option that fits is the better answer.",
	];
	return {
		type: "choice",
		instructions: lines.join("\n"),
		criteria: Object.fromEntries(
			packet.options.map((option) => [
				option.id,
				[option.label, option.shows, option.consequence].filter(Boolean).join(". "),
			]),
		),
	};
}

export function aiSeat(options: AiSeatOptions): Player {
	let latest: Frame | undefined;
	let asked = 0;

	return {
		name: options.name,

		async answer(frame) {
			if (!frame.decision) throw new Error(`${options.name} was asked a frame with no decision`);
			latest = frame;

			// Planning is unwritten, so the intent arrives whole and is used as
			// given. A phase change alone is not a reason for a model call.
			const seated = options.chronicle;
			const packet = focus(frame, options.intent, {
				...(seated?.briefs[frame.seat] ? { brief: seated.briefs[frame.seat] } : {}),
				...(seated ? { recaps: seated.recaps } : {}),
			});
			asked += 1;
			options.onAsk?.(packet);
			const answers = await options.api.ask({
				state: asState(packet),
				questions: { [KEY]: question(packet) },
			});

			const answer = chose(answers, KEY);
			if (typeof answer === "string") {
				// Returned to the loop unchanged. It owns the retry and the
				// fallback accounting, and replacing this with the first option
				// would lose the difference between a choice and a fallback.
				options.onGap(`${options.name} via ${options.api.named}: ${answer}`);
				return { kind: "pick", option: "", actionId: `${options.name}-${asked}` };
			}

			return { kind: "pick", option: answer.choice, actionId: `${options.name}-${asked}` } satisfies Answer;
		},

		// Watching is free and reacting is not, so nothing is asked here. The
		// frame is kept because the next intent check reads what changed.
		observe(frame) {
			latest = frame;
		},

		close() {
			latest = undefined;
			void latest;
		},
	};
}
