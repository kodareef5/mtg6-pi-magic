/** A payment spends only its price while preserving every unused output and its terms.
	* Past 150 lines to exercise choice, provenance, forecasting and saved continuation together. */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { activate, activationChanges, printedCast } from "../src/core/procedures.ts";
import { fundings, manaSplit, paying } from "../src/core/funding.ts";
import { payable, paymentOptions } from "../src/core/payment-options.ts";
import { completePayments } from "../src/core/complete-payments.ts";
import { paymentForecast } from "../src/core/budget.ts";
import { casting } from "../src/core/casting.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { project } from "../src/core/view.ts";
import { fork, open, replay, relive, save, type Header } from "../src/core/journal.ts";
import { load } from "../src/core/cards.ts";
import type { Plan } from "../src/core/language.ts";
import { establish, example, finish, main, offered, pack, passBoth, place } from "./play.ts";

const watch = "Interdimensional Web Watch", elf = "Llanowar Elves", secondCard = "Sleight of Hand";
function position() {
	const table = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Izzet Prowess")) }], "unused-source-output", undefined,
		{ announcementsFrom: 0, excessManaFrom: 0 });
	establish(table, 0, watch, pack(watch).filter(one => one.kind === "mana"));
	establish(table, 0, "Doc Aurlock, Grizzled Genius", pack("Doc Aurlock, Grizzled Genius"));
	const cards = [...place(table, 0, "exile", elf), ...place(table, 1, "exile", secondCard)];
	for (const one of cards) commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite", on: { id: one.id, incarnation: one.incarnation } } }], "game-setup");
	editWork(table, 0, [{ do: "package.put", package: { card: elf, assessed: true, printedCast: true, registers: pack(elf) } },
		{ do: "package.put", package: { card: secondCard, assessed: true, registers: [], procedures: [example("Cast Sleight of Hand")] } }], "prepare-casts");
	return table;
}

test("source output left floating remains a chosen, restricted resource through costs, forecasts and replay", () => {
	const table = position(); main(table, 0);
	table.excessManaFrom = table.ledger.length;
	const frame = workFrame(table, 0), source = frame.view.objects!.find(one => one.card === watch)!;
	const elves = frame.view.objects!.find(one => one.card === elf && one.zone === "exile")!;
	const spell = { ...elves, zone: "stack" as const }, cost = { generic: 0, colors: ["G" as const] };
	const before = structuredClone(table), menu = paymentOptions(frame, cost, [], new Set(), spell, "exile");
	const complete = completePayments(frame, cost, menu)!;
	assert.equal(complete.length, 5, "pay G and retain any one of the five colors");
	assert.equal(new Set(complete.map(one => manaSplit(one.funding.taps[0]!).remaining.join())).size, 5);
	assert.ok(complete.every(one => one.leaves.includes("Keeps floating") && one.leaves.includes("restricted")));
	assert.equal(completePayments(frame, cost, menu, 4), undefined, "a menu bound never truncates possible remainders");
	for (const payment of complete) {
		const individual = paymentOptions(frame, cost, payment.parts.map(one => one.id), new Set(), spell, "exile");
		assert.equal(individual.complete, true); assert.deepEqual(individual.funding, payment.funding);
	}
	assert.deepEqual(table, before, "inspecting payment options neither taps nor floats mana");
	assert.equal(payable(frame, cost, new Set(), spell, "hand"), false);
	assert.equal(payable(frame, cost, new Set(), spell), false, "an activated ability has no casting origin");
	assert.equal(payable(frame, { generic: 3, colors: [] }, new Set(), spell, "exile"), false, "the output alternatives still share one physical source");
	const pair = position(); establish(pair, 0, watch, pack(watch).filter(one => one.kind === "mana")); main(pair, 0);
	const three = { generic: 3, colors: [] }, pairedFrame = workFrame(pair, 0);
	const paired = fundings(pairedFrame, three, new Set(), spell, "exile");
	assert.ok(paired.length, "one identical Watch spends one unit and the other spends two");
	assert.ok(paired.every(one => one.funding.taps.length === 2 && new Set(one.funding.taps.map(tap => tap.source.id)).size === 2));
	assert.equal(new Set(paired.map(one => one.funding.taps.flatMap(tap => manaSplit(tap).remaining).join())).size, 5);
	const pairMenu = paymentOptions(pairedFrame, three, [], new Set(), spell, "exile");
	for (const one of paired) {
		const selected = one.funding.taps.map(tap => pairMenu.parts.find(part => isDeepStrictEqual(part.funding.taps[0], tap))!);
		assert.ok(selected.every(Boolean));
		assert.equal(paymentOptions(pairedFrame, three, selected.map(part => part.id), new Set(), spell, "exile").complete, true);
	}
	const all = offered(table, printedCast(elf, table.printed[elf]!));
	assert.equal(all.length, 5); assert.equal(new Set(all.map(one => one.option.id)).size, 5, "flat options distinguish each produced remainder");
	const legacy = structuredClone(table); delete legacy.excessManaFrom;
	assert.equal(offered(legacy, printedCast(elf, legacy.printed[elf]!)).length, 0);
	assert.throws(() => activationChanges(legacy, all[0]!.activation), /exact source output/);
	const wrong = structuredClone(all[0]!.activation); wrong.funding![0]!.colors = ["C"];
	assert.throws(() => activationChanges(table, wrong), /subset/);
	const invented = structuredClone(all[0]!.activation); invented.funding![0]!.produced = ["G", "G", "G"];
	assert.throws(() => activationChanges(table, invented), /registered mana ability/);
	const empty = structuredClone(all[0]!.activation); empty.funding![0]!.colors = [];
	assert.throws(() => activationChanges(table, empty), /must contribute/);
	const plan: Plan = { objective: "Cast both exiled cards", guidance: "Spend the Watch's two mana on separate spells", steps: [elf, secondCard].map(card => ({
		label: card, when: { step: "precombat-main" }, action: { procedure: card === elf ? printedCast(card, table.printed[card]!) : example("Cast Sleight of Hand") },
	})) };
	const forecast = paymentForecast(frame, plan);
	assert.deepEqual(forecast.conflicts, []); assert.equal(forecast.payments.length, 2);
	assert.deepEqual(forecast.payments[0]!.funding.taps[0]!.produced, ["U", "G"]);
	assert.equal(forecast.payments[1]!.funding.taps.length, 0); assert.equal(forecast.payments[1]!.funding.paid.length, 1);
	assert.ok(paymentForecast(workFrame(legacy, 0), plan).conflicts.length);
	const blocked = structuredClone(frame), familiar = blocked.view.objects!.find(one => one.card === secondCard && one.zone === "exile")!;
	familiar.zone = "hand";
	assert.ok(paymentForecast(blocked, plan).conflicts.length, "the remaining restricted unit cannot pay for the second spell from hand");
	const history = table.ledger.length;
	apply(table, nextDecision(table)!.options.find(one => one.announcement?.source.id === elves.id)!.id, "model", "chosen");
	apply(table, "announce:cost:0", "model", "chosen");
	const pending = structuredClone(table), at = table.ledger.length;
	const picked = nextDecision(table)!.options.find(one => one.use?.funding?.[0]?.produced?.join("") === "UG")!;
	assert.ok(picked); assert.equal(table.seats[0]!.pool.length, 0); assert.equal(table.things.get(source.id)!.tapped, false);
	const cancelled = structuredClone(table); apply(cancelled, "announce:cancel", "model", "chosen");
	assert.equal(cancelled.seats[0]!.pool.length, 0); assert.equal(cancelled.things.get(source.id)!.tapped, false);
	apply(table, picked.id, "model", "chosen");
	assert.equal(table.seats[0]!.pool.length, 1); assert.equal(table.seats[0]!.pool[0]!.color, "U");
	assert.deepEqual(table.seats[0]!.pool[0]!.spendFrom, ["exile"]);
	assert.deepEqual(casting(table, table.things.get(elves.id)!)!.mana, ["G"], "a cast records what was spent, not the source's full output");
	passBoth(table); finish(table);
	const floating = structuredClone(table), floatingAt = table.ledger.length;
	const second = offered(table, example("Cast Sleight of Hand")).find(one => one.activation.paid.length === 1)!;
	assert.ok(second); assert.equal(second.activation.cost.generic, 0, "the second spell spends only its colored symbol");
	activate(table, second.activation, { picked: second.option.id, offered: [second.option.id], by: "model", why: "declared" });
	assert.equal(table.seats[0]!.pool.length, 0);
	assert.deepEqual(casting(table, table.things.get(second.activation.source.id)!)!.mana, ["U"]);
	passBoth(table);
	// The resolving private choice stays with the caster, even though the exiled spell has another owner.
	while (table.resolution) apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
	finish(table);
	for (const [initial, from] of [[before, history], [pending, at], [floating, floatingAt]] as const) assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);

	const dir = mkdtempSync(join(tmpdir(), "excess-mana-"));
	try {
		const universe = load("cards/standard.tsv");
		const header: Header = { id: "excess", seed: table.rng.seed, format: "standard", announcementsFrom: 0, excessManaFrom: table.excessManaFrom,
			seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: universe.path, generated: universe.generated, names: universe.names, faces: universe.faces },
			rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
		const journal = open(join(dir, "game.jsonl"), header); save(journal, table);
		assert.deepEqual(replay(journal.path, position).table, table);
		const historicalHeader = { ...header }; delete historicalHeader.excessManaFrom;
		const historical = open(join(dir, "historical.jsonl"), historicalHeader); save(historical, legacy);
		assert.deepEqual(replay(historical.path, position).table, legacy, "a historical header overrides a newer starter's default");
		const prefix = replay(journal.path, position, table.excessManaFrom! - 1).table;
		assert.equal(project(prefix, 0).excessMana, undefined, "the old prefix retains its menu contract until the recorded boundary");
		const path = join(dir, "clone.jsonl"); fork(journal.path, at, "excess-clone", path);
		const clone = replay(path, position).table;
		assert.deepEqual(clone.announcement, pending.announcement);
		assert.deepEqual(relive(clone, table.ledger.slice(at)), table);
	} finally { rmSync(dir, { recursive: true, force: true }); }

	// Generic conservation for a granted mana ability: life, sacrifice and output terms are paid once.
	const granted = position(); main(granted, 0);
	const permanent = [...granted.things.values()].find(one => one.card === watch && one.zone === "battlefield")!;
	commit(granted, [{ do: "note", note: { kind: "label", text: "Granted mana payment fixture", by: 0, until: "end-of-turn", on: { id: permanent.id, incarnation: permanent.incarnation },
		change: { registers: [{ kind: "mana", basis: "Granted payment fixture", cost: { tap: true, sacrifice: "this", life: 1 }, colors: ["G", "U"], spendFrom: ["exile"], until: "end-of-turn", spellWords: ["can't be countered"] }] } } }], "game-setup");
	const grantedFrame = workFrame(granted, 0), candidates = fundings(grantedFrame, cost, new Set(), spell, "exile");
	const special = candidates.find(one => one.funding.taps[0]?.sacrifice)!;
	assert.ok(special);
	const changes = paying(special.funding, 0, granted.cursor.clock, 0); commit(granted, changes, "cost-payment");
	assert.equal(permanent.zone, "graveyard"); assert.equal(granted.seats[0]!.life, 19);
	assert.equal(granted.seats[0]!.pool.length, 1); assert.equal(granted.seats[0]!.pool[0]!.color, "U");
	assert.deepEqual(granted.seats[0]!.pool[0]!.spendFrom, ["exile"]); assert.equal(granted.seats[0]!.pool[0]!.until, "end-of-turn");
	assert.deepEqual(granted.seats[0]!.pool[0]!.spellWords, ["can't be countered"]);
	assert.ok(project(granted, 0).yours.some(line => line.includes("only spells cast from exile")));
});
