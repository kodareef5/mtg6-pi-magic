/**
 * The pilot lab rebuilds a logged decision as the game loop offered it: before
 * the seat's own later work at that decision, and without help the seat had
 * already used there.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { test } from "node:test";
import { decisionFrame, position } from "../tools/benchmark-positions.ts";
import { aiSeat } from "../src/context/seat.ts";
import { startingIntent } from "../src/context/plan.ts";
import type { DecisionApi } from "../src/context/model.ts";

const expand = (name: string) => {
	const to = join(mkdtempSync(join(tmpdir(), "magic-lab-")), `${name}.jsonl`);
	writeFileSync(to, gunzipSync(readFileSync(`test/fixtures/benchmarks/${name}.jsonl.gz`)));
	return to;
};

test("a position can be rebuilt before the seat's own later work at that decision", () => {
	const journal = expand("k-preserve-elf-response");
	assert.ok(position(journal, 87, 0).table.work[0]!.request, "the prefix ends with the seat's request for a new plan");
	assert.equal(position(journal, 87, 0, 0).table.work[0]?.request, undefined, "keeping no work entries at the decision leaves the request out");
});

test("a seat rebuilt mid-decision does not offer help it already used", async () => {
	const { table, brief } = position(expand("kellan-reserve"), 82, 1);
	const frame = decisionFrame(table, 1);
	const criteria = async (helpedAt?: number) => {
		let seen: Record<string, string> = {};
		const api: DecisionApi = { named: "capture", ask: async (request) => { seen = (request.questions.pick as { criteria: Record<string, string> }).criteria; throw new Error("captured"); } };
		await aiSeat({ name: "Lab", api, intent: startingIntent(1), chronicle: { briefs: brief ? { 1: brief } : {}, recaps: [] }, onGap() {},
			plan: async () => { throw new Error("no planning here"); }, ...(helpedAt === undefined ? {} : { helpedAt }) }).answer(frame).catch(() => undefined);
		return seen;
	};
	assert.ok("ask:help" in await criteria(), "a seat with a planner offers help");
	assert.ok(!("ask:help" in await criteria(frame.version)), "help already used at this version is not offered again");
});
