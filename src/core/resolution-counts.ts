/** Count completed uses of one source-backed ability, never its announcements. */
import type { Scope } from "./selectors.ts";

/** Only programs requesting this amount add completion receipts. Earlier
 * journals therefore retain their original events and choice identities. */
export function countsResolutions(value: unknown): boolean {
	if (!value || typeof value !== "object") return false;
	if (!Array.isArray(value) && Object.keys(value).length === 1 && "resolution" in value && value.resolution === true) return true;
	return Object.values(value).some(countsResolutions);
}

/** The current resolution counts as one throughout its program. Its completion
 * enters history only after its last instruction (608.2n-p). */
export function resolutionNumber(scope: Scope): number {
	const current = scope.resolving;
	if (!current) return 0;
	return 1 + scope.world.history.filter((event) => event.kind === "resolved" &&
		event.source?.id === current.source.id && event.source.incarnation === current.source.incarnation && event.basis === current.basis).length;
}
