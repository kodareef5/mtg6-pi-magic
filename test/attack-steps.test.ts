/** An attack step that names several creatures is one set: it stays open through the declaration
 * until each named creature is picked or can no longer attack, and a finished declaration closes it. */
import test from "node:test";
import assert from "node:assert/strict";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { annotate, execution, planState } from "../src/core/planning.ts";
import type { Table } from "../src/core/table.ts";
import type { PlanOption } from "../src/core/language.ts";
import { establish, matchup, quiet } from "./play.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";

function reach(table: Table, turn: number) {
	for (let guard = 0; guard < 3000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers" && table.cursor.turn === turn) return;
		apply(table, decision.situation === "pregame" ? "keep" : quiet(decision.options).id, "engine", "forced");
	}
	throw new Error(`Never reached declare-attackers on turn ${turn}.`);
}

const steps: PlanOption[] = [
	{ label: "Attack with the Elves", when: { active: "self", step: "declare-attackers" }, action: { prefix: "attack:", objects: { card: "Llanowar Elves" } } },
	{ label: "Finish attacking", when: { active: "self", step: "declare-attackers" }, action: { option: "attack:done" } },
];

test("an attack step naming three creatures stays open until all three are picked", () => {
	const table = matchup("attack-set");
	const elves = [establish(table, 0, "Llanowar Elves"), establish(table, 0, "Llanowar Elves"), establish(table, 0, "Llanowar Elves")];
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	reach(table, 3);
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps } }], "plan");
	const take = (id: string) => { const state = planState(workFrame(table, 0))!; apply(table, id, "model", "chosen", execution(state, id)); };
	const open = () => planState(workFrame(table, 0))!.due.find((one) => one.at === 0);
	const finishNote = () => (annotate(nextDecision(table)!.options, planState(workFrame(table, 0))!).find((one) => one.id === "attack:done")!.notes ?? []).join(" ");

	assert.deepEqual(open()!.candidates.map((one) => one.id).sort(), elves.map((one) => `attack:${one.id}`).sort());
	take(`attack:${elves[0]!.id}`);
	assert.deepEqual(open()!.candidates.map((one) => one.id).sort(), elves.slice(1).map((one) => `attack:${one.id}`).sort(), "the first Elf does not close the set");
	assert.match(finishNote(), /Finishing now leaves available plan steps unfinished: step 1/);
	const script = () => focus({ ...workFrame(table, 0), decision: nextDecision(table)! }, startingIntent(0)).plan?.script?.steps ?? [];
	assert.ok(script().some((line) => line.startsWith("Now: ")) && !script().some((line) => line.startsWith("Done: ")), "the pilot reads the open set as now, not done");
	assert.ok(!open()!.candidates.some((one) => one.id === `attack:${chocobo.id}`), "a creature the step does not name stays outside it");
	take(`attack:${elves[1]!.id}`); take(`attack:${elves[2]!.id}`);
	assert.equal(open()!.candidates.length, 0, "every named Elf is picked");
	assert.doesNotMatch(finishNote(), /leaves available plan steps unfinished/);
	take("attack:done");
	assert.deepEqual(table.combat?.attackers.map((one) => one.id).sort(), elves.map((one) => one.id).sort());
	assert.deepEqual([...new Set(workFrame(table, 0).view.done)].sort(), [0, 1]);
});

test("a finished declaration closes the set; a later turn's declaration does not reopen it", () => {
	const table = matchup("attack-set-later");
	establish(table, 0, "Llanowar Elves"); establish(table, 0, "Llanowar Elves");
	reach(table, 3);
	editWork(table, 0, [{ do: "plan.put", plan: { objective: "o", guidance: "g", steps } }], "plan");
	const state = planState(workFrame(table, 0))!, first = state.due[0]!.candidates[0]!.id;
	apply(table, first, "model", "chosen", execution(state, first));
	apply(table, "attack:done", "model", "chosen", execution(planState(workFrame(table, 0))!, "attack:done"));
	reach(table, 5);
	const later = planState(workFrame(table, 0));
	assert.ok(later, "the plan is still installed");
	assert.ok(!later.due.some((one) => one.at === 0), "the step carried out on turn 3 stays done on turn 5");
	const elf = later.attacks[0]?.objects[0] ?? workFrame(table, 0).view.objects!.find((one) => one.card === "Llanowar Elves" && one.zone === "battlefield")!;
	apply(table, `attack:${elf.id}`, "model", "chosen");
	assert.ok(!planState(workFrame(table, 0))!.due.some((one) => one.at === 0), "picking one of its Elves on turn 5 does not reopen it");
});
