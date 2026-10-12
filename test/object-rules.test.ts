/** Resolving rules persist independently of characteristics and end on their stated event. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { activationRestrictions } from "../src/core/permits.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { project } from "../src/core/view.ts";
import { announce, establish, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("resolved object rules survive ability loss, expire on actual untap or departure, and replay", () => {
	const netUse = example("Tap another nonland permanent and prevent its activated abilities from being activated for as long as it remains tapped.");
	for (const ending of ["untap", "departure"] as const) {
		const table = start(standard, [{ deck: deck("Jeskai Artifacts") }, { deck: deck("Boros Tokens") }], `object-rule-${ending}`);
		const net = establish(table, 0, "Braided Net // Braided Quipu", pack("Braided Net // Braided Quipu"));
		const target = establish(table, 1, "Stadium Headliner", []);
		main(table, 0);
		const before = structuredClone(table), from = table.ledger.length;
		announce(table, netUse, one => JSON.stringify(one.activation.targets).includes(target.id));
		assert.equal(net.counters.net, 2); assert.ok(net.tapped);
		passBoth(table); finish(table);
		assert.ok(target.tapped); assert.equal(activationRestrictions(tableWorld(table), target).length, 1);
		assert.equal(activationRestrictions(tableWorld(table), target, true).length, 1, "mana abilities are also prohibited");
		assert.ok(!characteristics(table, target)?.registrations.some(one => one.kind === "prohibit"), "the rule grants no ability");
		assert.ok(project(table, 1).notes?.some(note => note.kind === "rule" && note.on.id === target.id));
				assert.deepEqual(relive(before, table.ledger.slice(from)), table);
		const snapshot = structuredClone(table); nextDecision(table); nextDecision(table); assert.deepEqual(table, snapshot);
		commit(table, [{ do: "note", note: { kind: "label", by: 0, on: { id: target.id, incarnation: target.incarnation },
			until: "indefinite", text: "Abilities removed", change: { loseAbilities: true } } },
			{ do: "move", what: net.id, to: "graveyard", reason: "destroy" }], "resolve");
		assert.equal(activationRestrictions(tableWorld(table), target).length, 1, "neither source departure nor recipient ability loss ends a rule");
		commit(table, [{ do: "counters", what: target.id, kind: "stun", amount: 1 }], "resolve");
		const pendingUntap = structuredClone(table), untapAt = table.ledger.length;
		main(table, 1);
		assert.deepEqual(relive(pendingUntap, table.ledger.slice(untapAt)), table);
		assert.ok(target.tapped); assert.equal(target.counters.stun ?? 0, 0);
		assert.equal(activationRestrictions(tableWorld(table), target).length, 1, "stun replaced the untap, so duration remains");
		if (ending === "untap") {
			const pendingEnd = structuredClone(table), endAt = table.ledger.length;
			main(table, 1, 4);
			assert.equal(activationRestrictions(tableWorld(table), target).length, 0);
			assert.deepEqual(relive(pendingEnd, table.ledger.slice(endAt)), table);
			commit(table, [{ do: "tap", what: target.id }], "resolve");
			assert.ok(target.tapped); assert.equal(activationRestrictions(tableWorld(table), target).length, 0, "retapping cannot revive the expired rule");
		} else {
			commit(table, [{ do: "move", what: target.id, to: "hand", reason: "bounce" }], "resolve");
			commit(table, [{ do: "move", what: target.id, to: "battlefield", tapped: true, reason: "resolve" }], "resolve");
			assert.equal(activationRestrictions(tableWorld(table), target).length, 0, "a new incarnation inherits no restriction");
		}
	}

	for (const prevented of [false, true]) for (const expired of [false, true]) {
		const table = start(standard, [{ deck: deck("Boros Tokens") }, { deck: deck("Jeskai Artifacts") }], `torch-rule-${prevented}-${expired}`);
		const target = establish(table, 1, "Crystal Barricade", []);
		main(table, 0); place(table, 0, "hand", "Torch the Tower");
		commit(table, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
		if (prevented) commit(table, [{ do: "note", note: { kind: "damage-rule", by: 1, mode: "prevent", until: "end-of-turn" } }], "resolve");
		const before = structuredClone(table), from = table.ledger.length;
		announce(table, example("Cast Torch the Tower without bargaining: deal 2 damage to target creature or planeswalker and create its damage-linked exile replacement for this turn."));
		passBoth(table); finish(table);
		assert.equal(target.damage, prevented ? 0 : 2);
		assert.equal(table.notes.filter(note => note.kind === "rule").length, prevented ? 0 : 1);
		assert.deepEqual(relive(before, table.ledger.slice(from)), table);
		commit(table, [{ do: "note", note: { kind: "label", by: 0, on: { id: target.id, incarnation: target.incarnation },
			until: "indefinite", text: "Abilities removed", change: { loseAbilities: true } } }], "resolve");
		if (expired) {
			const pendingCleanup = structuredClone(table), cleanupAt = table.ledger.length;
			main(table, 1);
			assert.deepEqual(relive(pendingCleanup, table.ledger.slice(cleanupAt)), table);
			assert.ok(!table.notes.some(note => note.kind === "rule"));
		}
		commit(table, [{ do: "move", what: target.id, to: "graveyard", reason: "destroy" }], "destroy");
		assert.equal(target.zone, prevented || expired ? "graveyard" : "exile");
		assert.ok(!table.notes.some(note => note.kind === "rule"));
	}

	const craftTable = start(standard, [{ deck: deck("Jeskai Artifacts") }, { deck: deck("Boros Tokens") }], "craft-timing");
	establish(craftTable, 0, "Braided Net // Braided Quipu", pack("Braided Net // Braided Quipu"));
	place(craftTable, 0, "graveyard", "Candy Trail"); main(craftTable, 0);
	commit(craftTable, [{ do: "add-mana", who: 0, colors: ["U", "C"] }], "game-setup");
	const craft = example("Craft with an artifact to return this card transformed as Braided Quipu.");
	assert.ok(offered(craftTable, craft).length);
	main(craftTable, 0, 1, "begin-combat");
	commit(craftTable, [{ do: "add-mana", who: 0, colors: ["U", "C"] }], "game-setup");
	assert.equal(offered(craftTable, craft).length, 0);
});
