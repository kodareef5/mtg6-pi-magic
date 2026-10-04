/**
 * Which model answers which part of a game.
 *
 * Inference is Pi's job and stays Pi's job. Pi already holds the providers, the
 * credentials and the model catalogue, which is most of why this is a Pi package
 * rather than a program with a config file. So a role here is a Pi model
 * pattern and nothing else: the same string a person types at `/model`, an id
 * with an optional thinking level after a colon. No endpoint, no key and no
 * provider name is written anywhere in this repo.
 *
 * Five parts, because they want different models. A pregame plan is read once
 * and shapes a whole game, so it is worth a slow model. A turn decision happens
 * hundreds of times. The pick itself is a classifier and is not a chat model at
 * all. Keeping them apart is what lets a cheap model run the turns while an
 * expensive one sets the plan, and it is also how two models play each other:
 * give seat 0 and seat 1 different rosters and the ledger says who chose what.
 *
 * Past 150 lines because a reader asking "which model answers the judge" wants
 * the role list, how a pattern resolves and where the answer is written down in
 * one place. Splitting them would mean three files to change one default.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { AnyModel, Api, ClassifierApi, ClassifierModel, Model } from "@earendil-works/pi-ai";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";

export type Role = "decide" | "pregame" | "strategy" | "judge" | "summary";

export const ROLES: Record<
	Role,
	{
		/** What this model is asked for, in the terms the prompt will use. */
		does: string;
		/** A classifier returns one of our ids. A chat model writes prose we then read. */
		kind: "classifier" | "chat";
		/** A seat's own, or the table's. A ruling belongs to the table, a plan to a seat. */
		whose: "seat" | "table";
		/** The suggested pattern. Every one of these is a suggestion and nothing more. */
		suggested: string;
		/** Why this one. A reader overruling a default should know what it was for. */
		why: string;
		/** The step up, and what it buys. */
		instead?: string;
	}
> = {
	// Jev answers a choice question with one of the ids we supplied and a
	// probability over all of them, which is why a model cannot invent a move
	// here even in principle. Its job is to execute a plan somebody else made
	// and to notice when the board does not match it.
	decide: {
		does: "pick one of the options the table listed",
		kind: "classifier",
		whose: "seat",
		suggested: "typesafe/jev-latest",
		why:
			"A classifier, not a chat model. It answers with one of our ids and a distribution " +
			"over them, so it cannot write a move, and it is called once per asked decision, " +
			"which is the most frequent call in the game. It executes; it does not strategise.",
	},
	pregame: {
		does: "read the deck and write the snippets a later decision reads",
		kind: "chat",
		whose: "seat",
		suggested: "gpt-6-luna:low",
		why:
			"Luna while the game is being built: testing wants cheap and fast. A game that " +
			"plays well on luna plays better on a stronger model. Four analysts per seat at " +
			"once, then one synthesis, once per game; the deepest thinking a seat gets.",
		instead: "gpt-6.1-sol:low or gpt-6-astra:low, slower and stronger. Benchmark it before paying for it",
	},
	strategy: {
		does: "write each seat's plan: at the opening, at each of its turns, and when the plan stops fitting",
		kind: "chat",
		whose: "seat",
		suggested: "gpt-6-luna:low",
		why:
			"Plans each turn and answers escalations, and the game waits for it. Luna while the " +
			"game is being built: a sol call took 50 to 95 seconds a turn. A game that plays well " +
			"on luna plays better on a stronger model.",
		instead: "gpt-6.1-sol:low or gpt-6-astra:low, when prepared plans measure better for the extra time",
	},
	judge: {
		does: "rule on an objection, citing the rules on disk",
		kind: "chat",
		whose: "table",
		suggested: "gpt-6-luna:low",
		why:
			"Rare: only an objection reaches it. Luna while the game is being built; a wrong " +
			"ruling changes a game, so it is the first role to move to a stronger model. The " +
			"decision model narrows the rules first, so this reads a few rules rather than " +
			"three thousand.",
	},
	summary: {
		does: "say what happened this turn in two sentences, as the commentator",
		kind: "chat",
		whose: "seat",
		suggested: "gpt-6-luna:low",
		why:
			"Called every turn and read by every seat, so it is the one place to be strict " +
			"about cost. The job is small and bounded: summarise public events in two or three " +
			"sentences. A cheaper model on low thinking does it, and the output ceiling in " +
			"spend.ts keeps the bill where the prompt says it should be.",
	},
};

/** One pattern per role. Partial anywhere: a missing role takes its suggestion. */
export type Roster = Partial<Record<Role, string>>;

export const suggested: Roster = Object.fromEntries(
	Object.entries(ROLES).map(([role, about]) => [role, about.suggested]),
);

/** A role, the pattern asked for, and what Pi's catalogue made of it. */
export type Cast = {
	role: Role;
	pattern: string;
	model?: AnyModel;
	thinkingLevel?: ThinkingLevel;
	/** Why the pattern did not resolve. The game says so rather than substituting. */
	problem?: string;
	/**
	 * Asked for by name and switched off. Not the same as unresolved: a role that
	 * is off was a decision, and nothing records a gap for it.
	 *
	 * Measured on a game of basic lands, the recaps are 107 calls and about four
	 * cents, so this is not a cost rescue. It is for a bulk run where nobody
	 * reads the lines, and for pricing a role against playing without it:
	 * `summary: "off"` against `summary: "gpt-6-luna:low"` is the experiment.
	 */
	off?: boolean;
};

/** What Pi hands us. Available means its provider has working credentials. */
export type Catalogue = {
	chat: readonly Model<Api>[];
	classifiers: readonly ClassifierModel<ClassifierApi>[];
};

const LEVELS = new Set<string>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/**
 * Resolve one pattern against one list.
 *
 * Pi's own order, because a pattern a person reads should mean the same thing
 * here as at `/model`: try the whole string as an id first, since a real id can
 * contain a colon, and only then read a trailing thinking level off it.
 *
 * A bare id matching two providers is refused rather than guessed. Resolving
 * against available models usually settles it, and when it does not, the answer
 * is to say provider/id.
 */
function look(pattern: string, models: readonly AnyModel[]): Omit<Cast, "role" | "pattern"> {
	const canonical = models.find((m) => `${m.provider}/${m.id}` === pattern);
	if (canonical) return { model: canonical };

	const bare = models.filter((m) => m.id === pattern);
	if (bare.length === 1) return { model: bare[0]! };
	if (bare.length > 1) {
		return { problem: `${pattern} is in ${bare.map((m) => `${m.provider}/${m.id}`).join(", ")}. Name one.` };
	}

	const at = pattern.lastIndexOf(":");
	const level = at > 0 ? pattern.slice(at + 1) : "";
	if (LEVELS.has(level)) {
		const found = look(pattern.slice(0, at), models);
		return found.model ? { ...found, thinkingLevel: level as ThinkingLevel } : found;
	}

	const partial = models.filter((m) => m.id.includes(pattern) || m.name.includes(pattern));
	if (partial.length === 1) return { model: partial[0]! };
	if (partial.length > 1) {
		return { problem: `${pattern} matches ${partial.map((m) => `${m.provider}/${m.id}`).join(", ")}. Name one.` };
	}
	return { problem: `No available model matches ${pattern}.` };
}

/** Resolve every role. A problem on one role is reported, never substituted. */
export function cast(roster: Roster, catalogue: Catalogue): Cast[] {
	return (Object.keys(ROLES) as Role[]).map((role) => {
		const pattern = roster[role] ?? ROLES[role].suggested;
		if (pattern === "off") return { role, pattern, off: true };
		const models = ROLES[role].kind === "classifier" ? catalogue.classifiers : catalogue.chat;
		return { role, pattern, ...look(pattern, models) };
	});
}

/** The roster as lines, which is what `/magic models` prints. */
export const readRoster = (parts: Cast[]): string[] =>
	parts.map((part) => {
		const got = part.off
			? "off"
			: part.model
				? `${part.model.provider}/${part.model.id}${part.thinkingLevel ? ` thinking ${part.thinkingLevel}` : ""}`
				: (part.problem ?? "unresolved");
		return `${part.role.padEnd(9)} ${part.pattern.padEnd(22)} ${got}   ${ROLES[part.role].does}`;
	});

/**
 * Why each default is what it is.
 *
 * Recorded so a reader changing one knows what it was chosen for. A default
 * nobody can argue with is a default nobody can improve.
 */
export const readWhy = (): string[] =>
	(Object.keys(ROLES) as Role[]).flatMap((role) => [
		`${role}  ${ROLES[role].suggested}`,
		`  ${ROLES[role].does}.`,
		`  ${ROLES[role].why}`,
		...(ROLES[role].instead ? [`  Instead: ${ROLES[role].instead}`] : []),
		"",
	]);

/**
 * The whole arrangement for one game.
 *
 * `every` is the roster each seat starts from and the home of the table's own
 * roles. `seats` overrides one seat, which is the shape that matters: two seats
 * with different rosters is a model playing another model, and that is what the
 * bulk runs are for.
 */
export type Crew = {
	every?: Roster;
	/** By seat id as a string, because this is read from and written to JSON. */
	seats?: Record<string, Roster>;
};

/** The roster for one seat, or for the table when no seat is named. */
export const rosterFor = (crew: Crew, seat?: number): Roster => ({
	...suggested,
	...crew.every,
	...(seat === undefined ? {} : crew.seats?.[String(seat)]),
});

/**
 * Where the arrangement is written down.
 *
 * A small JSON file, so changing which model judges is an edit with an editor
 * and no command at all. `/magic models` reads and writes the same file, and a
 * game may still override it per run without touching it.
 */
export function load(path: string): Crew {
	if (!existsSync(path)) return {};
	const read = JSON.parse(readFileSync(path, "utf8")) as unknown;
	if (!read || typeof read !== "object") throw new Error(`${path} is not a roster object`);
	const crew = read as Crew;
	for (const [where, roster] of [["every", crew.every] as const, ...Object.entries(crew.seats ?? {})]) {
		for (const role of Object.keys(roster ?? {})) {
			if (!(role in ROLES)) {
				throw new Error(`${path} names a role ${role} under ${where}. The roles are ${Object.keys(ROLES).join(", ")}.`);
			}
		}
	}
	return crew;
}

export function save(path: string, crew: Crew): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(crew, null, 2)}\n`);
}

/** Set one role, for one seat or for every seat. Returns the arrangement to save. */
export function assign(crew: Crew, role: Role, pattern: string, seat?: number): Crew {
	if (seat === undefined) return { ...crew, every: { ...crew.every, [role]: pattern } };
	return {
		...crew,
		seats: { ...crew.seats, [String(seat)]: { ...crew.seats?.[String(seat)], [role]: pattern } },
	};
}
