/** Tokens carry complete abilities; loyalty timing belongs to the incarnation, not one procedure. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { activationChanges, checkProcedure, printedCast } from "../src/core/procedures.ts";
import { activatedUses, loyaltyUsed } from "../src/core/activated.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { actions } from "../src/context/plan-edit.ts";
import { announce, example, finish, main, offered, passBoth, place, step } from "./play.ts";

test("Empower creates a complete token, waits for the loyalty counter, and shares one activation allowance across abilities", () => {
	for (const existing of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Selesnya Landfall")) }], `loyalty-${existing}`);
		const counter = example("Cast Countersculpt, paying the additional mana, then empower Jace");
		const creation = counter.instructions.find((one) => one.do === "token")!;
		if (creation.do !== "token") assert.fail("Expected the Empower token");
		main(table, 1); place(table, 1, "hand", "Llanowar Elves"); place(table, 0, "hand", "Countersculpt");
		commit(table, [{ do: "add-mana", who: 1, colors: ["G"] }, { do: "add-mana", who: 0, colors: ["C", "U", "U"] },
			...(existing ? [{ do: "token" as const, id: "existing-jace", controller: 0, spec: { ...creation.spec, loyalty: 3 } }] : [])], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, printedCast("Llanowar Elves", table.printed["Llanowar Elves"]!)); apply(table, "pass", "model", "chosen");
		announce(table, counter); passBoth(table); step(table); // Counter the spell.
		if (!existing) step(table); // Create at zero; the next instruction chooses it before a checkpoint.
		const token = cardsIn(table, "battlefield").find((one) => one.token?.name === "Jace")!;
		assert.equal(token.counters.loyalty ?? 0, existing ? 3 : 0);
		assert.equal(nextDecision(table)!.situation, "resolution", "state checks wait through Empower's choice and counter");
		const middle = structuredClone(table), at = table.ledger.length;
		step(table); finish(table);
		assert.equal(token.counters.loyalty, existing ? 4 : 1);
		assert.equal(cardsIn(table, "battlefield").filter((one) => one.token?.name === "Jace").length, 1);
		assert.equal(activatedUses(workFrame(table, 0)).length, 2);
		assert.ok(Object.keys(actions(workFrame(table, 0))).some((key) => key.startsWith(`ability:${token.id}`)));
		assert.ok(!nextDecision(table)!.options.some((one) => one.id.startsWith(`ability:${token.id}`)), "no loyalty activation on the other seat's turn");
		main(table, 0, 3);
		const uses = activatedUses(workFrame(table, 0)), minusOne = uses.find((one) => one.procedure.cost?.loyalty === -1)!;
		const minusThree = uses.find((one) => one.procedure.cost?.loyalty === -3)!;
		assert.equal(offered(table, minusThree.procedure).length > 0, existing, "negative loyalty needs enough counters");
		const legal = offered(table, minusOne.procedure)[0]!; assert.ok(legal);
		const lost = structuredClone(table);
		commit(lost, [{ do: "note", note: { kind: "label", on: token, by: 0, until: "end-of-turn", text: "Lose abilities", change: { loseAbilities: true } } }], "resolve");
		assert.equal(activatedUses(workFrame(lost, 0)).length, 0);
		assert.equal(offered(lost, minusOne.procedure).length, 0, "a reused procedure still requires its registration");
		assert.throws(() => activationChanges(lost, legal.activation), /no longer has.*registered/);
		apply(table, nextDecision(table)!.options.find((one) => one.id.startsWith(minusOne.key + ":"))!.id, "model", "chosen");
		assert.ok(loyaltyUsed(tableWorld(table), token));
		finish(table); // A token paid down to zero ceases before its ability resolves.
		assert.equal(table.things.has(token.id), existing);
		passBoth(table); step(table); // Surveil look.
		step(table, (label) => label.startsWith("Decline")); finish(table);
		assert.equal(offered(table, minusOne.procedure).length, 0);
		assert.equal(offered(table, minusThree.procedure).length, 0, "another ability cannot spend the same turn allowance");
		assert.deepEqual(relive(middle, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		if (existing) { main(table, 0, 5); assert.ok(offered(table, minusThree.procedure).length, "the next turn restores the allowance"); }
	}
});

test("printed starting loyalty, zero costs and state-based removal use current types and replayable history", () => {
	const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Selesnya Landfall")) }], "printed-loyalty");
	main(table, 0); const [jace] = place(table, 0, "battlefield", "The Theorist, Jace Beleren");
	assert.equal(jace!.counters.loyalty, 3, "L3 supplies the printed starting loyalty without an entry claim");
	const zero = { source: { zones: ["battlefield"] as const, refs: [{ id: jace!.id, incarnation: jace!.incarnation }] }, claim: "Zero loyalty timing fixture",
		basis: "A zero loyalty symbol still activates a loyalty ability (606.3).", timing: "stack" as const, cost: { loyalty: 0 }, instructions: [] };
	// This position tests the zero-symbol timing contract, not an interpretation of Jace's printed abilities.
	const use = checkProcedure(zero), initial = structuredClone(table), at = table.ledger.length;
	const chosen = announce(table, use); assert.equal(chosen.activation.cost.loyalty, 0); assert.equal(jace!.counters.loyalty, 3);
	passBoth(table); finish(table);
	assert.equal(offered(table, use).length, 0); assert.throws(() => activationChanges(table, chosen.activation), /earlier loyalty activation/);
	assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	assert.throws(() => checkProcedure({ ...use, timing: "mana" }), /loyalty-symbol cost/);
	assert.throws(() => checkProcedure({ ...use, cost: { loyalty: -2, counters: { kind: "loyalty", count: 2 } } }), /Combine all loyalty/);
	commit(table, [{ do: "note", note: { kind: "label", on: jace!, by: 0, until: "indefinite", text: "Indestructible", change: { words: ["indestructible"] } } },
		{ do: "counters", what: jace!.id, kind: "loyalty", amount: -3 }], "resolve");
	assert.ok(characteristics(table, jace!)!.words.includes("indestructible"));
	assert.equal(nextDecision(table)!.situation, "state-based"); finish(table);
	assert.equal(jace!.zone, "graveyard");
});
