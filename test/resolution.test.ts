/**
 * Resolved. Announced procedures pay every part of their cost as they are
 * announced, and resolve one instruction at a time: a choice pauses resolution
 * for its actor, bindings carry "that land", targets are rechecked as it begins
 * (608.2b), and what each instruction reads is read as it applies.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { procedureOptions, activate, type ProcedureOption } from "../src/core/procedures.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import type { Procedure } from "../src/core/language.ts";
import type { Draft } from "../src/core/work.ts";

/** The pinned matchup's two lists. */
const deal = () => start(standard, [{ name: "Green", deck: deck("Mono-Green Landfall") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "resolution");
/** Put the first library copy of each card where a test needs it. */
function place(table: Table, seat: number, zone: "hand" | "battlefield", ...cards: string[]) {
	return cards.map((card) => {
		const object = cardsIn(table, "library", seat).find((one) => one.card === card)!;
		commit(table, [{ do: "move", what: object.id, to: zone, reason: "game-setup" }], "game-setup");
		return table.things.get(object.id)!;
	});
}
/** Keep both hands and stop at a seat's first main phase with priority. */
function main(table: Table, seat: number, turn = seat + 1) {
	for (let guard = 0; guard < 2000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && decision.seat === seat && table.cursor.turn === turn && table.cursor.steps[0] === "precombat-main") return;
		apply(table, decision.situation === "pregame" ? "keep" : decision.options.find((option) => option.id === "pass")?.id ?? decision.options[0]!.id, "engine", "forced");
	}
	throw new Error("Never reached the main phase.");
}
const draft = (procedure: Procedure): Draft => ({ id: "test", recipe: "test", label: "Test", guidance: "Test", next: 0, status: "editing", reserves: [],
	steps: [{ label: "Do it", when: {}, action: { procedure } }] });
const offered = (table: Table, procedure: Procedure) => procedureOptions(draft(procedure), workFrame(table, table.cursor.priority!));
function announce(table: Table, procedure: Procedure, which: (option: ProcedureOption) => boolean = () => true) {
	const choice = offered(table, procedure).find(which);
	assert.ok(choice, `${procedure.claim} is offered`);
	activate(table, choice.activation, { picked: choice.option.id, offered: [choice.option.id], by: "model", why: "declared" });
	return choice;
}
const passBoth = (table: Table) => { for (let at = 0; at < 2; at++) { while (!nextDecision(table)) advance(table); apply(table, "pass", "engine", "forced"); } };
/** Answer the pending resolution step with the option a test names, or its only option. */
const step = (table: Table, pick?: (label: string) => boolean) => {
	const decision = nextDecision(table)!;
	assert.equal(decision.situation, "resolution");
	const option = pick ? decision.options.find((one) => pick(one.label)) : decision.options.length === 1 ? decision.options[0] : undefined;
	assert.ok(option, `a resolution option among: ${decision.options.map((one) => one.label).join(" | ")}`);
	apply(table, option.id, "model", "chosen");
	return decision;
};
/** Finish resolving, apply the state check, and come back to the next priority. */
const finish = (table: Table) => {
	while (table.resolution) step(table);
	for (let decision = nextDecision(table); decision?.situation !== "priority"; decision = nextDecision(table)) {
		if (!decision) advance(table);
		else apply(table, decision.options[0]!.id, "engine", "forced");
	}
};

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
	assert.deepEqual(search.options.map((option) => option.label), ["Choose Forest (library)", "Choose nothing"], "identical Forests are one choice, and finding nothing is allowed");
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

	const passage = cardsIn(table, "battlefield", 0).find((one) => one.card === "Elven Passage")!;
	announce(table, { ...authored("Crack Elven Passage", { tap: true, life: 1, sacrifice: "this" }, ["battlefield"], "Elven Passage"), basis: "{T}, Pay 1 life, Sacrifice this land" });
	assert.equal(table.seats[0]!.life, 19);
	assert.equal(table.things.get(passage.id)!.zone, "graveyard");

	// X is announced, from zero to what the lands can pay.
	main(table, 1, 2);
	const x = offered(table, authored("Pay X", { mana: "{X}" }, ["battlefield"], "Mountain")).map((option) => option.activation.x);
	assert.deepEqual([...new Set(x)], [0, 1, 2, 3], "three Mountains pay up to three");
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
	const cast = nextDecision(table)!.options.find((option) => option.id.startsWith("cast:") && option.label.includes("Sazh's Chocobo"))!;
	apply(table, cast.id, "model", "chosen");
	announce(table, ability("Tax", [{ do: "counter", what: "target:0", unless: { who: "controller:target:0", pays: { life: 2 } } }],
		[{ object: { zones: ["stack"], types: ["creature"] } }]));
	passBoth(table);
	const tax = nextDecision(table)!;
	assert.equal(tax.seat, 0, "the countered spell's controller is asked");
	assert.deepEqual(tax.options.map((option) => option.label), ["Pay 2 life. ", "Do not pay; it is countered"]);
	apply(table, tax.options[1]!.id, "model", "chosen");
	assert.equal(table.things.get(cub.id)!.zone, "graveyard");
});
