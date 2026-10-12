/** Permissions preserve their price, player, incarnation and expiration through replay.
 * The shared invariant includes mixed owners and turn expiry past 150 lines. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { activate, checkProcedure, printedCast } from "../src/core/procedures.ts";
import { castingPrices, playable } from "../src/core/permits.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import { manaBudget } from "../src/core/budget.ts";
import { project } from "../src/core/view.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { faceFacts } from "../src/core/faces.ts";
import { permissionMana } from "../src/core/permits.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, establish, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("a permission carries its printed price and every stack departure through replay", () => {
	for (const route of ["resolve", "counter", "bounce"] as const) {
		const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Dimir Control") }], `flashback-${route}`);
		const victim = establish(table, 1, "Aegis Turtle", []);
		main(table, 0);
		place(table, 0, "hand", "Flashback", "Jeskai Revelation");
		const [sheriff] = place(table, 0, "graveyard", "Shoot the Sheriff");
		place(table, 1, "hand", "Negate");
		commit(table, [{ do: "add-mana", who: 0, colors: ["R", "B", "C", "C", "C", "C", "C", "U", "R", "W"] },
			{ do: "add-mana", who: 1, colors: ["U", "C"] }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, example("Grant flashback at the target's printed mana cost")); passBoth(table); finish(table);
		const spell: Procedure = { source: { card: "Shoot the Sheriff", zones: ["graveyard"] }, claim: "Shoot the Sheriff", basis: table.printed["Shoot the Sheriff"]!.oracle,
			timing: "spell", targets: [{ object: { types: ["creature"], not: { subtypes: ["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"] } } }],
			instructions: [{ do: "destroy", what: "target:0" }] };
		const options = offered(table, spell);
		assert.ok(options.length); assert.ok(options.every((one) => one.activation.cost.generic === 1 && one.activation.cost.colors.join("") === "B" && one.activation.leavesStack === "exile"));
		assert.equal(offered(table, { ...spell, cost: { mana: "{0}" } }).length, 0, "another alternative cost cannot replace flashback's price");
		const frame = workFrame(table, 0), known = frame.view.objects!.find((one) => one.id === sheriff!.id)!;
		assert.equal(manaBudget(frame, spell, known).cost, "{1}{B}");
		const expiry = structuredClone(table); main(expiry, 1, 2);
		assert.equal(playable(tableWorld(expiry), 0, expiry.things.get(sheriff!.id)!, 2, false), false);
		announce(table, spell, (one) => one.activation.paid.every((id) => ["B", "C"].includes(table.seats[0]!.pool.find((mana) => mana.id === id)!.color)));
		assert.equal(sheriff!.ability!.leavesStack, "exile");
		assert.ok(!table.notes.some((one) => one.kind === "permit"), "the permission note leaves, but the spell retains its departure term");
		const clone = structuredClone(table), at = table.ledger.length;
		if (route === "counter") {
			apply(table, "pass", "model", "chosen");
			announce(table, { source: { card: "Negate", zones: ["hand"] }, claim: "Negate", basis: table.printed.Negate!.oracle, timing: "spell",
				targets: [{ object: { zones: ["stack"], not: { types: ["creature"] } } }], instructions: [{ do: "counter", what: "target:0" }] });
		} else if (route === "bounce") {
			// Isolate Revelation's first instruction; this fixture does not claim complete card coverage.
			announce(table, { source: { card: "Jeskai Revelation", zones: ["hand"] }, claim: "Revelation's spell return", basis: "Return target spell or permanent to its owner's hand.", timing: "spell",
				targets: [{ object: { zones: ["stack"], types: ["instant", "sorcery"] } }], instructions: [{ do: "move", what: "target:0", to: "hand", reason: "bounce" }] });
		}
		passBoth(table); finish(table);
		assert.equal(sheriff!.zone, "exile", route);
		assert.equal(victim.zone, route === "resolve" ? "graveyard" : "battlefield");
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		commit(table, [{ do: "move", what: sheriff!.id, to: "graveyard", reason: "resolve" }], "resolve");
		assert.deepEqual(castingPrices(tableWorld(table), 0, sheriff!, table.cursor.turn), []);
		commit(table, [{ do: "move", what: sheriff!.id, to: "hand", reason: "resolve" }, { do: "add-mana", who: 0, colors: ["B", "C"] }], "game-setup");
		if (route === "resolve") establish(table, 1, "Aegis Turtle", []);
		announce(table, { ...spell, source: { ...spell.source, zones: ["hand"] } });
		assert.equal(sheriff!.ability!.leavesStack, undefined, "a new ordinary cast does not retain the old departure term");
		passBoth(table); finish(table); assert.equal(sheriff!.zone, "graveyard");
	}
	const faces = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("Mono-Red Aggro") }], "permitted-spell-faces");
	const [card] = place(faces, 0, "graveyard", "Hearth Elemental // Stoke Genius");
	commit(faces, [{ do: "note", note: { kind: "permit", on: { id: card!.id, incarnation: card!.incarnation }, by: 0, who: 0, fromTurn: 0,
		until: "end-of-turn", mana: "printed", of: { types: ["instant", "sorcery"] }, leavesStack: "exile" } }], "game-setup");
	for (const world of [tableWorld(faces), viewWorld(project(faces, 0))]) {
		assert.equal(playable(world, 0, card!, 1, false, 0), false);
		assert.equal(playable(world, 0, card!, 1, false, 1), true);
		const price = castingPrices(world, 0, card!, 1, 1)[0]!;
		assert.equal(permissionMana(price.mana, faceFacts(faces.printed[card!.card!], 1)!.mana), "{1}{R}");
	}
});

test("a granted casting price belongs to its player and incarnation, with explicit timing and expiry", () => {
	const table = start(standard, [{ name: "Bant", deck: deck("Bant Airbending Combo") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "airbend");
	const enchantment = establish(table, 0, "Airbender Ascension", []), claw = establish(table, 1, "Hired Claw", []);
	const [land] = place(table, 1, "exile", "Mountain");
	place(table, 1, "battlefield", "Mountain", "Mountain");
	main(table, 0);
	commit(table, [{ do: "move", what: enchantment.id, to: "exile", reason: "exile" },
		{ do: "move", what: enchantment.id, to: "battlefield", reason: "resolve", registers: pack("Airbender Ascension") }], "resolve");
	const prefix = structuredClone(table), from = table.ledger.length;
	apply(table, nextDecision(table)!.options.find((one) => one.id.endsWith(`:t0=${claw.id}@${claw.incarnation}`))!.id, "model", "chosen");
	passBoth(table); finish(table);
	const permit = table.notes.find((one) => one.kind === "permit")!;
	assert.ok(permit.kind === "permit");
	assert.deepEqual([permit.who, permit.mana, claw.zone, permit.on.incarnation], [1, "{2}", "exile", claw.incarnation]);
	assert.equal(playable(tableWorld(table), 0, claw, table.cursor.turn, false), false, "the owner's opponent gets no permission");
	const cast = printedCast("Hired Claw", table.printed["Hired Claw"]!);
	assert.throws(() => checkProcedure({ ...cast, instructions: [{ do: "permit", what: "this", who: "owner:bound:missing", until: "indefinite" }] }), /used before/);
	assert.equal(offered(table, cast).length, 0, "the permission does not grant flash");
	main(table, 1, 2);
	const choices = offered(table, cast);
	assert.ok(choices.length);
	assert.ok(choices.every((one) => one.activation.cost.generic === 2 && !one.activation.cost.colors.length && one.activation.permission === permit.id));
	assert.match(choices[0]!.option.shows!, /instead of the mana cost/);
	const frame = workFrame(table, 1), seen = frame.view.objects!.find((one) => one.id === claw.id)!;
	assert.equal(manaBudget(frame, cast, seen).cost, "{2}");
	assert.throws(() => activate(table, { ...choices[0]!.activation, permission: undefined }, { picked: "stale", offered: ["stale"], by: "model", why: "declared" }), /permission/);
	const clone = structuredClone(table), at = table.ledger.length;
	announce(table, cast); passBoth(table); finish(table);
	assert.equal(claw.zone, "battlefield");
	assert.equal(table.notes.some((one) => one.id === permit.id), false);
	assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
	commit(table, [{ do: "move", what: claw.id, to: "exile", reason: "exile" }], "exile");
	assert.equal(offered(table, cast).length, 0, "a new incarnation cannot reuse the old permission");
	commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 1, fromTurn: 0, until: "indefinite", on: { id: land!.id, incarnation: land!.incarnation }, mana: "{2}" } }], "resolve");
	assert.equal(playable(tableWorld(table), 1, land!, 2, true), false, "an alternative casting price gives no land play");
	// Separate permissions preserve both choices, and do not substitute another alternative procedure's cost.
	for (const mana of ["{2}", "{1}", undefined]) commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 1, fromTurn: 0, until: "indefinite", on: { id: claw.id, incarnation: claw.incarnation }, ...(mana ? { mana } : {}) } }], "resolve");
	const world = viewWorld(project(table, 1));
	assert.equal(castingPrices(world, 1, claw, 2).length, 3);
	assert.deepEqual(castingPrices(world, 1, claw, 2, 0, "{0}"), [{}]);
	assert.equal(castingPrices(viewWorld(project(table, 0)), 0, claw, 2).length, 0);

	// A single airbend can include a permanent its controller does not own.
	for (const count of [0, 2]) {
		const mixed = start(standard, [{ deck: deck("Bant Airbending Combo") }, { deck: deck("Mono-Red Aggro") }], `appa-owners-${count}`);
		const appa = establish(mixed, 0, "Appa, Steadfast Guardian", []), elf = establish(mixed, 0, "Llanowar Elves", []);
		const [borrowed] = place(mixed, 1, "graveyard", "Hired Claw");
		commit(mixed, [{ do: "move", what: borrowed!.id, to: "battlefield", controller: 0, reason: "resolve" }], "resolve");
		main(mixed, 0);
		commit(mixed, [{ do: "move", what: appa.id, to: "exile", reason: "exile" },
			{ do: "move", what: appa.id, to: "battlefield", reason: "resolve", registers: pack("Appa, Steadfast Guardian") }], "resolve");
		const beforeMixed = structuredClone(mixed), from = mixed.ledger.length;
		const choice = nextDecision(mixed)!.options.find(one => one.trigger?.targets.length === count)!;
		assert.ok(choice); apply(mixed, choice.id, "model", "chosen"); passBoth(mixed);
		const mid = structuredClone(mixed), at = mixed.ledger.length; finish(mixed);
		const notes = mixed.notes.filter(one => one.kind === "permit"); assert.equal(notes.length, count);
		for (const card of [elf, borrowed!]) {
			assert.equal(card.zone, count ? "exile" : "battlefield");
			const owned = notes.find(one => one.kind === "permit" && one.on.id === card.id);
			if (count) assert.ok(owned?.kind === "permit" && owned.who === card.owner && owned.mana === "{2}" && owned.on.incarnation === card.incarnation);
			for (const seat of [0, 1]) assert.equal(playable(tableWorld(mixed), seat, card, mixed.cursor.turn, false), !!count && seat === card.owner);
		}
		if (count) assert.equal(mixed.log.filter(row => row.changes.filter(one => one.do === "move" && one.to === "exile").length === 2).length, 1);
		assert.deepEqual(relive(mid, mixed.ledger.slice(at)), mixed);
		assert.deepEqual(relive(beforeMixed, mixed.ledger.slice(from)), mixed);
	}

	for (const duringOwnTurn of [true, false]) {
		const game = start(standard, [{ name: "Roku", deck: deck("Boros Dragons") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "roku-permission");
		establish(game, 0, "The Legend of Roku // Avatar Roku", []);
		main(game, 0);
		if (!duringOwnTurn) { main(game, 1, 2); apply(game, "pass", "model", "chosen"); }
		const before = structuredClone(game), begin = game.ledger.length;
		announce(game, example("Resolve Roku's first chapter")); passBoth(game); finish(game);
		const granted = game.notes.filter((one) => one.kind === "permit");
		assert.equal(granted.length, 3);
		main(game, 0, 3);
		assert.equal(game.notes.filter((one) => one.kind === "permit").length, 3);
		const nextTurn = structuredClone(game), next = game.ledger.length;
		main(game, 1, 4);
		assert.equal(game.notes.filter((one) => one.kind === "permit").length, 0);
		assert.deepEqual(relive(nextTurn, game.ledger.slice(next)), game);
		assert.deepEqual(relive(before, game.ledger.slice(begin)), game);
	}
});
