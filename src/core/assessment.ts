/** Check an accepted card assessment's coverage. This does not interpret its rules. */
import type { Package } from "./language.ts";
import { checkProcedure } from "./procedures.ts";
import { isLand, permanentSpell, quotes, type Printed } from "./printed.ts";

/** Ignore typography and reminder text when comparing the model's quoted source. */
const plain = (text: string) => text.replace(/\([^)]*\)/g, " ").replace(/^\s*•\s*/gm, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** Every source paragraph must have accepted terms; matching a quote does not prove those terms correct. */
export function assessmentProblems(printed: Printed, pack: Package): string[] {
	const problems: string[] = [];
	const claims = [...pack.registers, ...(pack.procedures ?? [])];
	if (pack.printedCast && !permanentSpell(printed)) problems.push(`${pack.card} cannot use the shared printed cast: it needs a targetless permanent and a fixed mana cost.`);
	if (!isLand(printed) && !pack.printedCast && !pack.procedures?.some((one) => one.timing === "spell")) problems.push(`${pack.card} has no prepared casting procedure.`);
	for (const claim of claims) if (!quotes(printed, claim.basis)) problems.push(`The basis ${JSON.stringify(claim.basis)} is not on ${pack.card}.`);
	// An empty normal cast merely pays the printed cost. Quoting the whole card
	// there cannot stand in for assessing its abilities.
	const effects = (pack.procedures ?? []).filter((one) => one.instructions.length || one.words?.length || one.cost || one.if || one.limit);
	const covered = [...pack.registers, ...effects].map((claim) => plain(claim.basis));
	for (const paragraph of printed.oracle.split("\n").map(plain).filter(Boolean))
		if (!covered.some((basis) => basis.includes(paragraph))) problems.push(`Unassessed text on ${pack.card}: ${paragraph}`);
	for (const procedure of pack.procedures ?? []) {
		if (procedure.source.card !== pack.card || procedure.source.refs?.length) problems.push(`A prepared procedure for ${pack.card} names that card, without game object ids.`);
		try { checkProcedure(procedure); } catch (error) { problems.push(String(error)); }
	}
	return problems;
}
