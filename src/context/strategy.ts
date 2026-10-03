/**
 * Designing the context for one phase.
 *
 * The per-turn calls are mostly this. A classifier executes well and does not
 * strategise, so the thinking happens here and what reaches the decision is a
 * short plan plus the facts. Handing the classifier everything known about the
 * game and hoping for a good answer is the failure mode this file exists to
 * avoid: it is smart, and it is not going to work out a line.
 *
 * What a seat gets is therefore layered, cheapest first:
 *
 *   the brief      written once before the game, injected by window
 *   the recaps     two or three public sentences about recent turns
 *   this file      a plan for the phase about to happen, when one is worth it
 *   the packet     the facts and the options, built by the core
 *
 * A phase plan is worth a call when the phase has a choice that can lose the
 * game. Most phases of most turns do not, which is why `worthPlanning` is
 * mechanical and runs before any money is spent.
 *
 * The classifier is asked to execute and to notice. Its routes out, in
 * `packet.ts`, are how it says the board does not match the plan, which is the
 * one thing it must be able to do that executing cannot cover.
 */

import type { Intent } from "../core/intent.ts";
import type { Table } from "../core/table.ts";
import { nextDecision } from "../core/decisions.ts";
import { STEPS } from "../core/steps.ts";
import type { Frame } from "../core/types.ts";
import type { Brief } from "./brief.ts";
import type { Reasoner } from "./reason.ts";
import type { Recap } from "./summary.ts";

/**
 * Is this phase worth a plan?
 *
 * Mechanical and free. A phase with no priority window, or one whose only
 * pending decision has a single option, is a phase the table will walk through
 * without asking anybody, and a plan for it is a plan nobody reads.
 *
 * This is the lever that decides the cost of a game. At milestone one almost
 * every phase fails it, which is correct: a deck of lands has one decision a
 * turn and it does not need a paragraph.
 */
export function worthPlanning(table: Table): boolean {
	const step = table.cursor.steps[0];
	if (!step || table.outcome || !STEPS[step].priority) return false;
	const decision = nextDecision(table);
	return !!decision && decision.options.length > 1;
}

const SYSTEM = [
	"You are planning one phase for one seat of a game of Magic: The Gathering.",
	"",
	"Write the order of operations for this phase, what it keeps available for",
	"later, and what on the board would mean doing something else. Short. The seat",
	"reads it next to a list of legal moves and has to act in seconds.",
	"",
	"What your answer does not promise. The board can change before the plan is",
	"used, an opponent holds cards you cannot see, and a move you do not mention",
	"stays legal. A plan is a prior. Name the one thing that would make you abandon",
	"it rather than hedging every line.",
	"",
	"No preamble, no headings. Prose, three or four lines.",
].join("\n");

/**
 * Plan the phase about to happen.
 *
 * Unwritten past the prompt, because what makes a phase plan worth its tokens
 * is the structured alternatives in `plan.preparePhase`, and those need cards
 * with abilities to be alternatives at all. Until then `worthPlanning` is false
 * on nearly every phase of a land game and this is not reached.
 *
 * The steps, when it is written:
 *
 * 1. Return the previous intent unchanged when its phase matches and its
 *    recorded assumptions still hold mechanically, with no call at all. A phase
 *    boundary is not a reason to spend money.
 * 2. Ask one question with the brief's snippet for this window, the recaps, and
 *    the projected board. Not the log and not another seat's anything.
 * 3. Read two or three alternatives out of the answer, each with its order and
 *    what it reserves, and record what would reopen the choice. Other legal
 *    lines stay reachable: the plan ranks, it does not restrict.
 * 4. Write it to the seat's `Intent.phase` with the turn and phase stamped, so
 *    `focus` can refuse to apply it to a phase it was not written for.
 */
export async function planPhase(
	frame: Frame,
	context: { brief?: Brief; recaps?: readonly Recap[]; previous?: Intent },
	reasoner: Reasoner,
): Promise<Intent> {
	void [frame, context, reasoner, SYSTEM];
	throw new Error("planPhase is unwritten. Four steps above, and step 1 is the one that saves money.");
}
