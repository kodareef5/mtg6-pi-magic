/**
 * The dialer: the ways out of a decision that only change what a seat knows.
 *
 * A route is not a move. Following one puts rules in front of the seat and
 * touches nothing else: no card moves, no cost is paid, and the table's
 * revision does not advance, so the seat answers the same decision afterwards.
 *
 * Answering a route costs no model call. The rules are on disk in rules/cr.tsv,
 * and a route names the rules it cites, so following one is a file read. What
 * costs money is the seat deciding to follow it, which is one classifier call
 * like any other pick.
 *
 * Citations rather than a search, and that is a measured choice. `rules.search`
 * ranks a glossary entry ahead of a rule, so searching "priority" returns the
 * entry that says "see rule 117" instead of rule 117, and "play a land"
 * returns Card Pool and Fortify. A curated citation is checkable: `rule`
 * throws on a ref that does not resolve and a test walks every ref here.
 */

import { rule, term, type Rules } from "../core/rules.ts";
import type { Decision } from "../core/types.ts";

export type Route = {
	/**
	 * Prefixed `rules:`. No option id uses that prefix, so a route and a move
	 * cannot collide and a seat answering a route id can never move the table
	 * by accident.
	 */
	id: string;
	/** What following it shows, in the terms the menu uses. */
	does: string;
	/** What it cites. A number is a rule, a word is a glossary term. */
	cites: string[];
};

type Topic = Route & { when(decision: Decision): boolean };

/** Does this decision offer a move with that id, or one in that family? */
const offers = (decision: Decision, prefix: string): boolean =>
	decision.options.some((option) => option.id === prefix || option.id.startsWith(`${prefix}:`));

/**
 * What a seat can ask about, and when asking is on the menu.
 *
 * Keyed on the decision's situation and on the moves actually offered, because
 * both are already in front of the seat. A topic nobody can act on is not
 * advertised: there is no route about combat while no option is a combat move.
 */
const TOPICS: Topic[] = [
	{
		id: "rules:priority",
		does: "what acting and passing do here, and when this step ends",
		cites: ["117.1", "117.3a", "117.4", "500.2"],
		when: (decision) => decision.situation === "priority",
	},
	{
		id: "rules:land",
		does: "when a land may be played, and the one a turn limit",
		cites: ["305.1", "305.2", "505.6b"],
		when: (decision) => offers(decision, "land"),
	},
	{
		id: "rules:mulligan",
		does: "how a mulligan works and what each one costs",
		cites: ["103.5", "103.5b", "Mulligan"],
		when: (decision) => decision.situation === "pregame",
	},
	{
		id: "rules:hand-size",
		does: "discarding down to maximum hand size at cleanup",
		cites: ["514.1", "Maximum Hand Size"],
		when: (decision) => offers(decision, "discard"),
	},
	{
		id: "rules:empty-library",
		does: "what drawing is, and what happens on an empty library",
		cites: ["121.1", "704.5b"],
		when: (decision) => offers(decision, "draw"),
	},
];

/**
 * Which routes this decision offers. Mechanical and free, so it runs before any
 * money is spent, and it returns nothing when the rules were not loaded:
 * advertising a route cannot make it answerable.
 */
export function dial(decision: Decision, rules?: Rules): Route[] {
	if (!rules) return [];
	return TOPICS.filter((topic) => topic.when(decision)).map(({ when, ...route }) => route);
}

/** Every topic, so a test can check that each one cites something real. */
export const topics = (): Route[] => TOPICS.map(({ when, ...route }) => route);

/**
 * The lines a route puts in front of the seat.
 *
 * A ref that does not resolve becomes a line saying so rather than a thrown
 * error. `rule` throws by design, which is right for a citation in a ruling and
 * wrong in the middle of a game: the seat still has a decision to answer. A
 * test walks every ref in this file, so a bad one is caught before a game.
 */
export function follow(route: Route, rules: Rules): string[] {
	return route.cites.map((cite) => {
		if (/^\d/.test(cite)) {
			try {
				return `${cite}: ${rule(rules, cite).text}`;
			} catch {
				return `${cite}: not in ${rules.path}.`;
			}
		}
		const found = term(rules, cite);
		return found ? `${cite}: ${found.text}` : `${cite}: not a glossary term in ${rules.path}.`;
	});
}
