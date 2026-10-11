import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { activationChanges } from "../src/core/procedures.ts";
import { cardsIn } from "../src/core/table.ts";
import { editWork } from "../src/core/work-tools.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { project } from "../src/core/view.ts";
import type { Registration } from "../src/core/language.ts";
import { announce, establish, example, finish, main, offered, passBoth, place, step } from "./play.ts";

test("costs select distinct available resources and pay once before any conditional result", () => {
	for (const choice of ["pay", "decline", "short"] as const) {
		const table = start(standard, [{ deck: deck("Selesnya Landfall") }, { deck: deck("Mono-Red Aggro") }], `counter-payment-${choice}`);
		const dyadrine = establish(table, 0, "Dyadrine, Synthesis Amalgam"), chocobo = establish(table, 0, "Sazh's Chocobo", []);
		main(table, 0);
		commit(table, [{ do: "counters", what: dyadrine.id, kind: "+1/+1", amount: 2 },
			...(choice === "short" ? [] : [{ do: "counters" as const, what: chocobo.id, kind: "+1/+1", amount: 1 }]),
			{ do: "attack", attackers: [{ id: chocobo.id, incarnation: chocobo.incarnation, defending: 1 }] }], "combat");
		assert.equal(table.waiting.length, 1);
		const initial = structuredClone(table), from = table.ledger.length;
		apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
		const before = structuredClone(table); nextDecision(table); assert.deepEqual(table, before, "listing a payment spends nothing");
		const hand = cardsIn(table, "hand", 0).length;
		const options = nextDecision(table)!.options;
		assert.ok(options.some((one) => one.label.startsWith("Decline")));
		assert.equal(options.filter((one) => one.label.startsWith("Pay")).length, choice === "short" ? 0 : 1);
		step(table, (label) => label.startsWith(choice === "pay" ? "Pay" : choice === "short" ? "The full cost" : "Decline"));
		assert.equal(dyadrine.counters["+1/+1"], choice === "pay" ? 1 : 2);
		const paid = structuredClone(table), at = table.ledger.length;
		finish(table);
		assert.equal(cardsIn(table, "hand", 0).length, hand + (choice === "pay" ? 1 : 0));
		assert.equal(cardsIn(table, "battlefield").filter((one) => one.token?.name === "Robot").length, choice === "pay" ? 1 : 0);
		assert.deepEqual(relive(paid, table.ledger.slice(at)), table, "a clone after paying does not pay twice");
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	}
	const table = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], "blight-announcement");
	const thor = establish(table, 0, "Thor, God of Thunder", []), other = establish(table, 0, "Firdoch Core", []);
	const claw = establish(table, 1, "Hired Claw", []);
	place(table, 0, "hand", "Requiting Hex");
	main(table, 0); commit(table, [{ do: "add-mana", who: 0, colors: ["B"] },
		{ do: "note", note: { kind: "label", by: 0, on: { id: other.id, incarnation: other.incarnation }, until: "end-of-turn",
			text: "This artifact becomes a 4/4 artifact creature until end of turn.", change: { types: { add: ["creature"] }, base: { power: 4, toughness: 4 } } } }], "game-setup");
	const spell = example("Blighted Requiting Hex");
	const options = offered(table, spell);
	assert.equal(new Set(options.map((one) => one.option.id)).size, options.length, "different cost selections have different ids");
	const initial = structuredClone(table), from = table.ledger.length;
	const cast = announce(table, spell, (one) => one.activation.cost.counters?.on?.[0]?.id === thor.id && one.activation.targets[0]?.some((one) => "id" in one && one.id === claw.id) === true);
	assert.equal(thor.counters["-1/-1"], 1, "blight is paid before either player receives priority");
	assert.equal(other.counters["-1/-1"] ?? 0, 0);
	const committed = structuredClone(table); assert.throws(() => activationChanges(table, cast.activation)); assert.deepEqual(table, committed);
	passBoth(table); finish(table);
	assert.equal(claw.zone, "graveyard"); assert.equal(table.seats[0]!.life, 22);
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	for (const zone of ["battlefield", "hand"] as const) {
	const beheld = start(standard, [{ deck: deck("4c Control") }, { deck: deck("Mono-Red Aggro") }], `behold-${zone}`);
	const changeling: Registration = { kind: "continuous", basis: "Changeling (This card is every creature type.)",
		affects: { is: "this", zones: ["hand", "battlefield", "stack"] }, change: { subtypes: { allCreatureTypes: true } } };
	place(beheld, 1, "hand", "Shock");
	main(beheld, 1, 2);
	const core = zone === "battlefield" ? establish(beheld, 0, "Firdoch Core", [changeling]) : place(beheld, 0, "hand", "Firdoch Core")[0]!;
	if (zone === "hand") {
		assert.ok(!characteristics(beheld, core)!.allCreatureTypes);
		const clock = beheld.cursor.clock;
		editWork(beheld, 0, [{ do: "package.put", package: { card: "Firdoch Core", registers: [changeling] } }], "known-changeling");
		assert.equal(beheld.cursor.clock, clock, "accepting source meaning moves nothing");
		assert.equal(characteristics(beheld, core)!.allCreatureTypes, true, "accepted self terms invalidate the derived reading without motion");
		assert.equal(characteristics(beheld, { ...core, zone: "stack" })!.allCreatureTypes, true, "a proposed spell retains its all-zone characteristic");
		assert.equal(project(beheld, 0).objects!.find((one) => one.id === core.id)!.traits!.allCreatureTypes, true);
		assert.equal(project(beheld, 1).objects!.find((one) => one.id === core.id)?.traits, undefined, "a private characteristic reveals no identity");
	}
	place(beheld, 0, "hand", "Dispelling Exhale");
	commit(beheld, [{ do: "add-mana", who: 0, colors: ["U", "C"] }, { do: "add-mana", who: 1, colors: ["R"] }], "game-setup");
	const before = structuredClone(beheld), startAt = beheld.ledger.length;
	announce(beheld, { source: { card: "Shock", zones: ["hand"] }, claim: "Shock", basis: beheld.printed.Shock!.oracle, timing: "spell",
		targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] });
	apply(beheld, "pass", "model", "chosen");
	const shown = announce(beheld, example("Dispelling Exhale with a beheld Dragon"));
	assert.deepEqual(shown.activation.cost.shown, [{ id: core.id, incarnation: core.incarnation, ...(zone === "hand" ? { reveal: true } : {}) }]);
	assert.equal(beheld.log.at(-1)!.changes.some((change) => change.do === "reveal"), zone === "hand", "only a Dragon in hand must be revealed");
	passBoth(beheld); finish(beheld);
	assert.equal(cardsIn(beheld, "stack").length, 0);
	assert.equal(beheld.seats[0]!.life, 20);
	assert.deepEqual(relive(before, beheld.ledger.slice(startAt)), beheld);
	}
});
