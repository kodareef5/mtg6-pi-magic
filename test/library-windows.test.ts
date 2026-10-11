/** A simultaneous instruction takes a separate ordered window from each library. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { project, describe } from "../src/core/view.ts";
import { printedCast } from "../src/core/procedures.ts";
import { objects, tableWorld } from "../src/core/selectors.ts";
import { editWork } from "../src/core/work-tools.ts";
import { main, place, pack, announce, passBoth, finish } from "./play.ts";

test("each library retains its own bottom cards while all selected cards move in one private group", () => {
	for (const small of [0, 4, 6, 9]) {
		const table = start(standard, [{ deck: alpha(deck("Dimir Excruciator")) }, { deck: alpha(deck("Mono-Red Aggro")) }], `excruciator-${small}`);
		main(table, 0);
		const [demon] = place(table, 0, "hand", "Doomsday Excruciator");
		const registers = pack(demon!.card!);
		editWork(table, 0, [{ do: "package.put", package: { card: demon!.card!, registers } }], "excruciator-terms");
		commit(table, [...cardsIn(table, "library", 1).slice(small).map(one => ({ do: "move" as const, what: one.id, to: "outside" as const, reason: "game-setup" as const })),
			{ do: "add-mana", who: 0, colors: ["B", "B", "B", "B", "B", "B"] }], "game-setup");
		const before = [0, 1].map(seat => structuredClone(cardsIn(table, "library", seat)));
		const initial = structuredClone(table), from = table.ledger.length;
		const scope = { world: tableWorld(table), controller: 0 };
		assert.deepEqual(objects(scope, { top: 1, of: "each-player" }).map(one => one.id), before.flatMap(one => one.slice(0, 1).map(card => card.id)));
		assert.deepEqual(table, initial, "reading library windows is pure");
		announce(table, printedCast(demon!.card!, table.printed[demon!.card!]!)); passBoth(table); finish(table);
		assert.equal(nextDecision(table)!.situation, "trigger-order");
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		const pending = structuredClone(table), at = table.ledger.length;
		finish(table);
		const moved = table.log.filter(one => one.changes.some(change => change.do === "move" && change.faceDown));
		assert.equal(moved.length, 1);
		assert.equal(moved[0]!.changes.filter(one => one.do === "move" && one.faceDown).length, before.reduce((sum, library) => sum + Math.max(0, library.length - 6), 0));
		for (const seat of [0, 1]) {
			const retained = cardsIn(table, "library", seat), expected = before[seat]!.slice(-6);
			assert.deepEqual(retained.map(one => [one.id, one.incarnation]), expected.map(one => [one.id, one.incarnation]));
			assert.deepEqual(retained.map(one => one.position), retained.map((_, index) => index));
		}
		const hidden = cardsIn(table, "exile");
		for (const viewer of [0, 1, "spectator"] as const) {
			const view = project(table, viewer), publicReceipt = describe(table, moved[0]!, viewer);
			for (const one of hidden) {
				assert.equal(view.objects!.find(object => object.id === one.id)!.card, undefined);
				assert.equal(one.lookedBy, undefined); assert.ok(!publicReceipt.includes(one.card!));
			}
		}
		assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, JSON.parse(JSON.stringify(table.ledger.slice(at)))), table);
		const uncast = structuredClone(initial);
		commit(uncast, [{ do: "move", what: demon!.id, to: "battlefield", registers, reason: "resolve" }], "resolve");
		assert.equal(uncast.waiting.length, 0, "entering without casting does not trigger the exile");
	}
});
