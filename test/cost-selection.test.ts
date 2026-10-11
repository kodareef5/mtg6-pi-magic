/** Large graveyard costs remain a complete linear choice space and spend only at confirmation. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { activate, activationChanges } from "../src/core/procedures.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { cardsIn } from "../src/core/table.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, finish, main, offered, passBoth, place, step } from "./play.ts";

test("staged costs preserve every subset, resources, plan execution and replay until confirmed", () => {
	const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], "evidence-selection");
	const victim = establish(table, 1, "Hired Claw", []);
	main(table, 0);
	const [cover] = place(table, 0, "hand", "Deadly Cover-Up");
	commit(table, [{ do: "add-mana", who: 0, colors: ["B", "B", "C", "C", "C"] }], "game-setup");
	// Isolate the additional payment and destroy instruction. Named-card search has its own invariant.
	const spell: Procedure = { source: { card: "Deadly Cover-Up", zones: ["hand", "graveyard"] }, timing: "spell", claim: "Collect evidence before the sweep",
		basis: "As an additional cost to cast this spell, you may collect evidence 6. ... Destroy all creatures.",
		cost: { exile: { graveyard: {}, totalManaValue: 6 } }, instructions: [{ do: "destroy", every: { types: ["creature"] } }] };
	assert.equal(offered(table, spell).length, 0, "insufficient total cannot offer an unpaid announcement");
	const [large, small, zero] = place(table, 0, "graveyard", "Jeskai Revelation", "Stock Up", "Island");
	const initial = structuredClone(table), from = table.ledger.length;
	const option = offered(table, spell)[0]!; assert.ok(option);
	assert.equal(offered(table, spell).length, 1, "graveyard subsets do not multiply the priority menu");
	const execution = { plan: 42, step: 0 };
	activate(table, option.activation, { picked: option.option.id, offered: [option.option.id], by: "model", why: "chosen", execution });
	assert.deepEqual(table.things, initial.things); assert.deepEqual(table.seats, initial.seats);
	assert.equal(table.ledger.at(-1)!.execution, undefined, "starting a selection does not execute the plan step");
	assert.equal(cardsIn(table, "stack").length, 0);
	assert.ok(!project(table, 1).objects!.some((one) => one.id === cover!.id), "an unfinished private selection exposes no hand source");
	const untouched = structuredClone(table); nextDecision(table); assert.deepEqual(table, untouched);
	assert.throws(() => apply(table, "pass", "model", "chosen"), /No option/);
	assert.ok(!nextDecision(table)!.options.some((one) => one.id === "payment:done"));
	apply(table, `payment:pick:${large!.id}`, "model", "chosen");
	assert.ok(nextDecision(table)!.options.some((one) => one.id === "payment:done"));
	assert.ok(nextDecision(table)!.options.some((one) => one.id === `payment:pick:${zero!.id}`), "overpayment and zero-value extras remain available");
	apply(table, `payment:pick:${small!.id}`, "model", "chosen");
	apply(table, `payment:remove:${large!.id}`, "model", "chosen");
	assert.ok(!nextDecision(table)!.options.some((one) => one.id === "payment:done"));
	const cancelled = structuredClone(table), cancelAt = table.ledger.length;
	apply(cancelled, "payment:cancel", "model", "chosen");
	assert.deepEqual(cancelled.things, initial.things); assert.deepEqual(cancelled.seats, initial.seats); assert.equal(cancelled.payment, undefined);
	assert.equal(cancelled.ledger.at(-1)!.execution, undefined);
	assert.deepEqual(relive(structuredClone(table), cancelled.ledger.slice(cancelAt)), cancelled);
	apply(table, `payment:pick:${large!.id}`, "model", "chosen");
	apply(table, `payment:pick:${zero!.id}`, "model", "chosen");
	const clone = structuredClone(table), at = table.ledger.length;
	const forged = { ...option.activation, cost: { ...option.activation.cost, exiled: [{ id: zero!.id, incarnation: zero!.incarnation }] } };
	assert.throws(() => activationChanges(table, forged), /required mana value/);
	assert.deepEqual(table, clone);
	apply(table, "payment:done", "model", "chosen");
	assert.equal(table.payment, undefined); assert.equal(cover!.zone, "stack");
	assert.deepEqual([large!.zone, small!.zone, zero!.zone], ["exile", "exile", "exile"]);
	assert.equal(table.seats[0]!.pool.length, 0); assert.deepEqual(table.ledger.at(-1)!.execution, execution);
	const payment = table.log.at(-1)!;
	assert.equal(payment.changes.filter((one) => one.do === "move" && one.to === "exile").length, 3, "one group spends the chosen set");
	passBoth(table); finish(table); assert.equal(victim.zone, "graveyard");
	assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);

	// A spell cast from the graveyard cannot exile itself to pay its additional cost.
	const fromGrave = structuredClone(initial), source = fromGrave.things.get(cover!.id)!;
	for (const card of cardsIn(fromGrave, "graveyard", 0)) commit(fromGrave, [{ do: "move", what: card.id, to: "exile", reason: "exile" }], "game-setup");
	commit(fromGrave, [{ do: "move", what: source.id, to: "graveyard", reason: "resolve" }, { do: "add-mana", who: 0, colors: ["B", "B", "C", "C", "C"] }], "game-setup");
	commit(fromGrave, [{ do: "note", note: { kind: "permit", by: 0, who: 0, on: { id: source.id, incarnation: source.incarnation }, fromTurn: 0, until: "indefinite" } }], "game-setup");
	assert.equal(offered(fromGrave, { ...spell, cost: { exile: { graveyard: {}, totalManaValue: 5 } } }).length, 0);

	// The same weighted cost can be a resolving payment. Picking does not bind success early.
	const resolving = structuredClone(initial);
	announce(resolving, { ...spell, cost: undefined, instructions: [{ do: "pay", who: "you", cost: spell.cost!, as: "paid" }] });
	passBoth(resolving);
	const before = structuredClone(resolving), began = resolving.ledger.length;
	step(resolving, (label) => label.startsWith("Select Jeskai Revelation"));
	assert.equal(resolving.resolution!.bound.paid, undefined);
	assert.equal(resolving.things.get(large!.id)!.zone, "graveyard");
	step(resolving, (label) => label.startsWith("Select Island"));
	step(resolving, (label) => label.startsWith("Pay")); finish(resolving);
	assert.equal(resolving.things.get(large!.id)!.zone, "exile"); assert.equal(resolving.things.get(zero!.id)!.zone, "exile");
	assert.deepEqual(relive(before, resolving.ledger.slice(began)), resolving);
});
