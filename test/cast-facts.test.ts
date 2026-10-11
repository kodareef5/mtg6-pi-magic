/** Casting facts use the spell face and announced X, independently of payment.
 * Event references retain the old stack incarnation through resolution and replay. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { characteristics, spellCharacteristics } from "../src/core/characteristics.ts";
import { manaBudget } from "../src/core/budget.ts";
import { amount, matches, select, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { eventScope } from "../src/core/triggers.ts";
import { activationChanges, printedCast } from "../src/core/procedures.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, finish, main, offered, passBoth, place } from "./play.ts";

test("cast queries preserve mana value, color and old spell facts without exposing hidden cards", () => {
	for (const x of [1, 3]) {
		const table = start(standard, [{ name: "Control", deck: deck("4c Control") }, { name: "Izzet", deck: deck("Izzet Aggro") }], `cast-facts-${x}`);
		// These source-backed watches isolate casting; neither is a complete card assessment.
		establish(table, 0, "Thor, God of Thunder", [{ kind: "watch", basis: table.printed["Thor, God of Thunder"]!.oracle.split("\n")[2]!,
			event: { on: "cast", by: "you", of: { zones: ["stack"], not: { types: ["creature"] } } },
			effect: { targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: { manaValue: "event:object" } }] } }]);
		establish(table, 1, "Scalding Viper // Steam Clean", [{ face: 0, kind: "watch", basis: table.printed["Scalding Viper // Steam Clean"]!.faces![0]!.oracle,
			event: { on: "cast", by: "opponent", of: { zones: ["stack"], manaValue: { atMost: 3 } } },
			effect: { instructions: [{ do: "damage", to: "event:player", amount: 1 }] } }]);
		const [day] = place(table, 0, "hand", "Day of Black Sun");
		const [pierce] = place(table, 1, "hand", "Spell Pierce");
		main(table, 0);
		assert.equal(characteristics(table, day!)!.manaValue, 2, "X is zero in hand");
		commit(table, [{ do: "add-mana", who: 0, colors: Array(x + 2).fill("B"), spendOnly: { zones: ["stack"], manaValue: { atLeast: x + 2 }, colors: ["B"] } },
			{ do: "add-mana", who: 1, colors: ["U"] }], "game-setup");
		const cast: Procedure = { source: { card: day!.card!, zones: ["hand"], controller: "self" }, claim: "Day of Black Sun", basis: table.printed[day!.card!]!.oracle,
			timing: "spell", instructions: [{ do: "modify", every: { types: ["creature"], manaValue: { atMost: { x: true } } }, until: "end-of-turn", change: { loseAbilities: true }, as: "small" },
				{ do: "destroy", what: "bound:small" }] };
		const choices = offered(table, cast);
		assert.ok(choices.length); assert.ok(choices.every((one) => one.activation.x === x), "restricted funding reads the announced X");
		const forged = structuredClone(choices[0]!.activation); forged.x = 0;
		assert.throws(() => activationChanges(table, forged), /restricted|may not be spent/, "execution rechecks the spell's value");
		const prefix = structuredClone(table), before = table.ledger.length;
		announce(table, cast);
		assert.equal(characteristics(table, day!)!.manaValue, x + 2);
		assert.equal("manaValue" in day!, false, "no derived value is stored on the object");
		assert.equal(table.waiting.length, x === 1 ? 2 : 1, "Viper reads value, including X");
		const packet = focus(workFrame(table, 0), startingIntent(0));
		assert.equal(packet.objects.find((one) => one.id === day!.id)!.manaValue, x + 2);
		assert.deepEqual(packet.objects.find((one) => one.id === day!.id)!.colors, ["B"]);
		const visible = { world: viewWorld(project(table, 0)), controller: 0 };
		assert.equal(select(visible, { zones: ["hand"], controller: "opponent", colors: ["U"] }).length, 0);
		assert.equal(select(visible, { zones: ["hand"], controller: "opponent", manaValue: { atLeast: 0 } }).length, 0);
		assert.equal(select(visible, { zones: ["hand"], controller: "opponent", colors: [] }).length, 0);
		if (x === 1) continue;
		const resolved = structuredClone(table);
		apply(resolved, nextDecision(resolved)!.options[0]!.id, "model", "chosen"); passBoth(resolved); finish(resolved);
		passBoth(resolved); finish(resolved);
		assert.equal([...resolved.things.values()].find((one) => one.card === "Scalding Viper // Steam Clean" && one.incarnation > 0)!.zone, "graveyard",
			"the computed bound selects Viper and the modification binds it for destruction");
		assert.equal([...resolved.things.values()].find((one) => one.card === "Thor, God of Thunder")!.zone, "battlefield");
		assert.deepEqual(relive(structuredClone(prefix), resolved.ledger.slice(before)), resolved);
		const trigger = structuredClone(table.waiting[0]!);
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		apply(table, "pass", "model", "chosen");
		announce(table, { source: { card: pierce!.card!, zones: ["hand"], controller: "self" }, claim: "Spell Pierce", basis: table.printed[pierce!.card!]!.oracle,
			timing: "spell", targets: [{ object: { zones: ["stack"], not: { types: ["creature"] } } }],
			instructions: [{ do: "counter", what: "target:0", unless: { who: "controller:target:0", pays: { mana: "{2}" } } }] },
			(one) => one.activation.targets[0]!.some((target) => "id" in target && target.id === day!.id));
		passBoth(table); finish(table);
		assert.equal(day!.zone, "graveyard"); assert.equal(characteristics(table, day!)!.manaValue, 2);
		const world = tableWorld(table), scope = { world, controller: 0, event: eventScope(world, trigger.event) };
		assert.equal(amount(scope, { manaValue: "event:object" }), 5, "the trigger reads the departed stack incarnation");
		assert.equal(amount(scope, { history: "cast", by: "you", of: { zones: ["stack"], manaValue: { atLeast: 5 }, colors: ["B"] } }), 1);
		const pending = structuredClone(table), from = table.ledger.length;
		passBoth(table); finish(table);
		assert.equal(table.seats[1]!.life, 15, "Thor still deals five after the spell was countered");
		assert.deepEqual(relive(pending, table.ledger.slice(from)), table, "a clone with the trigger pending retains its spell facts");
		assert.deepEqual(relive(prefix, table.ledger.slice(before)), table, "the entire cast, counter and trigger sequence replays");
	}
	const colors = start(standard, [{ name: "Spells", deck: deck("Izzet Spellementals") }, { name: "Other", deck: deck("Izzet Aggro") }], "cast-colors");
	const hydro = establish(colors, 0, "Hydro-Man, Fluid Felon", [{ kind: "watch", basis: colors.printed["Hydro-Man, Fluid Felon"]!.oracle.split("\n")[0]!,
		event: { on: "cast", by: "you", of: { zones: ["stack"], colors: ["U"] } }, if: { is: "this", matches: { types: ["creature"] } },
		effect: { instructions: [{ do: "modify", what: "this", until: "end-of-turn", change: { power: 1, toughness: 1 } }] } }]);
	const [charm, burst] = place(colors, 0, "hand", "Prismari Charm", "Burst Lightning");
	main(colors, 0); commit(colors, [{ do: "add-mana", who: 0, colors: ["U", "R", "R", "C", "C", "C", "C"] }], "game-setup");
	const prior = structuredClone(colors), from = colors.ledger.length;
	announce(colors, { source: { card: charm!.card!, zones: ["hand"], controller: "self" }, claim: "Prismari damage", basis: "Prismari Charm deals 1 damage to each of one or two targets.",
		timing: "spell", targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 1 }] });
	assert.equal(colors.waiting.length, 1, "a multicolored blue spell is blue");
	const scope = { world: tableWorld(colors), controller: 0 };
	assert.ok(matches(scope, charm!, { zones: ["stack"], colors: ["W", "U"] }));
	assert.ok(!matches(scope, charm!, { zones: ["stack"], not: { colors: ["U"] } }));
	assert.ok(matches(scope, charm!, { zones: ["stack"], not: { colors: [] } }));
	apply(colors, nextDecision(colors)!.options[0]!.id, "model", "chosen"); passBoth(colors); finish(colors);
	assert.equal(characteristics(colors, hydro)!.power, 3);
	passBoth(colors); finish(colors);
	assert.equal(amount({ world: tableWorld(colors), controller: 0 }, { history: "cast", of: { zones: ["stack"], colors: ["U"] } }), 1);
	const kicked = announce(colors, { source: { card: burst!.card!, zones: ["hand"], controller: "self" }, claim: "Kicked Burst Lightning", basis: colors.printed[burst!.card!]!.oracle,
		timing: "spell", cost: { mana: "{4}{R}" }, targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 4 }] });
	assert.equal(kicked.activation.cost.generic + kicked.activation.cost.colors.length, 5);
	assert.equal(characteristics(colors, colors.things.get(kicked.activation.source.id)!)!.manaValue, 1, "kicker changes payment, not mana value");
	assert.equal(colors.waiting.length, 0, "a red spell does not trigger the blue-spell watch");
	passBoth(colors); finish(colors);
	assert.deepEqual(relive(prior, colors.ledger.slice(from)), colors);
	const hybrid = start(standard, [{ name: "Life", deck: deck("Lifegain") }, { name: "Other", deck: deck("Izzet Aggro") }], "hybrid-facts");
	const [emptiness] = place(hybrid, 0, "hand", "Emptiness");
	assert.equal(characteristics(hybrid, emptiness!)!.manaValue, 6);
	assert.deepEqual(characteristics(hybrid, emptiness!)!.colors.sort(), ["B", "W"], "hybrid symbols supply both colors before payment");
});

test("a proposed spell uses the same scoped characteristics as its cast face without leaking the hand", () => {
	const table = start(standard, [{ deck: deck("Boros Dragons") }, { deck: deck("Azorius Control") }], "spell-characteristics");
	const card = "Twinmaw Stormbrood // Charring Bite", dragon = place(table, 0, "hand", card)[0]!;
	editWork(table, 0, [{ do: "package.put", package: { card, printedCast: true, registers: [
		{ kind: "continuous", face: 0, basis: "Flying", affects: { is: "this", zones: ["stack", "battlefield"] }, change: { words: ["flying"] } },
		{ kind: "watch", face: 0, basis: "When this creature enters, you gain 5 life.", event: { on: "enters", of: { is: "this" } }, effect: { instructions: [{ do: "life", who: "you", amount: 5 }] } },
	], procedures: [{ face: 1, claim: "Cast Charring Bite", basis: table.printed[card]!.faces![1]!.oracle, source: { card, zones: ["hand"] }, timing: "spell",
		targets: [{ object: { types: ["creature"], not: { words: ["flying"] } } }], instructions: [{ do: "damage", to: "target:0", amount: 5 }] }] } }], "spell-terms");
	main(table, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: ["W", "W", "W", "W", "W", "W"], spendOnly: { zones: ["stack"], words: ["flying"] } }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length, frame = workFrame(table, 0), shown = frame.view.objects!.find((one) => one.id === dragon.id)!;
	const expected = spellCharacteristics(frame.view, shown, 0)!;
	assert.ok(expected.words.includes("flying")); assert.equal(expected.manaValue, 6);
	const omen = spellCharacteristics(frame.view, shown, 0, 1)!;
	assert.equal(omen.words.includes("flying"), false); assert.deepEqual(omen.types, ["sorcery"]); assert.equal(omen.manaValue, 2);
	assert.ok(offered(table, printedCast(card, table.printed[card]!)).length, "restricted funding reads the future spell's flying");
	assert.equal(manaBudget(frame, printedCast(card, table.printed[card]!), shown).payableBeforeNewResources, true, "the resource forecast reads that same flying");
	for (const viewer of [1, "spectator"] as const) assert.ok(!project(table, viewer).objects!.some((one) => one.id === dragon.id));
	assert.deepEqual(table, initial, "projecting a cast changes neither the card nor the accepted terms");
	announce(table, printedCast(card, table.printed[card]!));
	assert.deepEqual(characteristics(table, dragon), expected);
	const pending = structuredClone(table), at = table.ledger.length;
	passBoth(table); finish(table);
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table); finish(table);
	assert.equal(table.seats[0]!.life, 25); assert.ok(characteristics(table, dragon)!.words.includes("flying"));
	assert.equal(amount({ world: tableWorld(table), controller: 0 }, { history: "cast", by: "you", of: { zones: ["stack"], words: ["flying"] } }), 1);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
});
