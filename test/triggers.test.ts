/**
 * Registered. What a permanent registers works as it sits on the battlefield:
 * entering terms apply as part of the motion, watches trigger from what the
 * table recorded and wait for the next priority, delayed and reflexive triggers
 * fire once, permissions add choices, and replacements change the event before
 * it happens. Positions come from the pinned lists; packages and procedures
 * from docs/examples where it has them, written alongside them where it does not.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { editWork } from "../src/core/work-tools.ts";
import { describe, project } from "../src/core/view.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import type { Procedure, Registration } from "../src/core/language.ts";
import type { Change } from "../src/core/syntax.ts";
import type { ProcedureOption } from "../src/core/procedures.ts";
import { announce, establish, example, finish, main, matchup, pack, passBoth, place, step } from "./play.ts";

const CHOCOBO: Registration = { basis: "Landfall — Whenever a land you control enters, put a +1/+1 counter on this creature.", kind: "watch",
	event: { on: "enters", of: { types: ["land"], controller: "you" } }, effect: { instructions: [{ do: "counters", on: "this", kind: "+1/+1", amount: 1 }] } };
const prepare = (table: Table, seat: number, card: string, registers = pack(card)) => editWork(table, seat, [{ do: "package.put", package: { card, registers } }], `package-${card}`);
const counters = (table: Table, id: string) => table.things.get(id)!.counters["+1/+1"] ?? 0;
/** Put the next waiting trigger on the stack: the option a test names, or the only one. */
const trigger = (table: Table, pick?: (label: string) => boolean) => {
	const decision = nextDecision(table)!;
	assert.equal(decision.situation, "trigger-order", `a trigger is waiting, not ${decision.situation}`);
	const option = pick ? decision.options.find((one) => pick(`${one.label} ${one.shows}`)) : decision.options.length === 1 ? decision.options[0] : undefined;
	assert.ok(option, `a trigger option among: ${decision.options.map((one) => one.label).join(" | ")}`);
	apply(table, option.id, "model", "chosen");
	return decision;
};
const aimsAt = (id: string) => (option: ProcedureOption) => option.activation.targets[0]!.some((chosen) => "id" in chosen && chosen.id === id);
/** Both seats pass, the top of the stack resolves, and play comes back to priority or the next trigger. */
const resolveTop = (table: Table) => { passBoth(table); finish(table); };

test("a landfall watch triggers once per land, waits for priority, and resolves from the stack; a permanent enters with its counters", () => {
	const setup = () => {
		const table = matchup("landfall");
		establish(table, 0, "Sazh's Chocobo", [CHOCOBO]);
		place(table, 0, "battlefield", "Forest", "Forest", "Forest");
		place(table, 0, "hand", "Forest", "Mossborn Hydra");
		prepare(table, 0, "Mossborn Hydra");
		return table;
	};
	const table = setup();
	const chocobo = cardsIn(table, "battlefield").find((one) => one.card === "Sazh's Chocobo")!;
	main(table, 0);

	// Mossborn Hydra is printed 0/0 and enters with its counter, as part of the motion.
	const cast = nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && option.label.includes("Mossborn Hydra"))!;
	assert.match(cast.shows!, /It enters registering: Trample/);
	apply(table, cast.id, "model", "chosen");
	resolveTop(table);
	const hydra = cardsIn(table, "battlefield").find((one) => one.card === "Mossborn Hydra")!;
	assert.equal(hydra.zone, "battlefield");
	assert.equal(counters(table, hydra.id), 1);
	assert.match(table.log.map((receipt) => describe(table, receipt)).join("\n"), /Mossborn Hydra into battlefield \(resolve\), 1 \+1\/\+1/);

	// One land: both landfall watches trigger. Nothing has priority until they are on the stack.
	const forest = cardsIn(table, "hand", 0).find((one) => one.card === "Forest")!;
	apply(table, `land:${forest.id}`, "model", "chosen");
	assert.equal(table.waiting.length, 2);
	assert.match(project(table, 1).table.join("\n"), /Waiting to go on the stack: Green's Sazh's Chocobo/);
	const order = trigger(table, (label) => label.includes("Sazh's Chocobo"));
	assert.equal(order.seat, 0);
	assert.equal(order.options.length, 2, "the seat chooses which of its triggers goes on first");
	trigger(table);
	assert.equal(cardsIn(table, "stack").length, 2);
	assert.equal(nextDecision(table)!.situation, "priority");
	resolveTop(table);
	resolveTop(table);
	assert.equal(counters(table, chocobo.id), 1);
	assert.equal(counters(table, hydra.id), 2, "doubling adds as many as there are");
	assert.equal(characteristics(table, table.things.get(hydra.id)!)!.power, 2);

	// Replay rebuilds the triggers from the recorded picks.
	const rebuilt = relive(setup(), table.ledger);
	assert.deepEqual([counters(rebuilt, chocobo.id), counters(rebuilt, hydra.id)], [1, 2]);

	// Two lands entering together are two occurrences (603.2c).
	const [one, two] = cardsIn(table, "library", 0).filter((card) => card.card === "Forest");
	commit(table, [{ do: "move", what: one!.id, to: "battlefield", reason: "resolve" }, { do: "move", what: two!.id, to: "battlefield", reason: "resolve" }], "resolve");
	assert.equal(table.waiting.filter((waiting) => waiting.source.id === chocobo.id).length, 2);
});

test("entering terms read the permanent as it enters, and another permanent can change how lands enter", () => {
	const playBaSingSe = (basics: number, zhao: boolean) => {
		const table = matchup("entering");
		if (basics) place(table, 0, "battlefield", ...Array(basics).fill("Forest"));
		if (zhao) establish(table, 1, "Zhao, the Moon Slayer");
		place(table, 0, "hand", "Ba Sing Se");
		prepare(table, 0, "Ba Sing Se");
		main(table, 0);
		const land = cardsIn(table, "hand", 0).find((one) => one.card === "Ba Sing Se")!;
		apply(table, `land:${land.id}`, "model", "chosen");
		return table.things.get(land.id)!.tapped;
	};
	assert.equal(playBaSingSe(0, false), true, "no basic land: it enters tapped");
	assert.equal(playBaSingSe(1, false), false, "with a Forest it enters untapped");
	assert.equal(playBaSingSe(1, true), true, "Zhao makes every nonbasic land enter tapped, the opponent's too");
});

test("a reflexive trigger fires when its condition holds, targets as it goes on the stack, and rechecks as it resolves", () => {
	const table = matchup("reflexive");
	const ascension = establish(table, 0, "Earthbender Ascension");
	const [elves] = place(table, 0, "battlefield", "Llanowar Elves");
	place(table, 0, "hand", "Forest", "Forest", "Forest");
	commit(table, [{ do: "counters", what: ascension.id, kind: "quest", amount: 2 }], "game-setup");
	main(table, 0);
	const play = () => apply(table, `land:${cardsIn(table, "hand", 0).find((one) => one.card === "Forest")!.id}`, "model", "chosen");

	// Third counter: the intervening "if" is false, so nothing reflexive triggers.
	play();
	trigger(table);
	resolveTop(table);
	assert.equal(ascension.counters.quest, 3);
	assert.equal(table.waiting.length, 0);

	// Fourth counter, the next turn: "when you do" triggers and targets a creature now.
	main(table, 0, 3);
	play();
	trigger(table);
	resolveTop(table);
	assert.equal(table.things.get(ascension.id)!.counters.quest, 4);
	const reflexive = trigger(table);
	assert.match(reflexive.options[0]!.shows!, /Target 1: Llanowar Elves/);
	resolveTop(table);
	assert.equal(counters(table, elves!.id), 1);
	assert.ok(characteristics(table, table.things.get(elves!.id)!)!.words.includes("trample"));
	assert.ok(nextDecision(table)!.situation === "priority");

	// Fifth counter, then two removed while the reflexive trigger waits on the stack: it does nothing (603.4).
	main(table, 0, 5);
	play();
	trigger(table);
	resolveTop(table);
	trigger(table);
	commit(table, [{ do: "counters", what: ascension.id, kind: "quest", amount: -2 }], "resolve");
	passBoth(table);
	step(table, (label) => /condition no longer holds/.test(label));
	assert.equal(counters(table, elves!.id), 1);
});

test("earthbend's delayed trigger looks back at the land that died and returns it, even when it bent itself", () => {
	const table = matchup("earthbend");
	const land = establish(table, 0, "Ba Sing Se");
	place(table, 0, "battlefield", "Forest", "Forest", "Forest");
	prepare(table, 0, "Ba Sing Se");
	main(table, 0, 3);
	announce(table, example("Earthbend 2 with Ba Sing Se"), aimsAt(land.id));
	resolveTop(table);
	const bent = { ...table.things.get(land.id)! };
	assert.deepEqual([characteristics(table, table.things.get(land.id)!)!.types.includes("creature"), characteristics(table, table.things.get(land.id)!)!.power], [true, 2]);
	assert.equal(table.notes.filter((note) => note.kind === "delay").length, 1);

	const red = cardsIn(table, "library", 1)[0]!;
	commit(table, [{ do: "damage", source: red.id, target: { id: land.id, incarnation: bent.incarnation }, amount: 2 }], "resolve");
	finish(table);
	assert.equal(table.things.get(land.id)!.zone, "graveyard");
	trigger(table);
	resolveTop(table);
	const back = table.things.get(land.id)!;
	assert.deepEqual([back.zone, back.tapped, back.incarnation], ["battlefield", true, bent.incarnation + 2]);
	assert.equal(characteristics(table, back)!.types.includes("creature"), false, "it returns as a new object, a land again");
	assert.equal(table.notes.filter((note) => note.kind === "delay").length, 0, "a delayed trigger fires once");
});

const NOVA_WARP: Procedure = { source: { zones: ["hand"], controller: "self", card: "Nova Hellkite" }, claim: "Cast Nova Hellkite for its warp cost",
	basis: "Warp {2}{R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)",
	timing: "spell", cost: { mana: "{2}{R}" }, instructions: [
		{ do: "delay", event: { on: "step", step: "end", whose: "any" }, effect: { instructions: [
			{ do: "move", what: "this", to: "exile", reason: "exile", as: "warped" },
			{ do: "permit", what: "bound:warped", who: "you", from: "next-turn", until: "indefinite" },
		] } },
	] };
const NOVA: Registration[] = [
	{ basis: "Flying, haste", kind: "continuous", affects: { is: "this" }, change: { words: ["flying", "haste"] } },
	{ basis: "When this creature enters, it deals 1 damage to target creature an opponent controls.", kind: "watch", event: { on: "enters", of: { is: "this" } },
		effect: { targets: [{ object: { types: ["creature"], controller: "opponent" } }], instructions: [{ do: "damage", to: "target:0", amount: 1, from: "this" }] } },
];

test("a warped Hellkite triggers as it enters, is exiled at the end step, and may be cast from exile on a later turn", () => {
	const table = matchup("warp");
	const chocobo = establish(table, 0, "Sazh's Chocobo", [CHOCOBO]);
	place(table, 1, "battlefield", "Mountain", "Mountain", "Mountain", "Mountain", "Mountain");
	place(table, 1, "hand", "Nova Hellkite");
	prepare(table, 1, "Nova Hellkite", NOVA);
	main(table, 1, 2);
	announce(table, NOVA_WARP);
	resolveTop(table);
	const aimed = trigger(table);
	assert.match(aimed.options[0]!.shows!, /Target 1: Sazh's Chocobo/);
	resolveTop(table);
	assert.equal(table.things.get(chocobo.id)!.zone, "graveyard");

	main(table, 1, 2, "end");
	assert.ok(cardsIn(table, "stack").some((object) => object.ability?.trigger), "the delayed trigger went on the stack as the end step began");
	resolveTop(table);
	assert.ok(cardsIn(table, "exile", 1).some((one) => one.card === "Nova Hellkite"));
	const castable = () => nextDecision(table)!.options.some((option) => option.id.startsWith("play:") && option.label.includes("Nova Hellkite"));
	assert.equal(castable(), false, "not this turn");
	main(table, 1, 4);
	assert.equal(castable(), true, "from exile on a later turn, for its printed cost");
});

test("Torpor Orb stops creatures entering from triggering anything", () => {
	const table = matchup("torpor");
	establish(table, 0, "Sazh's Chocobo", [CHOCOBO]);
	establish(table, 0, "Torpor Orb");
	place(table, 1, "battlefield", "Mountain", "Mountain", "Mountain");
	place(table, 1, "hand", "Nova Hellkite");
	prepare(table, 1, "Nova Hellkite", NOVA);
	main(table, 1, 2);
	announce(table, NOVA_WARP);
	passBoth(table);
	while (table.resolution) step(table);
	assert.equal(table.waiting.length, 0);
	assert.equal(table.notes.filter((note) => note.kind === "delay").length, 1, "the warp delay is not an entering trigger");
});

test("valiant triggers once each turn, prowess on every noncreature spell, and both go on the stack above the spell", () => {
	const table = matchup("valiant");
	const challenger = establish(table, 1, "Emberheart Challenger");
	place(table, 1, "battlefield", "Mountain", "Mountain");
	place(table, 1, "hand", "Shock", "Shock");
	main(table, 1, 2);
	const shock = example("Cast Shock");
	const atChallenger = aimsAt(challenger.id);
	announce(table, shock, atChallenger);
	assert.equal(table.waiting.length, 2, "cast and targeted, from one announcement");
	trigger(table, (label) => label.includes("Prowess"));
	trigger(table);
	assert.equal(cardsIn(table, "stack").length, 3);
	resolveTop(table);
	resolveTop(table);
	const exiled = cardsIn(table, "exile", 1);
	assert.equal(exiled.length, 1, "valiant exiled the top card");
	assert.ok(table.notes.some((note) => note.kind === "permit" && note.on.id === exiled[0]!.id && note.until === "end-of-turn"));
	resolveTop(table);
	assert.equal(table.things.get(challenger.id)!.damage, 2);
	assert.equal(table.things.get(challenger.id)!.zone, "battlefield", "prowess made it 3/3 before the Shock resolved");

	announce(table, shock, atChallenger);
	assert.deepEqual(table.waiting.map((waiting) => waiting.basis), ["Prowess"], "valiant already triggered this turn");
});

test("a replacement placed by a spell exiles the creature instead of letting it die", () => {
	const table = matchup("replace");
	const chocobo = establish(table, 0, "Sazh's Chocobo", [CHOCOBO]);
	place(table, 1, "battlefield", "Mountain", "Mountain", "Mountain");
	place(table, 1, "hand", "Fiery Annihilation");
	main(table, 1, 2);
	announce(table, { source: { zones: ["hand"], controller: "self", card: "Fiery Annihilation" }, claim: "Cast Fiery Annihilation",
		basis: "Fiery Annihilation deals 5 damage to target creature. Exile up to one target Equipment attached to that creature. If that creature would die this turn, exile it instead.",
		timing: "spell", targets: [{ object: { types: ["creature"] } }, { object: { subtypes: ["Equipment"], attachedTo: "target:0" }, upTo: true }],
		instructions: [
			{ do: "register", on: "target:0", registration: { basis: "If that creature would die this turn, exile it instead.", kind: "replace", on: "dies", to: "exile", until: "end-of-turn" } },
			{ do: "damage", to: "target:0", amount: 5 },
			{ do: "move", what: "target:1", to: "exile", reason: "exile" },
		] });
	resolveTop(table);
	assert.equal(table.things.get(chocobo.id)!.zone, "exile");
	assert.match(table.log.map((receipt) => describe(table, receipt)).join("\n"), /put Sazh's Chocobo into exile \(destroy\)/);
});

test("Smaug makes a Treasure at upkeep, and the Treasure pays by being sacrificed", () => {
	const table = matchup("treasure");
	establish(table, 1, "Smaug the Magnificent");
	place(table, 1, "battlefield", "Mountain");
	place(table, 1, "hand", "Emberheart Challenger");
	main(table, 1, 2, "upkeep");
	resolveTop(table);
	const treasure = [...table.things.values()].find((one) => one.token?.name === "Treasure")!;
	assert.equal(treasure.controller, 1);
	main(table, 1, 2);
	const cast = nextDecision(table)!.options.find((option) => option.label.includes("Emberheart Challenger") && option.shows!.includes("sacrifice it"));
	assert.ok(cast, "a payment that sacrifices the Treasure is offered");
	apply(table, cast.id, "model", "chosen");
	finish(table);
	assert.equal(table.things.has(treasure.id), false, "sacrificed, and a token outside the battlefield ceases to exist");
});

test("Icetill Explorer permits a second land and lands from the graveyard; Elvish Archdruid makes mana for each Elf", () => {
	const table = matchup("icetill");
	establish(table, 0, "Icetill Explorer");
	place(table, 0, "graveyard", "Forest");
	place(table, 0, "hand", "Forest");
	main(table, 0);
	const lands = () => nextDecision(table)!.options.filter((option) => option.id.startsWith("land:"));
	assert.ok(lands().some((option) => option.label === "Play Forest from graveyard"));
	apply(table, lands().find((option) => option.label === "Play Forest from graveyard")!.id, "model", "chosen");
	trigger(table);
	resolveTop(table);
	assert.ok(lands().length > 0, "a second land play");
	apply(table, lands()[0]!.id, "model", "chosen");
	trigger(table);
	resolveTop(table);
	assert.equal(lands().length, 0, "two land plays, no third");

	const elves = start(standard, [{ name: "Green", deck: deck("Green Stompy") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "archdruid");
	establish(elves, 0, "Elvish Archdruid");
	establish(elves, 0, "Llanowar Elves");
	establish(elves, 0, "Llanowar Elves");
	place(elves, 0, "hand", "Gigantosaurus");
	main(elves, 0, 3);
	const paid = nextDecision(elves)!.options.find((option) => option.label.includes("Gigantosaurus"));
	assert.match(paid?.shows ?? "", /Elvish Archdruid .* for GGG/, "three Elves, three green");
});

test("permanents entering together never shape each other's entry, whatever order the group is written in (614.12)", () => {
	// Not a printed card: a creature whose entering term reaches every creature its controller enters, itself included.
	const SWELL: Registration = { basis: "Each creature you control enters with an additional +1/+1 counter on it.", kind: "enters",
		affects: { types: ["creature"], controller: "you" }, counters: { "+1/+1": 1 } };
	for (const order of ["swell first", "elves first"]) {
		const table = matchup("together");
		const [swell, elves] = place(table, 0, "hand", "Sazh's Chocobo", "Llanowar Elves");
		const moves: Change[] = [{ do: "move", what: swell!.id, to: "battlefield", reason: "resolve", registers: [SWELL] }, { do: "move", what: elves!.id, to: "battlefield", reason: "resolve" }];
		commit(table, order === "swell first" ? moves : moves.reverse(), "resolve");
		assert.equal(counters(table, swell!.id), 1, `${order}: its own term reaches itself`);
		assert.equal(counters(table, elves!.id), 0, `${order}: a permanent entering alongside it is not yet on the battlefield to be affected by it`);
		// Already on the battlefield, it does reach the next creature.
		const [later] = place(table, 0, "hand", "Llanowar Elves");
		commit(table, [{ do: "move", what: later!.id, to: "battlefield", reason: "resolve" }], "resolve");
		assert.equal(counters(table, later!.id), 1, `${order}: a later creature enters with the counter`);
	}
});

test("a leaves-the-battlefield watch looks back at a table that still remembers this turn", () => {
	// Not a printed card: a dies watch whose intervening if reads what was cast this turn (603.4, 603.10a).
	const REMEMBERS: Registration = { basis: "When this creature dies, if you cast a spell this turn, you gain 2 life.", kind: "watch",
		event: { on: "dies", of: { is: "this" } }, if: { amount: { history: "cast", by: "you" }, atLeast: 1 },
		effect: { instructions: [{ do: "life", who: "you", amount: 2 }] } };
	const table = matchup("remembers");
	const chocobo = establish(table, 0, "Sazh's Chocobo", [REMEMBERS]);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	main(table, 0);
	apply(table, nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && option.label.includes("Llanowar Elves"))!.id, "model", "chosen");
	resolveTop(table);
	commit(table, [{ do: "move", what: chocobo.id, to: "graveyard", reason: "resolve" }], "resolve");
	assert.equal(table.waiting.length, 1, "the Elves were cast this turn, so the dies watch triggers");
});

test("a cast watch reads the zone the spell was cast from", () => {
	// Not printed cards: two watches that differ only in the zone they name.
	const watching = (zone: "hand" | "graveyard"): Registration => ({ basis: `Whenever you cast a spell from your ${zone}, you gain 1 life.`, kind: "watch",
		event: { on: "cast", by: "you", from: [zone] }, effect: { instructions: [{ do: "life", who: "you", amount: 1 }] } });
	for (const zone of ["hand", "graveyard"] as const) {
		const table = matchup("cast-from");
		establish(table, 0, "Sazh's Chocobo", [watching(zone)]);
		place(table, 0, "battlefield", "Forest");
		place(table, 0, "hand", "Llanowar Elves");
		main(table, 0);
		apply(table, nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && option.label.includes("Llanowar Elves"))!.id, "model", "chosen");
		assert.equal(table.waiting.length, zone === "hand" ? 1 : 0, `cast from the hand: a watch for the ${zone} ${zone === "hand" ? "triggers" : "does not"}`);
	}
});

test("a seat may play a card another seat owns when a permission names it, and controls what it plays", () => {
	const table = matchup("borrowed");
	const [mountain, claw] = place(table, 1, "exile", "Mountain", "Hired Claw");
	commit(table, [mountain!, claw!].map((card): Change => ({ do: "note", note: { kind: "permit", by: 0, until: "indefinite", on: { id: card.id, incarnation: card.incarnation }, who: 0, fromTurn: 0 } })), "game-setup");
	main(table, 0);
	const play = nextDecision(table)!.options.find((option) => option.id === `land:${mountain!.id}`);
	assert.ok(play, "Red's Mountain is offered to Green as a land play from exile");
	apply(table, play.id, "model", "chosen");
	assert.deepEqual([table.things.get(mountain!.id)!.zone, table.things.get(mountain!.id)!.controller, table.things.get(mountain!.id)!.owner], ["battlefield", 0, 1], "it enters under Green, still Red's card");
	const cast = nextDecision(table)!.options.find((option) => option.label.includes("Hired Claw"));
	assert.ok(cast, `Red's Hired Claw is offered to Green: ${nextDecision(table)!.options.map((option) => option.label).join(" | ")}`);
	apply(table, cast.id, "model", "chosen");
	assert.equal(table.things.get(claw!.id)!.controller, 0, "Green controls the spell it cast");
	resolveTop(table);
	assert.deepEqual([table.things.get(claw!.id)!.zone, table.things.get(claw!.id)!.controller], ["battlefield", 0], "and the creature it becomes");
});

test("a flash permission reaches a spell without saying it looks at the stack", () => {
	// Not a printed card: "You may cast creature spells as though they had flash."
	const table = matchup("flash");
	establish(table, 0, "Sazh's Chocobo", [{ basis: "You may cast creature spells as though they had flash.", kind: "permit", flash: { types: ["creature"] } }]);
	place(table, 0, "battlefield", "Forest");
	place(table, 0, "hand", "Llanowar Elves");
	main(table, 0, 1, "begin-combat");
	assert.ok(nextDecision(table)!.options.some((option) => option.label.includes("Llanowar Elves")), "Llanowar Elves can be cast at the beginning of combat");
});

test("a once-only delayed trigger fires once though its event happens twice at the same time (603.7b)", () => {
	const table = matchup("once");
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	// Not printed: "When a land you control next enters this turn, you gain 1 life."
	commit(table, [{ do: "note", note: { kind: "delay", by: 0, until: "end-of-turn", event: { on: "enters", of: { types: ["land"], controller: "you" } },
		effect: { instructions: [{ do: "life", who: "you", amount: 1 }] }, fixed: { source: { id: chocobo.id, incarnation: chocobo.incarnation }, targets: [], bound: {} }, once: true } }], "game-setup");
	const forests = place(table, 0, "hand", "Forest", "Forest");
	commit(table, forests.map((forest): Change => ({ do: "move", what: forest.id, to: "battlefield", reason: "resolve" })), "resolve");
	assert.equal(table.waiting.length, 1, "two lands entered together, and it triggered once");
	assert.equal(table.notes.some((note) => note.kind === "delay"), false, "and it is used up");
});

test("what triggers while triggers are put on the stack waits for that round to finish (603.3b)", () => {
	// Not printed: Green's creature notices being targeted, and three triggers already wait, two Green's and one Red's.
	const table = matchup("rounds");
	const watcher = establish(table, 0, "Sazh's Chocobo", [{ basis: "Whenever this creature becomes the target of an ability, you gain 1 life.", kind: "watch",
		event: { on: "targeted", of: { is: "this" } }, effect: { instructions: [{ do: "life", who: "you", amount: 1 }] } }]);
	main(table, 0);
	const source = { id: watcher.id, incarnation: watcher.incarnation }, gain = { instructions: [{ do: "life" as const, who: "you" as const, amount: 1 }] };
	commit(table, [
		{ do: "trigger", action: "wait", trigger: { id: "aimed", controller: 0, source, basis: "Put a +1/+1 counter on target creature.", event: {},
			effect: { targets: [{ object: { types: ["creature"] } }], instructions: [{ do: "counters", on: "target:0", kind: "+1/+1", amount: 1 }] } } },
		{ do: "trigger", action: "wait", trigger: { id: "plain", controller: 0, source, basis: "You gain 1 life.", event: {}, effect: gain } },
		{ do: "trigger", action: "wait", trigger: { id: "theirs", controller: 1, source, basis: "You gain 1 life.", event: {}, effect: gain } },
	], "resolve");
	trigger(table, (label) => label.includes("+1/+1 counter"));
	assert.equal(table.waiting.filter((one) => one.controller === 0).length, 2, "targeting the creature made a new Green trigger");
	trigger(table, (label) => label.includes("You gain 1 life") && !label.includes("becomes the target"));
	assert.equal(nextDecision(table)!.seat, 1, "Red puts its trigger from this round before Green's new one");
});
