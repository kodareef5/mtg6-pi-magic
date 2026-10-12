/** A broad preparation queue cannot silently skip, admit or misclassify a card. */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assessmentPool } from "../tools/assessment-pool.ts";
import { universe, decks } from "../tools/matchup-fixture.ts";
import { assessCard, UnsupportedAssessment } from "../src/context/assess.ts";
import { printedFacts } from "../src/core/printed.ts";
import type { Package } from "../src/core/language.ts";

test("universe batches partition assessment work without treating failed inference as unsupported text", async () => {
	const stored = new Map<string, { package: Package }>();
	const whole = assessmentPool(universe, decks, stored, {}, { universe: true });
	const outside = assessmentPool(universe, decks, stored, {}, { universe: true, outsideImported: true, limit: 10 });
	assert.equal(whole.names.length, universe.cards.size);
	assert.equal(outside.todo.length, 10);
	assert.ok(outside.names.every(card => !outside.byCard.has(card)));
	assert.equal(whole.names.length - outside.names.length, outside.byCard.size);
	assert.equal(new Set(whole.todo).size, whole.todo.length);
	assert.ok(whole.todo.every(card => whole.printed[card]!.text));
	assert.ok(whole.todo.every((card, i) => !i || whole.printed[card]!.oracle.length >= whole.printed[whole.todo[i - 1]!]!.oracle.length));
	const [first, refused, failed] = outside.todo as [string, string, string];
	stored.set(first, { package: { card: first, assessed: true, registers: [], procedures: [] } });
	const resumed = assessmentPool(universe, decks, stored, { [refused]: {} }, { universe: true, outsideImported: true, limit: 10, complete: true });
	assert.ok(!resumed.todo.includes(first) && !resumed.todo.includes(refused));
	assert.ok(resumed.todo.includes(failed), "an unfinished call remains eligible on resumption");
	assert.ok(assessmentPool(universe, decks, stored, { [refused]: { status: "pending" } }, { universe: true }).todo.includes(refused),
		"an interrupted reviewed refresh remains pending, not a claimed missing mechanic");
	assert.ok(assessmentPool(universe, decks, stored, { [refused]: {} }, { universe: true, retry: true }).todo.includes(refused));
	assert.throws(() => assessmentPool(universe, decks, stored, {}, { outsideImported: true }), /requires --universe/);
	assert.throws(() => assessmentPool(universe, decks, stored, {}, { limit: 0 }), /positive integer/);
	assert.throws(() => assessmentPool(universe, decks, stored, {}, { cards: [first] }), /selected assessment scope/);
	assert.throws(() => assessmentPool(universe, decks, stored, {}, { universe: true, cards: ["Invented card"] }), /selected assessment scope/);
	const card = "Quick Study", printed = printedFacts(universe, [card])[card]!;
	const deferred = { card, registers: [], procedures: [], assessed: true,
		deferred: [{ claim: "Draw two cards", basis: printed.oracle, source: { card, zones: ["hand"], controller: "any" }, timing: "spell" }] } as Package;
	stored.set(card, { package: deferred });
	assert.ok(!assessmentPool(universe, decks, stored, {}, { universe: true }).todo.includes(card));
	assert.ok(assessmentPool(universe, decks, stored, {}, { universe: true, complete: true }).todo.includes(card));
	await assert.rejects(assessCard(card, printed, { work: async (_about, _prompt, tools) => {
		assert.match(tools.submit.check({ registers: [], procedures: [], deferred: deferred.deferred, unsupported: [] })!, /Prepare all identified uses/);
		assert.equal(tools.submit.check({ registers: [], procedures: [], unsupported: ["Fixture missing operation"] }), null);
		return {};
	} }, universe, undefined, "complete"), error => error instanceof UnsupportedAssessment && error.reasons[0] === "Fixture missing operation");
	await assert.rejects(assessCard(card, printed, { work: async () => { throw new Error("Transport failed"); } }, universe),
		error => !(error instanceof UnsupportedAssessment) && /Transport failed/.test(String(error)));
	const reviewed = await assessCard(card, printed, { work: async (about, prompt, tools) => {
		assert.equal(about, "review assessment Quick Study");
		assert.deepEqual(JSON.parse(prompt.user).proposed, deferred);
		assert.equal(tools.submit.check({ registers: [], procedures: [{ source: deferred.deferred![0]!.source,
			claim: "Draw two cards", basis: printed.oracle, timing: "spell", instructions: [{ do: "draw", who: "you", count: 2 }] }], unsupported: [] }), null);
		return {};
	} }, universe, undefined, "complete", deferred);
	assert.equal(reviewed.procedures?.length, 1);
	assert.equal(reviewed.deferred, undefined, "review output goes through the same complete-use validation");
});
