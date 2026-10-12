/** A tap symbol checks the source's sickness; tapping chosen permanents does not (302.6). */
import type { Cost } from "./language.ts";
import { matches, type Scope, type Seen } from "./selectors.ts";
import { subsets } from "./subsets.ts";

type Selection = Exclude<Cost["tap"], boolean | undefined>;
export const tapsSource = (cost?: Pick<Cost, "tap">): boolean => cost?.tap === true || typeof cost?.tap === "object" && !!cost.tap.source;

/** Chosen costs use distinct, controlled, untapped battlefield objects. A source
 * paying its own tap symbol cannot also pay the chosen tap in the same cost. */
export function tapChoices(scope: Scope, choice: Selection): Seen[][] {
	const able = scope.world.objects.filter(one => one.zone === "battlefield" && one.controller === scope.controller && !one.tapped &&
		(!choice.source || one.id !== scope.source?.id) && matches(scope, one, choice.choose)).sort((a, b) => a.id.localeCompare(b.id));
	const enough = (chosen: Seen[]) => (choice.count === undefined || chosen.length >= choice.count) &&
		(choice.totalPower === undefined || chosen.reduce((sum, one) => sum + (scope.world.read(one)?.power ?? 0), 0) >= choice.totalPower);
	return choice.upTo || choice.totalPower === undefined ? subsets(able, choice.count ?? 1, choice.upTo ? 0 : choice.count ?? 1) : subsets(able, able.length, 1)
		.filter(set => enough(set) && set.every((_, at) => !enough(set.filter((__, other) => other !== at))));
}
