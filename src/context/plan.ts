/**
 * Filling a seat's intent from a model.
 *
 * The records themselves are core, in src/core/intent.ts, because a person at a
 * seat wants a turn objective and a phase review too. This file is the model
 * call that writes them, and the mechanical check that says whether the last
 * one still holds. design-ref/CIRCUIT-EXPERIMENTS.md section 11.
 *
 * This walks alongside the game. It does not drive it. src/core/loop.ts is the
 * only loop, and if anything here starts advancing a phase, stop.
 */

import type { Intent } from "../core/intent.ts";
import type { Frame } from "../core/types.ts";

/**
 * Prepare the next phase that has a real choice in it.
 *
 * A complete phase review asks seven questions: which of my permanents are
 * engines, resources, attackers, blockers, expendable or protected; what among
 * the opponent's threatens the engine or blocks profitably; which active effects
 * alter cost, targets, characteristics or timing; which draws would change the
 * line; what order of my own plays changes later mana, targets or triggers;
 * which opposing responses can reasonably matter given public mana; and what
 * must stay available for later.
 *
 * One source can hold several roles at once. The same Elf is a mana source, an
 * attacker, a blocker, and part of another card's live count. Questions that
 * assign each role separately cannot resolve that tradeoff, so the review is
 * one call and not four.
 */
export function preparePhase(frame: Frame, previous?: Intent): Intent {
	/*
	 * 1. An unchanged plan whose assumptions still hold is returned as is. No
	 *    fresh call at every phase boundary, and no invented choice in a phase
	 *    that only has bookkeeping in it.
	 * 2. Otherwise prepare two or three alternatives for this phase, each with
	 *    its order of operations, what it leaves available later, and its
	 *    tradeoff. Other legal lines stay reachable.
	 * 3. Annotate an immediate win or an immediate loss if one is visible. A
	 *    preference to preserve an engine is a preference, not a constraint that
	 *    excludes a winning trade.
	 * 4. Record what would reopen it: a key permanent leaving, a new visible
	 *    win or loss, a reserved resource becoming unavailable, or a branch that
	 *    no longer fits.
	 */
	void [frame, previous];
	throw new Error("preparePhase is unwritten. Four steps above.");
}

/**
 * Does this intent still apply?
 *
 * Checked mechanically before it is trusted. A missing target, a changed object
 * incarnation or an unpayable selected line invalidates a prepared branch with
 * no model call at all. What is left after those checks is the judgment a
 * decision model is for.
 */
export function stillValid(intent: Intent, frame: Frame): boolean {
	void [intent, frame];
	throw new Error("stillValid is unwritten: mechanical checks only, no model call.");
}
