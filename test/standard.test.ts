/**
 * The committed standard list. It is data in the repo, so a change to it that
 * breaks the reader or the deck check fails here rather than in a game.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { card, checkDeck, copiesAllowed, load } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";

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

test("sixty basics is a legal standard deck", () => {
	assert.deepEqual(checkDeck(universe, Array(60).fill("Forest"), standard), []);
	assert.equal(copiesAllowed(universe, "Forest", standard), Infinity);
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
