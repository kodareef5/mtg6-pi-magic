/** Declining a whole search differs from accepting it and finding no card. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { cardsIn } from "../src/core/table.ts";
import { project } from "../src/core/view.ts";
import { announce, example, finish, main, passBoth, place, step } from "./play.ts";

test("an optional search belongs to the destroyed target's controller and shuffles only when accepted", () => {
	for (const answer of ["decline", "none", "land"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Selesnya Landfall")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `optional-search-${answer}`);
		main(table, 0); place(table, 0, "hand", "Erode");
		const creature = cardsIn(table, "library", 1).find((one) => table.printed[one.card!]!.type.includes("Creature"))!;
		commit(table, [{ do: "move", what: creature.id, to: "battlefield", reason: "game-setup" }], "game-setup");
		commit(table, [{ do: "add-mana", who: 0, colors: ["W"] }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		const ownLibrary = structuredClone(cardsIn(table, "library", 0)), library = structuredClone(cardsIn(table, "library", 1));
		announce(table, example("Erode with its controller's optional search"), (one) => one.activation.targets[0]?.some((target) => "id" in target && target.id === creature!.id) ?? false);
		passBoth(table); step(table);
		assert.equal(table.things.get(creature!.id)!.zone, "graveyard");
		const beforeChoice = structuredClone(table), atChoice = table.ledger.length, decision = nextDecision(table)!;
		assert.equal(decision.seat, 1, "the target's last controller chooses after destruction");
		assert.equal(decision.options.length, 2);
		assert.ok(decision.options.every((one) => !one.objects?.length && !one.cards?.length), "accepting the search does not expose library identities");
		step(table, (label) => answer === "decline" ? label.startsWith("Decline") : label.startsWith("Carry out"));
		const afterChoice = structuredClone(table), atAccepted = table.ledger.length;
		if (answer !== "decline") {
			const search = nextDecision(table)!;
			assert.equal(search.seat, 1); assert.equal(search.blocked, undefined);
			assert.ok(search.options.some((one) => one.objects?.length));
			assert.ok(search.options.every((one) => one.objects?.every((ref) => library.some((card) => card.id === ref.id)) ?? true));
			assert.equal(project(table, 0).objects!.filter((one) => one.zone === "library").length, 0);
			const option = search.options.find((one) => answer === "land" ? one.objects?.length : !one.objects?.length)!;
			apply(table, option.id, "model", "chosen");
		}
		finish(table);
		assert.deepEqual(cardsIn(table, "library", 0), ownLibrary, "only the searcher's library can change");
		const landed = library.filter((one) => table.things.get(one.id)!.zone === "battlefield");
		assert.equal(landed.length, answer === "land" ? 1 : 0);
		if (landed.length) {
			const land = table.things.get(landed[0]!.id)!;
			assert.equal(land.controller, 1); assert.equal(land.tapped, true);
		}
		if (answer === "decline") {
			assert.deepEqual(cardsIn(table, "library", 1), library);
			assert.deepEqual(table.rng, beforeChoice.rng);
		} else assert.notDeepEqual(table.rng, beforeChoice.rng, "accepting the search shuffles even when it finds no card");
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(beforeChoice, table.ledger.slice(atChoice)), table, "clone at the optional choice");
		assert.deepEqual(relive(afterChoice, table.ledger.slice(atAccepted)), table, "clone after accepting or declining");
	}
});
