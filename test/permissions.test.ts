/** Permissions preserve their price, player, incarnation and expiration through replay. */
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
import { announce, establish, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

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
	assert.deepEqual(castingPrices(world, 1, claw, 2, 0, true), [{}]);
	assert.equal(castingPrices(viewWorld(project(table, 0)), 0, claw, 2).length, 0);

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
