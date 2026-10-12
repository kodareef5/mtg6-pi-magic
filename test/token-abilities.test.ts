/** A created token owns complete stack abilities even after its creating card leaves. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn } from "../src/core/table.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { checkProcedure, printedCast } from "../src/core/procedures.ts";
import { activatedUses } from "../src/core/activated.ts";
import { relive } from "../src/core/journal.ts";
import { holds, objects, tableWorld } from "../src/core/selectors.ts";
import { describe, project } from "../src/core/view.ts";
import { announce, establish, example, finish, main, offered, pack, passBoth, place, step } from "./play.ts";

test("a Map's own activation reveals before branching, pays once, and survives its source's departure and replay", () => {
	for (const mode of ["land", "keep", "graveyard", "empty"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Dimir Midrange")) }, { deck: alpha(deck("Selesnya Landfall")) }], `map-${mode}`);
		editWork(table, 0, [{ do: "package.put", package: { card: "Spyglass Siren", registers: pack("Spyglass Siren"), printedCast: true, assessed: true } }], "map-package");
		main(table, 0); const [siren] = place(table, 0, "hand", "Spyglass Siren");
		const land = (card: string) => table.printed[card]!.type.includes("Land");
		const top = cardsIn(table, "library", 0).find((one) => land(one.card!) === (mode === "land"))!;
		commit(table, [
			...(mode === "empty" ? cardsIn(table, "library", 0).map((one) => ({ do: "move" as const, what: one.id, to: "graveyard" as const, reason: "game-setup" as const }))
				: [{ do: "order" as const, who: 0, whose: 0, cards: [{ id: top.id, incarnation: top.incarnation }], position: "top" as const }]),
			{ do: "add-mana", who: 0, colors: ["U", "C"] },
		], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, printedCast("Spyglass Siren", table.printed["Spyglass Siren"]!)); passBoth(table); finish(table);
		assert.equal(nextDecision(table)!.situation, "trigger-order");
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
		const map = cardsIn(table, "battlefield", 0).find((one) => one.token?.name === "Map Token")!;
		const use = activatedUses(workFrame(table, 0)).find((one) => one.procedure.source.refs?.[0]?.id === map.id)!;
		assert.ok(use); assert.ok(offered(table, use.procedure).length);
		// A creature without haste cannot tap on entry, but a Map is not a creature.
		announce(table, use.procedure); assert.equal(map.zone, "graveyard");
		const sacrificed = table.log.findLast((one) => one.changes.some((change) => change.do === "move" && change.what === map.id && change.reason === "sacrifice"))!;
		for (const viewer of [0, 1, "spectator"] as const) assert.match(describe(table, sacrificed, viewer), /put Map Token into graveyard \(sacrifice\)/);
		finish(table); assert.equal(table.things.has(map.id), false, "sacrificed token ceases while its ability remains on the stack");
		assert.match(describe(table, sacrificed), /put Map Token into graveyard/, "the receipt keeps the token's event-time name after it ceases");
		passBoth(table);
		const hidden = structuredClone(table);
		assert.ok(!JSON.stringify(nextDecision(table)).includes(top.id), "the reveal confirmation names no unseen object");
		if (mode !== "empty") for (const viewer of [0, 1, "spectator"] as const) assert.ok(!project(table, viewer).objects!.some((one) => one.id === top.id));
		assert.deepEqual(table, hidden);
		step(table); // Public reveal.
		const prefix = structuredClone(table), at = table.ledger.length;
		if (mode !== "empty") for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find((one) => one.id === top.id)!.card, top.card);
		for (let guard = 0; table.resolution && guard < 12; guard++) {
			const decision = nextDecision(table)!;
			if (decision.options.length === 1) step(table);
			else step(table, (label) => label.startsWith(mode === "graveyard" ? "Carry out" : "Decline"));
		}
		finish(table);
		assert.equal(siren!.counters["+1/+1"] ?? 0, mode === "land" ? 0 : 1);
		if (mode !== "empty") assert.equal(top.zone, mode === "land" ? "hand" : mode === "graveyard" ? "graveyard" : "library");
		assert.equal(table.seats[0]!.pool.length, 0);
		assert.deepEqual(relive(prefix, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		const after = structuredClone(table);
		assert.equal(activatedUses(workFrame(table, 0)).length, 0); assert.deepEqual(table, after);
	}
	const table = start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Selesnya Landfall")) }], "clue-ability");
	main(table, 0); const inspector = establish(table, 0, "Callous Inspector");
	commit(table, [{ do: "move", what: inspector.id, to: "graveyard", reason: "destroy" }], "resolve");
	const initial = structuredClone(table), from = table.ledger.length;
	assert.equal(nextDecision(table)!.situation, "trigger-order");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
	assert.equal(table.seats[0]!.life, 19, "the source's death trigger deals its damage before making the Clue");
	const clue = cardsIn(table, "battlefield", 0).find((one) => one.token?.name === "Clue Token")!;
	assert.ok(clue); assert.equal(inspector.zone, "graveyard");
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	main(table, 1, 2); apply(table, "pass", "model", "chosen");
	commit(table, [{ do: "add-mana", who: 0, colors: ["C", "C"] }], "game-setup");
	const use = activatedUses(workFrame(table, 0)).find((one) => one.procedure.source.refs?.[0]?.id === clue.id)!;
	const prefix = structuredClone(table), at = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
	announce(table, use.procedure); finish(table); assert.equal(table.things.has(clue.id), false);
	passBoth(table); finish(table); assert.equal(cardsIn(table, "hand", 0).length, hand + 1);
	assert.deepEqual(relive(prefix, table.ledger.slice(at)), table);
});

test("token creation uses the target's last controller, survives failed destruction, and is lost with an illegal target", () => {
	const badColor = structuredClone(example("Get Lost"));
	const creation = badColor.instructions.find((one) => one.do === "token")!;
	if (creation.do !== "token") assert.fail("Get Lost creates Maps");
	assert.ok(creation.spec); creation.spec.colors = ["C"];
	assert.throws(() => checkProcedure(badColor), /Procedure/, "colorless tokens have an empty color set, not a sixth color");
	for (const mode of ["destroyed", "indestructible", "illegal"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: alpha(deck("Selesnya Landfall")) }], `get-lost-${mode}`);
		const victim = place(table, 0, "hand", "The Theorist, Jace Beleren")[0]!;
		commit(table, [{ do: "move", what: victim.id, to: "battlefield", controller: 1, reason: "game-setup", registers: [] }], "game-setup");
		if (mode === "indestructible") commit(table, [{ do: "note", note: { kind: "label", by: 0, on: { id: victim.id, incarnation: victim.incarnation },
			until: "indefinite", text: "Fixture makes the target indestructible.", change: { words: ["indestructible"] } } }], "game-setup");
		main(table, 0); place(table, 0, "hand", "Get Lost");
		commit(table, [{ do: "add-mana", who: 0, colors: ["C", "W"] }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, example("Get Lost"));
		if (mode === "illegal") commit(table, [{ do: "move", what: victim.id, to: "hand", reason: "resolve" }], "resolve");
		passBoth(table);
		if (mode === "illegal") {
			finish(table); assert.equal(cardsIn(table, "battlefield").filter((one) => one.token).length, 0);
			continue;
		}
		step(table); // Destruction happens before anyone creates a token.
		assert.equal(victim.zone, mode === "destroyed" ? "graveyard" : "battlefield");
		assert.equal(victim.controller, mode === "destroyed" ? 0 : 1);
		assert.equal(cardsIn(table, "battlefield").filter((one) => one.token).length, 0);
		const pending = structuredClone(table), at = table.ledger.length;
		assert.equal(nextDecision(table)!.options[0]!.label, `${table.seats[1]!.name} create 2 Map Token`);
		assert.deepEqual(table, pending, "listing a creator reads last known information without writing it");
		finish(table);
		const maps = cardsIn(table, "battlefield").filter((one) => one.token?.name === "Map Token");
		assert.equal(maps.length, 2); assert.ok(maps.every((one) => one.owner === 1 && one.controller === 1));
		assert.ok(maps.every((one) => one.token!.colors.length === 0));
		assert.equal(activatedUses(workFrame(table, 0)).filter((one) => maps.some((map) => one.procedure.source.refs?.[0]?.id === map.id)).length, 0);
		assert.equal(activatedUses(workFrame(table, 1)).filter((one) => maps.some((map) => one.procedure.source.refs?.[0]?.id === map.id)).length, 2);
		const receipt = table.log.findLast((one) => one.changes.some((change) => change.do === "token"))!;
		assert.ok(describe(table, receipt).startsWith(`${table.seats[1]!.name} created Map Token (x2)`));
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	}
	for (const mode of ["own", "opponent", "indestructible", "existing", "illegal", "none"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Selesnya Landfall")) }], `azog-${mode}`);
		const card = "Azog, Moria's Ruin", [azog] = place(table, 0, "hand", card);
		main(table, 0); const [victim] = place(table, 1, "graveyard", "Llanowar Elves");
		const controller = mode === "opponent" ? 1 : 0;
		commit(table, [{ do: "move", what: victim!.id, to: "battlefield", controller, reason: "game-setup", registers: [] },
			{ do: "counters", what: victim!.id, kind: "+1/+1", amount: 2 }], "game-setup");
		if (mode === "indestructible") commit(table, [{ do: "note", note: { kind: "label", by: 0, on: { id: victim!.id, incarnation: victim!.incarnation },
			until: "indefinite", text: "Fixture protects the target", change: { words: ["indestructible"] } } }], "game-setup");
		if (mode === "existing") commit(table, [{ do: "token", id: "previous-army", controller, spec: { name: "Goblin Army Token", types: ["creature"],
			subtypes: ["Goblin", "Army"], colors: ["B"], power: 0, toughness: 0 } },
			{ do: "counters", what: "previous-army", kind: "+1/+1", amount: 1 }], "game-setup");
		const registers = pack(card);
		editWork(table, 0, [{ do: "package.put", package: { card, registers } }], "azog-source");
		commit(table, [{ do: "move", what: azog!.id, to: "battlefield", reason: "resolve", registers }], "resolve");
		const decision = nextDecision(table)!, before = structuredClone(table);
		assert.deepEqual(nextDecision(table), decision); assert.deepEqual(table, before);
		const choice = decision.options.find(one => mode === "none" ? !one.trigger!.targets.length : one.trigger!.targets.some(ref => "id" in ref && ref.id === victim!.id))!;
		assert.ok(choice); apply(table, choice.id, "model", "chosen");
		const target = { id: victim!.id, incarnation: victim!.incarnation };
		if (mode === "illegal") commit(table, [{ do: "move", what: victim!.id, to: "hand", reason: "bounce" }], "bounce");
		const initial = structuredClone(table), at = table.ledger.length, hand = cardsIn(table, "hand", 0).length;
		passBoth(table);
		if (mode === "none" || mode === "illegal") {
			finish(table); assert.equal(cardsIn(table, "battlefield").filter(one => one.token).length, 0);
			assert.equal(cardsIn(table, "hand", 0).length, hand); continue;
		}
		step(table); step(table); // Accept the group, then destroy before amassing.
		const scope = { world: tableWorld(table), controller, targets: [[target]] };
		assert.equal(holds(scope, { is: "target:0", matches: { controller: "you" } }), mode === "indestructible");
		assert.equal(holds(scope, { is: "target:0", matches: { controller: "you" }, lastKnown: true }), true);
		assert.equal(objects(scope, "target:0").length, mode === "indestructible" ? 1 : 0, "the information check never makes an old target movable");
		assert.equal(holds({ ...scope, illegal: [`${target.id}@${target.incarnation}`] }, { is: "target:0", matches: { controller: "you" }, lastKnown: true }), false);
		const destroyed = structuredClone(table), from = table.ledger.length;
		step(table); // Create an Army only if needed.
		assert.equal(nextDecision(table)!.seat, controller, "the target's last controller chooses the Army");
		finish(table);
		const armies = cardsIn(table, "battlefield").filter(one => one.token?.name === "Goblin Army Token");
		assert.equal(armies.length, 1); assert.equal(armies[0]!.controller, controller);
		assert.equal(armies[0]!.counters["+1/+1"], mode === "existing" ? 4 : 3, "amass reads layered power before destruction");
		assert.equal(cardsIn(table, "hand", 0).length, hand + (mode === "opponent" ? 0 : 1));
		assert.deepEqual(relive(destroyed, table.ledger.slice(from)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(at)), table);
	}
});
