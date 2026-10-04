/**
 * The card universe reader, against a fixture in the shape the generator writes.
 */

import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { card, checkDeck, copiesAllowed, load } from "../src/core/cards.ts";
import { standard } from "../src/core/format.ts";

const COLUMNS = [
	"name", "mana", "cmc", "type", "stats", "colors", "identity", "layout",
	"rarities", "keywords", "reserved", "gamechanger",
	"standard", "pioneer", "vintage",
	"printings", "oracle", "oracle_id",
];

const row = (
	name: string,
	type: string,
	oracle: string,
	legality: [string, string, string],
) =>
	[
		name, "{G}", "1", type, "", "G", "G", "normal", "c", "", "0", "0",
		...legality, "dsk:1:c", oracle, `id-${name}`,
	].join("\t");

const fixture = join(tmpdir(), `pi-magic-cards-${process.pid}.tsv`);
writeFileSync(
	fixture,
	[
		"# Magic: The Gathering - fixture",
		"# Generated: never",
		COLUMNS.join("\t"),
		row("Forest", "Basic Land — Forest", "({T}: Add {G}.)", ["L", "L", "L"]),
		row("Llanowar Elves", "Creature — Elf Druid", "{T}: Add {G}.", ["L", "L", "L"]),
		row("Ancient Tomb", "Land", "{T}: Add {C}{C}.\\nThis deals 2 damage to you.", ["-", "L", "L"]),
		row("Channel", "Sorcery", "Until end of turn, any time you could...", ["-", "-", "B"]),
		row("Sol Ring", "Artifact", "{T}: Add {C}{C}.", ["-", "-", "R"]),
		"",
	].join("\n"),
);

const universe = load(fixture);

test("it skips comments and reads every row", () => {
	assert.equal(universe.cards.size, 5);
});

test("an escaped newline comes back as a newline", () => {
	assert.equal(card(universe, "Ancient Tomb").oracle.split("\n").length, 2);
	assert.equal(card(universe, "Forest").oracle, "({T}: Add {G}.)");
});

test("an unknown card names itself in the error", () => {
	assert.throws(() => card(universe, "Black Lotus"), /No card named Black Lotus/);
});

test("a basic land is exempt from the copy limit", () => {
	assert.equal(copiesAllowed(universe, "Forest", standard), Infinity);
});

test("a nonbasic is held to the format's limit", () => {
	assert.equal(copiesAllowed(universe, "Llanowar Elves", standard), 4);
});

test("not legal, banned and restricted are three different answers", () => {
	assert.equal(copiesAllowed(universe, "Ancient Tomb", standard), 0);
	assert.equal(copiesAllowed(universe, "Channel", standard), 0);
	assert.equal(copiesAllowed(universe, "Sol Ring", { ...standard, legality: "vintage" }), 1);
});

test("a legal deck has no problems", () => {
	const deck = [
		...Array.from({ length: 56 }, () => "Forest"),
		...Array.from({ length: 4 }, () => "Llanowar Elves"),
	];
	assert.deepEqual(checkDeck(universe, deck, standard), []);
});

test("every problem is named, not just the first", () => {
	const deck = [
		...Array.from({ length: 40 }, () => "Forest"),
		...Array.from({ length: 5 }, () => "Llanowar Elves"),
		"Ancient Tomb",
		"Black Lotus",
	];
	const problems = checkDeck(universe, deck, standard);
	assert.equal(problems.length, 4);
	assert.match(problems.join("; "), /at least 60/);
	assert.match(problems.join("; "), /5 copies of Llanowar Elves, 4 allowed/);
	assert.match(problems.join("; "), /Ancient Tomb is not legal in standard/);
	assert.match(problems.join("; "), /no card named Black Lotus/);
});

test("a card that reaches outside the game is refused, because no game here holds a sideboard it can reach", () => {
	const deck = [...Array.from({ length: 56 }, () => "Island"), ...Array.from({ length: 4 }, () => "North Wind Avatar")];
	assert.match(checkDeck(universe, deck, standard).join("; "), /North Wind Avatar/);
});
