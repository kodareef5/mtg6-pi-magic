/** Floating mana keeps its accepted lifetime through payments, step transitions and replay. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { fundings } from "../src/core/funding.ts";
import { afterUntap, paymentForecast } from "../src/core/budget.ts";
import { workFrame } from "../src/core/work-tools.ts";
import { project } from "../src/core/view.ts";
import { manaLines } from "../src/context/strategy-facts.ts";
import type { Plan } from "../src/core/language.ts";
import { establish, finish, main, passBoth, quiet, step } from "./play.ts";

test("mana keeps its stated expiry and payment alternatives across combat steps, forecasts and replay", () => {
	const table = start(standard, [{ name: "Roku", deck: deck("Boros Dragons") }, { name: "Red", deck: deck("Mono-Red Aggro") }], "firebending");
	const roku = establish(table, 0, "The Legend of Roku // Avatar Roku");
	commit(table, [{ do: "transform", what: roku.id }], "game-setup");
	main(table, 0, 1, "begin-combat");
	passBoth(table);
	for (let guard = 0; guard < 100 && nextDecision(table)?.situation !== "turn-based"; guard++) {
		const decision = nextDecision(table);
		if (decision) apply(table, quiet(decision.options).id, "model", "chosen"); else advance(table);
	}
	assert.equal(table.cursor.steps[0], "declare-attackers");
	const before = structuredClone(table), at = table.ledger.length;
	apply(table, `attack:${roku.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
	assert.equal(nextDecision(table)!.situation, "trigger-order");
	apply(table, nextDecision(table)!.options[0]!.id, "model", "chosen"); passBoth(table);
	assert.match(nextDecision(table)!.question, /mana|Add/i);
	step(table); finish(table);
	assert.equal(table.seats[0]!.pool.length, 4);
	assert.ok(table.seats[0]!.pool.every((mana) => mana.until === "end-of-combat"));
	assert.deepEqual(relive(before, table.ledger.slice(at)), table);
	// Equal colors with different lifetimes remain distinct payments.
	commit(table, [{ do: "add-mana", who: 0, colors: ["R"] }, { do: "add-mana", who: 0, colors: ["R"], until: "end-of-turn" }], "resolve");
	const frame = workFrame(table, 0);
	assert.equal(fundings(frame, { generic: 1, colors: [] }).length, 3);
	assert.match(project(table, 1).table.join("\n"), /lasts until end of combat/);
	assert.match(manaLines(frame).join("\n"), /lasts until end of combat/);
	assert.equal(afterUntap(frame).view.pools![0]!.mana.length, 0);
	const plan = (when: "end-of-combat" | "postcombat-main"): Plan => ({ objective: "Check known payment only.", guidance: "A forecast does not choose the activation.", steps: [{
		label: "Create a Dragon", when: { active: "self", step: when }, action: { procedure: {
			source: { zones: ["battlefield"], card: roku.card!, controller: "self", face: 1 }, face: 1, timing: "stack", claim: "Create a Dragon",
			basis: "{8}: Create a 4/4 red Dragon creature token with flying and firebending 4.", cost: { mana: "{8}" }, instructions: [] } }
	}] });
	const forecast = structuredClone(frame);
	forecast.view.pools![0]!.mana.push(...Array.from({ length: 3 }, (_, i) => ({ id: `forecast-${i}`, color: "R" as const, until: "end-of-combat" as const })));
	assert.deepEqual(paymentForecast(forecast, plan("end-of-combat")).conflicts, []);
	assert.equal(paymentForecast(forecast, plan("postcombat-main")).conflicts.length, 1);
	const prefix = structuredClone(table), from = table.ledger.length;
	main(table, 0, 1, "end-of-combat");
	assert.equal(table.seats[0]!.pool.length, 5, "ordinary mana expired at the attack step's end");
	const clone = structuredClone(table), next = table.ledger.length;
	main(table, 0, 1, "postcombat-main");
	assert.deepEqual(table.seats[0]!.pool.map((mana) => mana.until), ["end-of-turn"]);
	main(table, 1, 2);
	assert.equal(table.seats[0]!.pool.length, 0);
	assert.deepEqual(relive(clone, table.ledger.slice(next)), table);
	assert.deepEqual(relive(prefix, table.ledger.slice(from)), table);
});
