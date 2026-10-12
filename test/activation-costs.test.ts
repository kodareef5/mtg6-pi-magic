/** Activation prices use the source's live characteristics and lock before its payment removes anything. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { activatedUses } from "../src/core/activated.ts";
import { costAdjustment, maximumReduction } from "../src/core/casting-costs.ts";
import { manaBudget, paymentForecast } from "../src/core/budget.ts";
import { paymentChoices } from "../src/core/costs.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import { project } from "../src/core/view.ts";
import { tableWorld, viewWorld } from "../src/core/selectors.ts";
import type { Procedure, Plan } from "../src/core/language.ts";
import { announce, main, offered, pack, place, quiet } from "./play.ts";

const card = "Mutagen Man, Living Ooze";
const build = () => start(standard, [{ deck: alpha(deck("Jund Sacrifice")) }, { deck: alpha(deck("Jund Sacrifice")) }], "activation-costs", undefined, { announcementsFrom: 0 });
const replay = (table: Table, before: Table) => assert.deepEqual(relive(structuredClone(before), table.ledger.slice(before.ledger.length), table.workLog.slice(before.workLog.length)), table);
function settle(table: Table) {
	for (let guard = 0; guard < 150; guard++) {
		const decision = nextDecision(table); if (!decision) { advance(table); continue; }
		if (decision.situation === "priority" && !cardsIn(table, "stack").length) return;
		apply(table, quiet(decision.options).id, "model", "chosen");
	} throw new Error("Resolution did not settle");
}

test("activation discounts preserve targets and nonmana costs, bound X, and agree with staged payments and forecasts", () => {
	for (const x of [0, 2]) {
		const table = build(); main(table, 0);
		const source = cardsIn(table, "hand", 0).find(one => one.card === card) ?? place(table, 0, "hand", card)[0]!;
		const cast: Procedure = { source: { card, zones: ["hand"], controller: "self" }, claim: "Cast Mutagen Man with X", basis: table.printed[card]!.oracle.split("\n")[2]!, timing: "spell", cost: { mana: "{X}{G}{G}" }, instructions: [] };
		editWork(table, 0, [{ do: "package.put", package: { card, assessed: true, registers: pack(card), procedures: [cast], deferred: [] } }], "mutagen-terms");
		commit(table, [{ do: "add-mana", who: 0, colors: ["G", "G", ...Array(x).fill("C")] }], "game-setup");
		const before = structuredClone(table);
		announce(table, cast, one => one.activation.x === x); assert.ok(characteristics(table, source)!.words.includes("trample")); settle(table);
		const tokens = cardsIn(table, "battlefield").filter(one => one.token?.name === "Mutagen Token");
		assert.equal(tokens.length, x); assert.equal(table.seats[0]!.pool.length, 0); assert.ok(characteristics(table, source)!.words.includes("trample")); replay(table, before);
		if (!x) continue;
		const token = tokens[0]!, uses = activatedUses(workFrame(table, 0)), use = uses.find(one => one.procedure.source.refs?.[0]?.id === token.id)!.procedure;
		const frame = workFrame(table, 0), pure = structuredClone(table), object = frame.view.objects!.find(one => one.id === token.id)!;
		assert.ok(offered(table, use).every(one => one.activation.cost.generic === 0 && one.activation.cost.tap && one.activation.cost.sacrificed?.[0]?.id === token.id));
		assert.match(manaBudget(frame, use, object).scope, /Not priced/, "a mana-only forecast does not promise a sacrifice");
		for (const viewer of [1, "spectator"] as const) assert.ok(!project(table, viewer).objects!.some(one => one.zone === "hand" && one.owner === 0));
		assert.deepEqual(table, pure);
		// A removed reducer restores the generic price; an opponent's source and a nontoken never qualify.
		for (const removed of [false, true]) {
			const changed = structuredClone(table);
			commit(changed, removed ? [{ do: "move", what: source.id, to: "graveyard", reason: "destroy" }]
				: [{ do: "note", note: { kind: "label", on: source, by: 0, until: "end-of-turn", text: "Ability loss fixture", change: { loseAbilities: true } } }], "resolve");
			assert.equal(offered(changed, use).length, 0);
			commit(changed, [{ do: "add-mana", who: 0, colors: ["C"] }], "game-setup");
			assert.ok(offered(changed, use).every(one => one.activation.cost.generic === 1));
		}
		const world = viewWorld(frame.view);
		assert.equal(costAdjustment(world, { ...object, controller: 1 }, "battlefield", "activate"), 0);
		assert.equal(costAdjustment(world, { ...object, token: undefined }, "battlefield", "activate"), 0);
		assert.equal(costAdjustment(world, { ...object, traits: { ...object.traits!, types: ["creature"] } }, "battlefield", "activate"), 0);
		assert.equal(costAdjustment(world, { ...object, zone: "stack" }, "battlefield"), 0);
		assert.equal(maximumReduction(world, "cast"), 0); assert.equal(maximumReduction(world, "activate"), 1);
		// Fixed-mana pricing fixtures isolate the mana arithmetic without claiming these are printed abilities.
		const priced: Procedure = { ...use, claim: "Fixed-mana pricing fixture", cost: { mana: "{2}{G}{C}" }, targets: [], instructions: [] };
		const funded = structuredClone(table); commit(funded, [{ do: "add-mana", who: 0, colors: ["C", "G", "C", "C", "G", "C"] }], "game-setup");
		const fundedFrame = workFrame(funded, 0);
		assert.equal(manaBudget(fundedFrame, priced, object).cost, "{1}{G}{C}");
		const plan: Plan = { objective: "Price two activations", guidance: "Arithmetic fixture only", steps: [0, 1].map(at => ({ label: `Activation ${at}`, when: { active: "self", step: "precombat-main" }, action: { procedure: priced } })) };
		const forecast = paymentForecast(fundedFrame, plan); assert.deepEqual(forecast.conflicts, []); assert.deepEqual(forecast.unchecked, []); assert.deepEqual(forecast.payments.map(one => one.funding.paid.length), [3, 3]);
		const variable = { ...priced, cost: { mana: "{X}" } }, xs = offered(table, variable).map(one => one.activation.x);
		assert.ok(xs.includes(1), "a generic reduction makes X=1 reachable with no mana"); assert.ok(!xs.includes(2));
		const more = structuredClone(frame), reducedSource = more.view.objects!.find(one => one.id === source.id)!;
		reducedSource.traits!.registrations.push(pack(card).find(one => one.kind === "cost")!);
		assert.equal(costAdjustment(viewWorld(more.view), object, "battlefield", "activate"), 2);
		assert.equal(manaBudget(more, { ...priced, cost: { mana: "{1}{G}{C}" } }, object).cost, "{G}{C}", "stacking discounts stop at zero generic mana");
		assert.equal(paymentChoices(table, { world: tableWorld(table), controller: 0, source: token }, { mana: "{1}" }, 0, source.id).length, 0, "a resolving pay instruction is not an activation");
		// A granted reducer on the artifact being sacrificed is still present when its own price locks.
		const selfReduced = structuredClone(table);
		commit(selfReduced, [{ do: "note", note: { kind: "label", on: source, by: 0, until: "end-of-turn", text: "Remove original reduction fixture", change: { loseAbilities: true } } },
			{ do: "note", note: { kind: "label", on: token, by: 0, until: "end-of-turn", text: "Granted reduction fixture", change: { registers: [pack(card).find(one => one.kind === "cost")!] } } }], "resolve");
		const selfStart = structuredClone(selfReduced);
		const paid = announce(selfReduced, use, one => one.activation.targets[0]!.some(target => "id" in target && target.id === source.id));
		assert.equal(paid.activation.cost.generic, 0); settle(selfReduced); assert.equal(selfReduced.things.has(token.id), false);
		assert.equal(selfReduced.things.get(source.id)!.counters["+1/+1"], 1); replay(selfReduced, selfStart);
		// The staged target, cost and complete-payment choices spend nothing until the final confirmation.
		const snapshots = [structuredClone(table)], begin = nextDecision(table)!.options.find(one => one.announcement?.source.id === token.id)!; assert.ok(begin);
		apply(table, begin.id, "model", "chosen"); snapshots.push(structuredClone(table));
		for (let guard = 0; table.announcement && guard < 12; guard++) {
			const decision = nextDecision(table)!, state = structuredClone(table); nextDecision(table); assert.deepEqual(table, state);
			assert.equal(table.things.get(token.id)!.zone, "battlefield"); assert.equal(table.things.get(token.id)!.tapped, false);
			const option = decision.options.find(one => one.id.startsWith(`announce:target:${source.id}@`)) ?? decision.options.find(one => one.id === "announce:targets-done") ?? decision.options.find(one => one.id.startsWith("announce:cost:")) ?? decision.options.find(one => one.id.startsWith("announce:payment:"));
			assert.ok(option, decision.options.map(one => one.id).join(" | ")); apply(table, option.id, "model", "chosen"); snapshots.push(structuredClone(table));
		}
		assert.equal(table.announcement, undefined); settle(table); assert.equal(table.things.has(token.id), false); assert.equal(source.counters["+1/+1"], 1);
		assert.equal(table.seats[0]!.pool.length, 0); for (const snapshot of snapshots) replay(table, snapshot);
		const remaining = activatedUses(workFrame(table, 0)).find(one => one.procedure.source.refs?.[0]?.id === tokens[1]!.id)!.procedure;
		main(table, 1, 2); apply(table, "pass", "model", "chosen"); assert.equal(offered(table, remaining).length, 0, "a zero price does not change sorcery timing");
	}
});
