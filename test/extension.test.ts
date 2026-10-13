/**
 * Hosted in Pi. The extension itself, driven through a fake Pi whose models
 * answer offline: nothing starts by itself, a table replaced while another
 * prepared keeps its own game, a seat's models and keys follow it through the
 * coin flip, and a bad rollback leaves the game playing.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

// The extension reads where Pi keeps its files once, as it loads.
const home = mkdtempSync(join(tmpdir(), "magic-extension-"));
process.env.PI_CODING_AGENT_DIR = home;
process.env.SEAT_ONE_KEY = "key-for-seat-one";
mkdirSync(join(home, "magic"), { recursive: true });
writeFileSync(join(home, "magic", "roster.json"), JSON.stringify({
	every: { decide: "fake/jev-a", strategy: "fake/planner", pregame: "off", judge: "fake/planner", summary: "off" },
	seats: { 1: { decide: "fake/jev-b" } },
	keys: { 1: { fake: "$SEAT_ONE_KEY" } },
}));
const { default: extension } = await import("../index.ts");

const classifier = (id: string) => ({ type: "classifier" as const, id, name: id, api: "typesafe-system-one", provider: "fake", baseUrl: "https://example.invalid/",
	input: ["text" as const], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000 });
const planner = { id: "planner", name: "planner", api: "openai-completions", provider: "fake", baseUrl: "https://example.invalid/", input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, reasoning: true, contextWindow: 100000, maxTokens: 10000 };

/** One Pi with the extension loaded: what it said, and every classifier call with the key it carried. */
/** `gone` is a Pi whose models never answer: from the host's side, a guest that disconnected mid-decision. */
function fakePi(gone = false) {
	const notes: string[] = [], calls: { model: string; key?: string }[] = [];
	// The next roster read waits for `release`: a preparation that finishes late.
	const gate = { hold: false, release: () => {} };
	const ctx = {
		hasUI: false,
		ui: { notify: (message: string) => void notes.push(message), setWidget() {}, select: async () => undefined, input: async () => undefined },
		modelRegistry: {
			getAvailable: () => [planner],
			async getAvailableOfType() {
				if (gate.hold) { gate.hold = false; await new Promise<void>((go) => { gate.release = go; }); }
				return [classifier("jev-a"), classifier("jev-b")];
			},
			async classify(model: { id: string }, request: { questions: Record<string, { criteria: Record<string, string> }> }, options?: { apiKey?: string }) {
				calls.push({ model: model.id, ...(options?.apiKey ? { key: options.apiKey } : {}) });
				if (gone) await new Promise(() => {});
				const choice = Object.keys(request.questions.pick!.criteria)[0]!;
				return { api: "typesafe-system-one", provider: "fake", model: model.id, answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } }, stopReason: "stop", timestamp: 0 };
			},
			// Strategy never answers; the host ends each game long before it would matter.
			streamSimple: () => ({ result: () => new Promise(() => {}) }),
		},
	};
	const commands = new Map<string, { handler(args: string, context: unknown): Promise<void> }>(), events = new Map<string, () => Promise<void>>();
	extension({ registerProvider() {}, registerTool() {}, registerCommand: (name: string, spec: never) => void commands.set(name, spec),
		on: (name: string, handler: never) => void events.set(name, handler), exec: async () => ({}) } as never);
	const magic = (args: string) => commands.get("magic")!.handler(args, ctx);
	return {
		notes, calls, gate, magic,
		said: (pattern: RegExp) => notes.some((note) => pattern.test(note)),
		status: async () => { await magic("status"); return notes.at(-1)!; },
		shutdown: () => events.get("session_shutdown")?.(),
	};
}
async function until(done: () => boolean, what: string, notes: string[] = []) {
	for (const begun = Date.now(); !done(); await new Promise((go) => setTimeout(go, 20)))
		if (Date.now() - begun > 20_000) throw new Error(`Waited 20s for ${what}. Last said: ${notes.at(-1)}`);
}
const one = fakePi(), { notes, calls, magic, said, status } = one;
const guestPi = fakePi();
after(async () => { await one.shutdown(); await guestPi.shutdown(); });

test("nothing starts by itself, and a table replaced while another prepared keeps its own game", async () => {
	await magic("");
	assert.ok(said(/opens the menu/), "with no menu to show, /magic says what it can do");
	assert.ok(!readdirSync(home, { recursive: true }).map(String).some((name) => name.endsWith(".jsonl")), "and no game exists");

	await magic("host Izzet Spellementals vs Mardu Discard");
	await magic("first 0");
	one.gate.hold = true;
	await magic("start");
	await magic("host Boros Tokens vs Lifegain");
	await magic("first 0");
	await magic("start");
	await until(() => said(/^Prepared boros-tokens-vs-lifegain/), "the replacement to prepare");
	one.gate.release();
	await until(() => readdirSync(join(home, "magic", "games")).some((name) => name.startsWith("izzet-spellementals")), "the first preparation to write its journal");
	await new Promise((go) => setTimeout(go, 200));
	const now = await status();
	assert.match(now, /Seat 0\s+Boros-Tokens/);
	assert.doesNotMatch(now, /Izzet|Mardu/, "the late preparation did not replace the table");
	assert.ok(!said(/^Prepared izzet/), "and said nothing");
});

test("a seat's models and keys follow it through the coin flip, and a bad rollback leaves the game playing", async () => {
	await magic("host Mardu Discard vs Jund Sacrifice");
	await magic("first 1");
	await magic("start");
	await until(() => said(/^Prepared jund-sacrifice-vs-mardu-discard/), "preparation");
	await magic("models");
	assert.match(notes.at(-1)!, /Seat 0, Jund-Sacrifice \(set up as seat 1\):\n\s*decide\s+fake\/jev-b/);
	assert.match(notes.at(-1)!, /fake calls use this seat's key from \$SEAT_ONE_KEY\./);

	await magic("begin");
	await until(() => /· playing/.test(notes.filter((note) => note.startsWith("Magic ·")).at(-1) ?? "") || said(/agreed to begin/), "play to begin", notes);
	await magic("pause");
	await magic("rollback 99999");
	assert.match(notes.at(-1)!, /from 0 to/, "an impossible version is refused before play is touched");
	assert.match(await status(), /playing · paused/);
	await magic("continue");
	await until(() => calls.some((call) => call.model === "jev-a"), "both seats to be asked");
	assert.deepEqual(calls[0], { model: "jev-b", key: "key-for-seat-one" }, "seat 0 opens, as the seat it was set up as");
	assert.ok(calls.every((call) => call.model === "jev-b" ? call.key === "key-for-seat-one" : call.key === undefined), "each seat with its own key, or none");

	await magic("end Test over.");
	await until(() => /· over/.test(notes.filter((note) => note.startsWith("Magic ·")).at(-1) ?? "") || said(/finished, turn/), "the end");
	assert.match(await status(), /· over/);
});

test("a guest's Pi takes an open seat and plays it with its own models and keys", async () => {
	const hostPi = fakePi();
	await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
	await hostPi.magic("first 0");
	await hostPi.magic("seat 1 open");
	const invite = /\/magic join (\S+)/.exec(hostPi.notes.at(-1)!)?.[1];
	assert.ok(invite, "the host prints a join line for the open seat");
	await guestPi.magic(`join ${invite}`);
	await guestPi.magic("join " + invite);
	assert.ok(guestPi.said(/already has a chair/), "one chair per Pi");
	assert.match(await hostPi.status(), /Seat 1\s+Jund Sacrifice\s+guest /);

	await hostPi.magic("start");
	await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
	await hostPi.magic("begin");
	await until(() => hostPi.calls.length > 0 && guestPi.calls.length > 0, "both seats to be asked", hostPi.notes);
	assert.match(await guestPi.status(), /A judge hears objections/, "the guest learns of the judge the table seated");
	const journal = readdirSync(join(home, "magic", "games")).find((name) => name.startsWith("mardu-discard-vs-jund-sacrifice") && name.endsWith(".jsonl"))!;
	const prepared = readFileSync(join(home, "magic", "games", journal), "utf8").split("\n").filter((line) => line.includes('"prepared"')).map((line) => JSON.parse(line).prepared.seat);
	assert.deepEqual(prepared.sort(), [0, 1], "the host journals the guest's brief beside its own seat's");
	assert.ok(hostPi.calls.every((call) => call.model === "jev-a" && call.key === undefined), "the host's Pi answers only its own seat");
	assert.ok(guestPi.calls.every((call) => call.model === "jev-b" && call.key === "key-for-seat-one"), "the guest's Pi answers its seat with its own model and key");
	assert.match(await hostPi.status(), /Seat 1\s+Jund-Sacrifice\s+guest /);

	await hostPi.magic("end Test over.");
	await until(() => guestPi.said(/The game is over: this seat's result is draw/), "the guest to hear the end", guestPi.notes);
	await until(() => /· over/.test(hostPi.notes.filter((note) => note.startsWith("Magic ·")).at(-1) ?? "") || hostPi.said(/finished, turn/), "the host's report", hostPi.notes);
	await hostPi.shutdown();
});

test("a guest that stops answering runs out of time on the table's clock and concedes", async () => {
	const hostPi = fakePi(), silent = fakePi(true);
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 1 open");
		await hostPi.magic("clock 1");
		assert.match(hostPi.notes.at(-1)!, /1s for each decision/);
		await silent.magic(`join ${/\/magic join (\S+)/.exec(hostPi.notes.findLast((note) => note.includes("/magic join"))!)![1]}`);
		await hostPi.magic("start");
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		await hostPi.magic("begin");
		await until(() => hostPi.said(/did not answer within 1s and conceded/), "the clock", hostPi.notes);
		await until(() => hostPi.said(/Mardu-Discard win, Jund-Sacrifice lose/), "the result", hostPi.notes);
		assert.ok(hostPi.said(/timeout 1/), "the report counts the timeout");
		await until(() => silent.said(/this seat's result is lose/), "the guest to hear it lost", silent.notes);
	} finally {
		await hostPi.shutdown();
		await silent.shutdown();
	}
});
