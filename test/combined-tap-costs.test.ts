/** Mana payments conserve every object tapped, across casting, plans and saved continuations.
 * Past 150 lines to exercise the shared payment paths and both kinds of tap cost together. */
import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { cardsIn, type Table, type Thing } from "../src/core/table.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { activate, activationChanges, printedCast, procedureOptions } from "../src/core/procedures.ts";
import { fundings, tapObjects, type Price } from "../src/core/funding.ts";
import { payable, paymentOptions } from "../src/core/payment-options.ts";
import { completePayments } from "../src/core/complete-payments.ts";
import { paymentForecast } from "../src/core/budget.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { annotate, planState } from "../src/core/planning.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { manaLines } from "../src/context/strategy-facts.ts";
import type { Plan } from "../src/core/language.ts";
import { announce, establish, example, finish, main, pack, passBoth, place } from "./play.ts";

const drum = "Springleaf Drum", pollinator = "Gene Pollinator", momo = "Momo, Friendly Flier";
const ref = (one: Thing) => ({ id: one.id, incarnation: one.incarnation });
const position = (name = "Azorius Momo") => start(standard, [{ deck: alpha(deck(name)) }, { deck: deck("Mono-Green Landfall") }], `tap-costs-${name}`, undefined,
	{ announcementsFrom: 0, excessManaFrom: 0 });
const prepare = (table: Table, card: string) => editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, printedCast: true, registers: pack(card), procedures: [] } }], `prepare-${card}`);
const replayFrom = (table: Table, before: Table) => assert.deepEqual(relive(before, table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function agree(table: Table, price: Price, except = new Set<string>()) {
	const before = structuredClone(table), frame = workFrame(table, 0), all = fundings(frame, price, except), menu = paymentOptions(frame, price, [], except);
	assert.equal(payable(frame, price, except), all.length > 0); assert.equal(menu.possible, all.length > 0);
	const whole = completePayments(frame, price, menu, 256, 10000); assert.ok(whole);
	for (const { funding } of all) {
		assert.ok(whole.some(one => isDeepStrictEqual(one.funding, funding) ||
			isDeepStrictEqual(one.funding.taps.slice().sort((a, b) => a.source.id.localeCompare(b.source.id)), funding.taps.slice().sort((a, b) => a.source.id.localeCompare(b.source.id)))));
		const selected: string[] = [];
		for (const tap of funding.taps) {
			const next = paymentOptions(frame, price, selected, except).next.find(one => isDeepStrictEqual(one.funding.taps, [tap])); assert.ok(next);
			selected.push(next.id);
		}
		assert.equal(paymentOptions(frame, price, selected, except).complete, true);
	}
	for (const one of whole) {
		const used = one.funding.taps.flatMap(tapObjects).map(one => one.id);
		assert.equal(new Set(used).size, used.length, "every physical tap is paid once");
	}
	assert.deepEqual(table, before, "payment discovery spends and reveals nothing");
	return whole;
}

test("source and selected tap costs share resources without applying summoning sickness to the selected permanent", () => {
	const table = position(); main(table, 0); prepare(table, drum);
	const source = establish(table, 0, drum), helper = establish(table, 0, momo);
	if (!cardsIn(table, "hand", 0).some(one => one.card === drum)) place(table, 0, "hand", drum);
	const frame = workFrame(table, 0);
	for (const color of ["W", "U", "B", "R", "G"] as const) {
		const ways = agree(table, { generic: 0, colors: [color] }); assert.equal(ways.length, 1);
		assert.deepEqual(ways[0]!.funding.taps[0]!.tapped, [ref(helper)]);
		assert.match(ways[0]!.label, /Springleaf Drum.*Momo/);
	}
	assert.equal(payable(frame, { generic: 2, colors: [] }), false);
	assert.equal(payable(frame, { generic: 1, colors: [] }, new Set([helper.id])), false);
	const standalone = structuredClone(table), beforeStandalone = structuredClone(standalone);
	announce(standalone, example("Add green with Springleaf Drum"));
	assert.equal(standalone.things.get(source.id)!.tapped, true); assert.equal(standalone.things.get(helper.id)!.tapped, true);
	assert.deepEqual(standalone.seats[0]!.pool.map(one => one.color), ["G"]); replayFrom(standalone, beforeStandalone);
	const green = procedureOptions(printedCast(drum, table.printed[drum]!), frame, "drum")[0]!; assert.ok(green);
	const missing = structuredClone(green.activation); delete missing.funding![0]!.tapped;
	assert.throws(() => activationChanges(table, missing), /no registered mana ability/);
	const duplicate = structuredClone(green.activation); duplicate.funding![0]!.tapped = [ref(source)];
	assert.throws(() => activationChanges(table, duplicate), /no registered mana ability|duplicated/);
	const stale = structuredClone(green.activation); stale.funding![0]!.tapped![0]!.incarnation++;
	assert.throws(() => activationChanges(table, stale), /no longer there/);
	const held: Plan = { objective: "Preserve Momo", guidance: "Keep it untapped for later combat", steps: [], holds: [{ objects: { refs: [ref(helper)] }, purpose: "Later combat" }] };
	editWork(table, 0, [{ do: "plan.put", plan: held }], "hold-helper");
	const before = structuredClone(table);
	const choose = nextDecision(table)!.options.find(one => one.announcement?.procedure.source.card === drum); assert.ok(choose);
	apply(table, choose.id, "model", "chosen"); apply(table, "announce:cost:0", "model", "chosen");
	const pending = structuredClone(table), menu = nextDecision(table)!;
	const payment = menu.options.find(one => one.id.startsWith("announce:payment:")); assert.ok(payment);
	assert.ok(payment.objects?.some(one => one.id === helper.id));
	const marked = annotate([payment], planState(workFrame(table, 0))!)[0]!;
	assert.ok(marked.notes?.some(one => one.includes("Later combat")), "the complete payment warns about its held extra tap");
	assert.equal(source.tapped, false); assert.equal(helper.tapped, false);
	assert.equal(project(table, 1).announcement, undefined);
	const cancel = structuredClone(table); apply(cancel, "announce:cancel", "model", "chosen");
	assert.equal(cancel.things.get(source.id)!.tapped, false); assert.equal(cancel.things.get(helper.id)!.tapped, false);
	const individual = structuredClone(table); apply(individual, "announce:individual", "model", "chosen");
	const single = nextDecision(individual)!.options.find(one => one.id.startsWith("announce:pay:")); assert.ok(single);
	assert.ok(single.spends?.some(one => one.id === helper.id));
	apply(individual, single.id, "model", "chosen"); apply(individual, "announce:confirm", "model", "chosen");
	assert.equal(individual.things.get(source.id)!.tapped, true); assert.equal(individual.things.get(helper.id)!.tapped, true);
	apply(table, payment.id, "model", "chosen"); assert.equal(source.tapped, true); assert.equal(helper.tapped, true);
	passBoth(table); finish(table); replayFrom(table, pending); replayFrom(table, before);
	const shared = position(); main(shared, 0);
	const a = establish(shared, 0, drum), b = establish(shared, 0, drum), only = establish(shared, 0, momo);
	assert.equal(agree(shared, { generic: 2, colors: [] }).length, 0, "two Drums cannot share one creature");
	assert.match(manaLines(workFrame(shared, 0)).join("\n"), /also tap Momo.*Upper bound before shared tap costs/s);
	const elf = place(shared, 1, "exile", "Llanowar Elves")[0]!;
	commit(shared, [{ do: "move", what: elf.id, to: "battlefield", reason: "resolve", controller: 0, registers: pack("Llanowar Elves") }], "resolve");
	const two = agree(shared, { generic: 2, colors: [] }); assert.ok(two.length);
	assert.ok(two.every(one => one.funding.taps.length === 2), "the newly controlled Elf can pay a selected tap but not its own tap symbol");
	assert.equal(payable(workFrame(shared, 0), { generic: 2, colors: [] }, new Set([only.id])), false);
	const parts = paymentOptions(workFrame(shared, 0), { generic: 2, colors: [] });
	const first = parts.next.find(one => one.resource === a.id && one.tapped?.[0]?.id === only.id)!; assert.ok(first);
	const repeated = parts.parts.find(one => one.resource === b.id && one.tapped?.[0]?.id === only.id)!; assert.ok(repeated);
	assert.throws(() => paymentOptions(workFrame(shared, 0), { generic: 2, colors: [] }, [first.id, repeated.id]), /selected twice/);
	assert.ok(paymentOptions(workFrame(shared, 0), { generic: 2, colors: [] }, [first.id]).next.every(one => one.tapped?.[0]?.id !== only.id));
	const plains = place(shared, 0, "battlefield", "Plains")[0]!;
	if (!cardsIn(shared, "hand", 0).some(one => one.card === "Cosmogrand Zenith")) place(shared, 0, "hand", "Cosmogrand Zenith");
	const three = procedureOptions(printedCast("Cosmogrand Zenith", shared.printed["Cosmogrand Zenith"]!), workFrame(shared, 0), "zenith")
		.find(one => one.activation.funding?.length === 3); assert.ok(three);
	const forged = structuredClone(three.activation), drums = forged.funding!.filter(one => one.tapped?.length);
	assert.equal(drums.length, 2); drums[1]!.tapped = drums[0]!.tapped;
	assert.throws(() => activationChanges(shared, forged), /duplicated/, "two individually valid abilities cannot spend the same extra permanent");
	commit(shared, [{ do: "tap", what: plains.id }], "resolve");
	for (const which of [only, elf]) commit(shared, [{ do: "tap", what: which.id }], "resolve");
	assert.equal(payable(workFrame(shared, 0), { generic: 1, colors: [] }), false);
	const wide = position(); main(wide, 0);
	for (let at = 0; at < 4; at++) {
		const card = [...cardsIn(wide, "library", 0), ...cardsIn(wide, "hand", 0)].find(one => one.card === drum)!;
		commit(wide, [{ do: "move", what: card.id, to: "battlefield", reason: "game-setup", registers: pack(drum) }], "game-setup");
	}
	establish(wide, 0, momo);
	const forests = [...cardsIn(wide, "library", 1), ...cardsIn(wide, "hand", 1)].filter(one => one.card === "Forest");
	assert.equal(forests.length, 15);
	for (const forest of forests)
		commit(wide, [{ do: "move", what: forest.id, to: "battlefield", reason: "game-setup", controller: 0 }], "game-setup");
	assert.equal(payable(workFrame(wide, 0), { generic: 12, colors: ["U", "U"] }), false, "many ordinary lands cannot remove the shared-creature conflict");
	const gene = position("Jund Sacrifice"), producer = establish(gene, 0, pollinator);
	main(gene, 0); prepare(gene, pollinator);
	assert.equal(payable(workFrame(gene, 0), { generic: 1, colors: [] }), false, "Pollinator cannot tap itself for both parts");
	const forest = place(gene, 0, "battlefield", "Forest")[0]!;
	const blue = agree(gene, { generic: 0, colors: ["U"] }); assert.equal(blue.length, 1);
	assert.deepEqual(blue[0]!.funding.taps[0]!.tapped, [ref(forest)], "Pollinator can tap a noncreature permanent");
	assert.equal(payable(workFrame(gene, 0), { generic: 1, colors: ["U"] }), false, "the Forest cannot also produce its own mana");
	const sameLands = position("Jund Sacrifice"), owned = place(sameLands, 0, "battlefield", "Forest")[0]!, borrowed = place(sameLands, 1, "exile", "Forest")[0]!;
	commit(sameLands, [{ do: "move", what: borrowed.id, to: "battlefield", reason: "game-setup", controller: 0 }], "game-setup");
	assert.ok(owned.id.localeCompare(borrowed.id) < 0, "the needed helper is the ordinary canonical Forest");
	const pinnedHelper = structuredClone(pack(pollinator)), mana = pinnedHelper.find(one => one.kind === "mana")!;
	assert.equal(mana.kind, "mana"); if (mana.kind !== "mana" || typeof mana.cost.tap !== "object") throw new Error("selected tap fixture");
	mana.cost.tap.choose = { owner: "you" };
	establish(sameLands, 0, pollinator, pinnedHelper); main(sameLands, 0);
	assert.ok(agree(sameLands, { generic: 1, colors: ["U"] }).length, "a required helper cannot hide a distinct identical land's own mana");
	const inspector = establish(gene, 0, "Callous Inspector");
	assert.ok(agree(gene, { generic: 1, colors: ["U"] }).every(one => one.funding.taps.some(tap => tap.tapped?.[0]?.id === inspector.id)));
	while (cardsIn(gene, "hand", 0).filter(one => one.card === pollinator).length < 2) place(gene, 0, "hand", pollinator);
	const plan: Plan = { objective: "Cast two Pollinators", guidance: "Use distinct resources", steps: [1, 2].map(at => ({ label: `Pollinator ${at}`,
		when: { step: "precombat-main" }, action: { procedure: printedCast(pollinator, gene.printed[pollinator]!) } })) };
	const forecast = paymentForecast(workFrame(gene, 0), plan);
	assert.deepEqual(forecast.conflicts, []); assert.equal(forecast.payments.length, 2);
	const used = forecast.payments.flatMap(one => one.funding.taps.flatMap(tapObjects)).map(one => one.id);
	assert.equal(used.length, new Set(used).size, "the forecast does not reuse another ability's tap payment");
	const chosen = procedureOptions(printedCast(pollinator, gene.printed[pollinator]!), workFrame(gene, 0), "gene")
		.find(one => one.activation.funding?.some(one => one.source.id === producer.id && one.tapped?.[0]?.id === inspector.id)); assert.ok(chosen);
	const paying = structuredClone(gene); activate(gene, chosen.activation, { picked: chosen.option.id, offered: [chosen.option.id], by: "model", why: "declared" });
	passBoth(gene); finish(gene); assert.equal(producer.tapped, true); assert.equal(inspector.tapped, true); assert.equal(forest.tapped, false);
	replayFrom(gene, paying);
	const newborn = cardsIn(gene, "battlefield", 0).find(one => one.card === pollinator && one.id !== producer.id)!; assert.ok(newborn);
	assert.equal(payable(workFrame(gene, 0), { generic: 0, colors: ["U"] }), false, "the newly cast Pollinator cannot pay its own tap symbol");
	commit(gene, [{ do: "note", note: { kind: "label", on: ref(newborn), by: 0, until: "end-of-turn", text: "Haste fixture", change: { words: ["haste"] } } }], "resolve");
	assert.equal(payable(workFrame(gene, 0), { generic: 0, colors: ["U"] }), true);
});
