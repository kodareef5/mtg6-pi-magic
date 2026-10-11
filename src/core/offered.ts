/** The ledger retains small menus verbatim and fingerprints large ordered menus.
 * The selected action and accepted terms remain in the row in either form. */
import { createHash } from "node:crypto";

export type Offered = string[] | { count: number; sha256: string; planned?: true };

/** Hash the canonical JSON array incrementally, including order and boundaries. */
export function fingerprint(ids: readonly string[]): Exclude<Offered, string[]> {
	const hash = createHash("sha256").update("[");
	ids.forEach((id, at) => { if (at) hash.update(","); hash.update(JSON.stringify(id)); });
	return { count: ids.length, sha256: hash.update("]").digest("hex") };
}

export const offered = (ids: string[], planned = false): Offered => ids.length > 1024
	? { ...fingerprint(ids), ...(planned ? { planned: true as const } : {}) } : ids;

/** Only old combat menus may omit subsequently added declaration withdrawals. */
export function sameMenu(recorded: Offered, actual: readonly string[], combat = false): boolean {
	if (!Array.isArray(recorded)) {
		if (recorded.count !== actual.length) return false;
		return fingerprint(actual).sha256 === recorded.sha256;
	}
	if (recorded.length > actual.length || recorded.some((id, at) => id !== actual[at])) return false;
	return recorded.length === actual.length || combat && recorded.some((id) => id === "attack:done" || id === "block:done") &&
		actual.slice(recorded.length).every((id) => id.startsWith("unattack:") || id.startsWith("unblock:"));
}
