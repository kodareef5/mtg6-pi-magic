/**
 * Ruled. A seat objects to another seat's recorded action and the judge
 * decides: an illegal action is rolled back to just before it, with no seat
 * asked to agree, and a ruling that lets it stand is recorded. A rollback is a
 * journal line of its own; the lines it rolled past stay in the file, replay
 * skips them, and every seat is told it happened.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { focus } from "../src/context/packet.ts";
import { aiSeat } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import { heard, declarationEvidence } from "../src/core/judge.ts";
import { matchTable, universe } from "../tools/matchup-fixture.ts";
import { CHOICE_LIMIT } from "../src/context/model.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { start } from "../src/core/commit.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { append, fork, open, reopen, replay, relive, rollback, save, type Header } from "../src/core/journal.ts";
import { play, type Judge } from "../src/core/loop.ts";
import type { Ruling } from "../src/core/judge.ts";
import { PlayerUnavailable, type Answer, type Player } from "../src/core/player.ts";
import type { Table } from "../src/core/table.ts";
import type { Frame } from "../src/core/types.ts";
import { project } from "../src/core/view.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { editWork, workFrame } from "../src/core/work-tools.ts";
import { reasoner, type Stream } from "../src/context/reason.ts";
import { rule } from "../src/context/ruling.ts";
import { tally } from "../src/context/spend.ts";
import { planWork } from "../src/context/strategy.ts";
import { main, matchup } from "./play.ts";

const made: Header = {
	id: "ruled", format: standard.name, seed: "ruled",
	seats: [{ id: 0, name: "A", deck: deck("Green Stompy") }, { id: 1, name: "B", deck: deck("Dimir Control") }],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" }, rules: { path: "rules/cr.tsv", effective: "September 25, 2026" }, created: "2026-10-04T00:00:00.000Z",
};
const dealt = () => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });
/** B objects once, on turn 3, to A's latest land play. */
function objector(table: Table, contested: { row?: number }): Player {
	return { name: "B", observe() {}, close() {}, async answer(frame): Promise<Answer> {
		const land = [...table.ledger].reverse().find((row) => row.seat === 0 && row.picked.startsWith("land:"));
		if (contested.row === undefined && table.cursor.turn >= 3 && land) {
			contested.row = land.seq;
			return { kind: "object", row: land.seq, claim: "That land says it enters tapped, and it entered untapped.", rule: "614.1c" };
		}
		return { kind: "pick", option: landsFirst(frame), actionId: `B-${frame.version}` };
	} };
}
const stop = new Error("stop");
async function playThrough(table: Table, players: Record<number, Player>, judge: Judge | undefined, turn: number) {
	try { await play(table, players, {}, { watch: () => { if (table.cursor.turn > turn) throw stop; }, workBudget: 32, judge }); } catch (error) { if (error !== stop) throw error; }
	while (!table.outcome && !nextDecision(table)) advance(table);
}
const physical = (table: Table) => JSON.stringify({ ledger: table.ledger, log: table.log, things: [...table.things], cursor: table.cursor, rulings: table.rulings });

test("an upheld objection takes the game back to just before the action, and the journal keeps what it rolled past", async () => {
	const dir = mkdtempSync(join(tmpdir(), "magic-rulings-"));
	const table = dealt();
	const journal = open(join(dir, "ruled.jsonl"), made);
	const contested: { row?: number } = {};
	const ruling: Ruling = { legal: false, rule: "614.1c", remedy: "rollback", because: "It enters tapped." };
	let rebuiltAt = -1;
	const judge: Judge = { async rule(_table, open) { assert.equal(open.raisedBy, 1); return ruling; }, restart: dealt,
		flush() { save(journal, table); rebuiltAt = table.ledger.length; } };
	let rolled: { at: number; frame: Frame } | undefined;
	const capture = (player: Player): Player => ({ ...player, async answer(frame) {
		if (table.rulings.length && !rolled) rolled = { at: table.ledger.length, frame: structuredClone(frame) };
		return player.answer(frame);
	} });
	await playThrough(table, { 0: capture(steady("A")), 1: capture(objector(table, contested)) }, judge, 4);
	save(journal, table);

	assert.ok(contested.row !== undefined && rebuiltAt > contested.row, "B objected to a land A had already played");
	assert.deepEqual(table.rulings.map((one) => [one.case.row, one.at, one.kept !== undefined]), [[contested.row, contested.row, true]], "the ruling is kept, at the version the game went back to");
	assert.ok(project(table, 0).table.some((line) => line.startsWith("The judge upheld B's objection")), "and every seat is told");

	const file = readFileSync(journal.path, "utf8").trim().split("\n").slice(1).map((line) => JSON.parse(line) as { row?: { seq: number }; ruling?: unknown });
	const contestedRows = file.filter((line) => line.row?.seq === contested.row);
	assert.equal(contestedRows.length, 2, "the rolled-past action stays in the file, behind the ruling, beside the one played after it");
	assert.equal(physical(replay(journal.path, dealt).table), physical(table), "and replay reads the game that was played on");
	assert.ok(rolled);
	const branch = replay(journal.path, dealt, rolled.at).table;
	let resumedFrame: Frame | undefined;
	const probe: Player = { name: "Probe", observe() {}, close() {}, async answer(frame) {
		resumedFrame = structuredClone(frame);
		throw new PlayerUnavailable("Captured the post-ruling frame.");
	} };
	await play(branch, { 0: probe, 1: probe }, {});
	assert.deepEqual(resumedFrame, rolled.frame, "rollback and resume derive the same receipts from the kept branch");

	// Resuming the journal holds the same game and owes it nothing.
	const back = replay(journal.path, dealt).table;
	const resumed = reopen(journal.path, made, back);
	assert.equal(save(resumed, back), 0);
	assert.equal(physical(replay(journal.path, dealt).table), physical(table));

	// A crash after a receipt but before its decision row repairs only the
	// current continuation. The rolled-past action and ruling remain on disk.
	append(resumed, { v: back.ledger.length + 1, receipt: { ...back.log.at(-1)!, at: back.ledger.length + 1 } });
	const repaired = reopen(journal.path, made, replay(journal.path, dealt).table);
	assert.ok(repaired.repaired);
	const rowsAfterRepair = readFileSync(journal.path, "utf8").trim().split("\n").slice(1).map((line) => JSON.parse(line) as { row?: { seq: number } });
	assert.equal(rowsAfterRepair.filter((line) => line.row?.seq === contested.row).length, 2, "repair retains the rejected action as well as its replacement");
	assert.equal(physical(replay(journal.path, dealt).table), physical(table));
});

test("a ruling that lets the action stand is recorded and play goes on; without a judge the objection is a gap", async () => {
	const stands: Judge = { async rule() { return { legal: true, rule: "305.1", remedy: "stand", because: "A land play." }; }, restart: dealt };
	const table = dealt(), contested: { row?: number } = {};
	editWork(table, 0, [{ do: "notebook.edit", edits: [{ topic: "role", note: "Develop lands." }] }], "initial-work");
	await playThrough(table, { 0: steady("A"), 1: objector(table, contested) }, stands, 4);
	assert.deepEqual(table.rulings.map((one) => [one.case.row, one.kept]), [[contested.row, undefined]]);
	assert.ok(table.ledger.length > contested.row! + 1, "play went on from where it was");
	const dir = mkdtempSync(join(tmpdir(), "magic-ruling-history-"));
	const journal = open(join(dir, "game.jsonl"), made);
	save(journal, table);
	rollback(table, { case: { row: contested.row!, raisedBy: 1, claim: "A later objection reaches an earlier action." },
		ruling: { legal: false, rule: "614.1c", remedy: "rollback", because: "Rewind the action." } }, dealt);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan after the first rollback." }], "ruling-2-0");
	save(journal, table);
	assert.equal(table.rulings.length, 2);
	assert.deepEqual(replay(journal.path, dealt).table.rulings, table.rulings, "a rollback retains the earlier stand ruling even beyond the new durable version");
	assert.deepEqual(replay(journal.path, dealt, table.ledger.length).table.rulings, table.rulings, "a bounded replay retains the ruling history behind an included rollback");
	const childPath = join(dir, "child.jsonl");
	fork(journal.path, table.ledger.length, "child", childPath);
	const child = replay(childPath, dealt).table;
	assert.deepEqual(child.rulings, table.rulings, "a clone has the same ruling count and work-id history");
	await playThrough(child, { 0: steady("A"), 1: objector(child, {}) }, {
		restart: dealt,
		async rule() { return { legal: false, rule: "614.1c", remedy: "rollback", because: "A new objection on the continuation." }; },
	}, 4);
	assert.equal(child.rulings.length, 3, "the next rollback completes without reusing ruling-2-0 for different work");

	const alone = dealt(), asked: { row?: number } = {};
	await playThrough(alone, { 0: steady("A"), 1: objector(alone, asked) }, undefined, 4);
	assert.deepEqual(alone.rulings, []);
	assert.ok(alone.gaps.some((gap) => gap.includes("this game has no judge")));
});

/** A model that answers each call with the next prepared tool call, and keeps what it was sent. */
const scripted = (replies: Record<string, unknown>[], seen: string[] = []): Stream => (_model, request) => {
	seen.push(JSON.stringify(request.messages));
	const args = replies.shift()!;
	return { result: async () => ({ content: [{ type: "toolCall", id: `call-${seen.length}`, name: "submit", arguments: args }], stopReason: "toolUse" }) };
};
const offline = (role: "strategy" | "judge", stream: Stream) => reasoner({ role, stream, model: { id: "fixture", provider: "offline" } as never, tally: tally(), backoffMs: 0 });

test("the writer objects only to an action the opponent took since its last plan, and the judge cites a rule on disk", async () => {
	const table = matchup("objecting");
	main(table, 0, 3);
	editWork(table, 0, [{ do: "plan.request", reason: "Plan the turn." }], "request");
	const frame = workFrame(table, 0);
	const theirs = frame.view.actions!.find((one) => one.seat === 1)!;
	assert.ok(theirs.what.length, "Red's actions are listed in public words");
	const plan = { objective: "o", guidance: "g", steps: [{ label: "Pass", when: { active: "self" }, action: { option: "pass" } }] };
	const seen: string[] = [];
	const answer = await planWork(frame, {}, offline("strategy", scripted([{ ...plan, objection: { row: 9999, claim: "x" } }, { ...plan, objection: { row: theirs.row, claim: "That land enters tapped.", rule: "614.1c" } }], seen)));
	assert.match(seen[1]!, /An objection names a row/, "a row that is not listed is refused");
	assert.deepEqual(answer.objection, { row: theirs.row, claim: "That land enters tapped.", rule: "614.1c" });

	const verdicts: string[] = [];
	const ruling = await rule(table, { row: theirs.row, raisedBy: 0, claim: "That land enters tapped.", rule: "614.1c" },
		offline("judge", scripted([{ legal: false, rule: "999.99", remedy: "rollback", because: "It enters tapped." }, { legal: false, rule: "614.1c", remedy: "rollback", because: "It enters tapped." }], verdicts)),
		{ rules: loadRules("rules/cr.tsv"), universe: loadCards("cards/standard.tsv") });
	assert.match(verdicts[0]!, /614\.1c/, "the judge is shown the rule the objection cites");
	assert.match(verdicts[1]!, /999\.99.*not an entry/, "a rule that is not on disk is refused");
	assert.deepEqual(ruling, { legal: false, rule: "614.1c", remedy: "rollback", because: "It enters tapped." });

	// The recorded menace block has no receipt snapshots. Replay supplies event-time evidence.
	const dir = mkdtempSync(join(tmpdir(), "magic-declaration-case-")), path = join(dir, "block.jsonl");
	writeFileSync(path, gunzipSync(readFileSync("test/fixtures/benchmarks/menace-partial-block.jsonl.gz")));
	const source = replay(path, (header) => matchTable(header.seed));
	const blocked = source.table;
	apply(blocked, "block:done", "model", "chosen");
	const row = blocked.ledger.at(-1)!.seq;
	const journal = reopen(path, source.header, replay(path, (header) => matchTable(header.seed)).table);
	save(journal, blocked);
	assert.deepEqual(blocked.log.at(-1)!.before, {});
	const immediate = project(blocked, 1).blockDeclaration!;
	assert.equal(immediate.row, row); assert.match(immediate.conflicts.join(" "), /menace/);
	while (!nextDecision(blocked)) advance(blocked);
	assert.deepEqual(project(blocked, 1).blockDeclaration, immediate, "ordinary priority grant preserves the offer");
	const original = structuredClone(blocked), evidence = declarationEvidence(blocked, row, universe)!;
	assert.deepEqual(blocked, original, "evidence reconstruction is pure");
	assert.ok(evidence.objects?.every((one) => one.zone === "battlefield"));
	assert.ok(evidence.objects?.find((one) => one.card === "Zhao, the Moon Slayer")?.traits?.words.includes("menace"));
	assert.ok(evidence.notes?.some((one) => one.kind === "label"), "accepted effects include the animated Forest's label");
	let requested: Record<string, any> | undefined;
	await rule(blocked, { row, raisedBy: 1, claim: "Check the block." }, { async work(_about, prompt) {
		requested = JSON.parse(prompt.user!);
		return { legal: false, rule: "509.1b", remedy: "rollback", because: "The sole block does not satisfy menace." };
	} }, { universe, rules: loadRules("rules/cr.tsv") });
	assert.match(JSON.stringify(requested!.cards), /Zhao, the Moon Slayer.*Menace/s);
	assert.deepEqual(requested!.action.declarationTime, evidence);
	assert.equal(requested!.action.happened, undefined, "current objects never narrate historical declaration identities");

	const frameAt = (now: Table) => ({ ...workFrame(now, 1), decision: nextDecision(now)! });
	for (const available of [false, true]) {
		let criteria: Record<string, unknown> = {};
		const pilot = aiSeat({ name: "Red", judge: available, intent: startingIntent(1), onGap: assert.fail,
			api: { named: "offline", async ask(request) {
				const question = request.questions.pick!;
				assert.equal(question.type, "choice");
				criteria = (question as { criteria: Record<string, unknown> }).criteria;
				assert.ok(Object.keys(criteria).length <= CHOICE_LIMIT);
				return { pick: { type: "choice", choice: available ? `object:block:${row}` : "pass", probabilities: {}, confidence: 1 } };
			} } });
		const answer = await pilot.answer(frameAt(blocked));
		assert.equal(answer.kind, available ? "object" : "pick");
		assert.equal(Object.hasOwn(criteria, `object:block:${row}`), available);
		await pilot.close();
	}
	const edited = structuredClone(blocked);
	editWork(edited, 1, [{ do: "plan.keep", reason: "Same physical decision." }], "case-work");
	assert.deepEqual(project(edited, 1).blockDeclaration, immediate, "work does not consume the opportunity");
	apply(edited, "pass", "model", "chosen");
	assert.equal(project(edited, 1).blockDeclaration, undefined, "a physical decision closes it");
	const ended = structuredClone(blocked); ended.cursor.steps.shift();
	assert.equal(project(ended, 1).blockDeclaration, undefined, "an unlogged step transition cannot carry the offer");
	const changed = structuredClone(blocked); changed.cursor.clock += 1;
	assert.equal(project(changed, 1).blockDeclaration, undefined, "other control transitions close it");

	// An accepted effect conditional on blocking changes as the block completes.
	const rows = structuredClone(blocked.ledger);
	const registrations = rows[70]!.registered!["1-58"]!;
	const menace = registrations.find((one) => one.kind === "continuous" && one.change.words?.includes("menace"))!;
	assert.equal(menace.kind, "continuous");
	if (menace.kind !== "continuous") throw new Error("Missing continuous fixture.");
	menace.if = { amount: { count: { blocking: true } }, atLeast: 1 };
	const layered = relive(matchTable(blocked.rng.seed), rows, blocked.workLog);
	assert.ok(project(layered, 1).blockDeclaration!.conflicts.some((line) => line.includes("menace")));
	assert.ok(!declarationEvidence(layered, row, universe)!.objects!.find((one) => one.id === "1-58")!.traits!.words.includes("menace"), "current hints are not declaration-time evidence");
	layered.things.get("1-58")!.card = "Mountain";
	assert.equal(declarationEvidence(layered, row, universe)!.objects!.find((one) => one.id === "1-58")!.card, "Zhao, the Moon Slayer", "later identities do not rename historical participants");

	const failed = structuredClone(blocked);
	let attempts = 0;
	const failing = aiSeat({ name: "Red", judge: true, intent: startingIntent(1), onGap: assert.fail,
		api: { named: "offline", async ask(request) {
			const criteria = (request.questions.pick as { criteria: Record<string, unknown> }).criteria;
			if (!Object.hasOwn(criteria, `object:block:${row}`)) {
				assert.deepEqual((request.state.blockDeclaration as { result: unknown }).result, { failed: "Fixture judge failure" });
				throw new PlayerUnavailable("No repeated case.");
			}
			return { pick: { type: "choice", choice: `object:block:${row}`, probabilities: {}, confidence: 1 } };
		} } });
	await play(failed, { 1: failing }, {}, { judge: { async rule() { attempts++; throw new Error("Fixture judge failure"); }, restart: () => matchTable(failed.rng.seed) } });
	assert.equal(attempts, 1);
	assert.equal(failed.rulings.at(-1)!.ruling, null);
	assert.ok(heard(failed, row));
	assert.match(project(failed, 1).table.join(" "), /did not rule.*Fixture judge failure/);
	save(journal, failed);
	assert.deepEqual(replay(path, (header) => matchTable(header.seed)).table.rulings, failed.rulings);
	const child = join(dir, "child.jsonl"); fork(path, failed.ledger.length, "child", child);
	const resumed = replay(child, (header) => matchTable(header.seed)).table;
	assert.deepEqual(resumed.rulings, failed.rulings);
	await assert.rejects(failing.answer(frameAt(resumed)), /No repeated case/, "a cloned request delivers the same failure explanation");
	rollback(failed, { case: { row, raisedBy: 1, claim: "Revisit declaration." }, ruling: { legal: false, rule: "509.1b", remedy: "rollback", because: "Fixture rewind." } }, () => matchTable(failed.rng.seed));
	assert.equal(heard(failed, row), undefined, "a reused row belongs to a new branch");
	assert.ok(nextDecision(failed)!.options.some((one) => one.id.startsWith("unblock:")));
	const restored = workFrame(failed, 0), recoveryPacket = focus(restored, startingIntent(0));
	assert.equal(recoveryPacket.declarationReview!.row, row);
	assert.match(recoveryPacket.options.find((one) => one.id === "block:done")!.label, /judge ruled action.*illegal/);
	const revision = structuredClone(failed);
	apply(revision, "unblock:0-25:1-58", "model", "chosen");
	assert.equal(project(revision, 0).declarationReview!.row, row, "the ruling stays during revision, without claiming the new choice is illegal");
	apply(revision, "block:done", "model", "chosen");
	assert.equal(project(revision, 0).declarationReview, undefined);
	apply(failed, "block:done", "model", "chosen");
	assert.equal(project(failed, 1).blockDeclaration!.heard, false);
	failed.rulings.push({ case: { row, raisedBy: 1, claim: "Heard." }, ruling: { legal: true, rule: "509.1b", remedy: "stand", because: "Fixture stand." }, at: failed.ledger.length });
	assert.equal(project(failed, 1).blockDeclaration!.heard, true);
	assert.equal(project(failed, 1).blockDeclaration!.result!.ruling!.remedy, "stand");

});
