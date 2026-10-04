/** Seat equipment invariants across edits, reviews, execution and continuation.
 * Past 150 lines because each invariant includes changed and resumed positions.
 */
import { deck } from "../src/core/decks.ts";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { play } from "../src/core/loop.ts";
import { project } from "../src/core/view.ts";
import { completedStep, editWork, prepareWork, workFrame } from "../src/core/work-tools.ts";
import { overdue, pendingReviews } from "../src/core/agenda.ts";
import { refuseExecution, brokenReserves } from "../src/core/draft.ts";
import { needsAttention, workMenu } from "../src/core/work-menu.ts";
import { fork, open, read, reopen, replay, save, exportGame, type Header } from "../src/core/journal.ts";
import type { Frame } from "../src/core/types.ts";
import type { Table } from "../src/core/table.ts";
import type { Player } from "../src/core/player.ts";
import type { TaskSpec, WorkCommand } from "../src/core/work-language.ts";
import { exercise } from "../tools/circuit-fixture.ts";
import { seat as seatTable, run } from "../src/context/sit.ts";
import { load as loadCards } from "../src/core/cards.ts";
import { CEILING } from "../src/context/spend.ts";
import { focus } from "../src/context/packet.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork, syntaxReference } from "../src/context/strategy.ts";
import { question } from "../src/context/seat.ts";

const make = (steps = standard.steps) => start({ ...standard, steps }, [
	{ name: "A", deck: deck("Green Stompy") }, { name: "B", deck: deck("Dimir Control") },
], "work");
function seek(table: Table, accepts: (frame: Frame) => boolean): Frame {
	for (let count = 0; count < 20_000; count++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		const frame = workFrame(table, decision.seat);
		if (accepts(frame)) return frame;
		apply(table, decision.situation === "pregame" ? "keep" : decision.options[0]!.id, "engine", "forced");
	}
	throw new Error("The fixture never reached its window.");
}
const main = (frame: Frame) => frame.seat === 0 && frame.view.window.kind === "turn" && frame.view.window.step === "precombat-main";
const task = (id = "review"): TaskSpec => ({ id, label: id, when: { active: "self", step: "precombat-main" },
	scope: { zones: ["hand", "battlefield"] }, concepts: ["position"], concerns: ["threat", "opportunity", "maintenance"], guidance: "Inspect under the prepared plan; no action is required by this check.", recipes: [] });
function assess(table: Table, id = "review") {
	const due = pendingReviews(workFrame(table, 0)).find((review) => review.task === id)!;
	assert.ok(due, `${id} is pending`);
	editWork(table, 0, [{ do: "review.answer", task: due.task, occurrence: due.occurrence, stamp: due.stamp,
		answers: Object.fromEntries(due.items.map((item) => [item.id, "no-action"])) }], `assess-${table.workLog.length}`);
}
const physical = (table: Table) => { const { work: _work, workLog: _history, ...state } = structuredClone(table); return state; };

test("equipment edits are atomic, idempotent and physically separate", () => {
	const table = make();
	seek(table, main);
	const before = physical(table);
	const tools: WorkCommand[] = [{ do: "task.put", task: task() }];
	assert.equal(editWork(table, 0, tools, "setup"), true);
	assert.deepEqual(physical(table), before);
	assert.equal(editWork(table, 0, tools, "setup", 0), false, "a redelivery does not edit twice");
	assert.throws(() => editWork(table, 0, [{ do: "plan.accept", objective: "different" }], "setup"), /different seat tools/);
	const accepted = structuredClone(table);
	assert.throws(() => editWork(table, 0, [{ do: "task.cancel", id: "review" }, { do: "draft.start", recipe: "missing" }], "bad"), /No recipe/);
	assert.deepEqual(table, accepted, "a failed batch did not partly cancel its task");
	assert.throws(() => editWork(table, 0, [{ do: "task.cancel", id: "review" },
		{ do: "draft.edit", reserves: [], guidance: "Release the spent source" } as unknown as WorkCommand], "missing-steps"),
		(error: Error) => /Seat tool 1:/.test(error.message) && /steps/.test(error.message) && !/requiredProperties.*task/.test(error.message),
		"a refused edit names its missing field, not another union branch's tool");
	assert.deepEqual(table, accepted, "shape validation leaves the whole batch untouched");
	assert.throws(() => editWork(table, 0, tools, "stale", 0), /equipment changed/);
	assert.throws(() => prepareWork(workFrame(table, 0), [{ do: "task.put", task: { ...task(), when: { step: "untap" } } }]), /require a step with priority/);
});

test("a review covers each scoped concern and label, and a changed position reopens it", () => {
	const table = make();
	const frame = seek(table, main);
	const object = frame.view.objects!.find((object) => object.owner === 0 && object.zone === "hand")!;
	editWork(table, 0, [
		{ do: "task.put", task: task() },
		{ do: "label.put", object: { id: object.id, incarnation: object.incarnation }, role: "reserve", purpose: "Preserve for later" },
	], "setup");
	const before = structuredClone(table);
	const due = pendingReviews(workFrame(table, 0))[0]!;
	assert.equal(due.items.length, 7 * 3 + 3 + 1);
	assert.deepEqual(table, before, "listing the review is pure");
	assert.throws(() => editWork(table, 0, [{ do: "review.answer", task: due.task, occurrence: due.occurrence, stamp: due.stamp, answers: { [due.items[0]!.id]: "no-action" } }], "partial"), /every concern/);
	assert.deepEqual(table, before, "partial assessment records none of its answers");
	assess(table);
	assert.equal(pendingReviews(workFrame(table, 0)).length, 0);
	const pass = workFrame(table, 0).decision!.options.find((option) => option.id === "pass")!;
	apply(table, pass.id, "model", "chosen");
	apply(table, "pass", "engine", "forced");
	assert.equal(pendingReviews(workFrame(table, 0)).length, 0, "passes do not reopen an unchanged review");
	// Reopen the same actual visit with a visible position change.
	commit(table, [{ do: "change-life", who: 1, amount: -1, reason: "resolve" }], "resolve");
	const reopened = { ...workFrame(table, 0), decision: frame.decision };
	assert.equal(pendingReviews(reopened).length, 1);
	assert.throws(() => prepareWork(reopened, [{ do: "review.answer", task: due.task, occurrence: due.occurrence, stamp: due.stamp, answers: Object.fromEntries(due.items.map((item) => [item.id, "no-action"])) }]), /no longer/);
});

test("scheduled checks use actual visits, bound repetitions, expose missed windows and reject cycles", () => {
	const table = make(["precombat-main", "precombat-main", "end", "cleanup"]);
	const first = seek(table, main);
	editWork(table, 0, [
		{ do: "task.put", task: { ...task("twice"), times: 2 } },
		{ do: "task.put", task: { ...task("follow-up"), after: { task: "twice", runs: 2 }, times: 1 } },
	], "setup");
	assert.deepEqual(pendingReviews(workFrame(table, 0)).map((review) => review.task), ["twice"]);
	assess(table, "twice");
	apply(table, "pass", "model", "chosen");
	const second = seek(table, (frame) => main(frame) && frame.view.visit !== first.view.visit);
	assert.equal(second.view.window.kind === "turn" && second.view.window.turn, 1);
	assess(table, "twice");
	assert.equal(table.work[0]!.tasks[0]!.runs.length, 2);
	assert.deepEqual(pendingReviews(workFrame(table, 0)).map((review) => review.task), ["follow-up"]);
	assess(table, "follow-up");
	assert.throws(() => editWork(table, 0, [{ do: "task.put", task: { ...task("twice"), after: { task: "follow-up", runs: 1 } } }], "cycle"), /cycle/);
	const skipped = make(["precombat-main", "cleanup"]);
	seek(skipped, main);
	editWork(skipped, 0, [{ do: "task.put", task: { ...task("missed"), when: { active: "self", step: "end", throughTurn: 1 }, times: 1 } }], "missed");
	apply(skipped, "pass", "model", "chosen");
	seek(skipped, (frame) => main(frame) && frame.view.window.kind === "turn" && frame.view.window.turn > 1);
	assert.ok(overdue(skipped.work[0]!.tasks[0]!, workFrame(skipped, 0)));
	assert.ok(workMenu(workFrame(skipped, 0)).some((option) => option.id === "work:expire:missed"));
	editWork(skipped, 0, [{ do: "task.expire", id: "missed" }], "acknowledge");
	assert.equal(skipped.work[0]!.tasks[0]!.runs.length, 0, "missing the window is not completing a review");
});

test("draft readiness moves no cards and stale bindings or reserves cannot execute", () => {
	const table = make();
	const frame = seek(table, main);
	const land = frame.decision!.options.find((option) => option.id.startsWith("land:"))!;
	const before = physical(table);
	editWork(table, 0, [{ do: "recipe.put", recipe: { id: "land", label: "Develop", guidance: "Choose a land.", reserves: [], steps: [
		{ label: "Play a land", when: { active: "self", step: "precombat-main" }, action: { prefix: "land:" } },
	] } }, { do: "draft.start", recipe: "land" }, { do: "draft.bind", option: land.id }, { do: "draft.ready" }], "ready");
	assert.deepEqual(physical(table), before);
	assert.equal(table.work[0]!.draft!.next, 0);
	assert.equal(refuseExecution(table.work[0]!.draft!, workFrame(table, 0)), null);
	commit(table, [{ do: "change-life", who: 1, amount: -1, reason: "resolve" }], "resolve");
	assert.match(refuseExecution(table.work[0]!.draft!, workFrame(table, 0))!, /position changed/);
	assert.ok(workMenu(workFrame(table, 0)).some((option) => option.id === "work:ready"));
	editWork(table, 0, [{ do: "draft.ready" }], "check-again");
	const id = land.id.slice(5);
	commit(table, [{ do: "move", what: id, to: "exile", reason: "exile" }, { do: "move", what: id, to: "hand", reason: "bounce" }], "bounce");
	assert.ok(workFrame(table, 0).decision!.options.some((option) => option.id === land.id));
	assert.match(refuseExecution(table.work[0]!.draft!, workFrame(table, 0))!, /incarnation/);
	const reserve = workFrame(table, 0).view.objects!.find((object) => object.id !== id && object.owner === 0 && object.zone === "hand")!;
	editWork(table, 0, [{ do: "draft.edit", steps: table.work[0]!.draft!.steps,
		reserves: [{ object: { id: reserve.id, incarnation: reserve.incarnation }, purpose: "Keep untapped", tapped: false }] },
		{ do: "draft.bind", option: land.id }, { do: "draft.ready" }], "rebind");
	commit(table, [{ do: "tap", what: reserve.id }], "cost-payment");
	assert.equal(brokenReserves(table.work[0]!.draft!, workFrame(table, 0)).length, 1);
	assert.match(refuseExecution(table.work[0]!.draft!, workFrame(table, 0))!, /reserved resource/);

	const opaque = workFrame(table, 0);
	const refs = opaque.view.objects!.filter((object) => object.zone === "hand").slice(0, 2).map(({ id, incarnation }) => ({ id, incarnation }));
	opaque.decision!.options = [{ id: "opaque-selection", label: "Select two objects", objects: refs }];
	const prepared = prepareWork(opaque, [{ do: "draft.cancel" }, { do: "recipe.put", recipe: { id: "pair", label: "A pair", guidance: "Consider both objects", reserves: [],
		steps: [{ label: "Use the pair", when: {}, action: { objects: { refs: [refs[0]!] } } }] } },
		{ do: "draft.start", recipe: "pair" }, { do: "draft.bind", option: "opaque-selection" }, { do: "draft.ready" }]);
	assert.deepEqual(prepared.draft!.boundObjects, refs, "all object bindings come from metadata, regardless of id spelling");
	opaque.view.objects!.find((object) => object.id === refs[1]!.id)!.incarnation += 1;
	assert.match(refuseExecution(prepared.draft!, opaque)!, /incarnation/, "the second bound object matters too");
});

test("due attention is consulted before automatic passes and cannot become fallback approval", async () => {
	const spinning = make();
	seek(spinning, main);
	editWork(spinning, 0, [{ do: "plan.request", reason: "Keep reconsidering" }], "request");
	const frozen = { clock: spinning.cursor.clock, rows: spinning.ledger.length };
	let edits = 0;
	const spinner: Player = { name: "A", observe() {}, close() {}, async answer(frame) {
		if (++edits > 50) throw new Error("Harness stopped an unbounded work loop");
		return { kind: "work", revision: frame.view.work!.revision, actionId: `spin-${edits}`, tools: [{ do: "plan.request", reason: "Keep reconsidering" }] };
	} };
	assert.equal(await play(spinning, { 0: spinner, 1: spinner }, {}), null);
	assert.ok(edits < 50, "the engine, not the harness, bounds unchanged decisions");
	assert.deepEqual({ clock: spinning.cursor.clock, rows: spinning.ledger.length }, frozen);
	assert.match(spinning.gaps.at(-1)!, /budget.*pending/);
	const spent = edits;
	assert.equal(await play(spinning, { 0: spinner, 1: spinner }, {}), null);
	assert.equal(edits, spent, "resuming does not discard already accepted edits at this version");

	// A seat that plans each turn is asked for that plan after drawing, even when pass is all the table lists.
	const planning = make();
	seek(planning, (frame) => frame.seat === 0 && frame.view.window.kind === "turn" && frame.view.window.turn === 1 && frame.view.window.step === "upkeep");
	editWork(planning, 0, [{ do: "plan.each-turn" }, { do: "plan.accept", objective: "Turn one." }], "planned");
	const nextDraw = seek(planning, (frame) => frame.seat === 0 && frame.view.window.kind === "turn" && frame.view.window.turn === 3 && frame.view.window.step === "draw" && frame.decision?.situation === "priority");
	assert.deepEqual(nextDraw.decision!.options.map((option) => option.id), ["pass"]);
	assert.ok(needsAttention(nextDraw), "the turn's plan is due before an automatic pass");
	editWork(planning, 0, [{ do: "plan.accept", objective: "Turn three." }], "replanned");
	assert.equal(needsAttention(workFrame(planning, 0)), false, "one plan per turn");
	const opponentsTurn = seek(planning, (frame) => frame.seat === 0 && frame.view.window.kind === "turn" && frame.view.window.turn === 4);
	assert.equal(needsAttention(opponentsTurn), false, "the opponent's turn is covered by this seat's own plan");

	const table = make();
	const at = seek(table, (frame) => frame.seat === 0 && frame.view.window.kind === "turn" && frame.view.window.step === "upkeep");
	editWork(table, 0, [{ do: "task.put", task: { ...task(), when: { active: "self", step: "upkeep" }, scope: { zones: [] }, concepts: ["future resources"], times: 1 } }], "setup");
	assert.equal(at.decision!.options.length, 1);
	assert.ok(needsAttention(workFrame(table, 0)));
	let called = 0;
	const player: Player = { name: "A", observe() {}, close() {}, async answer(frame) { called += 1; return { kind: "pick", option: "pass", actionId: `bad-${frame.version}` }; } };
	const before = table.ledger.length;
	assert.equal(await play(table, { 0: player, 1: player }, {}), null);
	assert.equal(called, 2);
	assert.equal(table.ledger.length, before, "the table did not silently pass or approve the review");
	assert.equal(table.work[0]!.tasks[0]!.runs.length, 0);
	assert.match(table.gaps.at(-1)!, /Selection remains pending/);
	let refusal: string[] | undefined;
	const redelivery: Player = { name: "A", observe() {}, close() {}, async answer(frame) {
		if (frame.refused) refusal = frame.refused;
		return { kind: "work", revision: frame.view.work!.revision, actionId: "setup", tools: [{ do: "plan.accept", objective: "Different tools under an accepted id" }] };
	} };
	assert.equal(await play(table, { 0: redelivery, 1: redelivery }, {}), null);
	assert.match(refusal?.join(" ") ?? "", /actionId.*different/);
	assert.equal(table.work[0]!.objective, undefined, "an id collision is a refused answer rather than an uncaught write");

	const sequence = make();
	const frame = seek(sequence, main);
	const land = frame.decision!.options.find((option) => option.id.startsWith("land:"))!;
	editWork(sequence, 0, [{ do: "recipe.put", recipe: { id: "two", label: "Two actions", guidance: "Play then pass", reserves: [], steps: [
		{ label: "Land", when: { step: "precombat-main" }, action: { option: land.id } },
		{ label: "Pass", when: { step: "precombat-main" }, action: { option: "pass" } },
	] } }, { do: "draft.start", recipe: "two" }, { do: "draft.bind", option: land.id }, { do: "draft.ready" }], "ready");
	const beforeMenu = structuredClone(sequence);
	const packet = focus(workFrame(sequence, 0), startingIntent(0));
	const asked = question(packet);
	assert.equal(asked.type, "choice");
	if (asked.type !== "choice") throw new Error("Expected choice criteria");
	assert.deepEqual(packet.options, frame.decision!.options, "the physical options keep their ids and facts");
	assert.equal(asked.criteria.pass, undefined, "never ask a classifier to choose a pass the core refuses");
	assert.ok(asked.criteria[land.id], "other physical plays remain available");
	assert.match(asked.criteria[land.id]!, /does not adopt or advance/);
	assert.ok(asked.criteria["work:execute"] && asked.criteria["work:park"] && asked.criteria["work:cancel"]);
	assert.deepEqual(sequence, beforeMenu, "building the available menu is pure");
	const parked = workFrame(sequence, 0);
	parked.view.work = prepareWork(parked, [{ do: "draft.park" }]);
	const free = question(focus(parked, startingIntent(0)));
	assert.ok(free.type === "choice" && free.criteria.pass, "an explicit disposition makes pass available again");
	refusal = undefined;
	const repeat: Player = { name: "A", observe() {}, close() {}, async answer(frame) {
		const work = frame.view.work!;
		if (frame.refused) refusal = frame.refused;
		if (!work.draft!.bound) return { kind: "work", revision: work.revision, actionId: "bind-pass", tools: [{ do: "draft.bind", option: "pass" }, { do: "draft.ready" }] };
		return { kind: "execute", revision: work.revision, actionId: "execute-once", draft: work.draft!.id };
	} };
	assert.equal(await play(sequence, { 0: repeat, 1: repeat }, {}), null);
	assert.match((refusal as string[] | undefined)?.join(" ") ?? "", /actionId.*already/);
	assert.equal(sequence.work[0]!.draft!.next, 1, "a reused execution id cannot settle another step");

	editWork(sequence, 0, [{ do: "task.put", task: { ...task("before-pass"), scope: { zones: [] },
		concepts: ["line"], concerns: ["continue"], recipes: ["two"] } }], "due-before-pass");
	let pending = workFrame(sequence, 0);
	assert.match(refuseExecution(pending.view.work!.draft!, pending)!, /Other due work/);
	assert.equal(workMenu(pending).some((option) => option.id === "work:execute"), false);
	const review = pendingReviews(pending)[0]!;
	editWork(sequence, 0, [{ do: "review.answer", task: review.task, occurrence: review.occurrence, stamp: review.stamp,
		answers: Object.fromEntries(review.items.map((item) => [item.id, "recipe:two"])) }], "nominate-again");
	pending = workFrame(sequence, 0);
	const offered = question(focus(pending, startingIntent(0)));
	assert.ok(offered.type === "choice" && !offered.criteria["work:execute"] && offered.criteria["work:dismiss:two"],
		"a prepared pass cannot bypass a nomination either");
	const preview = structuredClone(pending);
	delete preview.view.work!.draft;
	const nomination = question(focus(preview, startingIntent(0)));
	assert.ok(nomination.type === "choice" && nomination.criteria["work:adopt:two"]!.includes("Play then pass") && nomination.criteria["work:adopt:two"]!.includes("Land; Pass"),
		"adoption carries guidance and step labels rather than only a recipe id");
	assert.equal(JSON.stringify(focus(preview, startingIntent(0))).includes('"action"'), false, "a recipe preview excludes executable bodies");
	assert.match(refuseExecution(pending.view.work!.draft!, pending)!, /Other due work/);
	editWork(sequence, 0, [{ do: "suggestion.dismiss", recipe: "two" }], "decline-repeat");
	assert.ok(workMenu(workFrame(sequence, 0)).some((option) => option.id === "work:execute"),
		"the prepared pass returns after the nomination has a disposition");
});

test("equipment and review queries reveal only the selected seat's earned facts", () => {
	const table = make();
	const frame = seek(table, main);
	editWork(table, 0, [{ do: "plan.accept", objective: "Private plan for A" }, { do: "task.put", task: task() }], "private");
	assert.equal(JSON.stringify(project(table, 1)).includes("Private plan for A"), false);
	assert.equal(project(table, "spectator").work, undefined);
	assert.ok(project(table, 0).objects!.every((object) => object.zone !== "library" && (object.zone !== "hand" || object.owner === 0)));
	const hidden = [...table.things.values()].find((object) => object.owner === 1 && object.zone === "hand")!;
	assert.throws(() => editWork(table, 0, [{ do: "label.put", object: { id: hidden.id, incarnation: hidden.incarnation }, role: "threat", purpose: "Unseen" }], "leak"), /not in this seat's view/);
	assert.ok(frame.view.objects!.length > 0);
});

test("a sequence survives real turns and a lost reservation causes revision without repeated execution", async () => {
	const normal = await exercise();
	const changed = await exercise(true);
	for (const run of [normal, changed]) {
		assert.ok(run.outcome);
		assert.equal(run.table.gaps.length, 0);
		assert.equal(run.table.work[0]!.draft!.next, 2);
		assert.equal(run.table.work[0]!.tasks.find((task) => task.id === "monitor")!.runs.length, 3);
		assert.equal(run.table.workLog.filter((entry) => entry.note.startsWith("Executed step")).length, 2);
		assert.ok(run.concernQuestions > run.batches * 5, "independent concerns were batched");
	}
	assert.equal(normal.plans, 2);
	assert.equal(changed.plans, 3);
	assert.equal(normal.trace.some((row) => row.event.includes("spent the reserved")), false);
	assert.ok(changed.trace.some((row) => row.event.includes("spent the reserved")));
	assert.equal(changed.table.work[0]!.draft!.reserves.length, 0);
});

test("journals and clones carry private equipment without reinterpreting it or losing an unterminated complete line", async () => {
	const run = await exercise();
	const table = run.table;
	const directory = mkdtempSync(join(tmpdir(), "magic-work-"));
	const header: Header = { id: "work", format: standard.name, seed: table.rng.seed,
		seats: table.seats.map(({ id, name, deck }) => ({ id, name, deck })), cards: { path: "cards/standard.tsv", generated: "fixture" }, rules: { path: "rules/cr.tsv", effective: "fixture" }, created: "fixture" };
	const dealt = (saved: Header) => start(standard, saved.seats, saved.seed);
	const journal = open(join(directory, "parent.jsonl"), header);
	save(journal, table);
	const restored = replay(journal.path, dealt).table;
	assert.deepEqual(restored.work, table.work);
	assert.deepEqual(restored.workLog, table.workLog);
	assert.deepEqual(restored.ledger, table.ledger);
	assert.equal(exportGame(journal.path, { mode: "public" }, dealt).includes("reserved"), false);
	assert.match(exportGame(journal.path, { mode: "seat", seat: 0 }, dealt), /Your equipment/);
	const first = table.workLog.find((entry) => entry.note.startsWith("Executed step 1"))!;
	const childPath = join(directory, "child.jsonl");
	fork(journal.path, first.at, "child", childPath);
	const child = replay(childPath, dealt).table;
	assert.equal(child.work[0]!.draft!.next, 1);
	assert.deepEqual(child.workLog, table.workLog.filter((entry) => entry.at <= first.at));
	assert.ok(child.work[0]!.tasks.some((task) => task.id === "monitor"));
	const text = readFileSync(childPath, "utf8").trimEnd();
	writeFileSync(childPath, text);
	const before = read(childPath).lines;
	const reopened = reopen(childPath, read(childPath).header, child);
	assert.equal(reopened.repaired, undefined);
	assert.deepEqual(read(childPath).lines, before);
	assert.equal(save(reopened, child), 0);
	const prefix = readFileSync(childPath, "utf8");
	const continuing: Player = { name: "A", observe() {}, close() {}, async answer(frame) {
		const work = frame.view.work!;
		const actionId = `continued-${frame.version}-${work.revision}`;
		const due = pendingReviews(frame)[0];
		if (due) return { kind: "work", revision: work.revision, actionId,
			tools: [{ do: "review.answer", task: due.task, occurrence: due.occurrence, stamp: due.stamp,
				answers: Object.fromEntries(due.items.map((item) => [item.id, "no-action"])) }] };
		const menu = workMenu(frame);
		const choice = menu.find((option) => option.id === "work:execute") ?? menu.find((option) => option.id === "work:ready") ?? menu.find((option) => option.id.startsWith("work:bind:")) ?? menu[0];
		if (choice?.execute) return { kind: "execute", draft: choice.execute, revision: work.revision, actionId };
		if (choice?.tools) return { kind: "work", tools: choice.tools, revision: work.revision, actionId };
		const reserved = work.draft?.reserves[0]?.object.id;
		const options = frame.decision!.options;
		const discard = options.find((option) => option.id.startsWith("discard:") && option.id !== `discard:${reserved}`);
		const waiting = work.draft && work.draft.next < work.draft.steps.length;
		const option = discard ?? (waiting ? options.find((option) => option.id === "pass") : options.find((option) => option.id.startsWith("land:"))) ?? options[0]!;
		return { kind: "pick", option: option.id, actionId };
	} };
	const opponent: Player = { name: "B", observe() {}, close() {}, async answer(frame) {
		return { kind: "pick", option: frame.decision!.options[0]!.id, actionId: `B-${frame.version}` };
	} };
	assert.ok(await play(child, { 0: continuing, 1: opponent }, {}));
	assert.equal(child.work[0]!.draft!.next, 2);
	assert.equal(child.ledger.filter((row) => row.execution?.step === 0).length, 1, "a resumed player did not repeat the land play");
	save(reopened, child);
	assert.ok(readFileSync(childPath, "utf8").startsWith(prefix), "continuing kept the copied prefix intact");
	assert.deepEqual(replay(childPath, dealt).table.work, child.work);
	// A crash after the physical action but before its equipment snapshot must
	// not turn an executed step back into an unexecuted one.
	const raw = readFileSync(journal.path, "utf8").trimEnd().split("\n");
	const execution = raw.findIndex((line) => {
		const value = JSON.parse(line);
		return value.work?.note.startsWith("Executed step 1");
	});
	const tornPath = join(directory, "torn-execution.jsonl");
	writeFileSync(tornPath, raw.slice(0, execution).join("\n") + "\n" + raw[execution]!.slice(0, 30));
	const recovered = replay(tornPath, dealt);
	assert.equal(recovered.table.work[0]!.draft!.next, 1);
	assert.equal(recovered.table.workLog.at(-1)!.note, first.note);
	const pickedUp = reopen(tornPath, recovered.header, recovered.table);
	assert.equal(save(pickedUp, recovered.table), 0);
	assert.deepEqual(replay(tornPath, dealt).table.work, recovered.table.work);
	// Tear the physical row itself: its preceding receipt is an orphan, and
	// continuing must not duplicate it in the repaired journal.
	const physicalRow = raw.findIndex((line) => JSON.parse(line).row?.execution?.step === 0);
	const orphanPath = join(directory, "orphan.jsonl");
	writeFileSync(orphanPath, raw.slice(0, physicalRow).join("\n") + "\n" + raw[physicalRow]!.slice(0, 25));
	const orphan = replay(orphanPath, dealt);
	assert.equal(orphan.table.work[0]!.draft!.next, 0);
	const repaired = reopen(orphanPath, orphan.header, orphan.table);
	assert.ok(repaired.repaired);
	assert.equal(save(repaired, orphan.table), 0);
	const receipts = read(orphanPath).lines.flatMap((line) => "receipt" in line ? [line.receipt.seq] : []);
	assert.equal(new Set(receipts).size, receipts.length);
});

test("strategy is requested, validated, metered and kept out of ordinary execution", async () => {
	const universe = loadCards("cards/standard.tsv");
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const chat = { id: "fixture", provider: "offline", type: "chat" } as never;
	const roster = async () => [
		{ role: "decide" as const, pattern: "fixture", model },
		{ role: "pregame" as const, pattern: "off", off: true },
		{ role: "strategy" as const, pattern: "fixture", model: chat },
	];
	const prompts: { user: string; system?: string; ceiling?: number }[] = [];
	const inference = {
		classify: (async (_model: unknown, request: { questions: Record<string, { criteria: Record<string, string> }> }) => ({
			api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", stopReason: "stop", timestamp: 0,
			answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
				const ids = Object.keys(question.criteria);
				const choice = key.startsWith("concern-") ? "no-action" : ids.find((id) => id.startsWith("land:")) ?? ids[0]!;
				return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
			})),
		})) as never,
		stream: ((_model: unknown, context: { systemPrompt?: string; messages: { content: string }[] }, options: { maxTokens?: number }) => {
			prompts.push({ user: context.messages[0]!.content, system: context.systemPrompt, ceiling: options.maxTokens });
			return { result: async () => ({ content: [{ type: "text", text: JSON.stringify([
				{ do: "task.put", task: { ...task("end-check"), when: { active: "opponent", step: "end", throughTurn: 2 }, scope: { zones: [] }, times: 1 } },
				{ do: "plan.accept", objective: "Review the next opponent end step, then continue." },
			]) }], stopReason: "stop" }) };
		}) as never,
	};
	const table = make();
	const seated = await seatTable(table, roster, inference, universe, { format: standard.name, circuits: true });
	assert.equal(prompts.length, 0, "seating did not spend strategy before a priority opportunity");
	assert.ok(await run(table, seated, inference, undefined));
	assert.equal(table.gaps.length, 0);
	// One opening preparation per seat, then one per turn of its own after drawing, and none per phase.
	const sessions = prompts.map((prompt) => JSON.parse(prompt.user) as { seat: number; view: { window: { turn: number; active: number; step: string } } });
	const turns = table.cursor.turn;
	for (const seat of [0, 1]) {
		const own = sessions.filter((session) => session.seat === seat && session.view.window.active === seat);
		assert.deepEqual(own.map((session) => session.view.window.turn), [...new Set(own.map((session) => session.view.window.turn))], "at most one plan per own turn");
		assert.ok(own.every((session) => session.view.window.step !== "upkeep" || session.view.window.turn === 1), "a turn's plan waits for the draw");
		const expected = Array.from({ length: turns }, (_, index) => index + 1).filter((turn) => (turn - 1) % 2 === seat);
		const planned = own.map((session) => session.view.window.turn);
		// The losing draw ends the last turn before anyone gets priority.
		assert.ok([expected, expected.slice(0, -1)].some((each) => JSON.stringify(each) === JSON.stringify(planned)), `every own turn is planned: ${planned} of ${expected}`);
	}
	assert.equal(sessions.filter((session) => session.view.window.active !== session.seat).length, 1, "the only plan on another seat's turn is the opening request");
	assert.ok(prompts.every((prompt) => prompt.ceiling === CEILING.strategy));
	assert.equal(new Set(prompts.map((prompt) => prompt.system)).size, 1, "every call sends the same system prompt, so it can be cached");
	assert.ok(prompts[0]!.system!.includes(syntaxReference()), "the syntax and its examples are in it");
	assert.equal(seated.tally.spent().filter((spend) => spend.role === "strategy").length, prompts.length);
	for (const prompt of prompts) {
		const sent = JSON.parse(prompt.user);
		assert.ok(sent.view.objects.every((object: { zone: string; owner: number }) => object.zone !== "library" && (object.zone !== "hand" || object.owner === sent.seat)));
		const known = new Set([...sent.view.objects.map((object: { card?: string }) => object.card).filter(Boolean),
			...sent.view.decks.flatMap((deck: { cards: Record<string, number> }) => Object.keys(deck.cards))]);
		assert.ok(sent.cards.length > 0, "the planner gets the actual instructions rather than just card names");
		for (const fact of sent.cards) {
			assert.ok(known.has(fact.name), "card text comes from visible objects or registered composition");
			assert.equal(fact.oracle, universe.cards.get(fact.name)!.oracle);
			assert.equal(fact.stats, universe.cards.get(fact.name)!.stats, "creature preparation receives printed characteristics");
		}
	}
	const frame = workFrame(table, 0);
	// Position a packet at an earlier decision, with equipment that has history.
	const context = focus({ ...frame, decision: { seat: 0, situation: "priority", question: "Inspect", options: [{ id: "pass", label: "Pass" }] }, view: { ...frame.view, window: { kind: "turn", turn: 1, active: 0, phase: "ending", step: "end" } } }, startingIntent(0));
	assert.equal(JSON.stringify(context).includes('"stamp"'), false, "assessment signatures do not consume classifier context");
	assert.equal(JSON.stringify(context).includes('"answers"'), false, "review history does not consume classifier context");

	const revising = make();
	const opening = seek(revising, main);
	const land = opening.decision!.options.find((option) => option.id.startsWith("land:"))!;
	editWork(revising, 0, [{ do: "recipe.put", recipe: { id: "line", label: "Develop", guidance: "Play a land, then consider the next step.", reserves: [], steps: [
		{ label: "Land", when: {}, action: { option: land.id } }, { label: "Pass", when: {}, action: { option: "pass" } },
	] } }, { do: "draft.start", recipe: "line" }, { do: "draft.bind", option: land.id }, { do: "draft.ready" }], "prepare");
	apply(revising, land.id, "model", "chosen", { draft: revising.work[0]!.draft!.id, step: 0, actionId: "land" });
	completedStep(revising, 0, "land");
	const remaining = { label: "Consider the prepared life change", when: {}, action: { procedure: {
		source: { zones: ["battlefield"], card: "Forest" }, claim: "An authored life change", basis: "A test of preparation, not a card ruling.",
		timing: "stack" as const, cost: { tap: true as const }, instructions: [{ do: "life" as const, who: "you", amount: 1 }],
	} } };
	editWork(revising, 0, [{ do: "draft.edit", steps: [remaining] }, { do: "plan.request", reason: "Reconsider the remaining instruction." }], "revise");
	const current = workFrame(revising, 0), before = structuredClone(revising);
	const tools = await planWork(current, {}, { named: "authored", broken: () => null, async think(_about, prompt) {
		const sent = JSON.parse(prompt.user);
		assert.deepEqual(sent.view.work.draft, current.view.work!.draft, "strategy gets the edited draft, including its instructions");
		assert.deepEqual(sent.view.work.recipes, current.view.work!.recipes);
		assert.notDeepEqual(sent.view.work.draft.steps, sent.view.work.recipes[0].steps, "the edited draft differs from its starting recipe");
		return JSON.stringify([{ do: "draft.edit", steps: [{ ...remaining, action: { procedure: { ...remaining.action.procedure, instructions: [{ do: "life", who: "you", amount: 2 }] } } }] },
			{ do: "plan.accept", objective: "Continue after the completed land play." }]);
	} });
	assert.deepEqual(revising, before, "strategy validates without writing the game or equipment");
	editWork(revising, 0, tools, "accept-revision");
	assert.deepEqual(physical(revising), physical(before));
	assert.equal(revising.work[0]!.draft!.next, 1);
	assert.deepEqual(revising.work[0]!.draft!.steps[0], before.work[0]!.draft!.steps[0]);
	const action = revising.work[0]!.draft!.steps[1]!.action;
	assert.ok("procedure" in action);
	assert.deepEqual(action.procedure.instructions, [{ do: "life", who: "you", amount: 2 }]);
});
