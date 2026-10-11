/** Standing restrictions describe offers and recheck execution without suppressing readiness or other actions. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { activationChanges } from "../src/core/procedures.ts";
import { castRestrictions } from "../src/core/permits.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import { useSources } from "../src/core/readiness.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { actionFacts } from "../src/context/strategy-actions.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("a casting prohibition follows active faces, control and abilities, preserving readiness and replay", () => {
	for (const face of [0, 1] as const) for (const zone of ["hand", "exile"] as const) {
		const table = start(standard, [{ name: "Bant", deck: deck("Bant Airbending Combo") }, { name: "Red", deck: deck("Mono-Red Aggro") }], `casting-ban-${face}-${zone}`);
		const jennifer = establish(table, 0, "Jennifer Walters // The Sensational She-Hulk");
		if (face) commit(table, [{ do: "transform", what: jennifer.id }], "game-setup");
		const [spell] = place(table, 1, zone, "Burst Lightning");
		place(table, 1, "battlefield", "Mountain", "Mountain");
		if (zone === "exile") commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 1, on: { id: spell!.id, incarnation: spell!.incarnation }, mana: "{2}", fromTurn: 0, until: "indefinite" } }], "game-setup");
		const cast: Procedure = { claim: "Cast Burst Lightning", basis: "Burst Lightning deals 2 damage to any target.", timing: "spell",
			source: { card: "Burst Lightning", controller: "self", zones: ["hand", "exile"], refs: [{ id: spell!.id, incarnation: spell!.incarnation }] }, targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
		main(table, 0); apply(table, "pass", "model", "chosen");
		const frame = workFrame(table, 1), beforeRead = structuredClone(table);
		assert.equal(castRestrictions(tableWorld(table), 0).length, 0);
		assert.equal(castRestrictions(viewWorld(project(table, 1)), 1).length, 1);
		assert.equal(useSources(frame, cast).length, 1, "a casting restriction cannot hide required interpretation work");
		assert.equal(offered(table, cast).length, 0, "neither flash nor alternative-price permission overrides a prohibition");
		const description = actionFacts(frame, { cast: { label: cast.claim, action: { procedure: cast } } }).cast;
		assert.ok(description && "castingRestrictions" in description && description.castingRestrictions?.length);
		assert.deepEqual(table, beforeRead);
		const mana: Procedure = { claim: "Tap a Mountain", basis: "{T}: Add {R}.", timing: "mana", source: { zones: ["battlefield"], card: "Mountain", controller: "self" },
			cost: { tap: true }, instructions: [{ do: "mana", who: "you", colors: ["R"] }] };
		assert.ok(offered(table, mana).length, "activated abilities remain available");
		const without = structuredClone(table);
		commit(without, [{ do: "note", note: { kind: "label", on: { id: jennifer.id, incarnation: jennifer.incarnation }, by: 1, until: "end-of-turn", text: "Loses abilities", change: { loseAbilities: true } } }], "resolve");
		const legal = offered(without, cast)[0]!;
		assert.ok(legal, "removing abilities removes the casting restriction through the layers");
		assert.throws(() => activationChanges(table, legal.activation), /Casting is prohibited/);
		assert.deepEqual(table, beforeRead, "refusing a stale announcement moves and spends nothing");
		const moved = structuredClone(table);
		commit(moved, [{ do: "move", what: jennifer.id, to: "exile", reason: "exile" }, { do: "move", what: jennifer.id, to: "battlefield", reason: "resolve", controller: 1, registers: pack(jennifer.card!) }], "resolve");
		assert.equal(castRestrictions(tableWorld(moved), 1).length, 0, "the restriction reads the permanent's new controller");
		const prefix = structuredClone(table), from = table.ledger.length;
		main(table, 1, 2);
		assert.equal(castRestrictions(tableWorld(table), 1).length, 0);
		announce(table, cast); passBoth(table); finish(table);
		assert.equal(spell!.zone, "graveyard");
		assert.equal(table.seats[0]!.life, 18);
		const clone = structuredClone(table), next = table.ledger.length;
		main(table, 0, 3);
		assert.equal(castRestrictions(tableWorld(table), 1).length, 1);
		assert.deepEqual(relive(clone, table.ledger.slice(next)), table);
		assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
	}
});
