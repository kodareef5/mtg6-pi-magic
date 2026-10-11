/** Exile-until returns are immediate effects, not optional work or stack objects. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { editWork } from "../src/core/work-tools.ts";
import { printedCast } from "../src/core/procedures.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { matches, tableWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { announce, establish, finish, main, pack, passBoth, place, step } from "./play.ts";

test("exile-until ends between instructions, tracks exact objects and returns simultaneously through replay", () => {
	for (const early of [false, true]) {
		const table = start(standard, [{ deck: deck("Azorius Control") }, { deck: deck("Mono-Red Aggro") }], `exile-duration-${early}`);
		const victim = establish(table, 1, "Hired Claw", []);
		main(table, 0);
		editWork(table, 0, [{ do: "package.put", package: { card: "Seam Rip", registers: pack("Seam Rip") } }], "seam-package");
		place(table, 0, "hand", "Seam Rip"); place(table, 0, "hand", "Get Lost");
		commit(table, [{ do: "add-mana", who: 0, colors: ["W", "W", "C"] }], "game-setup");
		const before = structuredClone(table), from = table.ledger.length;
		const cast = announce(table, printedCast("Seam Rip", table.printed["Seam Rip"]!));
		const seam = table.things.get(cast.activation.source.id)!; passBoth(table); finish(table);
		apply(table, nextDecision(table)!.options.find((one) => one.id.endsWith(`:t0=${victim.id}@${victim.incarnation}`))!.id, "model", "chosen"); finish(table);
		if (!early) { passBoth(table); finish(table); assert.equal(victim.zone, "exile"); }
		const clone = structuredClone(table), at = table.ledger.length;
		// The fixture exercises destruction and token creation; it does not exercise a Map activation.
		announce(table, { source: { card: "Get Lost", zones: ["hand"] }, claim: "Destroy the exiling enchantment, then make its controller's Maps", timing: "spell",
			basis: table.printed["Get Lost"]!.oracle, targets: [{ object: { types: ["enchantment"], controller: "you" } }],
			instructions: [{ do: "destroy", what: "target:0" }, { do: "token", count: 2, spec: { name: "Map", types: ["artifact"], subtypes: ["Map"], colors: [] } }] });
		passBoth(table); step(table);
		assert.equal(seam!.zone, "graveyard"); assert.equal(victim.zone, "battlefield");
		assert.ok(table.resolution, "the return precedes the next instruction in Get Lost");
		assert.equal(cardsIn(table, "battlefield").filter((one) => one.token?.name === "Map").length, 0);
		assert.ok(!table.notes.some((one) => one.kind === "return"));
		assert.ok(!table.waiting.some((one) => /return/i.test(one.basis)), "the duration creates no leaves trigger");
		finish(table);
		if (early) { passBoth(table); finish(table); assert.equal(victim.zone, "battlefield", "the departed source cannot exile it when its trigger resolves"); }
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
		assert.deepEqual(relive(before, table.ledger.slice(from)), table);
	}
	// A private hand exile returns to that owner's hand, even after its source loses its abilities.
	const batTable = start(standard, [{ deck: deck("Lifegain") }, { deck: deck("Mono-Red Aggro") }], "bat-duration");
	main(batTable, 0);
	editWork(batTable, 0, [{ do: "package.put", package: { card: "Deep-Cavern Bat", registers: pack("Deep-Cavern Bat") } }], "bat-package");
	place(batTable, 0, "hand", "Deep-Cavern Bat"); const [seenClaw] = place(batTable, 1, "hand", "Hired Claw");
	commit(batTable, [{ do: "add-mana", who: 0, colors: ["B", "C"] }], "game-setup");
	const cast = announce(batTable, printedCast("Deep-Cavern Bat", batTable.printed["Deep-Cavern Bat"]!));
	const bat = batTable.things.get(cast.activation.source.id)!; passBoth(batTable); finish(batTable);
	apply(batTable, nextDecision(batTable)!.options[0]!.id, "model", "chosen"); passBoth(batTable);
	step(batTable); assert.ok(project(batTable, 0).objects!.some((one) => one.id === seenClaw!.id));
	assert.ok(!project(batTable, "spectator").objects!.some((one) => one.id === seenClaw!.id));
	step(batTable, (label) => label.includes("Hired Claw"));
	const claw = batTable.things.get(batTable.resolution!.bound.chosen!.objects[0]!.id)!; finish(batTable);
	assert.equal(claw!.zone, "exile");
	assert.ok(matches({ world: tableWorld(batTable), controller: 0, source: bat }, claw!, { zones: ["exile"], linked: true }));
	commit(batTable, [{ do: "note", note: { kind: "label", on: { id: bat!.id, incarnation: bat!.incarnation }, by: 1, until: "indefinite", text: "Abilities removed", change: { loseAbilities: true } } }], "resolve");
	commit(batTable, [{ do: "move", what: bat!.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.equal(claw!.zone, "hand"); assert.equal(claw!.owner, 1);
	assert.ok(!project(batTable, 0).objects!.some((one) => one.id === claw!.id));

	// Isolate simultaneous duration expiry, an exiled card that already moved, and a token that cannot return.
	const table = start(standard, [{ deck: deck("Azorius Control") }, { deck: deck("Mono-Red Aggro") }], "simultaneous-returns");
	const sources = place(table, 0, "battlefield", "Seam Rip", "Seam Rip");
	const [a, b, gone] = place(table, 1, "exile", "Hired Claw", "Hired Claw", "Hired Claw");
	commit(table, [{ do: "token", id: "map", controller: 1, spec: { name: "Map", types: ["artifact"], subtypes: ["Map"], colors: [] } }], "game-setup");
	commit(table, [{ do: "move", what: "map", to: "exile", reason: "exile" }], "exile");
	const token = table.things.get("map")!;
	commit(table, [a!, b!, gone!, token].map((one, at) => ({ do: "note" as const, note: { kind: "return" as const, by: 0, until: "indefinite" as const,
		 source: { id: sources[at % 2]!.id, incarnation: sources[at % 2]!.incarnation }, on: { id: one.id, incarnation: one.incarnation }, to: "battlefield" as const } })), "resolve");
	commit(table, [{ do: "move", what: gone!.id, to: "hand", reason: "resolve" }], "resolve");
	const began = table.log.length;
	commit(table, sources.map((one) => ({ do: "move" as const, what: one.id, to: "graveyard" as const, reason: "destroy" as const })), "destroy");
	assert.deepEqual([a!.zone, b!.zone, gone!.zone, token.zone], ["battlefield", "battlefield", "hand", "exile"]);
	assert.deepEqual([a!.controller, b!.controller], [1, 1]);
	assert.equal(table.log.length - began, 2, "one departure group, then one simultaneous return group");
	assert.equal(table.log.at(-1)!.changes.filter((one) => one.do === "move").length, 2);

	// A return still carries the owner's package and pauses for an entry replacement before moving.
	const gated = start(standard, [{ deck: deck("Azorius Control") }, { deck: deck("Mono-Red Aggro") }], "return-entry-choice");
	main(gated, 0);
	const holder = establish(gated, 0, "Seam Rip", []), [land] = place(gated, 0, "exile", "Hallowed Fountain");
	editWork(gated, 0, [{ do: "package.put", package: { card: "Hallowed Fountain", registers: [{ kind: "enters",
		basis: "As this land enters, you may pay 2 life. If you don't, it enters tapped.", tapped: true, unlessPay: { life: 2 } }] } }], "return-package");
	commit(gated, [{ do: "note", note: { kind: "return", by: 1, until: "indefinite", on: { id: land!.id, incarnation: land!.incarnation },
		source: { id: holder.id, incarnation: holder.incarnation }, to: "battlefield" } }], "resolve");
	commit(gated, [{ do: "move", what: holder.id, to: "graveyard", reason: "destroy" }], "destroy");
	assert.ok(gated.entry); assert.equal(land!.zone, "exile"); assert.equal(gated.seats[0]!.life, 20);
	const cloned = structuredClone(gated), at = gated.ledger.length;
	apply(gated, nextDecision(gated)!.options.find((one) => one.id.endsWith(":pay"))!.id, "model", "chosen");
	assert.equal(land!.zone, "battlefield"); assert.equal(land!.tapped, false); assert.equal(gated.seats[0]!.life, 18);
	assert.ok(land!.registrations?.length); assert.equal(gated.entry, undefined);
	assert.ok(!gated.notes.some((one) => one.kind === "return"));
	assert.deepEqual(relive(cloned, gated.ledger.slice(at)), gated);
});
