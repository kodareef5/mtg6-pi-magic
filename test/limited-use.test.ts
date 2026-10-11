/** A resolution use is a chosen event, not a count of triggers that waited or fizzled. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { usedThisTurn } from "../src/core/triggers.ts";
import { check, RegistrationSchema } from "../src/core/language.ts";
import { establish, finish, main, pack, passBoth, step } from "./play.ts";

const jennifer = "Jennifer Walters // The Sensational She-Hulk";
const ref = (one: { id: string; incarnation: number }) => ({ id: one.id, incarnation: one.incarnation });

test("optional once-per-turn effects count acceptance, retain unused triggers and survive replay and new incarnations", () => {
	const registration = pack(jennifer)[0]!;
	const missing = JSON.parse(JSON.stringify({ ...registration, may: undefined }));
	assert.throws(() => check(RegistrationSchema, missing, "limited effect"));
	for (const decline of [true, false]) {
		const table = start(standard, [{ name: "Bant", deck: deck("Bant Airbending Combo") }, { name: "Red", deck: deck("Mono-Red Aggro") }], `limited-use-${decline}`);
		const hulk = establish(table, 0, jennifer), appa = establish(table, 0, "Appa, Steadfast Guardian", []);
		const first = establish(table, 1, "Hired Claw", []), second = establish(table, 1, "Emberheart Challenger", []);
		commit(table, [{ do: "transform", what: hulk.id }], "game-setup");
		main(table, 0);
		commit(table, [{ do: "damage", source: first.id, target: ref(appa), amount: 1 }, { do: "damage", source: second.id, target: ref(appa), amount: 2 },
			{ do: "damage", source: first.id, target: ref(hulk), amount: 1 }], "resolve");
		assert.equal(table.waiting.length, 2, "one trigger per damaged creature, not per source");
		assert.deepEqual(table.waiting.map((one) => one.event.amount).sort(), [1, 3]);
		const source = ref(hulk), basis = registration.basis;
		const prefix = structuredClone(table), from = table.ledger.length;
		const put = (target: string) => {
			const decision = nextDecision(table)!;
			assert.equal(decision.situation, "trigger-order");
			assert.ok(decision.options.every((one) => one.shows?.includes("Damage in this event:")), "Jev sees each trigger's amount before choosing its order");
			apply(table, decision.options.find((one) => one.id.endsWith(`:t0=${target}`))!.id, "model", "chosen");
		};
		put("seat-1"); put("seat-1");
		passBoth(table);
		assert.ok(nextDecision(table)!.options.some((one) => one.label === "Use it"));
		assert.ok(nextDecision(table)!.question.includes("Damage in the triggering event:"));
		const untouched = structuredClone(table); nextDecision(table); assert.deepEqual(table, untouched);
		step(table, (label) => label.startsWith(decline ? "Decline" : "Use it"));
		assert.equal(usedThisTurn(table, source, basis, 0), !decline);
		finish(table);
		const cloned = structuredClone(table), afterChoice = table.ledger.length;
		passBoth(table);
		if (decline) { step(table, (label) => label === "Use it"); finish(table); }
		else { assert.ok(nextDecision(table)!.options[0]!.label.includes("already used")); finish(table); }
		assert.ok(usedThisTurn(table, source, basis, 0));
		assert.deepEqual(relive(cloned, table.ledger.slice(afterChoice)), table);
		assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
		commit(table, [{ do: "damage", source: first.id, target: ref(hulk), amount: 1 }], "resolve");
		assert.equal(table.waiting.length, 0, "later events stop triggering after the effect is used");
		main(table, 1, 2);
		assert.equal(usedThisTurn(table, source, basis, 0), false, "a new turn supplies a new use");
		commit(table, [{ do: "damage", source: first.id, target: ref(hulk), amount: 1 }], "resolve");
		assert.equal(table.waiting.length, 1);
		put(`${first.id}@${first.incarnation}`);
		if (decline) commit(table, [{ do: "move", what: first.id, to: "graveyard", reason: "destroy" }], "destroy");
		else commit(table, [{ do: "note", note: { kind: "label", on: ref(first), by: 1, until: "end-of-turn", text: "Hexproof", change: { words: ["hexproof"] } } }], "resolve");
		passBoth(table);
		if (!decline) step(table, (label) => label.startsWith("Apply target restrictions"));
		finish(table);
		assert.equal(usedThisTurn(table, source, basis, 0), false, "losing every target spends nothing");
		commit(table, [{ do: "damage", source: second.id, target: ref(hulk), amount: 1 }], "resolve");
		put("seat-1"); passBoth(table);
		step(table, (label) => label === "Use it"); finish(table);
		commit(table, [{ do: "move", what: hulk.id, to: "exile", reason: "exile" }, { do: "move", what: hulk.id, to: "battlefield", reason: "resolve", face: 1, registers: pack(jennifer) }], "resolve");
		assert.ok(usedThisTurn(table, source, basis, 0), "the old incarnation's use remains in the journal");
		assert.equal(usedThisTurn(table, ref(hulk), basis, 0), false);
		commit(table, [{ do: "damage", source: second.id, target: ref(hulk), amount: 1 }], "resolve");
		assert.equal(table.waiting.length, 1, "the new incarnation has its own use");
	}
});
