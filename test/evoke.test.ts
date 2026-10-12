/** Alternative-cost names survive only the cast and its resulting permanent.
 * The same invariant covers trigger order, departure, permissions and replay. */
import test from "node:test";
import assert from "node:assert/strict";
import { start, commit } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Mana } from "../src/core/table.ts";
import { checkProcedure, checkReferences, activationChanges, printedCast } from "../src/core/procedures.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { amount, holds, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { relive } from "../src/core/journal.ts";
import { manaBudget } from "../src/core/budget.ts";
import { main, place, pack, offered, announce, passBoth, finish, step } from "./play.ts";

const evoke = checkProcedure({ claim: "Evoke Deceit", basis: "Evoke {U/B}{U/B}", source: { card: "Deceit", zones: ["hand", "graveyard", "exile"], controller: "any" },
	timing: "spell", cost: { mana: "{U/B}{U/B}", alternative: "evoke" }, instructions: [] });
function position(colors: Mana["color"][]) {
	const table = start(standard, [{ deck: alpha(deck("Dimir Excruciator")) }, { deck: deck("Mono-Red Aggro") }], "evoke-record", undefined, { announcementsFrom: 0 });
	const card = place(table, 0, "hand", "Deceit")[0]!;
	const target = place(table, 1, "battlefield", "Hired Claw")[0]!;
	const discard = place(table, 1, "hand", "Lightning Strike")[0]!;
	main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card: "Deceit", assessed: true, printedCast: true, registers: pack("Deceit"), procedures: [evoke] } }], "deceit-terms");
	commit(table, [{ do: "add-mana", who: 0, colors }], "game-setup");
	return { table, card, target, discard };
}

test("a named alternative cost causes its entry trigger without combining prices or changing actual mana facts", () => {
	const cases = ([["U", "U"], ["B", "B"], ["U", "B"], ["U", "U", "B", "B", "C", "C"]] as Mana["color"][][])
		.map(colors => ({ colors, evoked: colors.length === 2, reduce: 0 }));
	cases.push({ colors: ["U", "U"], evoked: false, reduce: 4 });
	for (const { colors, evoked, reduce } of cases) {
		const { table, card, target, discard } = position(colors);
		const procedure = evoked ? evoke : { ...printedCast("Deceit", table.printed.Deceit!), ...(reduce ? { cost: { reduce } } : {}) };
		const initial = structuredClone(table), from = table.ledger.length;
		announce(table, procedure);
		const read = () => ({ world: tableWorld(table), controller: 0, source: card });
		assert.equal(holds(read(), { cast: "this", alternative: "evoke" }), evoked, "a normal cast reduced to two mana is not evoke");
		assert.equal(holds(read(), { cast: "this", paid: "evoke" }), false, "the alternative is not an additional cost");
		assert.equal(amount(read(), { manaSpent: "this" }), colors.length);
		passBoth(table); finish(table);
		const blue = colors.filter(color => color === "U").length >= 2, black = colors.filter(color => color === "B").length >= 2;
		assert.equal(table.waiting.length, Number(evoked) + Number(blue) + Number(black));
		assert.equal(card.zone, "battlefield", "evoke has not sacrificed during spell resolution");
		const pending = structuredClone(table), at = table.ledger.length;
		const visible = project(table, 1), seen = visible.objects!.find(one => one.id === card.id)!;
		assert.equal(holds({ world: viewWorld(visible), controller: 1, source: seen }, { cast: "this", alternative: "evoke" }), evoked);
		// Put sacrifice last so it resolves first; the other entry abilities retain their facts.
		while (table.waiting.length) {
			const trigger = table.waiting.find(one => !one.basis.startsWith("Evoke")) ?? table.waiting[0]!;
			const option = nextDecision(table)!.options.find(one => one.trigger?.id === trigger.id &&
				(!trigger.basis.includes("{U}{U}") || one.trigger.targets.some(one => "id" in one && one.id === target.id)))!;
			assert.ok(option); apply(table, option.id, "model", "chosen");
		}
		if (evoked) { passBoth(table); finish(table); assert.equal(card.zone, "graveyard"); }
		while (cardsIn(table, "stack").length) {
			passBoth(table);
			while (table.resolution) {
				const options = nextDecision(table)!.options;
				const pick = options.find(one => one.label.startsWith("Choose") && one.objects?.some(ref => ref.id === discard.id)) ?? (options.length === 1 ? options[0] : undefined);
				assert.ok(pick, options.map(one => one.label).join(" | ")); apply(table, pick.id, "model", "chosen");
			}
			finish(table);
		}
		assert.equal(target.zone, blue ? "hand" : "battlefield");
		assert.equal(discard.zone, black ? "graveyard" : "hand");
		assert.equal(card.zone, evoked ? "graveyard" : "battlefield");
		assert.deepEqual(relive(pending, table.ledger.slice(at)), table);
		assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
		commit(table, [{ do: "move", what: card.id, to: "exile", reason: "exile" },
			{ do: "move", what: card.id, to: "battlefield", reason: "resolve", registers: pack("Deceit") }], "resolve");
		assert.equal(holds(read(), { cast: "this", alternative: "evoke" }), false);
		assert.equal(table.waiting.length, 0, "returning without casting inherits neither evoke nor earlier colored mana");
	}
	const { table, card } = position(["U", "U"]);
	const scope = () => ({ world: tableWorld(table), controller: 0, source: card });
	assert.throws(() => checkProcedure({ ...evoke, timing: "stack" }), /spell announcement/);
	assert.throws(() => checkProcedure({ ...evoke, cost: { alternative: "evoke" } }), /mana price/);
	assert.throws(() => checkReferences({ do: "pay", who: "you", cost: evoke.cost }), /spell announcement/);
	commit(table, [{ do: "move", what: card.id, to: "exile", reason: "exile" }], "resolve");
	assert.equal(offered(table, evoke).length, 0, "the alternative grants no zone permission");
	commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite",
		on: { id: card.id, incarnation: card.incarnation }, mana: "{U/B}{U/B}" } }], "resolve");
	assert.equal(offered(table, evoke).length, 0, "even an equal alternative permission cannot be combined with evoke");
	const plain = offered(table, printedCast("Deceit", table.printed.Deceit!))[0]!;
	assert.ok(plain);
	assert.throws(() => activationChanges(table, { ...plain.activation, cost: { ...plain.activation.cost, alternative: "evoke" } }), /casting permission/);
	commit(table, [{ do: "note", note: { kind: "permit", by: 0, who: 0, fromTurn: 0, until: "indefinite", on: { id: card.id, incarnation: card.incarnation } } }], "resolve");
	const frame = workFrame(table, 0), source = frame.view.objects!.find(one => one.id === card.id)!;
	assert.equal(manaBudget(frame, evoke, source).payableBeforeNewResources, true);
	announce(table, evoke); passBoth(table); step(table);
	assert.equal(holds(scope(), { cast: "this", from: "exile", alternative: "evoke" }), true);
});
