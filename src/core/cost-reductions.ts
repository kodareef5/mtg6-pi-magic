/** Standing generic spell reductions, read when a total cost is locked (601.2f).
 * The source keeps its own controller and conditions; the proposed spell carries
 * its casting controller, chosen face and X. No cost or discount is stored.
 */
import { holds, matches, type World } from "./selectors.ts";
import type { SeenObject } from "./work.ts";
import type { Zone } from "./syntax.ts";

const terms = (world: World) => world.objects.filter((source) => source.zone === "battlefield").flatMap((source) =>
	(world.read(source)?.registrations ?? []).flatMap((term) => term.kind === "cost" ? [{ source, term }] : []));

/** An upper bound for enumerating X. Conditions and spell filters can only lower it. */
export const maximumSpellReduction = (world: World): number => terms(world).reduce((sum, { term }) => sum + term.reduce, 0);

/** `from` is where the card was before announcement; selectors read the spell on the stack. */
export function spellReduction(world: World, spell: SeenObject, from: Zone): number {
	return terms(world).reduce((sum, { source, term }) => {
		const scope = { world, source, controller: source.controller };
		return (!term.from || term.from.includes(from)) && (!term.if || holds(scope, term.if)) &&
			matches(scope, spell, { zones: ["stack"], ...term.cast }, spell.traits)
			? sum + term.reduce : sum;
	}, 0);
}
