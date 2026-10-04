/**
 * The committed standard list. It is data in the repo, so a change to it that
 * breaks the reader or the deck check fails here rather than in a game.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { card, checkDeck, copiesAllowed, load } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";
import { basePT, intrinsicMana, manaCost, permanentSpell, printedFacts } from "../src/core/printed.ts";
import { commit, start } from "../src/core/commit.ts";
import { priorityMoves } from "../src/core/priority.ts";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { matchup, expand } from "../tools/matchup-fixture.ts";

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

test("registered decks satisfy Standard size, copy limits and pinned legality", () => {
	assert.deepEqual(checkDeck(universe, Array(60).fill("Forest"), standard), []);
	assert.equal(copiesAllowed(universe, "Forest", standard), Infinity);
	assert.equal(matchup.legalityDate, universe.generated);
	assert.equal(matchup.decks.length, 2);
	for (const deck of matchup.decks) {
		const main = expand(deck.main), sideboard = expand(deck.sideboard);
		assert.equal(main.length, 60);
		assert.equal(sideboard.length, 15);
		assert.deepEqual(checkDeck(universe, main, standard), []);
		assert.deepEqual(checkDeck(universe, [...main, ...sideboard], standard), [], "copy limits include the sideboard");
	}
});

test("four is the limit on a nonbasic", () => {
	assert.equal(copiesAllowed(universe, "Llanowar Elves", standard), 4);
	const deck = [...Array(55).fill("Forest"), ...Array(5).fill("Llanowar Elves")];
	assert.deepEqual(checkDeck(universe, deck, standard), [
		"5 copies of Llanowar Elves, 4 allowed",
	]);
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

	const table = start(standard, [{ deck: [...Array(59).fill("Forest"), "Fabled Passage"] }, { deck: Array(60).fill("Mountain") }], "printed");
	commit(table, [{ do: "move", what: "0-59", to: "hand", reason: "draw" }, { do: "move", what: "0-0", to: "hand", reason: "draw" }], "draw");
	table.cursor.steps = ["precombat-main"];
	assert.deepEqual(priorityMoves(table, 0).map((move) => move.option.label), ["Pass", "Play Fabled Passage", "Play Forest"], "any land can be played");
	assert.equal(priorityMoves(table, 0)[1]!.option.shows, "No package is prepared: it enters with nothing registered.", "an entry is never silent");
	assert.ok(table.printed["Fabled Passage"] && !table.printed["Llanowar Elves"], "a table holds facts for registered names only");

	// Core must not branch on a card name. Comments are excluded.
	const names = new Set(matchup.decks.flatMap((deck) => [...Object.keys(deck.main), ...Object.keys(deck.sideboard)]));
	for (const file of readdirSync("src/core").filter((name) => name.endsWith(".ts"))) {
		const code = readFileSync(join("src/core", file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
		for (const name of names) assert.equal(new RegExp(`["'\`]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`]`).test(code), false, `${file} names ${name}`);
	}
});

test("an unsupported card refuses its deck", () => {
	assert.deepEqual(checkDeck(universe, [...Array(4).fill("Shock"), ...Array(56).fill("Mountain")], standard, new Set(["Shock"])), ["Shock is not supported yet"]);
});
