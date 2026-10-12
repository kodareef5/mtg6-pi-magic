/** Standing generic reductions, read for casting or plotting when the price is locked.
 * The source keeps its own controller and conditions; the proposed spell carries
 * its casting controller, chosen face and X. No cost or discount is stored.
 */
import { holds, matches, type World } from "./selectors.ts";
import type { SeenObject } from "./work.ts";
import type { Zone } from "./syntax.ts";

const terms = (world: World) => world.objects.filter((source) => source.zone === "battlefield").flatMap((source) =>
	(world.read(source)?.registrations ?? []).flatMap((term) => term.kind === "cost" ? [{ source, term }] : []));

/** An upper bound for enumerating X. Conditions and spell filters can only lower it. */
export const maximumSpellReduction = (world: World): number => terms(world).reduce((sum, { term }) => sum + (term.action === "plot" ? 0 : term.reduce), 0);

/** Casting reads a proposed stack spell; plotting reads the card still in hand.
 * `from` remains the original zone, independent of the selector. */
export function genericReduction(world: World, spell: SeenObject, from: Zone, action: "cast" | "plot" = "cast"): number {
	return terms(world).reduce((sum, { source, term }) => {
		const scope = { world, source, controller: source.controller };
		return (term.action ?? "cast") === action && (!term.from || term.from.includes(from)) && (!term.if || holds(scope, term.if)) &&
			matches(scope, spell, { zones: [action === "cast" ? "stack" : "hand"], ...term.cast }, spell.traits)
			? sum + term.reduce : sum;
	}, 0);
}
