/** Source review retains accepted revisions and actual announced programs, without certifying either. */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, commit } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { editWork } from "../src/core/work-tools.ts";
import { relive } from "../src/core/journal.ts";
import type { Procedure } from "../src/core/language.ts";
import { sourceReview } from "../tools/source-review.ts";
import { saveReport } from "../tools/game-report.ts";
import { announce, example, finish, main, passBoth, place } from "./play.ts";

test("private source evidence preserves changed, unused and announced meanings through a cloned prefix", () => {
	const table = start(standard, [{ deck: deck("Izzet Spellementals") }, { deck: deck("4c Control") }], "source-review");
	const card = "Impractical Joke", good = { ...example("Cast Impractical Joke"), claim: "Cast spell" };
	editWork(table, 0, [{ do: "package.put", package: { card, registers: [] } }], "initial");
	main(table, 0); place(table, 0, "hand", card, "Burst Lightning");
	commit(table, [{ do: "add-mana", who: 0, colors: ["R", "R"] }], "game-setup");
	const put = (procedure: Procedure, id: string) => editWork(table, 0, [{ do: "package.put", package: { card: procedure.source.card!, registers: [], procedures: [procedure] } }], id);
	put({ ...good, instructions: [...good.instructions].reverse() }, "wrong-order");
	const prefix = structuredClone(table), version = table.ledger.length, work = table.workLog.length;
	put(good, "correct-order");
	editWork(table, 0, [{ do: "package.put", package: { card: "Opt", registers: [], deferred: [{ source: { card: "Opt", zones: ["hand"] },
		claim: "Cast Opt", basis: table.printed.Opt!.oracle, timing: "spell" }] } }], "unused-inventory");
	// Another seat's copied inventory must not replace this seat's interpreted procedure.
	editWork(table, 1, [{ do: "package.put", package: { card, registers: [] } }], "opponent-copy");
	announce(table, good, (one) => !one.activation.targets[0]?.length); passBoth(table); finish(table);
	const burst: Procedure = { source: { card: "Burst Lightning", zones: ["hand"] }, claim: "Cast spell", basis: table.printed["Burst Lightning"]!.oracle,
		timing: "spell", targets: [{ player: "opponent" }], instructions: [{ do: "damage", to: "target:0", amount: 2 }] };
	announce(table, burst); passBoth(table); finish(table);
	const before = structuredClone(table), review = sourceReview(table, version);
	assert.deepEqual(table, before, "extracting evidence cannot change the game");
	const joke = review.cards.find((one) => one.card === card && one.seat === 0)!;
	assert.ok(joke.initial); assert.equal(joke.prepared.length, 2, "later workspace snapshots do not duplicate a meaning");
	assert.equal(joke.prepared[0]!.terms.procedures[0]!.instructions[0]!.do, "damage", "a corrected mistake remains reviewable");
	assert.equal(joke.prepared[1]!.terms.procedures[0]!.instructions[0]!.do, "damage-rule");
	assert.equal(joke.announced.length, 1); assert.equal(joke.announced[0]!.program.instructions[0]!.do, "damage-rule");
	assert.ok(review.cards.some((one) => one.card === "Burst Lightning" && one.announced[0]?.program.claim === good.claim), "equal claims on different cards remain distinct");
	assert.ok(review.cards.some((one) => one.card === "Opt" && one.prepared.length && !one.announced.length), "unused private work is included");
	assert.deepEqual(joke.source, table.printed[card]);
	assert.deepEqual(sourceReview(relive(prefix, table.ledger.slice(version), table.workLog.slice(work)), version), review);
	const dir = mkdtempSync(join(tmpdir(), "magic-review-"));
	try {
		const path = join(dir, "game.result.json"), paths = saveReport(path, { seed: table.rng.seed, turn: table.cursor.turn, outcome: table.outcome,
			gaps: [], elapsedMs: 0, calls: [], fromVersion: version }, table);
		assert.equal(paths.length, 2, "a run with no new model calls still writes review evidence");
		const stored = JSON.parse(readFileSync(path, "utf8"));
		assert.equal(stored.sourceReview, join(dir, "game.source-review.md"));
		const text = readFileSync(stored.sourceReview, "utf8");
		assert.match(text, /Private card source review/); assert.ok(text.includes(table.printed[card]!.oracle));
		assert.match(text, /Not announced/); assert.match(text, /does not prove its instructions resolved/);
		assert.equal(statSync(stored.sourceReview).mode & 0o777, 0o600);
		assert.equal(stored.cards, undefined, "private card meanings stay out of the compact result and timeline");
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
