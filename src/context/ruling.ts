/**
 * A ruling, in two calls.
 *
 * The case and the record are core, in `src/core/judge.ts`, because a person at
 * a seat wants a judge too and the Comprehensive Rules are on disk so a ruling
 * can cite rather than assert. This file is the two model calls that produce
 * one.
 *
 * Two calls because the jobs are different sizes. Finding which of 3166 rules
 * bear on a case is a selection, and a classifier does selection cheaply over a
 * shortlist. Deciding whether a move was legal and why is reasoning, and it
 * wants the rule text in front of it and nothing else.
 *
 *   1. search the rules mechanically for candidates, free
 *   2. the classifier scores each candidate for relevance, cheap
 *   3. the reasoner rules on the case against the few that survive, and says
 *      which rule it rests on and what the remedy is
 *
 * The remedy is the part that is not written and not guessable. A ruling that a
 * move was illegal has to be carried out, and the ways to carry it out are
 * rollback, reject and leave it standing with a note. Rollback in a live game
 * needs every remaining seat to agree, which is in `docs/STATE.md` and in
 * `journal.rollback`, and that function is unwritten. So this stops at the
 * verdict rather than inventing a repair.
 *
 * After a ruling the phase plan is stale by construction: it was written for a
 * board that the ruling just changed. `strategy.planWork` is requested, and that
 * is a consequence of a ruling rather than a step in it.
 */

import type { Case, Ruling } from "../core/judge.ts";
import type { Rules } from "../core/rules.ts";
import type { Table } from "../core/table.ts";
import type { DecisionApi } from "./model.ts";
import type { Reasoner } from "./reason.ts";

/** How many candidate rules reach the classifier, and how many reach the reasoner. */
export const CANDIDATES = 12;
export const CITED = 3;

const SYSTEM = [
	"You are the judge at a game of Magic: The Gathering. You are given one",
	"objection, the public record of what happened, and the rules another model",
	"picked out as the relevant ones.",
	"",
	"Answer three things and nothing else. Was the action legal, yes or no. Which",
	"rule decides it, by number. What should happen now.",
	"",
	"What your answer does not promise. You were given a shortlist of rules and the",
	"deciding rule may not be in it, so say when the shortlist looks wrong instead",
	"of ruling from the closest match. You see public events only and cannot know a",
	"seat's reason for acting. You do not carry the remedy out; you name it.",
].join("\n");

/**
 * Rule on one case.
 *
 * Unwritten past the pipeline above, because step 3's remedy has nowhere to go
 * until rollback exists, and a judge that decides without a remedy is a judge
 * whose rulings do not change a game.
 *
 * The steps:
 *
 * 1. `rules.search` for candidates from the claim and the receipt's reasons.
 *    Mechanical, free, and the shortlist is recorded on the case so a reader
 *    can see what the judge was shown.
 * 2. One classifier request, one score question per candidate, asked together:
 *    does this rule decide this case. Keep the top few.
 * 3. One reasoner call with those rules, the claim, and the public events.
 *    Yes or no, the rule number, the remedy in a sentence.
 * 4. Record the ruling against the case with the rules it cited, whether they
 *    were the shortlist's best and whether the judge said the shortlist was
 *    wrong. A ruling that cites nothing is a gap, not a ruling.
 * 5. Hand the remedy back. Do not apply it here: a rollback needs the other
 *    seats to agree and this file does not hold that conversation.
 */
export async function rule(
	table: Table,
	open: Case,
	rules: Rules,
	models: { decide: DecisionApi; judge: Reasoner },
): Promise<Ruling> {
	void [table, open, rules, models, SYSTEM, CANDIDATES, CITED];
	throw new Error("rule is unwritten. Five steps above, and step 5 is why it stops at the verdict.");
}
