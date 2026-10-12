/** Restricted mana reads casting provenance before any motion, both from sources and the pool. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { activationChanges, checkProcedure, printedCast } from "../src/core/procedures.ts";
import { colorChoices, produces } from "../src/core/funding.ts";
import { payable } from "../src/core/payment-options.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { manaLines } from "../src/context/strategy-facts.ts";
import { establish, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("mixed-color mana retains its casting-origin restriction through drafts, floating payment, forecasts and replay", () => {
	assert.deepEqual(colorChoices(2), ["WW", "UU", "BB", "RR", "GG"].map(one => one.split("")));
	assert.equal(colorChoices(2, true).length, 15);
	assert.equal(colorChoices(3, true).length, 35);
	const watch = "Interdimensional Web Watch", doc = "Doc Aurlock, Grizzled Genius";
	const ability = pack(watch).find(one => one.kind === "mana")!;
	assert.throws(() => checkProcedure({ source: { card: watch }, timing: "stack", cost: { tap: true }, claim: "Invalid output", basis: ability.basis,
		instructions: [{ do: "mana", who: "you", combination: true, colors: ["U"] }] }), /combination/);
	for (const floating of [false, true]) {
		const table = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Izzet Prowess")) }], `mana-origin-${floating}`, undefined, { announcementsFrom: 0 });
		// Isolate the mana ability; the printed entry trigger is exercised by ordinary games.
		const source = establish(table, 0, watch, [ability]);
		const [exiled, hand, grave] = place(table, 0, "hand", doc, doc, doc);
		main(table, 0);
		editWork(table, 0, [{ do: "package.put", package: { card: doc, assessed: true, printedCast: true, registers: pack(doc) } }], "doc");
		commit(table, [{ do: "move", what: exiled!.id, to: "exile", reason: "exile" }, { do: "move", what: grave!.id, to: "graveyard", reason: "discard" }], "game-setup");
		for (const card of [exiled!, grave!]) commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite", on: { id: card.id, incarnation: card.incarnation } } }], "game-setup");
		if (floating) commit(table, [{ do: "tap", what: source.id }, { do: "add-mana", who: 0, colors: ["U", "G"], spendFrom: ["exile"] },
			{ do: "move", what: source.id, to: "graveyard", reason: "sacrifice" }], "game-setup");
		const cast = printedCast(doc, table.printed[doc]!), frame = workFrame(table, 0);
		const options = offered(table, cast);
		assert.ok(options.length); assert.ok(options.every(one => one.activation.source.id === exiled!.id), "hand and permitted graveyard casts cannot spend exile-only mana");
		const proposed = { ...frame.view.objects!.find(one => one.id === exiled!.id)!, zone: "stack" as const };
		assert.equal(payable(frame, { generic: 0, colors: ["G", "U"] }, new Set(), proposed), false, "an activation has no casting origin even if its source is on the stack");
		assert.match(manaLines(frame).join(" "), /only spells cast from exile/);
		for (const card of [exiled!, hand!, grave!]) {
			const visible = frame.view.objects!.find(one => one.id === card.id)!;
			assert.equal(manaBudget(frame, cast, visible).payableBeforeNewResources, card === exiled);
			const plan = { objective: "Cast the selected Doc", guidance: "Check its original zone", steps: [{ label: "Doc", when: { step: "precombat-main" as const },
				action: { procedure: { ...cast, source: { ...cast.source, refs: [{ id: card.id, incarnation: card.incarnation }] } } } }] };
			assert.equal(paymentForecast(frame, plan).conflicts.length > 0, card !== exiled);
		}
		const forged = structuredClone(options[0]!.activation); forged.source = { id: hand!.id, incarnation: hand!.incarnation }; delete forged.permission;
		assert.throws(() => activationChanges(table, forged), /restricted|may not be spent/);
		if (!floating) {
			assert.equal(produces(ability, { world: tableWorld(table), controller: 0, source }).length, 15);
			const stripped = structuredClone(options[0]!.activation); delete stripped.funding![0]!.spendFrom;
			assert.throws(() => activationChanges(table, stripped), /no registered mana ability/);
		}
		const initial = structuredClone(table), from = table.ledger.length;
		const beginning = nextDecision(table)!.options.find(one => one.announcement?.source.id === exiled!.id)!;
		assert.ok(beginning); apply(table, beginning.id, "model", "chosen"); apply(table, "announce:cost:0", "model", "chosen");
		const pending = structuredClone(table), at = table.ledger.length;
		const payment = nextDecision(table)!.options.find(one => one.use)!;
		assert.deepEqual(payment.use!.funding?.[0]?.colors ?? ["U", "G"], ["U", "G"]);
		apply(table, payment.id, "model", "chosen"); passBoth(table); finish(table);
		assert.equal(exiled!.zone, "battlefield"); assert.equal(table.seats[0]!.pool.length, 0);
		assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	}
});
