/**
 * Resolved. Announced procedures pay every part of their cost as they are
 * announced, and resolve one instruction at a time: a choice pauses resolution
 * for its actor, bindings carry "that land", targets are rechecked as it begins
 * (608.2b), and what each instruction reads is read as it applies.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit } from "../src/core/commit.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { type ProcedureOption } from "../src/core/procedures.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { editWork } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { open, save, replay, fork, exportGame } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import type { Procedure } from "../src/core/language.ts";
import { announce, finish, main, matchup, offered, passBoth, place, step } from "./play.ts";

const deal = () => matchup("resolution");

test("a search shows the library only to its chooser, may find nothing, binds that land and shuffles", () => {
	const table = deal();
	const [passage] = place(table, 0, "battlefield", "Fabled Passage");
	place(table, 0, "battlefield", "Forest", "Forest", "Forest");
	main(table, 0);
	const fetch: Procedure = { source: { zones: ["battlefield"], controller: "self", card: "Fabled Passage" }, claim: "Crack Fabled Passage",
		basis: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land.",
		timing: "stack", cost: { tap: true, sacrifice: "this" }, instructions: [
			{ do: "choose", who: "you", from: { zones: ["library"], owner: "you", supertypes: ["basic"], types: ["land"] }, count: 1, upTo: true, as: "land" },
			{ do: "move", what: "bound:land", to: "battlefield", tapped: true, reason: "resolve" },
			{ do: "shuffle", who: "you" },
			{ do: "untap", what: "bound:land", if: { amount: { count: { types: ["land"], controller: "you" } }, atLeast: 4 } },
		] };
	const shuffles = table.rng.calls.play ?? 0;
	announce(table, fetch);
	assert.equal(table.things.get(passage!.id)!.zone, "graveyard", "the sacrifice is paid as it is announced");
	passBoth(table);
	const search = nextDecision(table)!;
	assert.equal(search.seat, 0);
	assert.deepEqual(search.options.map((option) => option.label), ["Choose Forest (library)", "Decline: choose none of them, so this finds nothing"], "identical Forests are one choice, and finding nothing is allowed");
	assert.equal(JSON.stringify(project(table, 1)).includes("library)"), false, "the other seat sees no library card");
	step(table, (label) => label === "Choose Forest (library)");
	const fetched = table.resolution!.bound.land!.objects[0]!;
	step(table); step(table);
	assert.ok((table.rng.calls.play ?? 0) > shuffles, "the library was shuffled");
	assert.equal(table.things.get(fetched.id)!.tapped, true, "it entered tapped");
	step(table);
	assert.equal(table.things.get(fetched.id)!.tapped, false, "with four lands, that land untaps");
	assert.equal(table.resolution, null);
});

test("costs are paid as announced: life, sacrifice, discard, tapping creatures, reductions and X", () => {
	const table = deal();
	place(table, 0, "battlefield", "Elven Passage", "Forest", "Forest", "Forest", "Forest", "Llanowar Elves", "Icetill Explorer");
	place(table, 1, "battlefield", "Mountain", "Mountain", "Mountain");
	place(table, 0, "hand", "Sapling Nursery", "Sazh's Chocobo");
	main(table, 0);

	// Affinity for Forests: {6}{G}{G} less one per Forest is four mana the four Forests pay.
	const nursery: Procedure = { source: { zones: ["hand"], controller: "self", card: "Sapling Nursery" }, claim: "Cast Sapling Nursery",
		basis: "Affinity for Forests", timing: "spell", cost: { reduce: { count: { subtypes: ["Forest"], controller: "you" } } }, instructions: [] };
	const cheap = offered(table, nursery);
	assert.ok(cheap.length && cheap.every((option) => /Cost: 2 generic \+ \{G\} \+ \{G\} \(reduced by 4\)/.test(option.option.shows!)));

	// Tapping creatures with total power 2, as crew does: only the smallest sets that pay.
	const authored = (claim: string, cost: Procedure["cost"], zones: ("battlefield" | "hand")[] = ["battlefield"], card = "Forest"): Procedure =>
		({ source: { zones, controller: "self", card }, claim, basis: "An authored test, not a card ruling.", timing: "stack", cost, instructions: [] });
	const crews = offered(table, authored("Tap creatures", { tap: { choose: { types: ["creature"], controller: "you" }, totalPower: 2 } }))
		.map((option) => option.option.shows!.match(/Tap ([^.]*)\. /)![1]);
	assert.deepEqual([...new Set(crews)], ["Icetill Explorer"], "the Explorer alone has power 2; the Elves alone is short, and both tap one for nothing");

	// Discarding a card from hand is one choice per card.
	const discards = offered(table, authored("Discard to activate", { discard: 1 })).map((option) => option.option.shows!.match(/Discard ([^.]*)\. /)![1]);
	assert.ok(discards.includes("Sapling Nursery") && discards.includes("Sazh's Chocobo"));

	// One object leaves to pay once; only the source may also be tapped.
	assert.equal(offered(table, authored("Twice", { sacrifice: "this", exile: "this" })).length, 0, "sacrificing and exiling the same land is not a payment");
	assert.ok(offered(table, authored("Tap and sacrifice", { tap: true, sacrifice: "this" })).length > 0);

	const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Elven Passage")!;
	announce(table, { ...authored("Crack Elven Passage", { tap: true, life: 1, sacrifice: "this" }, ["battlefield"], "Elven Passage"), basis: "{T}, Pay 1 life, Sacrifice this land" });
	assert.equal(table.seats[0]!.life, 19);
	assert.equal(table.things.get(passage.id)!.zone, "graveyard");

	// X is announced, from zero to what the lands can pay.
	main(table, 1, 2);
	const x = offered(table, authored("Pay X", { mana: "{X}" }, ["battlefield"], "Mountain")).map((option) => option.activation.x);
	assert.deepEqual([...new Set(x)], [0, 1, 2, 3], "three Mountains pay up to three");
	const reduced = offered(table, authored("Pay X, reduced", { mana: "{X}{R}", reduce: 2 }, ["battlefield"], "Mountain")).map((option) => option.activation.x);
	assert.deepEqual([...new Set(reduced)], [0, 1, 2, 3, 4], "a reduction of two lets three Mountains pay {R} and X up to four");
});

test("mana keeps its stated count and restriction, and restricted mana pays only for what it allows", () => {
	const table = deal();
	place(table, 1, "battlefield", "Mountain", "Mountain");
	place(table, 1, "hand", "Shock", "Hired Claw");
	main(table, 1, 2);
	const creatureOnly = { types: ["creature" as const], zones: ["stack" as const] };
	const ritual: Procedure = { source: { zones: ["battlefield"], controller: "self", card: "Mountain" }, claim: "Restricted mana", basis: "An authored test, not a card ruling.",
		timing: "mana", cost: { tap: true }, instructions: [{ do: "mana", who: "you", colors: ["R"], times: 3, spendOnly: creatureOnly }] };
	announce(table, ritual);
	assert.deepEqual(table.seats[1]!.pool.map((mana) => [mana.color, mana.spendOnly]), [["R", creatureOnly], ["R", creatureOnly], ["R", creatureOnly]], "three, each restricted");
	const casts = nextDecision(table)!.options.filter((option) => option.id.startsWith("cast:"));
	assert.ok(casts.some((option) => option.label.includes("Hired Claw") && /restricted/.test(option.shows!)), "a creature spell can spend it");
	const shock: Procedure = { source: { zones: ["hand"], controller: "self", card: "Shock" }, claim: "Cast Shock", basis: "Shock deals 2 damage to any target.", timing: "spell",
		targets: [{ object: { types: ["creature", "planeswalker", "battle"] }, player: "any" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
	assert.ok(offered(table, shock).every((option) => !/restricted/.test(option.option.shows!)), "an instant cannot");
});

test("targets that partly fail, labels, fight, tokens, each player, and counter unless paid", () => {
	const table = deal();
	const [elves, chocobo] = place(table, 0, "battlefield", "Llanowar Elves", "Sazh's Chocobo");
	place(table, 0, "battlefield", ...Array(9).fill("Forest"));
	const [claw] = place(table, 1, "battlefield", "Hired Claw");
	main(table, 0, 3);
	place(table, 0, "hand", "Sazh's Chocobo");
	const ability = (claim: string, instructions: Procedure["instructions"], targets: Procedure["targets"] = []): Procedure =>
		({ source: { zones: ["battlefield"], controller: "self", card: "Forest" }, claim, basis: "An authored test, not a card ruling.", timing: "stack", cost: { tap: true }, targets, instructions });
	const aimed = (...ids: string[]) => (option: ProcedureOption) => ids.every((id, at) => option.activation.targets[at]!.some((one) => "id" in one && one.id === id));

	// Two targets; one leaves before resolution; the other is still dealt damage (608.2b).
	announce(table, ability("Two pings", [{ do: "damage", to: "target:0", amount: 1 }, { do: "damage", to: "target:1", amount: 1 }],
		[{ object: { types: ["creature"], controller: "opponent" } }, { object: { types: ["creature"], controller: "you" } }]), aimed(claw!.id, chocobo!.id));
	commit(table, [{ do: "move", what: chocobo!.id, to: "hand", reason: "bounce" }], "bounce");
	passBoth(table);
	finish(table);
	assert.equal(table.things.get(claw!.id)!.damage, 1, "the target still there is dealt damage");
	assert.equal(table.things.get(chocobo!.id)!.damage, 0, "the target that left is not");

	// A label: its amount is read as it applies and kept as a number, and every seat sees it.
	announce(table, ability("Pump", [{ do: "modify", what: "target:0", until: "end-of-turn", label: "+2/+0 until end of turn", change: { power: { sum: [1, 1] } } }],
		[{ object: { types: ["creature"], controller: "you" } }]), aimed(elves!.id));
	passBoth(table);
	finish(table);
	const label = table.notes.find((note) => note.kind === "label");
	assert.equal(label?.kind === "label" && label.change?.power, 2);
	assert.equal(characteristics(table, table.things.get(elves!.id)!)!.power, 3);
	assert.match(project(table, 1).table.join("\n"), /"\+2\/\+0 until end of turn" until end-of-turn/);

	// Fight is one group: the pumped Elves deals 3, the Claw deals 1, both die together.
	announce(table, ability("Fight", [{ do: "fight", a: "target:0", b: "target:1" }],
		[{ object: { types: ["creature"], controller: "you" } }, { object: { types: ["creature"], controller: "opponent" } }]), aimed(elves!.id, claw!.id));
	passBoth(table);
	const fighting = nextDecision(table)!;
	apply(table, fighting.options[0]!.id, "model", "chosen");
	const group = table.log.at(-1)!.changes.filter((change) => change.do === "damage");
	assert.deepEqual(group.map((change) => change.do === "damage" ? change.amount : 0), [3, 1], "both creatures are dealt damage in one group");
	finish(table);
	assert.deepEqual([table.things.get(elves!.id)!.zone, table.things.get(claw!.id)!.zone], ["graveyard", "graveyard"]);

	// A token, with what its spec registers.
	announce(table, ability("Treasure", [{ do: "token", count: 1, as: "made", spec: { name: "Treasure", types: ["artifact"], subtypes: ["Treasure"], colors: [],
		registers: [{ basis: "{T}, Sacrifice this token: Add one mana of any color.", kind: "mana", cost: { tap: true, sacrifice: "this" }, any: 1 }] } }]));
	passBoth(table);
	finish(table);
	const treasure = [...table.things.values()].find((one) => one.token?.name === "Treasure")!;
	assert.deepEqual([characteristics(table, treasure)!.types, characteristics(table, treasure)!.registrations.length], [["artifact"], 1]);

	// Each player, with the player bound.
	announce(table, ability("Each pays for Forests", [{ do: "each", players: "each-player", instructions: [
		{ do: "life", who: "bound:player", amount: { negate: { count: { subtypes: ["Forest"], controller: "bound:player" } } } }] }]));
	passBoth(table);
	finish(table);
	assert.deepEqual(table.seats.map((one) => one.life), [11, 20], "Green loses one per Forest it controls; Red controls none");

	// Counter unless its controller pays: the payer decides.
	const cub = cardsIn(table, "hand", 0).find((one) => one.card === "Sazh's Chocobo")!;
	const cast = nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && option.label.includes("Sazh's Chocobo") && !option.id.includes("token"))!;
	apply(table, cast.id, "model", "chosen");
	announce(table, ability("Tax", [{ do: "counter", what: "target:0", unless: { who: "controller:target:0", pays: { life: 2 } } }],
		[{ object: { zones: ["stack"], types: ["creature"] } }]));
	passBoth(table);
	const tax = nextDecision(table)!;
	assert.equal(tax.seat, 0, "the countered spell's controller is asked");
	assert.deepEqual(tax.options.map((option) => option.label), ["Pay 2 life. ", "Do not pay; it is countered"]);
	apply(table, tax.options[1]!.id, "model", "chosen");
	assert.equal(table.things.get(cub.id)!.zone, "graveyard");

	// A reserved Forest is a distinct payment from a free Forest. Replay must
	// restore the hold before listing pay:0/pay:1, including at a clone point.
	const setup = () => { const game = matchup("tax-hold"); place(game, 0, "battlefield", "Forest", "Forest", "Forest"); place(game, 0, "hand", "Sazh's Chocobo"); return game; };
	for (const payment of [0, 1]) {
		const game = setup(); main(game, 0);
		apply(game, nextDecision(game)!.options.find((one) => one.id.startsWith("cast:") && one.label.includes("Sazh's Chocobo"))!.id, "model", "chosen");
		const free = cardsIn(game, "battlefield", 0).filter((one) => !one.tapped).sort((a, b) => a.id.localeCompare(b.id));
		assert.equal(free.length, 2);
		editWork(game, 0, [{ do: "plan.put", plan: { objective: "Reserve one source.", guidance: "Use the free Forest.", steps: [],
			holds: [{ objects: { refs: [{ id: free[0]!.id, incarnation: free[0]!.incarnation }] }, purpose: "Next spell" }] } }], "hold");
		announce(game, { ...ability("Mana tax", [{ do: "counter", what: "target:0", unless: { who: "controller:target:0", pays: { mana: "{1}" } } }],
			[{ object: { zones: ["stack"], types: ["creature"] } }]), cost: {} });
		passBoth(game);
		const decision = nextDecision(game)!;
		assert.equal(decision.options.length, 3, "two payments and a refusal");
		const directory = mkdtempSync(join(tmpdir(), "magic-tax-"));
		const journal = open(join(directory, "game.jsonl"), { id: "tax", format: game.format.name, seed: game.rng.seed, seats: game.seats.map(({ id, name, deck }) => ({ id, name, deck })),
			cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" });
		save(journal, game);
		const child = join(directory, "child.jsonl"); fork(journal.path, game.ledger.length, "child", child);
		assert.deepEqual(nextDecision(replay(child, setup).table), decision, "the pending payment survives a clone");
		apply(game, decision.options[payment]!.id, "model", "chosen"); save(journal, game);
		const back = replay(journal.path, setup).table;
		assert.deepEqual(back.ledger, game.ledger);
		assert.deepEqual(back.things, game.things, "each payment spends the same source after replay");
		assert.doesNotThrow(() => exportGame(journal.path, { mode: "seat", seat: 0 }, setup));
	}
});

test("a target can depend on an earlier one, a card enters with its new controller's package, a reveal is public, and choosing zero picks nothing", () => {
	const table = deal();
	place(table, 0, "battlefield", "Forest", "Forest", "Forest", "Forest");
	const [claw] = place(table, 1, "battlefield", "Hired Claw");
	commit(table, [{ do: "token", id: "equipment", controller: 1, spec: { name: "Equipment", types: ["artifact"], subtypes: ["Equipment"], colors: [] } },
		{ do: "attach", what: "equipment", to: { id: claw!.id, incarnation: claw!.incarnation } }], "game-setup");
	place(table, 0, "hand", "Snakeskin Veil");
	main(table, 0);
	const ability = (claim: string, instructions: Procedure["instructions"], targets: Procedure["targets"] = []): Procedure =>
		({ source: { zones: ["battlefield"], controller: "self", card: "Forest" }, claim, basis: "An authored test, not a card ruling.", timing: "stack", cost: { tap: true }, targets, instructions });

	// Fiery Annihilation's second target is the Equipment attached to the first.
	const annihilate = ability("Annihilate", [{ do: "damage", to: "target:0", amount: 5 }, { do: "move", what: "target:1", to: "exile", reason: "exile" }],
		[{ object: { types: ["creature"], controller: "opponent" } }, { object: { subtypes: ["Equipment"], attachedTo: "target:0" }, upTo: true }]);
	const sets = offered(table, annihilate).map((option) => option.activation.targets.map((slot) => slot.map((one) => "id" in one ? one.id : one.player)));
	assert.deepEqual(sets, [[[claw!.id], []], [[claw!.id], ["equipment"]]], "the Equipment is offered with the creature it is attached to, or not at all");

	// A card returned under this seat's control registers this seat's package.
	commit(table, [{ do: "move", what: claw!.id, to: "graveyard", reason: "destroy" }], "destroy");
	finish(table);
	assert.equal(table.things.get("equipment")!.attached, undefined, "the Equipment fell off as a state-based action (704.5n)");
	editWork(table, 0, [{ do: "package.put", package: { card: "Hired Claw", registers: [{ basis: "Whenever you attack with one or more Lizards, this creature deals 1 damage to target opponent.", kind: "continuous", affects: { is: "this" }, change: { words: ["haste"] } }] } }], "package");
	announce(table, ability("Reanimate", [{ do: "move", what: "target:0", to: "battlefield", controller: "you", reason: "resolve" }], [{ object: { zones: ["graveyard"], types: ["creature"] } }]));
	passBoth(table);
	finish(table);
	const returned = table.things.get(claw!.id)!;
	assert.equal(returned.controller, 0);
	assert.deepEqual(returned.registrations?.map((one) => one.basis), ["Whenever you attack with one or more Lizards, this creature deals 1 damage to target opponent."]);

	// A revealed card is named to every seat.
	const veil = cardsIn(table, "hand", 0).find((one) => one.card === "Snakeskin Veil")!;
	announce(table, ability("Show it", [{ do: "choose", who: "you", from: { zones: ["hand"], owner: "you", name: "Snakeskin Veil" }, count: 1, reveal: true, as: "shown" }]));
	passBoth(table);
	const from = table.log.length;
	step(table, (label) => label === "Choose Snakeskin Veil (hand)");
	assert.ok(project(table, 1, from).since.some((line) => line.includes("revealed Snakeskin Veil from hand")), "the other seat is told");
	assert.equal(project(table, 1).objects!.some((one) => one.id === veil.id), false, "and the card stays in a hand it cannot see");
	finish(table);

	// A count of zero is already met.
	announce(table, ability("Choose none", [{ do: "choose", who: "you", from: { zones: ["hand"], owner: "you" }, count: 0, as: "none" }]));
	passBoth(table);
	assert.deepEqual(nextDecision(table)!.options.map((option) => option.label), ["Nothing can be chosen"]);
});
