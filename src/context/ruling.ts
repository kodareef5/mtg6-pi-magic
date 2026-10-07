/**
 * A ruling, in one reasoner session.
 *
 * The case and the record are core, in `src/core/judge.ts`, and the remedy is
 * the loop's: `play` rolls the game back when the ruling says so. This file is
 * the judge's call: the objection, what the contested action did in public
 * words, the cards it involved, and the rules on disk to look up, so a ruling
 * cites rather than asserts.
 *
 * The judge decides. Nobody is asked to agree, and a ruling that cites no rule
 * on disk is refused back to the judge rather than recorded.
 */

import { declarationEvidence, type Case, type Ruling } from "../core/judge.ts";
import type { Rules } from "../core/rules.ts";
import type { Table } from "../core/table.ts";
import type { Universe } from "../core/cards.ts";
import { describe, project } from "../core/view.ts";
import { lookups } from "./brief.ts";
import type { Reasoner, Submission } from "./reason.ts";

const SYSTEM = [
	"You are the judge at a game of Magic: The Gathering. One seat objects to another seat's action. You are given the objection,",
	"what the action did, the text of the cards involved, and the public table now. For a combat declaration, declarationTime reconstructs the public position before it. Its characteristics and effects are accepted interpretations, not certified card meaning. Judge that declaration against its own time, not the table now. Look rules up with the rule tool.",
	"",
	"Decide three things. Was the action legal under the Comprehensive Rules and the cards' text. Which rule decides it, by number.",
	"What happens now:",
	"- rollback: the action was illegal, and the game goes back to just before it. The seat that took it plans again.",
	"- stand: the action was legal; or it was illegal but so many decisions have followed that going back would undo more than the mistake.",
	"",
	"You see public events only and cannot know a seat's reasons. A poor play is not an illegal one. Rule on what happened, not on what would have been better.",
	"Answer by calling submit once.",
].join("\n");

const VERDICT: Omit<Submission, "check"> = {
	name: "submit",
	description: "Submit your ruling. Call it once; if it reports problems, fix them and call it again.",
	parameters: { type: "object", additionalProperties: false, required: ["legal", "rule", "remedy", "because"], properties: {
		legal: { type: "boolean" },
		rule: { type: "string", description: "The deciding rule's number, such as 702.9b." },
		remedy: { type: "string", enum: ["rollback", "stand"] },
		because: { type: "string", description: "One or two sentences: what the rule says and how the action meets or breaks it." },
	} },
};

/** Rule on one objection. Throws when the judge gives no usable ruling; the loop records that as a gap and play goes on. */
export async function rule(table: Table, open: Case, judge: Pick<Reasoner, "work">, sources: { rules: Rules; universe: Universe }): Promise<Ruling> {
	const row = table.ledger[open.row];
	if (!row) throw new Error(`There is no action ${open.row} to rule on.`);
	const seat = (id: number) => table.seats.find((one) => one.id === id)?.name ?? `seat ${id}`;
	const receipts = table.log.filter((receipt) => receipt.at === open.row + 1);
	// The cards the action touched that anyone could see, and the source of what it announced.
	const named = new Set<string>([...(row.activation ? [table.things.get(row.activation.source.id)?.card] : []),
		...receipts.flatMap((receipt) => [...Object.values(receipt.before), ...Object.values(receipt.after)].filter((thing) => !thing.faceDown && thing.zone !== "hand" && thing.zone !== "library").map((thing) => thing.card))]
		.filter((name): name is string => !!name));
	let declaration: ReturnType<typeof declarationEvidence>;
	try { declaration = declarationEvidence(table, open.row, sources.universe); }
	catch (error) { throw new Error(`Declaration evidence reconstruction failed: ${String(error)}`); }
	for (const object of declaration?.objects ?? []) if (object.card && !object.faceDown) named.add(object.card);
	const cited = open.rule ? sources.rules.byRef.get(open.rule) : undefined;
	const user = JSON.stringify({
		objection: { by: seat(open.raisedBy), claim: open.claim, ...(open.rule ? { cites: cited ? `${cited.ref}  ${cited.text}` : `${open.rule} (not found in the rules on disk)` } : {}) },
		action: { by: seat(row.seat), number: open.row, decisionsSince: table.ledger.length - open.row - 1, picked: row.picked,
			...(row.activation ? { announced: row.activation.claim, basis: row.activation.basis } : {}),
			...(declaration ? { declarationTime: declaration } : { happened: receipts.map((receipt) => describe(table, receipt)).filter(Boolean) }) },
		cards: [...named].flatMap((name) => { const card = sources.universe.cards.get(name); return card ? [`${card.name}  ${card.mana}  ${card.type}  ${card.stats}\n${card.oracle}`] : []; }),
		table: project(table, "spectator").table,
	});
	const check = (args: Record<string, unknown>): string | null => {
		const found: string[] = [];
		const number = String(args.rule ?? "").trim();
		if (!sources.rules.byRef.has(number)) found.push(`rule ${JSON.stringify(number)} is not an entry in the Comprehensive Rules; look it up and cite its number`);
		if (args.legal === true && args.remedy !== "stand") found.push("a legal action stands: remedy is stand");
		if (!String(args.because ?? "").trim()) found.push("because says what the rule says and how the action meets or breaks it");
		return found.length ? `${found.join("; ")}.` : null;
	};
	const answer = await judge.work("ruling", { system: SYSTEM, user, task: "Rule on this objection now: call submit with your ruling." },
		{ submit: { ...VERDICT, check }, lookups: lookups(sources.universe, sources.rules), turns: 4 });
	return { legal: answer.legal as boolean, rule: String(answer.rule).trim(), remedy: answer.remedy as Ruling["remedy"], because: String(answer.because) };
}
