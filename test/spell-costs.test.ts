/** Standing prices and the forecast consume the same qualifying cast history. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { printedCast } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { characteristics, spellCharacteristics } from "../src/core/characteristics.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { costAdjustment } from "../src/core/casting-costs.ts";
import { viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import type { Package, Procedure, Plan } from "../src/core/language.ts";
import { announce, establish, finish, main, offered, pack, passBoth, place } from "./play.ts";

test("standing discounts read the chosen spell and original zone, consume actual casts, and price ordered forecasts once", () => {
	const dragon = "Twinmaw Stormbrood // Charring Bite", momo = "Momo, Friendly Flier";
	const table = start(standard, [{ deck: alpha(deck("Boros Dragons")) }, { deck: alpha(deck("Azorius Control")) }], "first-flying-cost");
	const dragons = place(table, 0, "hand", dragon, dragon);
	place(table, 0, "hand", momo, "Voice of Victory"); place(table, 1, "hand", "Three Steps Ahead");
	const source = establish(table, 0, momo);
	const omen: Procedure = { face: 1, claim: "Cast Charring Bite", basis: table.printed[dragon]!.faces![1]!.oracle,
		source: { card: dragon, zones: ["hand"] }, timing: "spell", targets: [{ object: { types: ["creature"], not: { words: ["flying"] } } }],
		instructions: [{ do: "damage", to: "target:0", amount: 5 }] };
	const dragonPackage: Package = { card: dragon, printedCast: true, registers: [...pack(dragon),
		{ kind: "watch", face: 0, basis: "When this creature enters, you gain 5 life.", event: { on: "enters", of: { is: "this" } }, effect: { instructions: [{ do: "life", who: "you", amount: 5 }] } }], procedures: [omen] };
	editWork(table, 0, [{ do: "package.put", package: dragonPackage }, { do: "package.put", package: { card: momo, printedCast: true, registers: pack(momo) } }], "spell-cost-terms");
	main(table, 0);
	commit(table, [{ do: "add-mana", who: 0, colors: Array(10).fill("W") }, { do: "add-mana", who: 1, colors: ["U", "U", "U"] }], "game-setup");
	const cast = printedCast(dragon, table.printed[dragon]!);
	const shown = (frame: ReturnType<typeof workFrame>, id: string) => frame.view.objects!.find(one => one.id === id)!;
	const frame = workFrame(table, 0), proposed = (id: string, face: 0 | 1 = 0) => ({ ...shown(frame, id), controller: 0, zone: "stack" as const,
		traits: spellCharacteristics(frame.view, shown(frame, id), 0, face) });
	assert.equal(costAdjustment(viewWorld(frame.view), proposed(dragons[0]!.id), "hand"), 1);
	assert.equal(costAdjustment(viewWorld(frame.view), proposed(dragons[0]!.id, 1), "hand"), 0, "the Omen face is not a flying creature spell");
	for (const name of [momo, "Voice of Victory"]) {
		const card = frame.view.objects!.find(one => one.card === name && one.zone === "hand")!;
		assert.equal(costAdjustment(viewWorld(frame.view), proposed(card.id), "hand"), 0, "a Lemur or nonflying creature does not qualify");
	}
	assert.equal(costAdjustment(viewWorld(frame.view), { ...proposed(dragons[0]!.id), controller: 1 }, "hand"), 0);
	const nextTurn = structuredClone(frame); if (nextTurn.view.window.kind !== "turn") assert.fail(); nextTurn.view.window.active = 1;
	assert.equal(costAdjustment(viewWorld(nextTurn.view), proposed(dragons[0]!.id), "hand"), 0, "an opponent-turn cast gains no discount");
	const noAbility = structuredClone(frame), lost = shown(noAbility, source.id); lost.traits!.registrations = [];
	assert.equal(costAdjustment(viewWorld(noAbility.view), proposed(dragons[0]!.id), "hand"), 0, "the reader uses remaining abilities");
	assert.equal(manaBudget(frame, cast, shown(frame, dragons[0]!.id)).cost, "{4}{W}");
	assert.ok(offered(table, cast).every(one => one.activation.cost.generic === 4 && one.activation.cost.colors.join("") === "W"));
	const plan: Plan = { objective: "Cast both Dragons", guidance: "Pay the first reduction once", steps: dragons.map((one, at) => ({ label: `Dragon ${at + 1}`, when: { active: "self", step: "precombat-main" },
		action: { procedure: { ...cast, source: { ...cast.source, refs: [{ id: one.id, incarnation: one.incarnation }] } } } })) };
	const beforeForecast = structuredClone(table);
	assert.match(paymentForecast(frame, plan).conflicts.join(" "), /Dragon 2.*\{5\}\{W\}/, "ten mana cannot pay five plus six");
	assert.deepEqual(table, beforeForecast);
	commit(table, [{ do: "add-mana", who: 0, colors: ["W"] }], "game-setup");
	const ready = workFrame(table, 0), forecast = paymentForecast(ready, plan);
	assert.deepEqual(forecast.conflicts, []); assert.deepEqual(forecast.unchecked, []);
	assert.deepEqual(forecast.payments.map(one => one.funding.paid.length), [5, 6]);
	const developing = structuredClone(table);
	commit(developing, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" }], "game-setup");
	const development = workFrame(developing, 0);
	development.view.pools![0]!.mana = development.view.pools![0]!.mana.slice(0, 6);
	const momoCast = printedCast(momo, table.printed[momo]!);
	const afterMomo = paymentForecast(development, { ...plan, steps: [{ label: "Momo first", when: { active: "self", step: "precombat-main" },
		action: { procedure: { ...momoCast, source: { ...momoCast.source, refs: [{ id: source.id, incarnation: developing.things.get(source.id)!.incarnation }] } } } }, plan.steps[0]!] });
	assert.deepEqual(afterMomo.conflicts, []); assert.deepEqual(afterMomo.payments.map(one => one.funding.paid.length), [1, 5], "an earlier ordinary entry supplies the later discount");
	const fixed = offered(table, { ...cast, source: { ...cast.source, refs: [{ id: dragons[1]!.id, incarnation: dragons[1]!.incarnation }] } })[0]!;
	ready.decision!.options.push(fixed.option);
	const fixedPlan = structuredClone(plan); fixedPlan.steps[1]!.action = { option: fixed.option.id };
	assert.equal(paymentForecast(ready, fixedPlan).payments.length, 1, "an old discounted exact pick cannot promise a second discount");
	assert.ok(paymentForecast(ready, fixedPlan).unchecked.length);
	const initial = structuredClone(table), from = table.ledger.length;
	announce(table, cast, one => one.activation.source.id === dragons[0]!.id);
	assert.equal(workFrame(table, 0).view.pools!.find(one => one.seat === 0)!.mana.length, 6);
	apply(table, "pass", "model", "chosen");
	announce(table, { source: { card: "Three Steps Ahead", zones: ["hand"] }, timing: "spell", claim: "Counter with the first spree mode",
		basis: "Spree (Choose one or more additional costs.) ... + {1}{U} — Counter target spell.", cost: { mana: "{1}{U}{U}" },
		targets: [{ object: { zones: ["stack"], types: ["artifact", "battle", "creature", "enchantment", "instant", "planeswalker", "sorcery"] } }], instructions: [{ do: "counter", what: "target:0" }] });
	passBoth(table); finish(table);
	assert.equal(dragons[0]!.zone, "graveyard");
	assert.ok(offered(table, cast).every(one => one.activation.cost.generic === 5), "a countered first spell still consumes the discount");
	const second = workFrame(table, 0);
	const later = structuredClone(second); if (later.view.window.kind !== "turn") assert.fail(); later.view.window.active = 1;
	// Next-turn forecasts must reset both whose turn it is and this-turn history.
	later.view.pools = [{ seat: 0, mana: [] }, { seat: 1, mana: [] }];
	assert.equal(paymentForecast(later, { ...plan, steps: [plan.steps[1]!] }).conflicts.some(line => line.includes("{4}{W}")), true);
	const pending = structuredClone(table), at = table.ledger.length;
	const arrivedLater = structuredClone(table);
	commit(arrivedLater, [{ do: "move", what: source.id, to: "hand", reason: "game-setup" },
		{ do: "move", what: source.id, to: "battlefield", reason: "game-setup", registers: pack(momo) }], "game-setup");
	assert.ok(offered(arrivedLater, cast).every(one => one.activation.cost.generic === 5), "the qualifying cast predates this Momo incarnation");
	announce(table, cast); passBoth(table); finish(table);
	while (table.waiting.length || [...table.things.values()].some(one => one.zone === "stack")) {
		if (nextDecision(table)?.situation === "trigger-order") apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen");
		else { passBoth(table); finish(table); }
	}
	assert.equal(table.seats[0]!.life, 25); assert.equal(characteristics(table, source)!.power, 2);
	assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
	assert.deepEqual(relive(structuredClone(initial), table.ledger.slice(from)), table);
	for (const viewer of [1, "spectator"] as const) assert.ok(!project(initial, viewer).objects!.some(one => one.id === dragons[1]!.id));

	// Doc's casting paragraph reads the original zone independently of plotting.
	const zones = start(standard, [{ deck: alpha(deck("Bant Airbending Combo")) }, { deck: alpha(deck("Azorius Control")) }], "original-zone-cost");
	establish(zones, 0, "Doc Aurlock, Grizzled Genius");
	const familiar = place(zones, 0, "hand", "Bramble Familiar // Fetch Quest")[0]!;
	main(zones, 0); commit(zones, [{ do: "add-mana", who: 0, colors: ["G", "G"] }], "game-setup");
	const bramble = printedCast(familiar.card!, zones.printed[familiar.card!]!);
	assert.equal(offered(zones, bramble)[0]!.activation.cost.generic, 1, "a hand cast has no zone discount");
	for (const zone of ["graveyard", "exile"] as const) {
		const position = structuredClone(zones);
		commit(position, [{ do: "move", what: familiar.id, to: zone, reason: "game-setup" }], "game-setup");
		assert.equal(offered(position, bramble).length, 0, "a reduction grants no casting permission");
		const card = position.things.get(familiar.id)!;
		commit(position, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite",
			on: { id: card.id, incarnation: card.incarnation }, mana: zone === "exile" ? "{2}" : "printed" } }], "game-setup");
		const options = offered(position, bramble);
		assert.ok(options.length); assert.ok(options.every(one => one.activation.cost.generic === 0));
		assert.deepEqual(options[0]!.activation.cost.colors, zone === "exile" ? [] : ["G"], "only generic mana is reduced, including an alternative price");
		const before = structuredClone(position), row = position.ledger.length;
		announce(position, bramble);
		assert.equal(position.seats[0]!.pool.length, zone === "exile" ? 2 : 1);
		assert.deepEqual(relive(before, position.ledger.slice(row)), position);
	}
});
