/** A counter replacement changes one stack departure, never two zone changes. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { checkProcedure, printedCast } from "../src/core/procedures.ts";
import { symbols } from "../src/core/announce.ts";
import { announce, example, finish, main, passBoth, place, step } from "./play.ts";

test("a countered spell goes straight to its replacement destination, while payment or protection preserves it", () => {
	const prepared = example("Cast No More Lies, exiling the countered spell unless its controller pays three mana");
	const counter = checkProcedure({ ...prepared, instructions: [{ ...prepared.instructions[0]!, as: "countered" }] });
	for (const choice of ["pay", "decline", "unfunded", "protected"] as const) {
		const table = start(standard, [{ deck: alpha(deck("Azorius Control")) }, { deck: deck("Mono-Red Aggro") }], `counter-destination-${choice}`);
		place(table, 0, "hand", "No More Lies"); const [nova] = place(table, 1, "hand", "Nova Hellkite");
		main(table, 1);
		const mana = symbols(table.printed["Nova Hellkite"]!.mana)!;
		commit(table, [{ do: "add-mana", who: 0, colors: ["W", "U"] },
			{ do: "add-mana", who: 1, colors: Array(mana.generic + mana.colors.length + (choice === "unfunded" ? 0 : 3)).fill("R") }], "game-setup");
		const initial = structuredClone(table), from = table.ledger.length;
		// The protected variant isolates the already-supported keyword conflict.
		announce(table, { ...printedCast("Nova Hellkite", table.printed["Nova Hellkite"]!), ...(choice === "protected" ? { words: ["can't be countered"] } : {}) });
		const incarnation = nova!.incarnation;
		apply(table, "pass", "model", "chosen"); announce(table, counter); passBoth(table);
		const pending = structuredClone(table), at = table.ledger.length, decision = nextDecision(table)!;
		assert.equal(decision.seat, 1, "the target spell's controller answers the tax");
		if (choice === "unfunded") assert.ok(!decision.options.some(one => one.label.startsWith("Pay ")));
		step(table, label => choice === "pay" ? label.startsWith("Pay ") : choice === "protected" ? label.startsWith("Apply can't be countered") : label.startsWith("Do not pay"));
		const moved = choice === "decline" || choice === "unfunded";
		const completed = table.log.at(-1)!.changes.find(one => one.do === "resolution" && one.action === "next");
		assert.ok(completed?.do === "resolution" && completed.action === "next");
		assert.deepEqual(completed.bind!.countered, { objects: moved ? [{ id: nova!.id, incarnation }] : [], players: [], amount: Number(moved) });
		finish(table);
		assert.equal(nova!.zone, moved ? "exile" : "stack"); assert.equal(nova!.incarnation, incarnation + Number(moved));
		const departures = table.log.flatMap(receipt => receipt.changes).filter(change => change.do === "move" && change.what === nova!.id && change.reason === "counter");
		assert.deepEqual(departures.map(change => "to" in change ? change.to : undefined), moved ? ["exile"] : []);
		assert.ok(!table.log.some(receipt => receipt.after[nova!.id]?.zone === "graveyard"));
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table, "a clone at the tax decision retains the destination and payer");
	}
});
