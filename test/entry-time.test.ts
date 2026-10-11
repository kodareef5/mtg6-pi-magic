/** Entry conditions read physical clocks, not the controller's previous turn or a stale incarnation. */
import test from "node:test";
import assert from "node:assert/strict";
import { commit, start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { apply } from "../src/core/decisions.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { fundings } from "../src/core/funding.ts";
import { holds, tableWorld, viewWorld } from "../src/core/selectors.ts";
import { project } from "../src/core/view.ts";
import { relive } from "../src/core/journal.ts";
import { planningFrame } from "../src/context/strategy-facts.ts";
import { main, pack, place } from "./play.ts";

test("entry timing has the same mana meaning in core, projected views and replay", () => {
	const table = start(standard, [{ deck: deck("Dimir Midrange") }, { deck: deck("Mono-Red Aggro") }], "conditional-entry-time");
	main(table, 0);
	editWork(table, 0, [{ do: "package.put", package: { card: "Hidden Lair", registers: pack("Hidden Lair") } }], "conditional-land");
	const [land] = place(table, 0, "hand", "Hidden Lair");
	const initial = structuredClone(table), from = table.ledger.length;
	apply(table, `land:${land!.id}`, "model", "chosen");
	const entered = { enteredThisTurn: "this" };
	assert.ok(holds({ world: tableWorld(table), controller: 0, source: land }, entered));
	for (const viewer of [0, 1, "spectator"] as const) {
		const world = viewWorld(project(table, viewer));
		assert.ok(holds({ world, controller: 0, source: world.objects.find((one) => one.id === land!.id) }, entered));
	}
	assert.equal(fundings(workFrame(table, 0), { generic: 0, colors: ["U"] }).length, 1);
	const forecast = planningFrame(workFrame(table, 0), "preparation");
	assert.equal(fundings(forecast, { generic: 0, colors: ["U"] }).length, 0, "entry permission does not survive a forecast turn boundary");
	main(table, 1);
	assert.equal(holds({ world: tableWorld(table), controller: 0, source: land }, entered), false, "the opponent's turn also resets the condition");
	assert.equal(fundings(workFrame(table, 0), { generic: 0, colors: ["U"] }).length, 0);
	assert.equal(fundings(workFrame(table, 0), { generic: 1, colors: [] }).length, 1, "unconditional colorless mana remains available");
	assert.deepEqual(relive(initial, table.ledger.slice(from)), table);
	const [basic] = place(table, 0, "battlefield", "Island");
	assert.ok(fundings(workFrame(table, 0), { generic: 0, colors: ["B"] }).length, "a basic enables the other condition on a later turn");
	commit(table, [{ do: "move", what: basic!.id, to: "hand", reason: "bounce" }], "resolve");
	assert.equal(fundings(workFrame(table, 0), { generic: 0, colors: ["B"] }).length, 0);
	const old = { id: land!.id, incarnation: land!.incarnation };
	const departed = structuredClone(land!);
	commit(table, [{ do: "move", what: land!.id, to: "hand", reason: "bounce" }], "resolve");
	assert.equal(holds({ world: tableWorld(table), controller: 0, source: land }, entered), false);
	commit(table, [{ do: "move", what: land!.id, to: "battlefield", reason: "resolve", registers: pack("Hidden Lair") }], "resolve");
	assert.ok(fundings(workFrame(table, 0), { generic: 0, colors: ["B"] }).length, "re-entry during the opponent's turn enables mana");
	assert.equal(holds({ world: tableWorld(table), controller: 0, source: departed }, entered), false);
	assert.equal(holds({ world: tableWorld(table), controller: 0, bound: { old: { objects: [old], players: [] } } }, { enteredThisTurn: "bound:old" }), false);
});
