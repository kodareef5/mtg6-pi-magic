/**
 * What a viewer cannot identify never reaches it by id.
 *
 * A card's object id is its owner and its place in that deck's registered
 * list, and the lists are public: the id of a face-down permanent, or of a card
 * in a library or another seat's hand, would name the card. Everything a seat
 * or an audience receives goes through here. Each such id becomes an alias the
 * viewer cannot reverse, keyed by the game's secret seed, the same alias every
 * time; and the objects it cannot identify come after the rest, in alias
 * order, so their place says nothing about the list either. An answer comes
 * back through here, each alias replaced by the id it stands for.
 *
 * The engine itself reads real ids: only what crosses to a viewer is aliased.
 */

import { createHmac } from "node:crypto";
import type { Table } from "./table.ts";
import type { Viewer } from "./types.ts";
import { sight } from "./view.ts";

/** A card's id, as text: owner, then place in the registered list. Tokens, abilities and mana have other ids, which name nothing hidden. */
const CARD = /(?<![\w-])\d+-\d+(?![\w-])/g;
const ALIAS = /(?<![\w-])hidden-[0-9a-f]{12}(?![\w-])/g;

/** Every string in a value, keys included, rewritten; anything else copied as it is. */
function rewrite<T>(value: T, text: (one: string) => string): T {
	if (typeof value === "string") return text(value) as T;
	if (Array.isArray(value)) return value.map((one) => rewrite(one, text)) as T;
	if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, one]) => [text(key), rewrite(one, text)])) as T;
	return value;
}

export type Lens = ReturnType<typeof perspective>;

export function perspective(table: Table, viewer: Viewer) {
	const { knows } = sight(table, viewer);
	const alias = (id: string) => `hidden-${createHmac("sha256", table.rng.seed).update(`${viewer}:${id}`).digest("hex").slice(0, 12)}`;
	const hidden = new Map<string, string>();
	for (const thing of table.things.values()) if (!knows(thing)) hidden.set(thing.id, alias(thing.id));
	const real = new Map([...hidden].map(([id, one]) => [one, id]));
	const unknown = (id: string) => id.startsWith("hidden-");
	return {
		/** A frame or view as this viewer may hold it. */
		hide<T>(value: T): T {
			const seen = rewrite(value, (text) => text.replace(CARD, (id) => hidden.get(id) ?? id)) as T & { view?: { objects?: { id: string }[] }; objects?: { id: string }[] };
			const objects = seen.view?.objects ?? seen.objects;
			if (objects) {
				const known = objects.filter((one) => !unknown(one.id)), rest = objects.filter((one) => unknown(one.id)).sort((a, b) => a.id.localeCompare(b.id));
				objects.splice(0, objects.length, ...known, ...rest);
			}
			return seen;
		},
		/** An answer from this viewer, as the table reads it. */
		reveal<T>(value: T): T {
			return rewrite(value, (text) => text.replace(ALIAS, (one) => real.get(one) ?? one));
		},
	};
}
