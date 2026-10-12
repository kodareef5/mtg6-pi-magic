/** Plot preserves its payment, private announcement and later incarnation-scoped permission.
 * Past 150 lines to keep cost reductions and casting restrictions in the same lifecycle. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import type { Plan } from "../src/core/language.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { announcementOffers } from "../src/core/announcement-options.ts";
import { activationChanges, checkProcedure, printedCast } from "../src/core/procedures.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { happened, tableWorld } from "../src/core/selectors.ts";
import { playable } from "../src/core/permits.ts";
import { project, describe } from "../src/core/view.ts";
import { preparation } from "../src/core/readiness.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { example, finish, main, pack, passBoth, place } from "./play.ts";

const plot = example("Plot Slickshot Show-Off"), card = "Slickshot Show-Off";
function position(opponent = "Jeskai Artifacts") {
	const table = start(standard, [{ deck: alpha(deck("Izzet Prowess")) }, { deck: alpha(deck(opponent)) }], "plot", undefined, { announcementsFrom: 0 });
	place(table, 0, "hand", card, card);
	place(table, 0, "battlefield", "Island", "Steam Vents");
	main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [plot] } }], "plot-assessed");
	return table;
}
const begin = (table: Table) => apply(table, nextDecision(table)!.options.find(one => one.announcement?.procedure.special === "plot")!.id, "model", "chosen");

test("plot is a paid special action, followed only on a later turn by its owner's strictly timed cast", () => {
	checkProcedure(plot);
	for (const invalid of [
		{ ...plot, timing: "stack" }, { ...plot, special: undefined }, { ...plot, source: { ...plot.source, zones: ["graveyard"] } },
		{ ...plot, cost: { mana: "{X}{R}" } }, { ...plot, cost: { mana: "{R}", life: 1 } }, { ...plot, speed: "instant" },
		{ ...plot, instructions: [{ do: "draw", who: "you", count: 1 }] },
	]) assert.throws(() => checkProcedure(invalid), /special|Plot needs/);
	const table = position(), source = cardsIn(table, "hand", 0).find(one => one.card === card)!;
	const initial = structuredClone(table), from = table.ledger.length, incarnation = source.incarnation;
	const snapshots: { table: Table; from: number }[] = [];
	const remember = () => snapshots.push({ table: structuredClone(table), from: table.ledger.length });
	const physical = () => JSON.stringify({ things: [...table.things], seats: table.seats, notes: table.notes, history: happened(table) });
	const before = physical();
	const offered = nextDecision(table)!;
	assert.ok(offered.options.some(one => one.announcement?.procedure.special === "plot"));
	assert.deepEqual(table, initial, "discovery is pure");
	begin(table); remember();
	assert.equal(physical(), before);
	assert.ok(project(table, 0).announcement);
	for (const viewer of [1, "spectator"] as const) {
		assert.equal(project(table, viewer).announcement, undefined);
		assert.ok(!project(table, viewer).objects!.some(one => one.id === source.id), "the pending hand source is private");
	}
	apply(table, "announce:cancel", "model", "chosen");
	assert.equal(physical(), before); assert.equal(table.cursor.priority, 0);
	begin(table); apply(table, "announce:cost:0", "model", "chosen"); remember();
	const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
	assert.equal(payment.use!.cost.generic, 1); assert.deepEqual(payment.use!.cost.colors, ["R"]);
	assert.ok(Object.values(focus(workFrame(table, 0), startingIntent(0)).uses).every(one => one.timing === "special" && one.special === "plot"));
	assert.throws(() => activationChanges(table, { ...payment.use!, instructions: [{ do: "draw", who: "you", count: 1 }] }), /Plot needs/);
	apply(table, payment.id, "model", "chosen"); remember();
	assert.equal(source.zone, "exile"); assert.equal(source.incarnation, incarnation + 1);
	assert.equal(table.cursor.priority, 0); assert.equal(cardsIn(table, "stack").length, 0);
	assert.equal(table.waiting.length, 0); assert.deepEqual(happened(table), [], "plot is neither a cast nor an activated ability");
	assert.ok(cardsIn(table, "battlefield", 0).every(one => one.tapped));
	assert.match(describe(table, table.log.at(-1)!), /special action, no stack/);
	const permission = table.notes.find(one => one.kind === "permit")!;
	assert.ok(permission.kind === "permit" && permission.plotted && permission.speed === "sorcery" && permission.fromTurn === 2 && permission.mana === "{0}");
	for (const viewer of [0, 1, "spectator"] as const) assert.ok(project(table, viewer).objects!.some(one => one.id === source.id && one.card === card));
	const cast = printedCast(card, table.printed[card]!);
	assert.equal(playable(tableWorld(table), 0, source, 1, false), false);
	assert.equal(playable(tableWorld(table), 1, source, 3, false), false);
	assert.ok(!announcementOffers(cast, workFrame(table, 0), "cast").some(one => one.announcement.source.id === source.id));
	const lost = structuredClone(table);
	commit(lost, [{ do: "move", what: source.id, to: "hand", reason: "bounce" }, { do: "move", what: source.id, to: "exile", reason: "exile" }], "resolve");
	assert.equal(playable(tableWorld(lost), 0, lost.things.get(source.id)!, 3, false), false, "another exiled incarnation is not plotted");
	main(table, 1, 2);
	assert.equal(announcementOffers({ ...cast, speed: "instant" }, workFrame(table, 0), "cast").length, 0, "flash cannot override the owner's main-phase restriction");
	main(table, 0, 3, "upkeep");
	assert.ok(!announcementOffers({ ...cast, speed: "instant" }, workFrame(table, 0), "cast").some(one => one.announcement.source.id === source.id));
	main(table, 0, 3);
	const allowed = announcementOffers(cast, workFrame(table, 0), "cast").find(one => one.announcement.source.id === source.id)!;
	assert.ok(allowed); assert.equal(allowed.announcement.permission, permission.id);
	const changed = structuredClone(table);
	editWork(changed, 0, [{ do: "package.put", package: { card, registers: pack(card), procedures: [plot], deferred: [{ claim: "Use plotted card", basis: "Flying, haste", source: { card, zones: ["exile"], controller: "any" }, timing: "spell" }] } }], "changed-use");
	assert.equal(preparation(workFrame(changed, 0))[0]!.card, card, "a permitted deferred use requires work without paying its old cost");
	const prefix = nextDecision(table)!.options.find(one => one.announcement?.source.id === source.id)!;
	apply(table, prefix.id, "model", "chosen"); apply(table, "announce:cost:0", "model", "chosen"); remember();
	const free = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
	assert.equal(free.use!.cost.generic, 0); assert.deepEqual(free.use!.cost.colors, []);
	assert.deepEqual(free.use!.paid, []); assert.deepEqual(free.use!.funding ?? [], []);
	const empty = structuredClone(table);
	commit(empty, [{ do: "move", what: cardsIn(empty, "hand", 0).find(one => one.card === card)!.id, to: "stack", reason: "cast" }], "game-setup");
	assert.throws(() => activationChanges(empty, { ...free.use!, speed: "instant" }), /empty stack, regardless of flash/);
	apply(table, free.id, "model", "chosen");
	assert.equal(source.zone, "stack"); assert.equal(happened(table).filter(one => one.kind === "cast").length, 1);
	assert.ok(!table.notes.some(one => one.kind === "permit" && one.on.id === source.id));
	passBoth(table); finish(table);
	assert.equal(source.zone, "battlefield"); assert.equal(source.ability, undefined);
	assert.ok(cardsIn(table, "battlefield", 0).filter(one => one.card !== card).every(one => !one.tapped), "the free cast spends no lands");
	assert.deepEqual(relive(initial, table.ledger.slice(from), table.workLog.slice(initial.workLog.length)), table);
	for (const saved of snapshots) assert.deepEqual(relive(saved.table, JSON.parse(JSON.stringify(table.ledger.slice(saved.from))), table.workLog.slice(saved.table.workLog.length)), table, "each pending announcement and plotted prefix continues identically");

	const reduced = position(), crystal = cardsIn(reduced, "library", 1).find(one => one.card === "The Fire Crystal")!;
	commit(reduced, [{ do: "move", what: crystal.id, to: "battlefield", controller: 0, reason: "game-setup", registers: [
		{ kind: "cost", basis: "Red spells you cast cost {1} less to cast.", cast: { zones: ["stack"], controller: "you", colors: ["R"] }, reduce: 1 },
	] }], "game-setup");
	begin(reduced); apply(reduced, "announce:cost:0", "model", "chosen");
	assert.equal(nextDecision(reduced)!.options.find(one => one.use)!.use!.cost.generic, 1, "spell reductions do not reduce the plot special action");
	const restricted = position();
	commit(restricted, [...cardsIn(restricted, "battlefield", 0).map(one => ({ do: "tap" as const, what: one.id })),
		{ do: "add-mana", who: 0, colors: ["R", "R"], spendOnly: { zones: ["stack"], types: ["creature"] } }], "game-setup");
	assert.equal(announcementOffers(plot, workFrame(restricted, 0), "plot").length, 0, "mana restricted to creature spells cannot pay to plot a creature card");
	assert.ok(announcementOffers(cast, workFrame(restricted, 0), "cast").length);
	const plan: Plan = { objective: "Plot before a later turn", guidance: "Do not forecast its later cast.",
		steps: [{ label: "Plot", when: { step: "precombat-main" }, action: { procedure: plot } },
			{ label: "Later cast", when: { step: "precombat-main" }, action: { procedure: cast } }] };
	const forecast = paymentForecast(workFrame(position(), 0), plan);
	assert.equal(forecast.conflicts.length, 0);
	assert.equal(forecast.payments.length, 0, "the forecast supplies no payment witness past the special action's boundary");
	assert.match(forecast.unchecked.join(" "), /stopped at steps\[0\].*later steps/);
	assert.match(paymentForecast(workFrame(restricted, 0), plan).conflicts.join(" "), /costs/, "the known plot price is still checked against spending restrictions");

	for (const controller of [0, 1]) {
		const discounted = position("Bant Airbending Combo"), doc = "Doc Aurlock, Grizzled Genius";
		const genius = cardsIn(discounted, "library", 1).find(one => one.card === doc)!;
		commit(discounted, [{ do: "move", what: genius.id, to: "battlefield", controller, reason: "game-setup", registers: pack(doc) },
			{ do: "tap", what: cardsIn(discounted, "battlefield", 0).find(one => one.card === "Island")!.id }], "game-setup");
		const hand = cardsIn(discounted, "hand", 0).find(one => one.card === card)!, frame = workFrame(discounted, 0);
		assert.equal(manaBudget(frame, plot, frame.view.objects!.find(one => one.id === hand.id)!).cost, controller === 0 ? "{R}" : "{1}{R}");
		assert.equal(paymentForecast(frame, plan).conflicts.length > 0, controller !== 0, "forecast checks the discounted boundary price without predicting a later cast");
		assert.equal(announcementOffers(cast, frame, "cast").length, 0, "Doc does not discount an ordinary hand cast");
		if (controller !== 0) {
			assert.equal(announcementOffers(plot, frame, "plot").length, 0, "the opponent's Doc leaves the full price");
			continue;
		}
		const initial = structuredClone(discounted), from = discounted.ledger.length;
		begin(discounted); apply(discounted, "announce:cost:0", "model", "chosen");
		const pending = structuredClone(discounted), at = discounted.ledger.length;
		assert.equal(hand.zone, "hand", "the reduced draft spends nothing");
		const paid = nextDecision(discounted)!.options.find(one => one.use)!;
		assert.equal(paid.use!.cost.generic, 0); assert.deepEqual(paid.use!.cost.colors, ["R"]);
		apply(discounted, paid.id, "model", "chosen");
		assert.equal(hand.zone, "exile");
		assert.equal(happened(discounted).filter(one => one.kind === "cast").length, 0);
		assert.deepEqual(relive(structuredClone(initial), discounted.ledger.slice(from)), discounted);
		assert.deepEqual(relive(pending, discounted.ledger.slice(at)), discounted);
		commit(initial, [{ do: "move", what: genius.id, to: "exile", reason: "exile" }], "game-setup");
		assert.equal(announcementOffers(plot, workFrame(initial, 0), "plot").length, 0, "the reduction ends when Doc leaves");
	}
});
