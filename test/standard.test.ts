/**
 * The committed standard list. It is data in the repo, so a change to it that
 * breaks the reader or the deck check fails here rather than in a game.
 */

import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { card, copiesAllowed, load } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import { basePT, intrinsicMana, manaCost, permanentSpell, printedFacts } from "../src/core/printed.ts";
import { commit, start } from "../src/core/commit.ts";
import { priorityMoves } from "../src/core/priority.ts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchup, decks, matchTable } from "../tools/matchup-fixture.ts";
import { collection, listed, problems, register } from "../src/core/decks.ts";
import { cardsIn } from "../src/core/table.ts";

const universe = load("cards/standard.tsv");

test("every card in the list is standard legal", () => {
	assert.equal(universe.cards.size, 5164);
	for (const one of universe.cards.values()) assert.equal(one.legal.standard, "L");
});

test("the cards milestone one plays are there, with their text", () => {
	assert.equal(card(universe, "Forest").type, "Basic Land — Forest");
	assert.equal(card(universe, "Forest").oracle, "({T}: Add {G}.)");
	assert.equal(card(universe, "Llanowar Elves").mana, "{G}");
	assert.equal(card(universe, "Llanowar Elves").cmc, 1);
});

test("a card legal in an older format is absent, not marked", () => {
	assert.throws(() => card(universe, "Ancient Tomb"));
});

test("every kept deck registers for Standard, and the matchup lists keep their sideboards", () => {
	assert.equal(copiesAllowed(universe, "Forest", standard), Infinity);
	assert.equal(matchup.legalityDate, universe.generated);
	for (const kept of collection().values()) assert.deepEqual(problems(universe, kept, standard), [], `${kept.name} registers`);
	assert.deepEqual(decks.map((one) => [listed(one.main).length, listed(one.sideboard).length]), [[60, 15], [60, 15]]);
	const green = decks[0]!;
	assert.ok(problems(universe, { ...green, sideboard: { ...green.sideboard, "Sazh's Chocobo": 1 } }, standard)
		.includes("5 copies of Sazh's Chocobo across deck and sideboard, 4 allowed"), "copy limits include the sideboard (100.4a)");
	assert.deepEqual(problems(universe, { ...green, sideboard: { ...green.sideboard, "Snakeskin Veil": 1 } }, standard).filter((one) => one.includes("sideboard cards")),
		["16 sideboard cards, standard allows 15"]);
	const table = matchTable("registered");
	assert.equal(table.things.size, 150, "main decks are libraries and sideboards are outside the game");
	assert.equal([...table.things.values()].filter((one) => one.zone === "outside").length, 30);
});

test("four is the limit on a nonbasic", () => {
	assert.equal(copiesAllowed(universe, "Llanowar Elves", standard), 4);
	const stompy = deck("Green Stompy");
	assert.deepEqual(problems(universe, { ...stompy, main: { ...stompy.main, "Llanowar Elves": 5 } }, standard), ["5 copies of Llanowar Elves, 4 allowed"]);
});

test("oracle text with several lines survives the round trip", () => {
	const many = [...universe.cards.values()].filter((one) => one.oracle.includes("\n"));
	assert.ok(many.length > 500, `${many.length} cards with a line break`);
	for (const one of many.slice(0, 200)) assert.equal(one.oracle.includes("\\n"), false);
});

test("printed facts decide land plays, default casts, intrinsic mana and creature bodies, and core names no card", () => {
	const printed = printedFacts(universe, ["Forest", "Fabled Passage", "Llanowar Elves", "Shock", "Mossborn Hydra", "Lightning Strike", "Meltstrider's Resolve"]);
	assert.equal(printed["Forest"]!.text, false, "reminder text adds nothing a basic land type does not grant");
	assert.deepEqual(intrinsicMana(printed["Forest"]), ["G"]);
	assert.ok(permanentSpell(printed["Llanowar Elves"]) && permanentSpell(printed["Mossborn Hydra"]));
	assert.ok(!permanentSpell(printed["Shock"]) && !permanentSpell(printed["Fabled Passage"]) && !permanentSpell(printed["Meltstrider's Resolve"]),
		"instants, lands and Auras need more than entering");
	assert.deepEqual(intrinsicMana(printed["Fabled Passage"]), []);
	assert.deepEqual(basePT(printed["Llanowar Elves"]), { power: 1, toughness: 1 });
	assert.deepEqual(basePT(printed["Mossborn Hydra"]), { power: 0, toughness: 0 }, "its entry counter is text, not a printed fact");
	assert.equal(basePT(printed["Shock"]), undefined);
	assert.deepEqual(manaCost(printed["Lightning Strike"]), { tap: false, generic: 1, colors: ["R"] });

	const table = start(standard, [{ deck: deck("Mono-Green Landfall") }, { deck: deck("Red Burn") }], "printed");
	const first = (card: string) => cardsIn(table, "library", 0).find((one) => one.card === card)!.id;
	commit(table, [{ do: "move", what: first("Fabled Passage"), to: "hand", reason: "draw" }, { do: "move", what: first("Forest"), to: "hand", reason: "draw" }], "draw");
	table.cursor.steps = ["precombat-main"];
	assert.deepEqual(priorityMoves(table, 0).map((move) => move.option.label), ["Pass", "Play Fabled Passage", "Play Forest"], "any land can be played");
	assert.equal(priorityMoves(table, 0)[1]!.option.shows, "No package is prepared: it enters with nothing registered.", "an entry is never silent");
	assert.ok(table.printed["Fabled Passage"] && !table.printed["Bear Cub"], "a table holds facts for registered names only");

	// Core must not branch on a card name. Comments are excluded.
	const names = new Set([...collection().values()].flatMap((kept) => [...Object.keys(kept.main), ...Object.keys(kept.sideboard)]));
	for (const file of readdirSync("src/core").filter((name) => name.endsWith(".ts"))) {
		const code = readFileSync(join("src/core", file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
		for (const name of names) assert.equal(new RegExp(`["'\`]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(code), false, `${file} names ${name}`);
	}
});

test("an unsupported card refuses its deck", () => {
	assert.deepEqual(problems(universe, deck("Red Burn"), standard, new Set(["Shock"])), ["Shock is not supported yet"]);
	assert.throws(() => register(universe, { ...deck("Red Burn"), main: { ...deck("Red Burn").main, Shock: 5 } }, standard), /Red Burn cannot be registered for standard/);
});
