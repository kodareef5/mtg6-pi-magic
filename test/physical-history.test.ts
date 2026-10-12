/** Public action history survives departures and source entry without retaining hidden identities.
 * Past 150 lines to exercise descent and both Bookworm alternatives through real end-step decisions. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision, advance } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { amount, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork } from "../src/core/work-tools.ts";
import { check, InstructionSchema } from "../src/core/language.ts";
import type { PhysicalAction } from "../src/core/physical-history.ts";
import { main, place, announce, passBoth, step, finish, pack, quiet } from "./play.ts";

const corpses = "Corpses of the Lost", bookworm = "Oblivious Bookworm";
const position = () => start(standard, [{ deck: alpha(deck("Mono-Black Aggro")) }, { deck: alpha(deck("4c Reanimator")) }], "physical-history");
const count = (table: Table, who: number, action: PhysicalAction) => amount({ world: tableWorld(table), controller: who }, { history: action, by: "you" });
function end(table: Table) {
	for (let guard = 0; guard < 500; guard++) {
		const decision = nextDecision(table);
		if (table.cursor.steps[0] === "end" && decision && ["trigger-order", "priority"].includes(decision.situation)) return decision;
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	throw new Error("Never reached end-step decisions");
}
function resolve(table: Table) {
	finish(table);
	while (nextDecision(table)?.situation === "trigger-order") apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	while (cardsIn(table, "stack").length) { passBoth(table); finish(table); }
}
function cast(table: Table, who: number, card: string) {
	const object = cardsIn(table, "hand", who).find(one => one.card === card) ?? place(table, who, "hand", card)[0]!;
	editWork(table, who, [{ do: "package.put", package: { card, registers: pack(card), printedCast: true, assessed: true } }], `prepare-${card}`);
	commit(table, [{ do: "add-mana", who, colors: who ? ["G", "U"] : ["B", "C", "C"] }], "game-setup");
	return object!;
}

test("physical turn counts retain their original player and never require hidden identities or a surviving object", () => {
	assert.throws(() => check(InstructionSchema, { do: "draw", who: "you", count: { history: "descended", by: "you", of: { types: ["creature"] } } }, "unsupported past selector"));
	for (const mode of ["none", "permanent", "nonpermanent", "token", "opponent", "repeated", "decline", "manifested-instant"] as const) {
		const table = position(); main(table, 0);
		if (["permanent", "repeated", "decline"].includes(mode)) {
			const land = cardsIn(table, "library", 0).find(one => one.card === "Swamp")!;
			commit(table, [{ do: "move", what: land.id, to: "graveyard", reason: "mill" }, ...(mode === "repeated" ? [
				{ do: "move" as const, what: land.id, to: "hand" as const, reason: "bounce" as const },
				{ do: "move" as const, what: land.id, to: "graveyard" as const, reason: "discard" as const },
			] : []), { do: "move", what: land.id, to: "exile", reason: "exile" }], "resolve");
		} else if (mode === "nonpermanent" || mode === "manifested-instant") {
			const spell = cardsIn(table, "library", 0).find(one => one.card === "Requiting Hex")!;
			if (mode === "manifested-instant") commit(table, [{ do: "move", what: spell.id, to: "battlefield", faceDown: "manifest", reason: "resolve" }], "resolve");
			commit(table, [{ do: "move", what: spell.id, to: "graveyard", reason: "mill" }], "resolve");
		} else if (mode === "opponent") {
			const land = cardsIn(table, "library", 1).find(one => one.card === "Forest")!;
			commit(table, [{ do: "move", what: land.id, to: "graveyard", reason: "mill" }], "resolve");
		} else if (mode === "token") {
			commit(table, [{ do: "token", id: "skeleton-fixture", controller: 0, spec: { name: "Skeleton Pirate Token", types: ["creature"], subtypes: ["Skeleton", "Pirate"], colors: ["B"], power: 2, toughness: 2 } }], "resolve");
			commit(table, [{ do: "move", what: "skeleton-fixture", to: "graveyard", reason: "destroy" }], "resolve");
		}
		const expected = mode === "repeated" ? 2 : ["permanent", "decline"].includes(mode) ? 1 : 0;
		assert.equal(count(table, 0, "descended"), expected, mode);
		assert.equal(count(table, 1, "descended"), mode === "opponent" ? 1 : 0);
		finish(table);
		const source = cast(table, 0, corpses), initial = structuredClone(table), from = table.ledger.length;
		announce(table, printedCast(corpses, table.printed[corpses]!), one => one.activation.source.id === source.id); passBoth(table); resolve(table);
		const skeleton = cardsIn(table, "battlefield", 0).find(one => one.token)!;
		assert.equal(characteristics(table, skeleton)!.power, 3); assert.ok(characteristics(table, skeleton)!.words.includes("haste"));
		assert.equal(count(table, 0, "descended"), expected, "entering the source does not reset its owner's earlier history");
		const ended = end(table), pending = structuredClone(table), at = table.ledger.length;
		const life = table.seats[0]!.life;
		assert.equal(ended.situation, expected ? "trigger-order" : "priority");
		if (expected) {
			apply(table, ended.options[0]!.id, "model", "chosen"); passBoth(table);
			step(table, label => mode === "decline" ? label.startsWith("Decline") : !label.startsWith("Decline")); finish(table);
		}
		assert.equal(source.zone, expected && mode !== "decline" ? "hand" : "battlefield", mode);
		assert.equal(table.seats[0]!.life, life - (expected && mode !== "decline" ? 1 : 0));
		assert.equal(characteristics(table, skeleton)!.power, source.zone === "hand" ? 2 : 3);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
		main(table, 1, 2);
		assert.equal(count(table, 0, "descended"), 0, "a new turn does not inherit the previous turn's events");
	}

	for (const mode of ["none", "entry", "face-up", "opponent", "decline", "previous-turn"] as const) {
		const table = position(); main(table, mode === "previous-turn" ? 0 : 1);
		const actor = mode === "opponent" ? 0 : 1;
		const hidden = cardsIn(table, "library", 0).find(one => one.card === "Forsaken Miner")!;
		if (["entry", "face-up", "opponent", "previous-turn"].includes(mode)) {
			commit(table, [{ do: "move", what: hidden.id, to: "battlefield", controller: actor, faceDown: "manifest", reason: mode === "face-up" ? "game-setup" : "resolve" }], mode === "face-up" ? "game-setup" : "resolve");
			if (mode === "face-up") commit(table, [{ do: "turn-face-up", what: hidden.id }], "resolve");
			for (const viewer of [0, 1, "spectator"] as const) {
				const view = project(table, viewer), history = view.history!.filter(one => one.kind === "physical");
				assert.ok(!JSON.stringify(history).includes(hidden.card!));
				for (const action of ["entered-face-down", "turned-face-up"] as const)
					assert.equal(amount({ world: viewWorld(view), controller: actor }, { history: action, by: "you" }), count(table, actor, action));
			}
			commit(table, [{ do: "move", what: hidden.id, to: "hand", reason: "bounce" }], "resolve");
		}
		if (mode === "previous-turn") main(table, 1, 2);
		const source = cast(table, 1, bookworm), initial = structuredClone(table), from = table.ledger.length;
		announce(table, printedCast(bookworm, table.printed[bookworm]!), one => one.activation.source.id === source.id); passBoth(table); finish(table);
		assert.equal(source.zone, "battlefield");
		const ended = end(table), pending = structuredClone(table), at = table.ledger.length;
		assert.equal(ended.situation, "trigger-order"); apply(table, ended.options[0]!.id, "model", "chosen"); passBoth(table);
		const hand = cardsIn(table, "hand", 1).length;
		step(table, label => mode === "decline" ? label.startsWith("Decline") : label.startsWith("Carry out"));
		if (mode !== "decline") {
			step(table); // Draw first.
			assert.equal(cardsIn(table, "hand", 1).length, hand + 1);
			step(table); // Check whether the discard group applies.
			if (!["entry", "face-up"].includes(mode)) {
				const discard = nextDecision(table)!; assert.ok(discard.options.every(one => one.objects?.length), "the required discard has no decline");
				apply(table, discard.options[0]!.id, "model", "chosen"); step(table);
			}
		}
		finish(table);
		assert.equal(cardsIn(table, "hand", 1).length, hand + (["entry", "face-up"].includes(mode) ? 1 : 0), mode);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	}
});
