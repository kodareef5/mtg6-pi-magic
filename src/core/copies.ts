/** A copy effect freezes copiable base terms (707.2), never the layer walk's
 * current power, counters, damage or temporary granted abilities. A token's
 * creation specification is its base, so a later copy keeps these same terms. */
import { creatureType, printedTraits } from "./characteristics.ts";
import { facts } from "./printed.ts";
import { activeFaces, doubleFaced } from "./faces.ts";
import type { Table, Ability } from "./table.ts";
import type { Seen } from "./selectors.ts";
import type { Instruction, Procedure, Selector, TokenSpec } from "./language.ts";
import type { Decision, SeatId } from "./types.ts";

type Exceptions = Extract<Instruction, { do: "token" }>["except"];
type CopyResult = { spec: TokenSpec } | { blocked: string; preparation?: { seat: SeatId; needed: NonNullable<Decision["preparation"]> } };

/** Entry copying currently inspects only these public source zones. */
export const entryCopySelector = (selector: Selector): boolean =>
	(selector.zones ?? []).every(zone => ["battlefield", "graveyard"].includes(zone)) &&
	[...selector.any ?? [], ...selector.all ?? []].every(entryCopySelector);

/** Unsupported copy shapes leave resolution pending, without creating a partial token. */
export function tokenCopy(table: Table, source: Seen, except?: Exceptions): CopyResult {
	return copyExceptions(copiable(table, source, "token"), except);
}

/** Fixed exceptions become copiable values (707.9b, 707.9d), not later effects. */
export function copyExceptions(copied: CopyResult, except?: Exceptions): CopyResult {
	if (!except || "blocked" in copied) return copied;
	// 707.9d omits characteristic-defining abilities for replaced values. Our
	// registrations do not yet distinguish those from other base-setting abilities.
	if ((except.power !== undefined || except.toughness !== undefined) && copied.spec.registers?.some(one => one.kind === "continuous" && one.change.base))
		return { blocked: "A power/toughness copy exception needs characteristic-defining abilities distinguished from other base-setting abilities." };
	if (copied.spec.registers?.some(one => one.kind === "continuous" && (except.colors && one.change.colors || except.creatureTypes && one.change.subtypes)))
		return { blocked: "A color or creature-type copy exception needs characteristic-defining abilities distinguished from other abilities changing those values." };
	const { creatureTypes, ...fixed } = except;
	if (creatureTypes?.some(type => !creatureType(type))) return { blocked: "A copy exception names an unknown creature type." };
	const spec = { ...copied.spec, ...structuredClone(fixed) };
	if (creatureTypes && spec.types.some(type => type === "creature" || type === "kindred"))
		spec.subtypes = [...(spec.subtypes ?? []).filter(type => !creatureType(type)), ...creatureTypes];
	return { spec };
}

/** A single-faced permanent copies the current face; creating a double-faced
 * token also needs the other face and remains a separate unsupported shape. */
export function copiable(table: Table, source: Seen, form: "token" | "permanent" | "spell"): CopyResult {
	const publicCard = !!source.card && ["graveyard", "exile"].includes(source.zone) && !source.faceDown && !source.token && !source.copy;
	const spell = form === "spell" && source.zone === "stack" && source.ability?.timing === "spell" && !source.faceDown;
	if (source.zone !== "battlefield" && !publicCard && !spell)
		return { blocked: "This copy operation needs a permanent, its last battlefield existence, or a face-up graveyard or exiled card." };
	if (source.faceDown) return { spec: { name: "", types: ["creature"], colors: [], power: 2, toughness: 2 } };
	if (source.copied) return form === "token" && source.card && doubleFaced(table.printed[source.card])
		? { blocked: "Copying a double-faced permanent into a token needs both physical faces, including any copy effects." }
		: { spec: structuredClone(source.copied.spec) };
	if (source.token) return { spec: structuredClone(source.token) };
	const printed = source.card && table.printed[source.card];
	if (!printed) return { blocked: "The copy source has no pinned printed characteristics." };
	if (printed.faces && (form !== "permanent" || !doubleFaced(printed) && printed.layout !== "adventure"))
		return { blocked: "Copying a permanent with multiple faces needs its copiable face structure and entry behavior." };
	const active = activeFaces(printed, source);
	const seat = publicCard ? source.owner : source.controller;
	const pack = table.work[seat]?.packages?.find(one => one.card === source.card);
	if (printed.text && !pack) return { blocked: `Copying ${source.card} needs its source-backed use inventory.` };
	const own = structuredClone(publicCard || spell ? pack?.registers ?? [] : source.registrations ?? []).filter(one => !printed.faces || one.face === undefined || active.includes(one.face));
	if (printed.faces) for (const one of own) delete one.face;
	const onField = (one: Pick<Procedure, "timing" | "source" | "face">) => one.timing === "stack" && (one.source.zones ?? ["battlefield"]).includes("battlefield") &&
		(!printed.faces || (one.source.face ?? one.face) === undefined || active.includes((one.source.face ?? one.face)!));
	const uses = pack?.deferred?.filter(onField) ?? [];
	if (uses.length) return { blocked: `Copying ${source.card} needs its identified battlefield activations prepared first.`,
		preparation: { seat, needed: [{ card: source.card!, uses: structuredClone(uses) }] } };
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

/** Copying a spell preserves targets, modes, X and cost choices (707.10).
 * No new target permission is implied. A non-targeted departed spell can
 * supply its last stack existence, as a cast trigger requires. */
export function copySpell(table: Table, source: Seen): CopyResult & { ability?: Ability } {
	if (source.zone !== "stack" || source.ability?.timing !== "spell" || source.faceDown)
		return { blocked: "Copying a spell needs its face-up stack existence and accepted instructions." };
	if (source.ability.words?.length)
		return { blocked: "Copying a spell with procedure or granted spell words needs their separate copiable provenance." };
	const result = copiable(table, source, "spell");
	if ("blocked" in result) return result;
	const ability = structuredClone(source.ability);
	delete ability.permission; delete ability.leavesStack; delete ability.funding;
	ability.paid = [];
	return { ...result, ability };
}
