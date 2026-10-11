/** Copies retain base meaning, not the original's current layer results. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { tokenCopy } from "../src/core/copies.ts";
import { beforeEntry } from "../src/core/entry-payments.ts";
import { activatedUses } from "../src/core/activated.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import type { Package, Procedure } from "../src/core/language.ts";
import { announce, establish, example, finish, main, pack, passBoth, place, step } from "./play.ts";

const prepare = (table: Table, card: string, procedures: Procedure[] = [], seat = 0) =>
	editWork(table, seat, [{ do: "package.put", package: { card, registers: pack(card), procedures } }], `prepare-${seat}-${card}`);
const setup = () => start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: deck("Mono-Green Landfall") }], "token-copies");

test("a copy freezes printed values and complete abilities, applies entry terms, and replays every Spree instruction", () => {
	const table = setup(), hydra = establish(table, 1, "Mossborn Hydra");
	prepare(table, "Mossborn Hydra");
	// A registered opponent's card supplies this established control-change position.
	commit(table, [{ do: "move", what: hydra.id, to: "hand", reason: "game-setup" },
		{ do: "move", what: hydra.id, to: "battlefield", controller: 0, registers: pack("Mossborn Hydra"), reason: "game-setup" },
		{ do: "counters", what: hydra.id, kind: "+1/+1", amount: 3 }, { do: "tap", what: hydra.id },
		{ do: "note", note: { kind: "label", on: { id: hydra.id, incarnation: hydra.incarnation + 2 }, by: 0, until: "indefinite", text: "A temporary boost",
			change: { power: 7, toughness: 7, words: ["flying"] } } }], "game-setup");
	place(table, 0, "hand", "Three Steps Ahead"); main(table, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: ["U", "U", "U", "U"] }, { do: "tap", what: hydra.id }, { do: "damage", source: hydra.id, target: { id: hydra.id, incarnation: hydra.incarnation }, amount: 2 }], "game-setup");
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, example("Three Steps Ahead with only the copy mode")); passBoth(table);
	const pure = structuredClone(table); nextDecision(table); assert.deepEqual(table, pure);
	step(table); finish(table);
	const copy = cardsIn(table, "battlefield").find(one => one.token?.name === "Mossborn Hydra")!;
	assert.ok(copy); assert.equal(copy.tapped, false); assert.equal(copy.damage, 0); assert.equal(copy.counters["+1/+1"], 1);
	const traits = characteristics(table, copy)!;
	assert.equal(traits.power, 1); assert.equal(traits.manaValue, 3); assert.deepEqual(traits.colors, ["G"]);
	assert.ok(traits.words.includes("trample")); assert.ok(!traits.words.includes("flying"));
	assert.equal(characteristics(table, hydra)!.power, 11);
	for (const viewer of [0, 1, "spectator"] as const) assert.equal(project(table, viewer).objects!.find(one => one.id === copy.id)!.traits!.manaValue, 3);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	const frozen = tokenCopy(table, copy); assert.ok("spec" in frozen);
	commit(table, [{ do: "counters", what: copy.id, kind: "+1/+1", amount: 5 },
		{ do: "move", what: hydra.id, to: "graveyard", reason: "destroy" }], "resolve");
	assert.deepEqual(tokenCopy(table, copy), frozen, "a copy of the token ignores its new counters and the original's departure");
	commit(table, [{ do: "token", id: "second-copy", spec: frozen.spec, controller: 0 }], "resolve");
	assert.equal(characteristics(table, table.things.get("second-copy")!)!.power, 1);

	for (const illegal of [false, true]) {
		const game = setup(), original = establish(game, 1, "Mossborn Hydra");
		prepare(game, "Mossborn Hydra");
		commit(game, [{ do: "move", what: original.id, to: "hand", reason: "game-setup" },
			{ do: "move", what: original.id, to: "battlefield", controller: 0, registers: pack("Mossborn Hydra"), reason: "game-setup" }], "game-setup");
		place(game, 0, "hand", "Three Steps Ahead"); place(game, 1, "hand", "Llanowar Elves"); main(game, 1);
		commit(game, [{ do: "add-mana", who: 0, colors: Array(8).fill("U") }, { do: "add-mana", who: 1, colors: ["G"] }], "game-setup");
		announce(game, printedCast("Llanowar Elves", game.printed["Llanowar Elves"]!)); apply(game, "pass", "model", "chosen");
		const targetSpell = cardsIn(game, "stack")[0]!;
		announce(game, example("Three Steps Ahead with all three modes"));
		if (illegal) commit(game, [{ do: "move", what: original.id, to: "graveyard", reason: "destroy" }], "resolve");
		const start = structuredClone(game), since = game.ledger.length, hand = cardsIn(game, "hand", 0).length;
		passBoth(game); step(game); assert.equal(targetSpell.zone, "graveyard");
		step(game); assert.equal(cardsIn(game, "battlefield").filter(one => one.token).length, illegal ? 0 : 1);
		const middle = structuredClone(game), at = game.ledger.length;
		step(game); assert.equal(cardsIn(game, "hand", 0).length, hand + 2);
		step(game, () => true); finish(game); assert.equal(cardsIn(game, "hand", 0).length, hand + 1);
		assert.deepEqual(relive(start, game.ledger.slice(since)), game);
		assert.deepEqual(relive(middle, game.ledger.slice(at)), game, "cloning between copy and draw does not create another token");
	}

	// Copied base abilities remain executable when their original package belongs to the other seat.
	const manaGame = setup(), elves = establish(manaGame, 1, "Llanowar Elves"); prepare(manaGame, "Llanowar Elves", [], 1);
	const elf = tokenCopy(manaGame, elves); assert.ok("spec" in elf); assert.ok(elf.spec.registers?.some(one => one.kind === "mana"));
	const abilities = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: deck("Mono-Red Aggro") }], "copied-activation");
	const sanctuary = place(abilities, 1, "battlefield", "Soulstone Sanctuary")[0]!;
	const animate: Procedure = { source: { card: "Soulstone Sanctuary", zones: ["battlefield"], controller: "self" },
		claim: "Animate Soulstone Sanctuary", basis: abilities.printed[sanctuary.card!]!.oracle.split(/\\n|\n/).at(-1)!, timing: "stack", cost: { mana: "{4}" },
		instructions: [{ do: "modify", what: "this", until: "indefinite", change: { types: { add: ["creature"] }, subtypes: { allCreatureTypes: true }, base: { power: 3, toughness: 3 }, words: ["vigilance"] } }] };
	const landPackage: Package = { card: sanctuary.card!, registers: [{ kind: "mana", basis: "{T}: Add {C}.", cost: { tap: true }, colors: ["C"] }], procedures: [animate] };
	editWork(abilities, 1, [{ do: "package.put", package: landPackage }], "prepare-sanctuary");
	commit(abilities, [{ do: "move", what: sanctuary.id, to: "hand", reason: "game-setup" },
		{ do: "move", what: sanctuary.id, to: "battlefield", registers: landPackage.registers, reason: "game-setup" }], "game-setup");
	const land = tokenCopy(abilities, sanctuary); assert.ok("spec" in land);
	commit(abilities, [{ do: "token", id: "copied-sanctuary", spec: land.spec, controller: 0 }], "game-setup"); main(abilities, 0);
	commit(abilities, [{ do: "add-mana", who: 0, colors: Array(4).fill("C") }], "game-setup");
	const activation = activatedUses(workFrame(abilities, 0)).find(one => one.procedure.basis === animate.basis)!;
	assert.ok(activation); const before = structuredClone(abilities), at = abilities.ledger.length;
	announce(abilities, activation.procedure); passBoth(abilities); finish(abilities);
	assert.equal(characteristics(abilities, abilities.things.get("copied-sanctuary")!)!.power, 3);
	assert.deepEqual(relive(before, abilities.ledger.slice(at)), abilities);
	const oldSpec = tokenCopy(abilities, abilities.things.get("copied-sanctuary")!); assert.ok("spec" in oldSpec);
	assert.deepEqual(oldSpec.spec.types, ["land"], "animation is not a copiable effect");
	assert.equal(oldSpec.spec.power, undefined);
	editWork(abilities, 1, [{ do: "package.put", package: { ...landPackage, procedures: [], deferred: [{
		claim: animate.claim, basis: animate.basis, source: animate.source, timing: "stack" }] } }], "deferred-copy-source");
	assert.match((tokenCopy(abilities, sanctuary) as { blocked: string }).blocked, /activations prepared/);
	assert.match((tokenCopy(abilities, { ...sanctuary, faceDown: true }) as { blocked: string }).blocked, /face-down/);
	const faced = start(standard, [{ deck: alpha(deck("4c Control")) }, { deck: deck("Mono-Green Landfall") }], "copy-room-gap");
	const [room] = place(faced, 0, "battlefield", "Unholy Annex // Ritual Chamber"), unchanged = structuredClone(faced);
	assert.match((tokenCopy(faced, room!) as { blocked: string }).blocked, /multiple faces/); assert.deepEqual(faced, unchanged);

	// A token has its own entry choice, not the name or payment chosen for the original.
	const entry = setup(); main(entry, 0); const [jace] = place(entry, 0, "hand", "The Theorist, Jace Beleren");
	const spec = { name: "Theorist's Sanctum", types: ["land"] as const, colors: [], registers: pack("Theorist's Sanctum") };
	commit(entry, beforeEntry(entry, [{ do: "token", id: "copied-sanctum", controller: 0, spec: { ...spec, types: [...spec.types] } }], "resolve"), "resolve");
	assert.equal(entry.things.has("copied-sanctum"), false); const waiting = structuredClone(entry), after = entry.ledger.length;
	const choice = nextDecision(entry)!; assert.equal(choice.situation, "replacement-order");
	assert.ok(!project(entry, 1).objects!.some(one => one.id === jace!.id));
	apply(entry, choice.options.find(one => one.label.includes("(hand)"))!.id, "model", "chosen");
	assert.equal(entry.things.get("copied-sanctum")!.tapped, false);
	assert.deepEqual(relive(waiting, entry.ledger.slice(after)), entry);
});
