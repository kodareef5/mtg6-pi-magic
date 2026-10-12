/** A hold can name the cards its reserve pays for. Spending the reserve on one of them is the
 * planned use; any other spend is still marked as breaking it. Nothing is removed either way. */
import test from "node:test";
import assert from "node:assert/strict";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { main, place } from "./play.ts";

/** Green on its third turn with two Forests and Llanowar Elves, casting in recorded stages. */
function position(reservedFor?: string[]) {
	const table = start(standard, [{ name: "Green", deck: deck("Mono-Green Landfall") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "holds", undefined, { announcementsFrom: 0 });
	main(table, 0, 3);
	place(table, 0, "battlefield", "Forest", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	const [kept] = cardsIn(table, "battlefield", 0).filter((one) => one.card === "Forest");
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps: [],
		holds: [{ objects: { refs: [{ id: kept!.id, incarnation: kept!.incarnation }] }, purpose: "Keep a Forest for the reserved card", ...(reservedFor ? { for: reservedFor } : {}) }] } }], "plan");
	return { table, kept: kept! };
}

/** Choose the Elves cast, then the only forward choice at each stage, until the mana step. */
function toPayment(table: Table) {
	const begin = nextDecision(table)!.options.find((one) => one.announcement?.procedure.source.card === "Llanowar Elves")!;
	apply(table, begin.id, "model", "chosen");
	for (let guard = 0; guard < 6; guard++) {
		const options = nextDecision(table)!.options;
		if (options.some((one) => one.id.startsWith("announce:payment:"))) return;
		const forward = options.filter((one) => !["announce:back", "announce:cancel"].includes(one.id));
		assert.equal(forward.length, 1, `one forward choice before payment: ${forward.map((one) => one.id).join(", ")}`);
		apply(table, forward[0]!.id, "model", "chosen");
	}
	assert.fail("never reached the mana step");
}

const notes = (table: Table, prefix: string) => annotate(nextDecision(table)!.options, planState(workFrame(table, 0))!)
	.filter((one) => one.id.startsWith(prefix)).map((one) => (one.notes ?? []).join(" "));

test("spending a reserve on the card it is held for is the planned use, not a warning", () => {
	const { table, kept } = position(["Llanowar Elves"]);
	toPayment(table);
	const complete = notes(table, "announce:payment:");
	assert.ok(complete.some((text) => text.includes(`Uses Forest (${kept.id}@${kept.incarnation}) from the reserve the plan holds for Llanowar Elves`)), complete.join("\n"));
	assert.ok(complete.every((text) => !text.includes("which the plan holds for")), "no payment warns against the reserve's own use");
	apply(table, "announce:individual", "model", "chosen");
	const individual = notes(table, "announce:pay:");
	assert.ok(individual.some((text) => text.includes("from the reserve the plan holds for Llanowar Elves")), "source-by-source selection reads the pending use too");
	assert.ok(individual.every((text) => !text.includes("which the plan holds for")));
});

test("a reserve held for another card, or for nothing named, still warns when the Elves spend it", () => {
	for (const reservedFor of [["Snakeskin Veil"], undefined]) {
		const { table, kept } = position(reservedFor);
		toPayment(table);
		const complete = notes(table, "announce:payment:");
		assert.ok(complete.some((text) => text.includes(`Spends Forest (${kept.id}@${kept.incarnation}), which the plan holds for: Keep a Forest for the reserved card.`)), complete.join("\n"));
		assert.ok(complete.every((text) => !text.includes("from the reserve")));
		assert.ok(complete.length >= 2, "every payment stays offered");
	}
});
