/**
 * Layered. Characteristics are read through the layers every time they are
 * asked for (613) and never stored: printed or token values, then type changes,
 * then abilities, then power and toughness with counters, by timestamp. State-based
 * actions, mana and sickness read the result.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { characteristics, intrinsic, sick } from "../src/core/characteristics.ts";
import { matches, tableWorld } from "../src/core/selectors.ts";
import { nextDecision, advance, apply } from "../src/core/decisions.ts";
import type { Registration } from "../src/core/language.ts";

/** The pinned matchup, with Green Stompy's Archdruid for a lord. */
const deal = (green = "Mono-Green Landfall") => start(standard, [{ name: "Green", deck: deck(green) }, { name: "Red", deck: deck("Mono-Red Aggro") }], "layers");
const find = (table: Table, card: string, nth = 0) => [...table.things.values()].filter((one) => one.card === card)[nth]!;
const enter = (table: Table, card: string, registers: Registration[] = [], nth = 0) => {
	const object = find(table, card, nth);
	commit(table, [{ do: "move", what: object.id, to: "battlefield", reason: "game-setup", registers }], "game-setup");
	return table.things.get(object.id)!;
};
const words = (basis: string, list: string[]): Registration => ({ basis, kind: "continuous", affects: { is: "this" }, change: { words: list } });

test("characteristics apply by layer and timestamp, and nothing derived is stored", () => {
	const table = deal();
	const hydra = enter(table, "Mossborn Hydra", [words("Trample", ["trample"])]);
	commit(table, [{ do: "counters", what: hydra.id, kind: "+1/+1", amount: 3 }], "resolve");
	commit(table, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: { id: hydra.id, incarnation: hydra.incarnation }, text: "power doubled", change: { power: 3 } } }], "resolve");
	const read = characteristics(table, hydra)!;
	assert.deepEqual([read.power, read.toughness, read.words], [6, 3, ["trample"]], "printed 0/0, three counters and +3/+0 in 7c");
	assert.equal("power" in hydra, false, "the object stores none of it");

	// A lord affects other Elves, not itself, whenever it is read.
	const stompy = deal("Green Stompy");
	const elf = enter(stompy, "Llanowar Elves");
	enter(stompy, "Elvish Archdruid", [{ basis: "Other Elf creatures you control get +1/+1.", kind: "continuous",
		affects: { types: ["creature"], subtypes: ["Elf"], controller: "you", other: true }, change: { power: 1, toughness: 1 } }]);
	assert.deepEqual([characteristics(stompy, elf)!.power, characteristics(stompy, find(stompy, "Elvish Archdruid"))!.power], [2, 2]);
	const elves = enter(table, "Llanowar Elves");

	// Setting land subtypes removes the land's own abilities and gives the basic type's mana (305.7).
	const village = enter(table, "Ba Sing Se", [{ basis: "{T}: Add {G}.", kind: "mana", cost: { tap: true }, colors: ["G"] }]);
	const zhao = enter(table, "Zhao, the Moon Slayer", [words("Menace", ["menace"]), { basis: "As long as Zhao has a conqueror counter on him, nonbasic lands are Mountains.",
		kind: "continuous", if: { amount: { counters: "conqueror", on: "this" }, atLeast: 1 }, affects: { types: ["land"], not: { supertypes: ["basic"] } },
		change: { subtypes: { set: ["Mountain"], of: "land" } } }]);
	assert.equal(characteristics(table, village)!.registrations.length, 1, "no conqueror counter, no change");
	commit(table, [{ do: "counters", what: zhao.id, kind: "conqueror", amount: 1 }], "resolve");
	const mountain = characteristics(table, village)!;
	assert.deepEqual([mountain.subtypes, mountain.registrations, intrinsic(mountain)], [["Mountain"], [], ["R"]]);
	assert.deepEqual(characteristics(table, find(table, "Forest"))?.subtypes, ["Forest"], "a library card reads printed");

	// Becoming a creature with every creature type, and keeping it.
	const sanctuary = enter(table, "Soulstone Sanctuary");
	commit(table, [{ do: "note", note: { kind: "label", by: 1, until: "indefinite", on: { id: sanctuary.id, incarnation: sanctuary.incarnation }, text: "a 3/3 creature with vigilance and all creature types",
		change: { types: { add: ["creature"] }, subtypes: { allCreatureTypes: true }, base: { power: 3, toughness: 3 }, words: ["vigilance"] } } }], "resolve");
	const animated = characteristics(table, sanctuary)!;
	assert.deepEqual([animated.types, animated.power, animated.words], [["land", "creature"], 3, ["vigilance"]]);
	assert.ok(matches({ world: tableWorld(table), controller: 1 }, sanctuary, { subtypes: ["Lizard"], controller: "you" }), "all creature types makes it a Lizard");
	assert.ok(!matches({ world: tableWorld(table), controller: 1 }, sanctuary, { subtypes: ["Equipment"] }), "but not an artifact type");
	assert.equal(characteristics(table, sanctuary)!.subtypes.includes("Mountain"), true, "Zhao's effect, earlier, still makes it a Mountain");

	// Replacing creature subtypes keeps the land and other subtypes.
	const kellan = enter(table, "Kellan, Planar Trailblazer");
	commit(table, [{ do: "note", note: { kind: "label", by: 1, until: "indefinite", on: { id: kellan.id, incarnation: kellan.incarnation }, text: "a Human Faerie Detective",
		change: { subtypes: { set: ["Human", "Faerie", "Detective"], of: "creature" } } } }], "resolve");
	assert.deepEqual(characteristics(table, kellan)!.subtypes, ["Human", "Faerie", "Detective"]);

	// Haste lifts summoning sickness; without it a new creature is sick.
	const challenger = enter(table, "Emberheart Challenger", [words("Haste", ["haste"])]);
	assert.equal(sick(table, challenger), false);
	assert.equal(sick(table, elves), true);

	// Until end of turn ends at cleanup, and the reading follows.
	for (let guard = 0; table.cursor.turn === 1 && guard < 500; guard++) {
		const decision = nextDecision(table);
		if (!decision) advance(table);
		else apply(table, decision.situation === "pregame" ? "keep" : decision.options[0]!.id, "engine", "forced");
	}
	assert.equal(characteristics(table, hydra)!.power, 3, "the doubled power ended with the turn; the counters stay");
});

test("state-based actions read characteristics, and the legend rule asks which to keep", () => {
	const table = deal();
	while (!table.opening || nextDecision(table)?.situation === "pregame" || table.cursor.priority === null) {
		const decision = nextDecision(table);
		if (decision) apply(table, decision.situation === "pregame" ? "keep" : decision.options[0]!.id, "engine", "forced");
		else advance(table);
	}
	const elves = enter(table, "Llanowar Elves");
	const hydra = enter(table, "Mossborn Hydra");
	const smaug = [enter(table, "Smaug the Magnificent"), enter(table, "Smaug the Magnificent", [], 1)];
	commit(table, [{ do: "note", note: { kind: "label", by: 0, until: "end-of-turn", on: { id: elves.id, incarnation: elves.incarnation }, text: "indestructible", change: { words: ["indestructible"] } } },
		{ do: "damage", source: hydra.id, target: { id: elves.id, incarnation: elves.incarnation }, amount: 3 }], "resolve");
	const decision = nextDecision(table)!;
	assert.equal(decision.situation, "state-based");
	assert.deepEqual(decision.options.map((option) => option.id), smaug.map((one) => `keep:${one.id}`), "the controller chooses which Smaug stays");
	apply(table, `keep:${smaug[1]!.id}`, "model", "chosen");
	assert.equal(table.things.get(hydra.id)!.zone, "graveyard", "a 0/0 dies in the same group");
	assert.equal(table.things.get(elves.id)!.zone, "battlefield", "indestructible ignores lethal damage");
	assert.deepEqual(cardsIn(table, "battlefield").filter((one) => one.card === "Smaug the Magnificent").map((one) => one.id), [smaug[1]!.id]);
});
