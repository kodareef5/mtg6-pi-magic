/** One cost choice precedes targeting; every physical payment remains the seat's. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { manaChoices, symbols } from "../src/core/mana-cost.ts";
import { printedCast, activate } from "../src/core/procedures.ts";
import { announcementOffers } from "../src/core/announcement-options.ts";
import { beginAnnouncement } from "../src/core/announcing.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { paymentChoices } from "../src/core/costs.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { casting } from "../src/core/casting.ts";
import { tableWorld } from "../src/core/selectors.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { relive } from "../src/core/journal.ts";
import { main, place, passBoth, finish, offered } from "./play.ts";
import type { Mana, Table } from "../src/core/table.ts";
import type { Plan } from "../src/core/language.ts";

const colors = (one: { generic: number; colors: string[] }) => `${one.generic}:${[...one.colors].sort().join("")}`;
function position(mana: Mana["color"][]) {
	const table = start(standard, [{ deck: deck("Dimir Excruciator") }, { deck: deck("Mono-Red Aggro") }], "hybrid-costs", undefined, { announcementsFrom: 0 });
	place(table, 0, "hand", "Deceit", "Negate"); main(table, 0);
	// Isolate payment and casting provenance, without claiming complete Deceit terms.
	editWork(table, 0, [{ do: "package.put", package: { card: "Deceit", printedCast: true, registers: [], procedures: [] } }], "payment-fixture");
	commit(table, [{ do: "add-mana", who: 0, colors: mana }], "game-setup");
	return table;
}
function choose(table: Table, id: string) {
	const before = structuredClone(table), decision = nextDecision(table)!;
	assert.deepEqual(table, before); assert.ok(decision.options.some(one => one.id === id), id);
	apply(table, id, "model", "chosen");
}

test("hybrid equivalents stay distinct before reductions, preserve actual mana spent and replay every draft", () => {
	assert.deepEqual(manaChoices("{4}{U/B}{U/B}")!.map(colors).sort(), ["4:BB", "4:BU", "4:UU"]);
	assert.deepEqual(manaChoices("{2/W}{C/U}{X}")!.map(colors).sort(), ["0:CW", "0:UW", "2:C", "2:U"]);
	assert.equal(symbols("{U/B}"), undefined, "a single-price caller must not choose a hybrid half");
	for (const invalid of ["{U/P}", "{S}", "{2/C}", "{U/B/P}", "{U} stray", "{Q}"]) assert.equal(manaChoices(invalid), undefined);
	for (const colored of [["U", "U"], ["U", "B"], ["B", "B"]] as Mana["color"][][]) {
		const table = position(["C", "C", "C", "C", ...colored]);
		const source = [...table.things.values()].find(one => one.card === "Deceit" && one.zone === "hand")!;
		const procedure = printedCast("Deceit", table.printed.Deceit!);
		const frame = workFrame(table, 0), seen = frame.view.objects!.find(one => one.id === source.id)!;
		assert.equal(manaBudget(frame, procedure, seen).payableBeforeNewResources, true);
		const ways = offered(table, procedure);
		assert.ok(ways.length); assert.ok(ways.every(one => colors(one.activation.cost) === colors({ generic: 4, colors: colored })));
		const before = structuredClone(table), from = table.ledger.length;
		const choice = announcementOffers(procedure, frame, "cast")[0]!;
		beginAnnouncement(table, choice.announcement, { picked: choice.option.id, offered: [choice.option.id], by: "model", why: "chosen" });
		assert.equal(nextDecision(table)!.preparing!.stage, "hybrid");
		assert.equal(nextDecision(table)!.options.filter(one => one.id.startsWith("announce:hybrid:")).length, 1);
		assert.equal(project(table, 1).announcement, undefined);
		assert.deepEqual([...table.things], [...before.things]);
		choose(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:hybrid:"))!.id);
		const draft = structuredClone(table), pending = table.ledger.length;
		choose(table, "announce:back"); assert.equal(table.announcement!.hybrid, undefined);
		choose(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:hybrid:"))!.id);
		choose(table, "announce:cost:0");
		const payment = nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!;
		const forged = structuredClone(payment.use!); forged.cost.colors = ["R", "R"];
		assert.throws(() => activate(table, forged, { picked: payment.id, offered: [payment.id], by: "model", why: "chosen" }), /Finish or cancel/);
		choose(table, payment.id);
		assert.equal(characteristics(table, source)!.manaValue, 6);
		assert.deepEqual(characteristics(table, source)!.colors.sort(), ["B", "U"]);
		assert.deepEqual(casting(table, source)!.mana.sort(), ["C", "C", "C", "C", ...colored].sort());
		passBoth(table); finish(table);
		assert.equal(source.zone, "battlefield");
		assert.deepEqual(casting(table, source)!.mana.sort(), ["C", "C", "C", "C", ...colored].sort());
		assert.deepEqual(relive(draft, table.ledger.slice(pending)), table, "a clone pending hybrid payment continues identically");
		assert.deepEqual(relive(before, table.ledger.slice(from)), table);
	}
	const table = position(["C", "C", "C", "C", "U", "U", "B", "B"]), frame = workFrame(table, 0);
	const source = frame.view.objects!.find(one => one.card === "Deceit" && one.zone === "hand")!;
	const procedure = printedCast("Deceit", table.printed.Deceit!);
	const start = announcementOffers(procedure, frame, "cast")[0]!;
	beginAnnouncement(table, start.announcement, { picked: start.option.id, offered: [start.option.id], by: "model", why: "chosen" });
	assert.equal(nextDecision(table)!.options.filter(one => one.id.startsWith("announce:hybrid:")).length, 3);
	choose(table, "announce:cancel"); assert.equal(table.seats[0]!.pool.length, 8);
	const ways = offered(table, procedure); assert.equal(new Set(ways.map(one => one.option.id)).size, ways.length);
	const pay = paymentChoices(table, { world: tableWorld(table), controller: 0, source: table.things.get(source.id) }, { mana: "{U/B}" }, 0, source.id);
	assert.equal(pay.length, 2); assert.equal(new Set(pay.map(one => one.id)).size, 2);
	const when = { active: "self" as const, step: "precombat-main" as const, fromTurn: 1, throughTurn: 1 };
	const plan: Plan = { objective: "Cast and retain blue", guidance: "Spend black on Deceit; leave blue for the response.", throughTurn: 1,
		steps: [{ label: "Deceit", when, action: { procedure } }, { label: "Negate", when, action: { procedure: { claim: "Negate", basis: table.printed["Negate"]!.oracle,
			 source: { card: "Negate", zones: ["hand"] }, timing: "spell" as const, cost: { mana: "{1}{U}" }, targets: [{ object: { zones: ["stack"], not: { types: ["creature"] } } }], instructions: [{ do: "counter", what: "target:0" }] } } }] };
	const forecast = paymentForecast(frame, plan);
	assert.deepEqual(forecast.conflicts, []); assert.deepEqual(forecast.unchecked, []); assert.equal(forecast.payments.length, 2);
	// A monocolored hybrid's generic half can be reduced; its colored half cannot.
	const claimed = { ...procedure, cost: { mana: "{2/U}", reduce: 2 } };
	assert.deepEqual([...new Set(offered(table, claimed).map(one => colors(one.activation.cost)))].sort(), ["0:", "0:U"]);
	commit(table, [{ do: "move", what: source.id, to: "battlefield", controller: 0, faceDown: "manifest", reason: "resolve" }], "resolve");
	const before = structuredClone(table), from = table.ledger.length, incarnation = table.things.get(source.id)!.incarnation;
	const turnUp = nextDecision(table)!.options.find(one => one.announcement?.procedure.special === "turn-face-up")!;
	choose(table, turnUp.id); assert.equal(nextDecision(table)!.preparing!.stage, "hybrid");
	choose(table, "announce:hybrid:1"); choose(table, "announce:cost:0");
	choose(table, nextDecision(table)!.options.find(one => one.id.startsWith("announce:payment:"))!.id);
	assert.equal(table.things.get(source.id)!.faceDown, false); assert.equal(table.things.get(source.id)!.incarnation, incarnation);
	assert.equal(table.waiting.length, 0, "turning face up repeats no entry ability");
	assert.deepEqual(relive(before, table.ledger.slice(from)), table);
});
