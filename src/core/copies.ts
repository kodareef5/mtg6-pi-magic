/** A copy effect freezes copiable base terms (707.2), never the layer walk's
 * current power, counters, damage or temporary granted abilities. A token's
 * creation specification is its base, so a later copy keeps these same terms. */
import { printedTraits } from "./characteristics.ts";
import { facts } from "./printed.ts";
import { activeFaces, doubleFaced } from "./faces.ts";
import type { Table } from "./table.ts";
import type { Seen } from "./selectors.ts";
import type { Procedure, Selector, TokenSpec } from "./language.ts";

/** Entry copying currently inspects only these public source zones. */
export const entryCopySelector = (selector: Selector): boolean =>
	(selector.zones ?? []).every(zone => ["battlefield", "graveyard"].includes(zone)) &&
	[...selector.any ?? [], ...selector.all ?? []].every(entryCopySelector);

/** Unsupported copy shapes leave resolution pending, without creating a partial token. */
export function tokenCopy(table: Table, source: Seen, except?: { power: number; toughness: number }): { spec: TokenSpec } | { blocked: string } {
	return copyExceptions(copiable(table, source, "token"), except);
}

/** Fixed exceptions become copiable values (707.9b, 707.9d), not later effects. */
export function copyExceptions(copied: { spec: TokenSpec } | { blocked: string }, except?: Pick<TokenSpec, "power" | "toughness"> & { name?: string }): { spec: TokenSpec } | { blocked: string } {
	if (!except || "blocked" in copied) return copied;
	// 707.9d omits characteristic-defining abilities for replaced values. Our
	// registrations do not yet distinguish those from other base-setting abilities.
	if ((except.power !== undefined || except.toughness !== undefined) && copied.spec.registers?.some(one => one.kind === "continuous" && one.change.base))
		return { blocked: "A power/toughness copy exception needs characteristic-defining abilities distinguished from other base-setting abilities." };
	return { spec: { ...copied.spec, ...except } };
}

/** A single-faced permanent copies the current face; creating a double-faced
 * token also needs the other face and remains a separate unsupported shape. */
export function copiable(table: Table, source: Seen, form: "token" | "permanent"): { spec: TokenSpec } | { blocked: string } {
	if (source.zone !== "battlefield" && !(form === "permanent" && source.zone === "graveyard" && source.card))
		return { blocked: "This copy operation needs a permanent, its last battlefield existence, or a public graveyard card for an entry copy." };
	if (source.faceDown) return { spec: { name: "", types: ["creature"], colors: [], power: 2, toughness: 2 } };
	if (source.copied) return form === "token" && source.card && doubleFaced(table.printed[source.card])
		? { blocked: "Copying a double-faced permanent into a token needs both physical faces, including any copy effects." }
		: { spec: structuredClone(source.copied.spec) };
	if (source.token) return { spec: structuredClone(source.token) };
	const printed = source.card && table.printed[source.card];
	if (!printed) return { blocked: "The copy source has no pinned printed characteristics." };
	if (printed.faces && (form === "token" || !doubleFaced(printed) && printed.layout !== "adventure"))
		return { blocked: "Copying a permanent with multiple faces needs its copiable face structure and entry behavior." };
	const active = activeFaces(printed, source);
	const pack = table.work[source.zone === "graveyard" ? source.owner : source.controller]?.packages?.find(one => one.card === source.card);
	if (printed.text && !pack) return { blocked: `Copying ${source.card} needs its source-backed use inventory.` };
	const own = structuredClone(source.zone === "graveyard" ? pack?.registers ?? [] : source.registrations ?? []).filter(one => !printed.faces || one.face === undefined || active.includes(one.face));
	if (printed.faces) for (const one of own) delete one.face;
	const onField = (one: Pick<Procedure, "timing" | "source" | "face">) => one.timing === "stack" && (one.source.zones ?? ["battlefield"]).includes("battlefield") &&
		(!printed.faces || (one.source.face ?? one.face) === undefined || active.includes((one.source.face ?? one.face)!));
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
