import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { SelectorSchema, check } from "../src/core/language.ts";
import { matches, select, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { deck } from "../src/core/decks.ts";
import { establish, place } from "./play.ts";

test("set queries preserve zone bounds, intersections, exclusions and hidden identities", () => {
	const table = start(standard, [{ name: "Control", deck: deck("4c Control") }, { name: "Landfall", deck: deck("Selesnya Landfall") }], "set-queries");
	const thor = establish(table, 0, "Thor, God of Thunder", []);
	const [spell] = place(table, 0, "stack", "Day of Black Sun");
	const [land] = place(table, 1, "hand", "Forest");
	commit(table, [{ do: "move", what: land!.id, to: "battlefield", reason: "play-land" },
		{ do: "note", note: { kind: "label", by: 1, on: { id: land!.id, incarnation: land!.incarnation + 1 }, until: "end-of-turn", text: "Animated land",
			change: { types: { add: ["creature"] }, base: { power: 2, toughness: 2 } } } }], "resolve");
	const scope = { world: tableWorld(table), controller: 0, source: thor,
		bound: { chosen: { objects: [{ id: land!.id, incarnation: land!.incarnation }], players: [] } } };
	const union = check(SelectorSchema, { any: [{ types: ["creature"], other: true }, { zones: ["stack"], types: ["instant", "sorcery"] }] }, "Selector");
	assert.deepEqual(select(scope, union).map((one) => one.id).sort(), [spell!.id, land!.id].sort());
	assert.ok(!matches(scope, thor, union));
	assert.deepEqual(select(scope, { zones: ["battlefield"], any: union.any }).map((one) => one.id), [land!.id], "outer zones still narrow a union");
	assert.deepEqual(select(scope, { all: [{ types: ["land"] }, { types: ["creature"] }] }).map((one) => one.id), [land!.id]);
	assert.ok(matches(scope, spell!, { zones: ["stack"], all: [{ types: ["sorcery"] }, { not: { types: ["creature"] } }] }), "branches inherit the outer zone");
	assert.deepEqual(select(scope, { any: [{ types: ["creature"] }, { types: ["land"] }] }).map((one) => one.id).sort(), [thor.id, land!.id].sort(), "overlapping branches never duplicate an object");
	assert.ok(!matches(scope, land!, { not: { is: "bound:chosen" } }));
	assert.deepEqual(select(scope, { zones: ["battlefield"], is: "bound:chosen" }).map((one) => one.id), [land!.id]);
	commit(table, [{ do: "move", what: land!.id, to: "hand", reason: "bounce" }], "resolve");
	assert.deepEqual(select(scope, { zones: ["hand"], is: "bound:chosen" }), [], "a binding never follows an unrelated zone change");
	const privateScope = { world: viewWorld(project(table, 0)), controller: 0 };
	assert.deepEqual(select(privateScope, { zones: ["hand"], controller: "opponent", any: [{ types: ["land"] }, { not: { types: ["creature"] } }] }), [], "no branch names hidden cards");
});
