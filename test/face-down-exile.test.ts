/** An exile permission never makes a private identity public before its play. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { describe, project } from "../src/core/view.ts";
import { tableWorld, viewWorld, matches } from "../src/core/selectors.ts";
import { playable, checkOngoingCondition } from "../src/core/permits.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { activationChanges, checkProcedure } from "../src/core/procedures.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { preparation } from "../src/core/readiness.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { example, announce, main, passBoth, step, finish, place } from "./play.ts";

test("face-down exile retains only earned looks and grants play only while its live condition holds", () => {
	const card = "Gandalf, Goblins' Bane // Flameshape", procedure = example("Flameshape with a continuing Wizard permission");
	checkProcedure(procedure);
	assert.throws(() => checkProcedure({ ...procedure, instructions: [{ do: "move", what: "this", to: "battlefield", faceDown: true, reason: "resolve" }] }), /faceDown|exile|valid/);
	for (const condition of [{ bound: "looked" }, { amount: { x: true }, atLeast: 1 }, { amount: { count: { other: true } }, atLeast: 1 },
		{ is: "this", matches: {} }, { amount: { life: "controller:target:0" }, atLeast: 1 }])
		assert.throws(() => checkOngoingCondition(condition as never), /permit.while/);
	const table = start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: alpha(deck("Mono-Red Aggro")) }], "private-exile", undefined, { announcementsFrom: 0 });
	main(table, 0);
	place(table, 0, "hand", card);
	const [land, spell] = place(table, 0, "library", "Island", "Slickshot Show-Off");
	commit(table, [{ do: "add-mana", who: 0, colors: ["R", "R", "C", "C"] }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, procedure); passBoth(table); step(table);
	const inspected = structuredClone(table), inspectedAt = table.ledger.length;
	step(table);
	const exileReceipt = table.log.at(-1)!;
	finish(table);
	assert.equal(table.notes.filter(one => one.kind === "permit").length, 3, "two conditional cards and the Adventure card's own permission");
	for (const object of [land!, spell!]) {
		assert.equal(object.zone, "exile"); assert.equal(object.faceDown, true); assert.deepEqual(object.lookedBy, [0]);
		assert.equal(characteristics(table, object), undefined);
		for (const viewer of [0, 1, "spectator"] as const) {
			const view = project(table, viewer, 0), known = view.objects!.find(one => one.id === object.id)!;
			assert.equal(known.card, viewer === 0 ? object.card : undefined); assert.equal(known.traits, undefined);
			assert.equal(playable(viewWorld(view), viewer === "spectator" ? 1 : viewer, known, 1, object === land), false);
			if (viewer !== 0) assert.ok(!describe(table, exileReceipt, viewer).includes(object.card!));
		}
		assert.equal(matches({ world: tableWorld(table), controller: 0 }, object, { zones: ["exile"], types: ["creature", "land"] }), false);
	}
	assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
	assert.deepEqual(relive(structuredClone(inspected), JSON.parse(JSON.stringify(table.ledger.slice(inspectedAt)))), table);
	assert.ok(!nextDecision(table)!.options.some(one => one.objects?.some(ref => ref.id === spell!.id || ref.id === land!.id)));
	// Both permission and readiness switch with the current board. The granted
	// note survives losing the Wizard and does not expire at a turn boundary.
	const [wizard] = place(table, 0, "battlefield", card);
	const work = workFrame(table, 0);
	work.view.work = { ...work.view.work!, packages: [{ card: spell!.card!, registers: [], deferred: [{ claim: "Deferred cast", basis: "Flying, haste", timing: "spell", source: { card: spell!.card!, zones: ["exile"] } }] }] };
	assert.equal(preparation(work)[0]!.card, spell!.card);
	const enabled = structuredClone(table), enabledAt = table.ledger.length;
	const pilot = focus(workFrame(table, 0), startingIntent(0)).objects.find(one => one.id === spell!.id)!;
	assert.equal(pilot.name, spell!.card); assert.equal(pilot.faceDown, true); assert.equal(pilot.types, undefined);
	const begin = nextDecision(table)!.options.find(one => one.announcement?.source.id === spell!.id)!;
	assert.ok(begin); apply(table, begin.id, "model", "chosen");
	assert.equal(project(table, 1).announcement, undefined);
	assert.equal(project(table, 1).objects!.find(one => one.id === spell!.id)!.card, undefined);
	apply(table, "announce:cancel", "model", "chosen");
	assert.equal(spell!.faceDown, true);
	apply(table, begin.id, "model", "chosen"); apply(table, "announce:cost:0", "model", "chosen");
	const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
	const unavailable = structuredClone(table);
	commit(unavailable, [{ do: "move", what: wizard!.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.throws(() => activationChanges(unavailable, payment.use!), /source.*available/);
	assert.ok(unavailable.things.get(spell!.id)!.faceDown);
	const draft = structuredClone(table), draftAt = table.ledger.length;
	apply(table, payment.id, "model", "chosen");
	assert.equal(spell!.zone, "stack"); assert.equal(spell!.faceDown, false); assert.equal(spell!.lookedBy, undefined);
	assert.equal(project(table, 1).objects!.find(one => one.id === spell!.id)!.card, spell!.card);
	passBoth(table); finish(table);
	assert.equal(spell!.zone, "battlefield");
	apply(table, `land:${land!.id}`, "model", "chosen");
	assert.equal(land!.faceDown, false); assert.equal(land!.zone, "battlefield");
	for (const [saved, at] of [[enabled, enabledAt], [draft, draftAt]] as const) assert.deepEqual(relive(structuredClone(saved), table.ledger.slice(at)), table);
	assert.ok(!describe(table, exileReceipt, 1).includes(spell!.card!), "later public play cannot reveal the earlier private receipt");
	const later = structuredClone(enabled);
	commit(later, [{ do: "move", what: wizard!.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.equal(playable(tableWorld(later), 0, later.things.get(land!.id)!, 1, true), false);
	main(later, 0, 3);
	commit(later, [{ do: "move", what: wizard!.id, to: "battlefield", reason: "resolve" }], "resolve");
	assert.equal(playable(tableWorld(later), 0, later.things.get(land!.id)!, 3, true), true);
	const old = later.things.get(land!.id)!.incarnation;
	commit(later, [{ do: "move", what: land!.id, to: "exile", faceDown: true, reason: "exile" }], "exile");
	assert.equal(later.things.get(land!.id)!.incarnation, old + 1);
	assert.equal(later.things.get(land!.id)!.lookedBy, undefined);
	assert.equal(playable(tableWorld(later), 0, later.things.get(land!.id)!, 3, true), false);
	// Replacing the private look with a public reveal cannot create lasting look rights.
	const revealed = structuredClone(initial);
	announce(revealed, { ...procedure, instructions: [{ do: "reveal", what: { top: 2, of: "you" }, as: "looked" }, ...procedure.instructions.slice(1)] });
	passBoth(revealed); finish(revealed);
	for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(revealed, viewer).objects!.find(one => one.id === land!.id)!.card, undefined);
	const shuffled = structuredClone(inspected);
	commit(shuffled, [{ do: "shuffle", whose: 0 }], "resolve"); finish(shuffled);
	assert.equal(project(shuffled, 0).objects!.find(one => one.id === land!.id)!.card, undefined, "a shuffle ends the inspected identities before exile");
	const unknown = cardsIn(revealed, "exile", 0).find(one => one.faceDown)!;
	assert.equal(playable(tableWorld(revealed), 0, unknown, 1, false), false, "a play permission alone never grants a look");
});
