/** Check an accepted card assessment's coverage. This does not interpret its rules. */
import type { Package } from "./language.ts";
import { checkProcedure } from "./procedures.ts";
import { isLand, permanentSpell, quotes, type Printed } from "./printed.ts";
import { castableFace, faceFacts } from "./faces.ts";

/** Ignore typography and reminder text when comparing the model's quoted source. */
const plain = (text: string) => text.replace(/\([^)]*\)/g, " ").replace(/^\s*•\s*/gm, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/** Every source paragraph must have accepted terms; matching a quote does not prove those terms correct. */
export function assessmentProblems(printed: Printed, pack: Package): string[] {
	const problems: string[] = [];
	const claims = [...pack.registers, ...(pack.procedures ?? []), ...(pack.deferred ?? [])];
	const shared = new Set([...(pack.printedCast ? [0] : []), ...(pack.printedFaces ?? [])]);
	for (const face of shared) if (!castableFace(printed, face) || !permanentSpell(faceFacts(printed, face)))
		problems.push(`${pack.card} face ${face} cannot use the shared printed cast: it needs a castable targetless permanent and a fixed mana cost.`);
	for (const face of printed.faces ? [0, 1] : [0]) {
		if ((castableFace(printed, face) || printed.layout === "prepare" && face === 1) && !isLand(faceFacts(printed, face)) && !shared.has(face) &&
			![...(pack.procedures ?? []), ...(pack.deferred ?? [])].some((one) => one.timing === "spell" && (one.face ?? 0) === face))
			problems.push(`${pack.card} face ${face} has no prepared casting procedure or identified cast to prepare.`);
	}
	for (const claim of claims) {
		if (printed.faces && claim.face === undefined) problems.push(`Each claim on ${pack.card} must name its printed face (0 or 1).`);
		if (!quotes(faceFacts(printed, claim.face), claim.basis)) problems.push(`The basis ${JSON.stringify(claim.basis)} is not on ${pack.card}${printed.faces ? ` face ${claim.face}` : ""} as complete sentences or printed lines in source order.`);
	}
	// An empty normal cast merely pays the printed cost. Quoting the whole card
	// there cannot stand in for assessing its abilities.
	const effects = (pack.procedures ?? []).filter((one) => one.instructions.length || one.words?.length || one.cost || one.if || one.limit || one.speed === "instant");
	for (const face of printed.faces ? [0, 1] : [0]) {
		const covered = [...pack.registers, ...effects, ...(pack.deferred ?? [])].filter((claim) => (claim.face ?? 0) === face).map((claim) => plain(claim.basis));
		for (const paragraph of faceFacts(printed, face)!.oracle.split("\n").map(plain).filter(Boolean))
			if (!covered.some((basis) => basis.includes(paragraph))) problems.push(`Unassessed text on ${pack.card}${printed.faces ? ` face ${face}` : ""}: ${paragraph}`);
	}
	for (const procedure of pack.procedures ?? []) {
		if (procedure.source.card !== pack.card || procedure.source.refs?.length || procedure.source.ids?.length) problems.push(`A prepared procedure for ${pack.card} names that card, without game object ids.`);
		try { checkProcedure(procedure); } catch (error) { problems.push(String(error)); }
	}
	for (const use of pack.deferred ?? []) {
		if (use.source.card !== pack.card || use.source.refs?.length || use.source.ids?.length || !use.source.zones?.length || !use.source.controller)
			problems.push(`Deferred use ${use.claim} must name ${pack.card}, its source zones and controller, without game object ids.`);
	}
	for (const use of [...(pack.procedures ?? []), ...(pack.deferred ?? [])]) if (printed.faces && use.timing === "stack" &&
		(use.source.zones ?? ["battlefield"]).includes("battlefield") && use.source.face !== use.face)
		problems.push(`${use.claim} must require its active face with source.face equal to face.`);
	return problems;
}
