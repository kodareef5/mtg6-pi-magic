/** A designation is physical state; granted abilities remain derived and incarnation-scoped. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { copiable } from "../src/core/copies.ts";
import { relive } from "../src/core/journal.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { project, describe } from "../src/core/view.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { announce, establish, example, finish, main, pack, passBoth, place, quiet } from "./play.ts";

test("harnessing grants infinity while present, survives ability loss, and is neither copied nor carried across zones", () => {
	const card = "The Mind Stone", harness = example("Harness The Mind Stone");
	const table = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Bant Airbending Combo")) }], "harness");
	const stone = establish(table, 0, card), elf = place(table, 1, "hand", "Llanowar Elves")[0]!;
	const land = place(table, 0, "battlefield", "Plains")[0]!;
	commit(table, [{ do: "move", what: elf.id, to: "battlefield", controller: 0, reason: "game-setup" }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [harness] } }], "stone-terms");
	main(table, 0);
	assert.equal(characteristics(table, stone)!.registrations.some(one => one.kind === "watch"), false);
	const notHarnessed = structuredClone(table); main(notHarnessed, 0, 1, "end");
	assert.equal(notHarnessed.waiting.length, 0);
	assert.ok(!notHarnessed.log.some(one => one.changes.some(change => change.do === "trigger")), "there is no infinity trigger before harnessing");
	commit(table, [{ do: "add-mana", who: 0, colors: ["W", "W", "W", "W", "W", "W"] }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, harness);
	assert.equal(stone.designations, undefined, "paying does not harness before resolution");
	const pending = structuredClone(table), at = table.ledger.length;
	passBoth(table); finish(table);
	assert.deepEqual(stone.designations, ["harnessed"]);
	assert.ok(stone.tapped); assert.equal(table.seats[0]!.pool.length, 0);
	assert.ok(characteristics(table, stone)!.registrations.some(one => one.kind === "watch"));
	assert.ok(!stone.registrations!.some(one => one.kind === "watch"), "the granted watch is never stored on the permanent");
	assert.match(table.log.map(one => describe(table, one)).join("\n"), /designated The Mind Stone as harnessed/);
	for (const viewer of [0, 1, "spectator"] as const)
		assert.deepEqual(project(table, viewer).objects!.find(one => one.id === stone.id)!.designations, ["harnessed"]);
	assert.deepEqual(focus(workFrame(table, 0), startingIntent(0)).objects.find(one => one.id === stone.id)!.designations, ["harnessed"]);
	assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table, "a pending harness activation continues identically");

	const removed = structuredClone(table), original = removed.things.get(stone.id)!;
	commit(removed, [{ do: "note", note: { kind: "label", text: "Abilities removed", on: { id: stone.id, incarnation: stone.incarnation }, by: 0,
		until: "end-of-turn", change: { loseAbilities: true } } }], "resolve");
	assert.deepEqual(original.designations, ["harnessed"]);
	assert.equal(characteristics(removed, original)!.registrations.length, 0, "ability loss removes the infinity grant, not the designation");
	commit(removed, [{ do: "designate", what: stone.id, designation: "harnessed" }], "resolve");
	assert.deepEqual(original.designations, ["harnessed"], "harnessing twice does not duplicate the marker");
	main(removed, 0, 3);
	assert.ok(characteristics(removed, original)!.registrations.some(one => one.kind === "watch"), "the grant returns when ability loss expires");
	const copy = copiable(table, stone, "token"); assert.ok("spec" in copy);
	const copied = structuredClone(table);
	commit(copied, [{ do: "token", id: "harness-copy", spec: copy.spec, controller: 1 }], "resolve");
	assert.equal(copied.things.get("harness-copy")!.designations, undefined);
	assert.equal(characteristics(copied, copied.things.get("harness-copy")!)!.registrations.some(one => one.kind === "watch"), false);

	// An already announced harness ability must not mark a later incarnation.
	const departed = structuredClone(initial); announce(departed, harness);
	commit(departed, [{ do: "move", what: stone.id, to: "exile", reason: "exile" },
		{ do: "move", what: stone.id, to: "battlefield", reason: "resolve", registers: pack(card) }], "resolve");
	passBoth(departed); finish(departed);
	assert.equal(departed.things.get(stone.id)!.designations, undefined);

	for (let guard = 0; !table.waiting.length && guard < 150; guard++) {
		const decision = nextDecision(table);
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	assert.equal(table.waiting.length, 1);
	while (!nextDecision(table)) advance(table);
	const decision = nextDecision(table)!;
	assert.equal(decision.situation, "trigger-order");
	assert.ok(decision.options.some(one => !one.objects?.some(ref => ref.id === elf.id)), "zero targets is offered");
	assert.ok(!decision.options.some(one => one.objects?.some(ref => ref.id === land.id)), "a land is not a target");
	const chosen = decision.options.find(one => one.objects?.some(ref => ref.id === elf.id))!;
	assert.ok(chosen); apply(table, chosen.id, "model", "chosen");
	commit(table, [{ do: "move", what: stone.id, to: "exile", reason: "exile" }], "resolve");
	assert.equal(stone.designations, undefined);
	const announced = structuredClone(table), startAt = table.ledger.length, incarnation = elf.incarnation;
	passBoth(table); finish(table);
	assert.equal(elf.zone, "battlefield"); assert.equal(elf.controller, 1);
	assert.equal(elf.incarnation, incarnation + 2, "the already triggered ability blinks its target after the source leaves");
	assert.deepEqual(relive(announced, table.ledger.slice(startAt)), table);
	commit(table, [{ do: "designate", what: stone.id, designation: "harnessed" }], "resolve");
	assert.equal(stone.designations, undefined, "only a permanent can be harnessed");
});
