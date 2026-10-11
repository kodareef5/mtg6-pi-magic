/** A copy effect freezes copiable base terms (707.2), never the layer walk's
 * current power, counters, damage or temporary granted abilities. A token's
 * creation specification is its base, so a later copy keeps these same terms. */
import { printedTraits } from "./characteristics.ts";
import { facts } from "./printed.ts";
import type { Table } from "./table.ts";
import type { Seen } from "./selectors.ts";
import type { Procedure, TokenSpec } from "./language.ts";

/** Unsupported copy shapes leave resolution pending, without creating a partial token. */
export function tokenCopy(table: Table, source: Seen): { spec: TokenSpec } | { blocked: string } {
	if (source.faceDown) return { blocked: "Copying a face-down permanent needs its face-down copiable characteristics." };
	if (source.zone !== "battlefield") return { blocked: "This copy operation needs a permanent or its last battlefield existence." };
	if (source.token) return { spec: structuredClone(source.token) };
	const printed = source.card && table.printed[source.card];
	if (!printed) return { blocked: "The copy source has no pinned printed characteristics." };
	if (printed.faces) return { blocked: "Copying a permanent with multiple faces needs its copiable face structure and entry behavior." };
	const own = structuredClone(source.registrations ?? []);
	const pack = table.work[source.controller]?.packages?.find(one => one.card === source.card);
	if (printed.text && !pack) return { blocked: `Copying ${source.card} needs its source-backed use inventory.` };
	const onField = (one: Pick<Procedure, "timing" | "source">) => one.timing === "stack" && (one.source.zones ?? ["battlefield"]).includes("battlefield");
	if (pack?.deferred?.some(onField)) return { blocked: `Copying ${source.card} needs its identified battlefield activations prepared first.` };
	// Accepted uses are an ability's terms; cast procedures and later grants are not copied.
	const carried = new Set(own.filter(one => one.kind === "activated").map(one => one.basis));
	for (const use of pack?.procedures?.filter(onField) ?? []) {
		if (carried.has(use.basis)) continue;
		own.push({ kind: "activated", basis: use.basis, cost: structuredClone(use.cost ?? {}),
			effect: { ...(use.targets ? { targets: structuredClone(use.targets) } : {}), instructions: structuredClone(use.instructions) },
			...(use.speed === "sorcery" ? { speed: "sorcery" as const } : {}), ...(use.if ? { if: structuredClone(use.if) } : {}), ...(use.limit ? { limit: use.limit } : {}) });
	}
	const base = facts(table, source)!;
	const traits = printedTraits(base, source.card!, own), loyalty = base.stats.match(/^L(\d+)$/);
	return { spec: { name: traits.name, ...(base.mana ? { mana: base.mana } : {}), types: traits.types as TokenSpec["types"],
		supertypes: traits.supertypes as NonNullable<TokenSpec["supertypes"]>, subtypes: traits.subtypes, colors: traits.colors as TokenSpec["colors"],
		...(traits.power !== undefined ? { power: traits.power, toughness: traits.toughness } : {}),
		...(loyalty ? { loyalty: Number(loyalty[1]) } : {}), registers: own } };
}
