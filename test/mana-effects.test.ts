/** A chosen type and the effect of spending mana belong to their physical source and payment.
 * The positions isolate mana and casting; creature entry and combat abilities are outside this fixture. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { characteristics, creatureTypeChoices } from "../src/core/characteristics.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { activationChanges, printedCast } from "../src/core/procedures.ts";
import { manaTerms, produces } from "../src/core/funding.ts";
import { matches, tableWorld } from "../src/core/selectors.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { manaLines } from "../src/context/strategy-facts.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, finish, main, offered, pack, passBoth, place, step } from "./play.ts";

const card = "Cavern of Souls", protectedWord = "can't be countered", registers = pack(card);
const colored = registers.find((one) => one.kind === "mana" && one.any)!;
const build = () => start(standard, [{ deck: deck("Rakdos Lizards") }, { deck: deck("Dimir Control") }], "chosen-mana");

test("entry choices, frozen mana restrictions and spent spell effects survive responses and replay", () => {
	for (const protect of [false, true]) {
		const table = build(); main(table, 0);
		editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, registers } }], "cavern");
		const land = place(table, 0, "hand", card)[0]!;
		place(table, 0, "battlefield", "Mountain"); place(table, 0, "hand", "Master of Barbs", "Fireglass Mentor", "Burst Lightning");
		place(table, 1, "hand", "Essence Scatter");
		commit(table, [{ do: "add-mana", who: 1, colors: ["U", "C"] }], "game-setup");
		const prefix = structuredClone(table), before = table.ledger.length;
		apply(table, `land:${land.id}`, "model", "chosen");
		const entry = structuredClone(table), atEntry = table.ledger.length;
		const choices = nextDecision(table)!.options;
		assert.equal(choices.length, creatureTypeChoices().length); assert.ok(choices.length > 250);
		assert.ok(choices.some((one) => one.label.startsWith("Choose Time Lord ")));
		assert.ok(!choices.some((one) => one.label.startsWith("Choose Equipment ")));
		assert.deepEqual(table, entry, "listing the complete type list changes nothing");
		apply(table, "entry:0:choose:creatureType:Lizard", "model", "chosen");
		assert.equal(land.zone, "battlefield"); assert.deepEqual(land.choices, { creatureType: "Lizard" });
		assert.ok(project(table, "spectator").table.some((line) => line.includes("creatureType: Lizard")));
		const spell = printedCast("Master of Barbs", table.printed["Master of Barbs"]!);
		const options = offered(table, spell);
		assert.equal(new Set(options.map((one) => one.option.id)).size, options.length, "colorless and protected payments have different ids");
		assert.ok(options.some((one) => !one.activation.words?.length)); assert.ok(options.some((one) => one.activation.words?.includes(protectedWord)));
		const forgery = structuredClone(options.find((one) => !one.activation.words?.length)!.activation);
		forgery.funding!.find((one) => one.source.id === land.id)!.spellWords = [protectedWord];
		assert.throws(() => activationChanges(table, forgery), /registered mana ability/);
		const lines = manaLines(workFrame(table, 0)).join(" ");
		assert.ok(lines.includes("Lizard creature spells") && lines.includes(protectedWord));
		const chosen = announce(table, spell, (one) => !!one.activation.words?.includes(protectedWord) === protect);
		const object = table.things.get(chosen.activation.source.id)!;
		assert.equal(characteristics(table, object)!.words.includes(protectedWord), protect);
		const mid = structuredClone(table), at = table.ledger.length;
		apply(table, "pass", "model", "chosen");
		const counter: Procedure = { source: { card: "Essence Scatter", zones: ["hand"] }, claim: "Counter a creature spell", basis: table.printed["Essence Scatter"]!.oracle,
			timing: "spell", targets: [{ object: { zones: ["stack"], types: ["creature"] } }], instructions: [{ do: "counter", what: "target:0" }] };
		announce(table, counter); passBoth(table);
		if (protect) step(table, (label) => label.startsWith("Apply can't be countered"));
		finish(table);
		if (protect) { assert.equal(object.zone, "stack"); passBoth(table); finish(table); }
		assert.equal(object.zone, protect ? "battlefield" : "graveyard");
		assert.ok(!characteristics(table, object)!.words.includes(protectedWord), "the spent mana protects only the spell incarnation");
		assert.deepEqual(relive(mid, table.ledger.slice(at)), table);
		assert.deepEqual(relive(entry, table.ledger.slice(atEntry)), table);
		assert.deepEqual(relive(prefix, table.ledger.slice(before)), table);
	}

	const table = build(); main(table, 0);
	const [land, other] = place(table, 0, "hand", card, card);
	const enter = (id: string, type: string) => {
		commit(table, beforeEntry(table, [{ do: "move", what: id, to: "battlefield", reason: "resolve", registers }], "resolve"), "resolve");
		apply(table, `entry:0:choose:creatureType:${type}`, "model", "chosen");
	};
	enter(land!.id, "Lizard"); enter(other!.id, "Dragon");
	place(table, 0, "hand", "Hired Claw", "Fireglass Mentor", "Burst Lightning");
	const claw = printedCast("Hired Claw", table.printed["Hired Claw"]!);
	assert.ok(offered(table, claw).every((one) => one.activation.funding![0]!.source.id === land!.id));
	assert.equal(offered(table, printedCast("Fireglass Mentor", table.printed["Fireglass Mentor"]!)).length, 0, "the other type cannot supply the second colored symbol");
	const source = { world: tableWorld(table), controller: 0, source: land! };
	const candidate = table.things.get(offered(table, claw)[0]!.activation.source.id)!;
	const spending = { ...candidate, zone: "stack" as const };
	assert.ok(produces(colored, source).every((one) => matches(source, spending, one.spendOnly!)));
	assert.ok(produces(colored, { ...source, source: { ...land!, choices: undefined } }).every((one) => !matches(source, spending, one.spendOnly!)), "an absent choice cannot fund any subtype");
	const terms = manaTerms(colored.kind === "mana" ? colored : {}, source);
	assert.deepEqual(terms.spendOnly!.subtypes, ["Lizard"]);
	assert.equal(matches(source, spending, terms.spendOnly!, { ...characteristics(table, candidate)!, subtypes: ["Shapeshifter"], allCreatureTypes: true }), true, "all creature types matches the chosen type");
	assert.equal(matches(source, spending, terms.spendOnly!, { ...characteristics(table, candidate)!, types: ["kindred", "artifact"], allCreatureTypes: true }), false, "kindred is not a creature spell");
	const burst: Procedure = { source: { card: "Burst Lightning", zones: ["hand"] }, claim: "Burst Lightning for two", basis: table.printed["Burst Lightning"]!.oracle,
		timing: "spell", targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
	assert.equal(offered(table, burst).length, 0, "restricted colored mana cannot pay for an instant");
	const float: Procedure = { source: { card, zones: ["battlefield"] }, claim: "Produce restricted red mana", basis: colored.basis, timing: "mana", cost: { tap: true },
		instructions: [{ do: "mana", who: "you", colors: ["R"], ...(colored.kind === "mana" ? { spendOnly: colored.spendOnly, spellWords: colored.spellWords } : {}) }] };
	announce(table, float, (one) => one.activation.source.id === land!.id);
	commit(table, [{ do: "move", what: land!.id, to: "hand", reason: "bounce" }], "bounce");
	assert.equal(land!.choices, undefined); enter(land!.id, "Dragon");
	assert.deepEqual(table.seats[0]!.pool[0]!.spendOnly!.subtypes, ["Lizard"], "floating mana retains the old choice");
	commit(table, [{ do: "add-mana", who: 0, colors: ["R"] }], "game-setup");
	const choices = offered(table, claw);
	assert.ok(choices.some((one) => !one.activation.words?.length), "unspent protected mana does not affect another payment");
	assert.ok(choices.some((one) => one.activation.words?.includes(protectedWord)), "the old mana still funds the original type");
	const prefix = structuredClone(table), at = table.ledger.length;
	const cast = announce(table, claw, (one) => !!one.activation.words?.includes(protectedWord));
	passBoth(table); finish(table);
	assert.equal(table.things.get(cast.activation.source.id)!.zone, "battlefield");
	assert.equal(table.seats[0]!.pool.length, 1);
	assert.deepEqual(relive(prefix, table.ledger.slice(at)), table);
});
