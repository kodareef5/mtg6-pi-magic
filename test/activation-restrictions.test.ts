/** A standing activation ban follows source characteristics and checks payment as well as priority offers. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { activationChanges, printedCast } from "../src/core/procedures.ts";
import { activationRestrictions } from "../src/core/permits.ts";
import { sources } from "../src/core/funding.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { useSources } from "../src/core/readiness.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { actionFacts } from "../src/context/strategy-actions.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("a chosen-name activation ban reaches all zones while preserving mana, readiness, replay and clones", () => {
	const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Selesnya Landfall")) }], "named-activation");
	main(table, 0);
	const [hamlet] = place(table, 0, "hand", "Petrified Hamlet"), [passage] = place(table, 1, "battlefield", "Fabled Passage");
	const [inHand] = place(table, 1, "hand", "Fabled Passage");
	const crack = example("Crack Fabled Passage for a basic land");
	const before = structuredClone(table); apply(before, "pass", "model", "chosen");
	const legal = offered(before, crack)[0]!; assert.ok(legal);
	editWork(table, 0, [{ do: "package.put", package: { card: hamlet!.card!, registers: pack(hamlet!.card!) } }], "hamlet");
	const initial = structuredClone(table), from = table.ledger.length;
	apply(table, `land:${hamlet!.id}`, "model", "chosen");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
	apply(table, nextDecision(table)!.options.find((one) => one.label === "Choose the name Fabled Passage")!.id, "model", "chosen"); finish(table);
	apply(table, "pass", "model", "chosen");
	const frame = workFrame(table, 1), snapshot = structuredClone(table);
	assert.equal(offered(table, crack).length, 0);
	assert.equal(useSources(frame, crack).length, 1, "a prohibition cannot hide required interpretation work");
	assert.equal(activationRestrictions(tableWorld(table), inHand!).length, 1, "a source in hand retains the chosen name");
	const projected = viewWorld(project(table, 1));
	assert.equal(activationRestrictions(projected, projected.objects.find((one) => one.id === inHand!.id)!).length, 1, "the owner's projected facts agree");
	const facts = actionFacts(frame, { crack: { label: crack.claim, action: { procedure: crack } } }).crack;
	assert.ok(facts && "activationRestrictions" in facts && facts.activationRestrictions?.[0]?.restrictions.length);
	assert.throws(() => activationChanges(table, legal.activation), /Activation is prohibited/);
	assert.deepEqual(table, snapshot, "listing and refusing spend nothing");
	for (const removed of [false, true]) {
		const changed = structuredClone(table);
		commit(changed, removed ? [{ do: "move", what: hamlet!.id, to: "graveyard", reason: "destroy" }]
			: [{ do: "note", note: { kind: "label", on: hamlet!, by: 0, until: "end-of-turn", text: "Lose abilities", change: { loseAbilities: true } } }], "resolve");
		assert.ok(offered(changed, crack).length, "the ban ends when its source or ability leaves");
	}
	const mana: Procedure = { source: { card: "Fabled Passage", zones: ["battlefield"], controller: "self" }, claim: "Use the granted colorless mana",
		basis: "Lands with the chosen name have \"{T}: Add {C}.\"", timing: "mana", cost: { tap: true }, instructions: [{ do: "mana", who: "you", colors: ["C"] }] };
	assert.ok(sources(frame).some((one) => one.object.id === passage!.id && one.yields.some((yielded) => yielded.colors.includes("C"))));
	const pending = structuredClone(table), at = table.ledger.length;
	announce(table, mana); assert.equal(table.seats[1]!.pool[0]!.color, "C");
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
});

test("an activation ban without a mana exception blocks registered and intrinsic mana payment, not existing mana", () => {
	const table = start(standard, [{ deck: alpha(deck("Boros Dragons")) }, { deck: alpha(deck("Mono-Green Landfall")) }], "mana-activation");
	const conqueror = establish(table, 0, "Clarion Conqueror");
	const elves = establish(table, 1, "Llanowar Elves"), [forest] = place(table, 1, "battlefield", "Forest");
	place(table, 1, "hand", "Llanowar Elves"); main(table, 1);
	const cast = printedCast("Llanowar Elves", table.printed["Llanowar Elves"]!);
	const unlocked = structuredClone(table);
	commit(unlocked, [{ do: "note", note: { kind: "label", on: conqueror, by: 1, until: "end-of-turn", text: "Lose abilities", change: { loseAbilities: true } } }], "resolve");
	const stale = offered(unlocked, cast).find((one) => one.activation.funding?.some((tap) => tap.source.id === elves.id))!;
	assert.ok(stale); assert.throws(() => activationChanges(table, stale.activation), /mana source.*cannot activate/);
	assert.ok(!sources(workFrame(table, 1)).some((one) => one.object.id === elves.id));
	const landPaid = offered(table, cast).find((one) => one.activation.funding?.some((tap) => tap.source.id === forest!.id))!;
	assert.ok(landPaid, "an ordinary land is unaffected");
	commit(table, [{ do: "note", note: { kind: "label", on: forest!, by: 1, until: "end-of-turn", text: "Animate land", change: { types: { add: ["creature"] }, base: { power: 2, toughness: 2 } } } }], "resolve");
	assert.equal(sources(workFrame(table, 1)).length, 0, "an animated land's intrinsic mana ability is restricted too");
	assert.throws(() => activationChanges(table, landPaid.activation), /mana source.*cannot activate/);
	commit(table, [{ do: "add-mana", who: 1, colors: ["G"] }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	const chosen = announce(table, cast); assert.equal(chosen.activation.funding?.length ?? 0, 0);
	const pending = structuredClone(table), at = table.ledger.length;
	passBoth(table); finish(table);
	assert.equal(table.things.get(chosen.activation.source.id)!.zone, "battlefield");
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
});
