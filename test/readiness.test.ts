/** Known uses block physical choices until prepared, across visibility, permissions and replay.
 * Past 150 lines because these positions exercise one readiness boundary through core and the model adapter.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assessCard } from "../src/context/assess.ts";
import { interpret } from "../src/context/interpret.ts";
import { aiSeat } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { assessmentProblems } from "../src/core/assessment.ts";
import { commit } from "../src/core/commit.ts";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { preparation } from "../src/core/readiness.ts";
import { play } from "../src/core/loop.ts";
import { PlayerUnavailable, type Player } from "../src/core/player.ts";
import { project } from "../src/core/view.ts";
import { open, save, fork, replay, type Header } from "../src/core/journal.ts";
import type { DeferredUse, Package, Procedure } from "../src/core/language.ts";
import { matchTable, universe } from "../tools/matchup-fixture.ts";
import { main, pack, place } from "./play.ts";

test("identified uses are prepared before priority choices, while hidden or unpermitted sources need no work", async () => {
	const basis = universe.cards.get("Shock")!.oracle;
	const use: DeferredUse = { claim: "Cast Shock", basis, source: { card: "Shock", zones: ["hand", "graveyard", "exile"], controller: "any" }, timing: "spell" };
	const known: Package = { card: "Shock", assessed: true, registers: [], procedures: [], deferred: [use] };
	const procedure: Procedure = { ...use, targets: [{ player: "any", object: { zones: ["battlefield"], types: ["creature", "planeswalker", "battle"] } }],
		instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
	const initial = matchTable("readiness-clone");
	assert.deepEqual(assessmentProblems(initial.printed.Shock!, known), [], "coverage can identify a use without programming its effect");
	assert.match(assessmentProblems(initial.printed.Shock!, { ...known, deferred: [] }).join("; "), /Unassessed text/);
	assert.match(assessmentProblems(initial.printed.Shock!, { ...known, deferred: [{ ...use, source: { card: "Shock" } }] }).join("; "), /source zones and controller/);
	const assessed = await assessCard("Shock", initial.printed.Shock!, { work: async (_about, _prompt, tools) => {
		assert.equal(tools.submit.check({ registers: [], procedures: [], deferred: [use], unsupported: [] }), null); return {};
	} }, universe);
	assert.deepEqual(assessed, known);
	await assert.rejects(assessCard("Shock", initial.printed.Shock!, { work: async (_about, _prompt, tools) => {
		assert.match(tools.submit.check({ registers: [], procedures: [], deferred: [use], unsupported: [] })!, /no runtime interpreter/); return {};
	} }, universe, undefined, "complete"), /not ready/);
	for (const seat of [0, 1]) editWork(initial, seat, [{ do: "package.put", package: known }], `known-${seat}`);
	const dir = mkdtempSync(join(tmpdir(), "magic-readiness-"));
	const header: Header = { id: "parent", format: initial.format.name, seed: initial.rng.seed,
		seats: initial.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: "cards/standard.tsv", generated: universe.generated },
		rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const journal = open(join(dir, "parent.jsonl"), header); save(journal, initial);
	fork(journal.path, 0, "clone", join(dir, "clone.jsonl"));
	const rebuilt = replay(join(dir, "clone.jsonl"), (header) => matchTable(header.seed)).table;
	assert.deepEqual(rebuilt.work, initial.work, "a version-zero clone carries unfinished uses, not invented procedures");

	for (const zone of ["hand", "graveyard", "exile"] as const) {
		const table = matchTable(`readiness-${zone}`);
		main(table, 1);
		// Keep this position's other copies out of the source scope.
		commit(table, [...table.things.values()].filter((one) => one.card === "Shock" && one.zone === "hand")
			.map((one) => ({ do: "move", what: one.id, to: "outside", reason: "game-setup" })), "game-setup");
		for (const seat of [0, 1]) editWork(table, seat, [{ do: "package.put", package: known }], `known-${seat}`);
		assert.equal(nextDecision(table)!.preparation, undefined, "knowing the registered list does not expose a library source");
		const [card] = place(table, 1, zone, "Shock");
		assert.deepEqual(preparation(workFrame(table, 0)), [], "another seat's hand and unpermitted public cards give no use");
		if (zone !== "hand") {
			assert.equal(nextDecision(table)!.preparation, undefined);
			commit(table, [{ do: "note", note: { kind: "permit", by: 1, until: "indefinite", who: 1,
				on: { id: card!.id, incarnation: card!.incarnation }, fromTurn: table.cursor.turn } }], "game-setup");
		}
		assert.deepEqual(nextDecision(table)!.preparation, [{ card: "Shock", uses: [use] }]);
		assert.equal(nextDecision(table)!.fallback, undefined);
		const before = structuredClone(table);
		assert.throws(() => apply(table, "pass", "model", "chosen"), /Prepare the known uses/);
		assert.deepEqual(table, before);
		const unavailable = structuredClone(table);
		const pilot = aiSeat({ name: "Unprepared", intent: startingIntent(1), onGap: assert.fail,
			api: { named: "fixture", ask: async () => assert.fail("Do not ask Jev to ignore missing meaning") } });
		assert.equal(await play(unavailable, { 1: pilot }, {}), null);
		assert.deepEqual(unavailable.ledger, before.ledger);
		assert.deepEqual(unavailable.things, before.things);
		assert.match(unavailable.gaps.at(-1)!, /no interpreter.*pending/);
		await pilot.close();
		const bad = structuredClone(table);
		editWork(bad, 1, [{ do: "plan.each-turn" }], "plan-also-due");
		let passes = 0;
		assert.equal(await play(bad, { 1: { name: "Ignores readiness", answer: async () => {
			passes++; return { kind: "pick", option: "pass", actionId: "unready" };
		}, observe() {}, close() {} } }, {}), null);
		assert.equal(passes, 2);
		assert.deepEqual(bad.ledger, before.ledger, "readiness failure cannot become a fallback pass");
		assert.equal(bad.work[1]!.accepted, undefined, "a due strategy session cannot turn failed interpretation into keeping the old plan");
		assert.match(bad.gaps.at(-1)!, /card preparation.*pending/);
		let interpretations = 0;
		const ready = aiSeat({ name: "Interpreter", intent: startingIntent(1), onGap: assert.fail,
			api: { named: "fixture", ask: async () => assert.fail("Interpretation is not a pilot decision") },
			interpret: (frame) => interpret(frame, { work: async (about, prompt, tools) => {
				interpretations++; assert.equal(about, "interpret Shock");
				assert.equal(JSON.parse(prompt.user).printed.oracle, basis);
				assert.match(tools.submit.check({ procedures: [{ ...procedure, source: { ...procedure.source, zones: ["hand"] } }], unsupported: [] })!, /from graveyard/);
				assert.equal(tools.submit.check({ procedures: [procedure], unsupported: [] }), null); return {};
			} }, universe),
		});
		const answer = await ready.answer(workFrame(table, 1));
		assert.equal(answer.kind, "work"); if (answer.kind !== "work") assert.fail();
		assert.deepEqual(table, before, "only core accepts the returned interpretation");
		editWork(table, 1, answer.tools, answer.actionId, answer.revision);
		assert.equal(nextDecision(table)!.preparation, undefined);
		assert.equal(interpretations, 1);
		assert.deepEqual(table.work[1]!.packages![0]!.registers, known.registers);
		assert.deepEqual(table.work[1]!.packages![0]!.deferred, []);
		assert.deepEqual(table.ledger, before.ledger);
		await ready.close();
		await assert.rejects(interpret(workFrame(before, 1), { work: async (_about, _prompt, tools) => {
			assert.equal(tools.submit.check({ procedures: [], unsupported: ["Fixture cannot express this use."] }), null); return {};
		} }, universe), /still needs preparation/);
	}

	// An activated ability belongs to the controller, including a card owned by the other seat.
	const controlled = matchTable("readiness-control"); main(controlled, 0);
	const village: Package = { card: "Rockface Village", assessed: true, registers: pack("Rockface Village"), deferred: [{
		claim: "Village grants haste", basis: universe.cards.get("Rockface Village")!.oracle.split("\n").at(-1)!,
		source: { card: "Rockface Village", zones: ["battlefield"], controller: "self" }, timing: "stack",
	}] };
	for (const seat of [0, 1]) editWork(controlled, seat, [{ do: "package.put", package: village }], `village-${seat}`);
	const [land] = place(controlled, 1, "hand", "Rockface Village");
	assert.deepEqual(preparation(workFrame(controlled, 1)), [], "an activation from the battlefield need not be programmed while in hand");
	commit(controlled, [{ do: "move", what: land!.id, to: "battlefield", controller: 0, reason: "game-setup", registers: village.registers }], "game-setup");
	assert.equal(preparation(workFrame(controlled, 0))[0]!.card, village.card);
	assert.deepEqual(preparation(workFrame(controlled, 1)), []);
	assert.equal(project(controlled, 0).objects!.find((one) => one.id === land!.id)!.controller, 0);

	// Exercise the readiness boundary after ordinary dealing, then freeze the
	// first cast. The accepted use must replay without running its interpreter.
	let prepared = 0;
	const player = (seat: number): Player => ({ name: `Replay ${seat}`, async answer(frame) {
		if (rebuilt.ledger.some((row) => row.activation?.claim === "Cast Shock")) throw new PlayerUnavailable("Fixture stops at the first cast.");
		if (frame.decision!.preparation?.length) {
			const ready = await interpret(frame, { work: async (_about, _prompt, tools) => {
				prepared++; assert.equal(tools.submit.check({ procedures: [procedure], unsupported: [] }), null); return {};
			} }, universe);
			return { kind: "work", tools: [{ do: "package.put", package: ready }], revision: frame.view.work!.revision, actionId: `interpret-${seat}-${prepared}` };
		}
		const options = frame.decision!.options;
		const choice = options.find((one) => one.use?.claim === "Cast Shock" && one.use.targets.flat().some((to) => "player" in to && to.player !== seat))
			?? options.find((one) => one.label === "Play Mountain") ?? options[0]!;
		return { kind: "pick", option: choice.id, actionId: `pick-${rebuilt.ledger.length}` };
	}, observe() {}, close() {} });
	assert.equal(await play(rebuilt, { 0: player(0), 1: player(1) }, {}), null);
	assert.equal(prepared, 1);
	assert.ok(rebuilt.ledger.some((row) => row.activation?.claim === "Cast Shock"));
	const played = open(join(dir, "played.jsonl"), { ...header, id: "played" }); save(played, rebuilt);
	fork(played.path, rebuilt.ledger.length, "pending-cast", join(dir, "pending-cast.jsonl"));
	const again = replay(join(dir, "pending-cast.jsonl"), (header) => matchTable(header.seed)).table;
	assert.deepEqual(again.ledger, rebuilt.ledger);
	assert.deepEqual(again.things, rebuilt.things);
	assert.deepEqual(again.work, rebuilt.work);
});
