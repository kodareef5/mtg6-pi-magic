/** "Your choice of A or B" is chosen as the spell resolves (608.2d): one labelled option, then its instructions. */
import test from "node:test";
import assert from "node:assert/strict";
import { start } from "../src/core/commit.ts";
import { alpha, deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { advance, nextDecision } from "../src/core/decisions.ts";
import { relive } from "../src/core/journal.ts";
import { characteristics } from "../src/core/characteristics.ts";
import { check, ProcedureSchema, type Procedure } from "../src/core/language.ts";
import { checkProcedure } from "../src/core/procedures.ts";
import { main, place, announce, passBoth, step } from "./play.ts";

const offense = (oracle: string): Procedure => ({
	source: { card: "Practiced Offense", zones: ["hand"], controller: "self" }, timing: "spell", claim: "Cast Practiced Offense", basis: oracle,
	targets: [{ player: "any" }, { object: { types: ["creature"] } }],
	instructions: [
		{ do: "counters", every: { zones: ["battlefield"], types: ["creature"], controller: "target:0" }, kind: "+1/+1", amount: 1 },
		{ do: "choose-one", who: "you", options: [
			{ label: "double strike", instructions: [{ do: "modify", what: "target:1", change: { words: ["double strike"] }, until: "end-of-turn" }] },
			{ label: "lifelink", instructions: [{ do: "modify", what: "target:1", change: { words: ["lifelink"] }, until: "end-of-turn" }] },
		] },
	],
});

test("the caster chooses double strike or lifelink as Practiced Offense resolves, and replay keeps the choice", () => {
	for (const [label, keyword, other] of [["lifelink", "lifelink", "double strike"], ["double strike", "double strike", "lifelink"]] as const) {
		const table = start(standard, [{ deck: alpha(deck("Mardu Discard")) }, { deck: deck("Mono-Red Aggro") }], `choose-one-${label}`, undefined, { announcementsFrom: 0 });
		const procedure = offense(table.printed["Practiced Offense"]!.oracle);
		assert.doesNotThrow(() => check(ProcedureSchema, procedure, "Practiced Offense"));
		assert.doesNotThrow(() => checkProcedure(procedure), "option instructions may name the spell's targets");
		main(table, 0, 3);
		place(table, 0, "battlefield", "Sacred Foundry", "Sacred Foundry", "Godless Shrine");
		const [ally] = place(table, 0, "battlefield", "Iron-Shield Elf");
		place(table, 0, "hand", "Practiced Offense");
		const before = structuredClone(table), from = table.ledger.length;
		announce(table, procedure, (choice) => choice.activation.targets[0]!.some((one) => "player" in one && one.player === 0)
			&& choice.activation.targets[1]!.some((one) => "id" in one && one.id === ally!.id));
		passBoth(table);
		step(table); // the counters
		const decision = nextDecision(table)!;
		assert.equal(decision.seat, 0, "the caster chooses");
		assert.deepEqual(decision.options.map((one) => one.label), ["Choose: double strike", "Choose: lifelink"]);
		step(table, (text) => text === `Choose: ${label}`);
		while (table.resolution) step(table);
		const traits = characteristics(table, table.things.get(ally!.id)!)!;
		assert.ok(traits.words.includes(keyword), `${keyword} is granted`);
		assert.ok(!traits.words.includes(other), `${other} is not`);
		assert.equal(table.things.get(ally!.id)!.counters["+1/+1"], 1);
		while (!nextDecision(table)) advance(table);
		assert.deepEqual(relive(before, table.ledger.slice(from)), table, "replay reaches the same choice and state");
	}
});
