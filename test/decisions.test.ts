import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { standard } from "../src/core/format.ts";
import { commit, start } from "../src/core/commit.ts";
import { cardsIn } from "../src/core/table.ts";
import { relive } from "../src/core/journal.ts";
import { endingPhase } from "../src/core/turn.ts";
import { example, main, matchup, passBoth, place, step } from "./play.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { project, sinceDecision } from "../src/core/view.ts";

const table = () => start(standard, [
	{ name: "A", deck: deck("Green Stompy") },
	{ name: "B", deck: deck("Dimir Control") },
], "decisions");

test("listing a decision never changes the table, including pending losses", () => {
	const built = table();
	const inspect = () => {
		const before = structuredClone(built);
		const first = nextDecision(built);
		const view = project(built, 0);
		const recent = project(built, 0, sinceDecision(built, 0));
		assert.deepEqual(project(built, 0, sinceDecision(built, 0)), recent);
		assert.deepEqual(view.remainingSteps, view.window.kind === "turn" ? built.cursor.steps : undefined);
		if (view.remainingSteps) { view.remainingSteps.length = 0; assert.deepEqual(built.cursor.steps, before.cursor.steps); }
		assert.deepEqual(nextDecision(built), first);
		assert.deepEqual(built, before);
		return first;
	};
	assert.equal(inspect(), null);
	advance(built);
	assert.equal(inspect()?.situation, "pregame");
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	commit(built, [{ do: "change-life", who: 0, amount: -20, reason: "resolve" }], "resolve");
	const loss = inspect()!;
	assert.equal(loss.situation, "state-based");
	apply(built, loss.options[0]!.id, "engine", "forced");
	assert.deepEqual(built.outcome?.results, { 0: "lose", 1: "win" });
	assert.equal(inspect(), null);

	const boundary = table();
	advance(boundary);
	assert.equal(sinceDecision(boundary, 0), 0, "before any seat answer, setup receipts are included");
	apply(boundary, "keep", "model", "chosen");
	const afterKeep = sinceDecision(boundary, 0);
	assert.match(project(boundary, 0, afterKeep).since.join("\n"), /A declared keep/);
	apply(boundary, "keep", "model", "chosen");
	assert.match(project(boundary, 0, afterKeep).since.join("\n"), /B declared keep/, "opposing actions extend the same window");
	main(boundary, 0);
	assert.equal(sinceDecision(boundary, 0), afterKeep, "forced rows do not consume receipts");
	const land = nextDecision(boundary)!.options.find((one) => one.id.startsWith("land:"))!;
	apply(boundary, land.id, "model", "chosen");
	const afterLand = sinceDecision(boundary, 0);
	assert.ok(afterLand > afterKeep);
	assert.match(project(boundary, 0, afterLand).since[0]!, /play-land/, "the action's own receipt is included");
	apply(boundary, "pass", "engine", "delegated");
	assert.equal(sinceDecision(boundary, 0), afterLand, "delegation does not mean a new seat answer");
	apply(boundary, "pass", "engine", "forced");
	while (!nextDecision(boundary)) advance(boundary);
	apply(boundary, "pass", "judge", "chosen");
	assert.equal(sinceDecision(boundary, 0), afterLand, "a judge row is not the seat's answer");
	apply(boundary, "pass", "engine", "forced");
	while (!nextDecision(boundary)) advance(boundary);
	apply(boundary, "attack:done", "model", "chosen");
	while (!nextDecision(boundary)) advance(boundary);
	apply(boundary, "pass", "engine", "fallback");
	assert.equal(sinceDecision(boundary, 0), boundary.log.length, "a fallback pass advances the boundary even with no receipt");
	commit(boundary, [{ do: "change-life", who: 0, amount: 1, reason: "resolve" }], "resolve");
	commit(boundary, [{ do: "change-life", who: 1, amount: 1, reason: "resolve" }], "resolve");
	assert.equal(project(boundary, 0, sinceDecision(boundary, 0)).since.length, 2, "all receipts associated with the last decision remain visible");
	assert.deepEqual(project(boundary, 0).since, []);
	assert.deepEqual(workFrame(boundary, 0).view.since, []);
	assert.deepEqual(project(boundary, "spectator").since, []);
	assert.equal(project(boundary, "spectator", boundary.log.length - 2).since.length, 2, "explicit receipt slices retain their meaning");
});

test("an outcome accounts for every loss in the simultaneous group", () => {
	for (const order of [[0, 1], [1, 0]]) {
		const built = table();
		advance(built);
		apply(built, "keep", "model", "chosen");
		apply(built, "keep", "model", "chosen");
		advance(built);
		commit(built, order.map((who) => ({ do: "change-life", who, amount: -20, reason: "resolve" })), "resolve");
		const loss = nextDecision(built)!;
		apply(built, loss.options[0]!.id, "engine", "forced");
		assert.equal(built.log.at(-1)!.changes.length, 2);
		assert.deepEqual(built.outcome?.results, { 0: "draw", 1: "draw" });
	}
});

test("cleanup keeps the discard obligation pending until the hand fits", () => {
	const built = table();
	advance(built);
	apply(built, "keep", "model", "chosen");
	apply(built, "keep", "model", "chosen");
	advance(built);
	built.cursor.steps = ["cleanup"];
	commit(built, cardsIn(built, "library", 0).slice(0, 2).map((card) => ({
		do: "move", what: card.id, to: "hand", reason: "draw",
	})), "draw");
	for (const size of [9, 8]) {
		assert.equal(cardsIn(built, "hand", 0).length, size);
		const discard = nextDecision(built)!;
		assert.equal(discard.situation, "turn-based");
		assert.match(discard.question, /^Discard /);
		apply(built, discard.options[0]!.id, "model", "chosen");
	}
	assert.equal(cardsIn(built, "hand", 0).length, 7);
	assert.equal(nextDecision(built), null);
	advance(built);
	assert.equal(built.cursor.active, 1);

	// 514.2 removes damage and temporary effects together. 514.3a checks
	// afterward, opens priority for either exception, and repeats cleanup.
	for (const exception of ["trigger", "state"] as const) {
		const setup = () => {
			const table = matchup(`cleanup-${exception}`);
			const [elf] = place(table, 0, "battlefield", "Llanowar Elves");
			place(table, 1, "battlefield", "Mountain"); place(table, 1, "hand", "Shock");
			editWork(table, 1, [{ do: "package.put", package: { card: "Shock", registers: [], procedures: [example("Cast Shock")], assessed: true } },
				{ do: "plan.put", plan: { objective: "Keep the response.", guidance: "Shock if needed during cleanup priority.", steps: [],
					may: [{ label: "Shock", when: { step: "cleanup" }, action: { procedure: example("Cast Shock") } }] } }], "shock");
			const on = { id: elf!.id, incarnation: elf!.incarnation };
			commit(table, [{ do: "note", note: { kind: "label", by: 0, on, until: "end-of-turn", text: "temporary protection",
				change: exception === "trigger" ? { words: ["indestructible"] } : { power: 1, toughness: 1 } } },
				exception === "trigger" ? { do: "damage", source: elf!.id, target: on, amount: 1 } : { do: "counters", what: elf!.id, kind: "-1/-1", amount: 1 },
				...(exception === "trigger" ? [{ do: "note" as const, note: { kind: "delay" as const, by: 0, until: "indefinite" as const,
					event: { on: "step" as const, step: "cleanup" as const }, once: true,
					effect: { instructions: [{ do: "draw" as const, who: "you", count: 2 }] }, fixed: { source: on, targets: [], bound: {} } } }] : []),
			], "game-setup");
			return table;
		};
		const table = setup(), elf = cardsIn(table, "battlefield")[0]!;
		main(table, 0, 1, "end"); passBoth(table); advance(table);
		assert.equal(table.cursor.steps[0], "cleanup");
		assert.equal(nextDecision(table), null, "cleanup's turn-based operation precedes its exception check");
		advance(table);
		assert.equal(table.things.get(elf.id)!.damage, 0);
		assert.equal(table.notes.some((one) => one.until === "end-of-turn"), false);
		const before = structuredClone(table), pending = nextDecision(table)!;
		assert.deepEqual(table, before, "discovering the exception changes nothing");
		assert.equal(pending.situation, exception === "trigger" ? "trigger-order" : "state-based");
		apply(table, pending.options[0]!.id, "engine", "forced");
		assert.equal(nextDecision(table)!.situation, "priority");
		assert.equal(nextDecision(table)!.seat, 0, "the active seat receives the cleanup exception's first priority");
		if (exception === "trigger") {
			passBoth(table);
			while (table.resolution) step(table);
			assert.equal(cardsIn(table, "hand", 0).length, 9);
			assert.equal(table.things.get(elf.id)!.zone, "battlefield", "damage expired together with indestructible");
			assert.equal(nextDecision(table), null, "drawing in cleanup does not restart discards in the current step");
			advance(table);
		} else assert.equal(table.things.get(elf.id)!.zone, "graveyard", "the temporary toughness expired before the state check");
		assert.match(nextDecision(table)!.options.find((one) => one.id === "pass")!.shows!, /another cleanup step/);
		apply(table, "pass", "model", "chosen");
		const response = nextDecision(table)!;
		assert.equal(response.seat, 1);
		assert.ok(response.options.some((one) => one.label.startsWith("Cast Shock")), "the nonactive seat can respond in cleanup");
		assert.ok(response.options.every((one) => !one.id.startsWith("land:")), "cleanup priority is not a main phase");
		assert.equal(workFrame(table, 1).view.work!.plan!.may![0]!.when.step, "cleanup", "strategy may prepare an exceptional cleanup response");
		apply(table, "pass", "model", "chosen");
		assert.equal(endingPhase(table), false, "the ending phase is not over while a cleanup is owed");
		const visit = table.cursor.visit;
		advance(table);
		assert.equal(table.cursor.steps[0], "cleanup");
		assert.equal(table.cursor.turn, 1);
		assert.equal(table.cursor.visit, visit + 1, "the repeated cleanup is a new window");
		for (const size of exception === "trigger" ? [9, 8] : []) {
			assert.equal(cardsIn(table, "hand", 0).length, size);
			const discard = nextDecision(table)!;
			assert.match(discard.question, /^Discard /);
			apply(table, discard.options[0]!.id, "model", "chosen");
		}
		while (!nextDecision(table)) advance(table);
		assert.equal(table.cursor.turn, 2, "quiet cleanup ends without priority or another repeat");
		const restored = relive(setup(), table.ledger);
		assert.deepEqual(restored.things, table.things);
		assert.deepEqual(restored.cursor, table.cursor);
		assert.deepEqual(restored.waiting, table.waiting);
	}
});
