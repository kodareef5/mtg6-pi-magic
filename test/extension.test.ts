/**
 * Hosted in Pi. The extension itself, driven through a fake Pi whose models
 * answer offline: nothing starts by itself, a table replaced while another
 * prepared keeps its own game, a seat's models and keys follow it through the
 * coin flip, a seat's own choices pay for its calls, a player's seat concedes
 * on the clock rather than letting its AI answer, and the host pilots a seat
 * from its terminal.
 */
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

const classifier = (id: string, provider = "fake") => ({ type: "classifier" as const, id, name: id, api: "typesafe-system-one", provider, baseUrl: "https://example.invalid/",
	input: ["text" as const], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 64000 });
const planner = { id: "planner", name: "planner", api: "openai-completions", provider: "fake", baseUrl: "https://example.invalid/", input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, reasoning: true, contextWindow: 100000, maxTokens: 10000 };

/** One Pi with the extension loaded: what it said, and every classifier call with the key it carried. */
function fakePi() {
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
				return [classifier("jev-a"), classifier("jev-b"), classifier("jev-c", "openrouter")];
			},
			async classify(model: { id: string }, request: { questions: Record<string, { criteria: Record<string, string> }> }, options?: { apiKey?: string }) {
				calls.push({ model: model.id, ...(options?.apiKey ? { key: options.apiKey } : {}) });
				const choice = Object.keys(request.questions.pick!.criteria)[0]!;
				return { api: "typesafe-system-one", provider: "fake", model: model.id, answers: { pick: { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 } }, stopReason: "stop", timestamp: 0 };
			},
			// Strategy never answers; the host ends each game long before it would matter.
			streamSimple: () => ({ result: () => new Promise(() => {}) }),
		},
	};
	const commands = new Map<string, { handler(args: string, context: unknown): Promise<void> }>(), events = new Map<string, (...args: unknown[]) => Promise<unknown>>();
	const tools = new Map<string, { execute(id: string, params: unknown): Promise<{ content: { text: string }[] }> }>();
	let active = new Set(["read", "bash"]);
	extension({ registerProvider() {}, registerTool: (tool: { name: string }) => void tools.set(tool.name, tool as never), registerCommand: (name: string, spec: never) => void commands.set(name, spec),
		on: (name: string, handler: never) => void events.set(name, handler), exec: async () => ({}),
		getActiveTools: () => [...active], setActiveTools: (names: string[]) => { active = new Set(names); } } as never);
	const magic = (args: string) => commands.get("magic")!.handler(args, ctx);
	return {
		notes, calls, gate, magic, active: () => [...active],
		/** Call a registered tool as the Pi chat agent would. */
		tool: async (name: string, params: unknown = {}) => (await tools.get(name)!.execute("call", params)).content.map((one) => one.text).join("\n"),
		said: (pattern: RegExp) => notes.some((note) => pattern.test(note)),
		status: async () => { await magic("status"); return notes.at(-1)!; },
		shutdown: () => events.get("session_shutdown")?.(),
		/** Type a line into this Pi's editor: an extension may take it before the chat does. */
		type: (text: string) => events.get("input")?.({ type: "input", text, source: "interactive" }, ctx) as Promise<{ action: string } | undefined>,
	};
}
async function until(done: () => boolean, what: string, notes: string[] = []) {
	for (const begun = Date.now(); !done(); await new Promise((go) => setTimeout(go, 20)))
		if (Date.now() - begun > 20_000) throw new Error(`Waited 20s for ${what}. Last said: ${notes.at(-1)}`);
}
const one = fakePi(), { notes, calls, magic, said, status } = one;
after(async () => { await one.shutdown(); });

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

test("a seat's own models and key are chosen before the start, journaled, and pay for its calls", async () => {
	const hostPi = fakePi();
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 0 model decide nothing-like-it");
		assert.match(hostPi.notes.at(-1)!, /Seat 0's decide: No available model matches nothing-like-it/, "a choice that resolves to nothing is named at once");
		await hostPi.magic("seat 0 model judge fake/planner");
		assert.match(hostPi.notes.at(-1)!, /The judge and the commentator are the table's/);
		await hostPi.magic("seat 0 model decide openrouter/jev-c");
		await hostPi.magic("seat 0 key $UNSET_SEAT_KEY");
		assert.match(hostPi.notes.at(-1)!, /not set in this Pi's environment/);
		await hostPi.magic("start");
		assert.match(hostPi.notes.at(-1)!, /Seat 0's key names \$UNSET_SEAT_KEY, which is not set/, "a table whose agreed key is missing does not start");
		process.env.SEAT_ZERO_KEY = "key-for-seat-zero";
		await hostPi.magic("seat 0 key $SEAT_ZERO_KEY");
		assert.match(await hostPi.status(), /Seat 0\s+Mardu Discard\s+its AI .*decide openrouter\/jev-c · the key in \$SEAT_ZERO_KEY/);
		await hostPi.magic("start");
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		const id = /^Prepared (\S+)\./.exec(hostPi.notes.findLast((note) => note.startsWith("Prepared "))!)![1]!;
		const header = JSON.parse(readFileSync(join(home, "magic", "games", `${id}.jsonl`), "utf8").split("\n")[0]!).header;
		assert.deepEqual(header.seats.map((one: { pilot: string; models?: object; key: string }) => [one.pilot, one.models, one.key]),
			[["ai", { decide: "openrouter/jev-c" }, "$SEAT_ZERO_KEY"], ["ai", undefined, "game"]], "the game records what every seat agreed to, and never a key");
		assert.match(header.seed, /^[0-9a-f]{32}$/, "the seed, which decides every shuffle, is secret: never the game's public id");
		await hostPi.magic("begin");
		await until(() => hostPi.calls.some((call) => call.model === "jev-c") && hostPi.calls.some((call) => call.model === "jev-b"), "both seats to be asked", hostPi.notes);
		assert.ok(hostPi.calls.every((call) => call.model === "jev-c" ? call.key === "key-for-seat-zero" : call.model === "jev-b" && call.key === "key-for-seat-one"),
			"seat 0 plays the model it chose on its own OpenRouter key; seat 1 the one the roster file gives it, with the roster's key");
		await hostPi.magic("end Test over.");
		await until(() => /· over/.test(hostPi.notes.filter((note) => note.startsWith("Magic ·")).at(-1) ?? "") || hostPi.said(/finished, turn/), "the end", hostPi.notes);
	} finally { await hostPi.shutdown(); }
});

test("a player who does not answer runs out of time and their seat concedes; their AI never answers for them", async () => {
	const hostPi = fakePi();
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 1 player");
		await hostPi.magic("pilot 1");
		await hostPi.magic("clock 1");
		assert.match(hostPi.notes.at(-1)!, /1s for each decision, then their seat concedes/);
		await hostPi.magic("start");
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		await hostPi.magic("begin");
		await until(() => hostPi.said(/did not answer within 1s, and the seat conceded/), "the clock", hostPi.notes);
		await until(() => hostPi.said(/Mardu-Discard win, Jund-Sacrifice lose/), "the result", hostPi.notes);
		assert.ok(hostPi.said(/timeout 1/), "the report counts the timeout");
		const journal = readdirSync(join(home, "magic", "games")).filter((name) => name.startsWith("mardu-discard-vs-jund-sacrifice") && name.endsWith(".jsonl"))
			.map((name) => join(home, "magic", "games", name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
		const rows = readFileSync(journal, "utf8").split("\n").filter((line) => line.includes('"row"')).map((line) => JSON.parse(line).row);
		assert.deepEqual(rows.filter((row) => row.seat === 1).map((row) => [row.why, row.by]), [["timeout", "engine"]], "the player's seat made no pick at all");
	} finally { await hostPi.shutdown(); }
});

test("the host pilots a seat from its terminal: it answers by number, its assistant reads the seat, and the ledger says the person chose", async () => {
	const hostPi = fakePi();
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 1 player");
		await hostPi.magic("pilot 1");
		assert.ok(["magic_seat", "magic_choose", "magic_tell"].every((name) => hostPi.active().includes(name)) && hostPi.active().includes("bash"), "the seat tools join the chat agent's own");
		assert.deepEqual(await hostPi.type("1"), { action: "continue" }, "with nothing asked, a typed number is chat");
		await hostPi.magic("start");
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		await hostPi.magic("begin");
		const panelShows = async (pattern: RegExp) => {
			let panel = "";
			for (const begun = Date.now(); !pattern.test(panel); await new Promise((go) => setTimeout(go, 50))) {
				if (Date.now() - begun > 20_000) throw new Error(`The panel never showed ${pattern}. Panel: ${panel}`);
				panel = await hostPi.status();
			}
			return panel;
		};
		const panel = await panelShows(/Type a number/);
		assert.match(panel, /piloting seat 1/);
		assert.match(panel, /suggest mode/);
		assert.match(panel, /Your hand: /, "the panel shows the seat its own hand");
		assert.match(panel, /1\. .*<- autopilot/, "and marks the autopilot's choice");
		const reading = await hostPi.tool("magic_seat");
		assert.match(reading, /Cards this seat can see:/);
		assert.match(reading, /Mulligan/, "the assistant reads the open question");
		assert.equal(await hostPi.tool("magic_tell", { instruction: "Keep two-landers and attack every turn." }), "Passed to the seat's autopilot. It plans from it at the seat's next question.");
		assert.deepEqual(await hostPi.type("1"), { action: "handled" }, "a typed number answers the question");
		await panelShows(/Jund-Sacrifice declared keep/);
		await hostPi.magic("end Person check done.");
		await until(() => /· over/.test(hostPi.notes.filter((note) => note.startsWith("Magic ·")).at(-1) ?? "") || hostPi.said(/finished, turn/), "the end", hostPi.notes);
		const journal = readdirSync(join(home, "magic", "games")).filter((name) => name.startsWith("mardu-discard-vs-jund-sacrifice") && name.endsWith(".jsonl"))
			.map((name) => join(home, "magic", "games", name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
		const rows = readFileSync(journal, "utf8").split("\n").filter((line) => line.includes('"row"')).map((line) => JSON.parse(line).row);
		assert.ok(rows.some((row) => row.seat === 1 && row.by === "person" && row.situation === "pregame"), "the person's mulligan decision is the person's row");
		await hostPi.magic("pilot off");
		assert.ok(!hostPi.active().includes("magic_seat"), "the seat tools go with the seat");
	} finally { await hostPi.shutdown(); }
});

test("a player plays their seat from its page: they choose its models and key, agree to the table as set, and answer its questions", async () => {
	const hostPi = fakePi(), key = `sk-or-v1-${"a".repeat(40)}`;
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 1 player");
		assert.match(hostPi.notes.at(-1)!, /needs this Pi to show its games/);
		await hostPi.magic("watch local");
		await hostPi.magic("seat 1 link");
		const link = /(http:\/\/127\.0\.0\.1:\d+)\/seat\/#(\S+)/.exec(hostPi.notes.at(-1)!)!, [base, code] = [link[1]!, link[2]!];
		const seat = (body?: object, query = "") => fetch(`${base}/api/seat${query}`, { headers: { authorization: `Bearer ${code}` }, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}) }).then((one) => one.json());
		type Seen = { agreement?: string; question?: { ask: number; board: string; options: { suggested?: true; at: unknown[] }[] }; stage: string; mode?: string; key: string; seats: { pilot: string; models: Record<string, string> }[] };
		const awaiting = async (done: (state: Seen) => boolean, what: string): Promise<Seen> => {
			let got = await seat();
			for (const begun = Date.now(); !done(got.state); got = await seat(undefined, `?after=${got.serial}`))
				if (Date.now() - begun > 20_000) throw new Error(`The seat's page never showed ${what}. Last: ${JSON.stringify(got.state).slice(0, 300)}`);
			return got.state;
		};
		let now: Seen = (await seat()).state;
		assert.deepEqual(now.seats.map((one) => [one.pilot, one.models.decide]), [["its AI", "fake/jev-a"], ["a player, here", "fake/jev-b"]], "the page shows the table as set");
		assert.match((await seat({ do: "model", role: "decide", pattern: "nothing-like-it" })).message, /No available model matches nothing-like-it/);
		assert.deepEqual(await seat({ do: "model", role: "decide", pattern: "openrouter/jev-c" }), { ok: true });
		assert.match((await seat({ do: "agree", what: "prepare", yes: true })).message, /Nothing asks this seat to prepare/);
		assert.deepEqual(await seat({ do: "key", key }), { ok: true });
		now = (await seat()).state;
		assert.deepEqual([now.key, now.seats[1]!.models.decide], ["given", "openrouter/jev-c"]);
		assert.ok(!JSON.stringify(now).includes("aaaa"), "a key given is never sent back");
		await hostPi.magic("start");
		await awaiting((one) => one.agreement === "prepare", "the agreement to prepare");
		assert.match((await seat({ do: "model", role: "decide", pattern: "fake/jev-a" })).message, /asking every seat to agree/, "the table holds still while it is agreed to");
		assert.deepEqual(await seat({ do: "agree", what: "prepare", yes: true }), { ok: true });
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		await hostPi.magic("begin");
		await awaiting((one) => one.agreement === "begin", "the agreement to begin");
		assert.deepEqual(await seat({ do: "agree", what: "begin", yes: true }), { ok: true });
		now = await awaiting((one) => !!one.question, "a question");
		assert.equal(now.mode, "suggest");
		assert.ok(now.question!.options.some((one) => one.suggested), "the AI's pick is marked");
		assert.ok(now.question!.options.every((one) => Array.isArray(one.at) && !("objects" in one)), "an option names its cards by where they sit, never by engine id");
		for (const begun = Date.now(); ; await new Promise((go) => setTimeout(go, 100))) {
			const got = await seat();
			if (got.board?.full.moments.at(-1)?.views[0].board === got.state.question?.board) break;
			if (Date.now() - begun > 20_000) throw new Error("The page's newest board never matched the board its question was asked on.");
		}
		assert.match((await seat({ do: "choose", ask: now.question!.ask + 1, n: 1 })).message, /answered or withdrawn/, "an answer meant for another question is refused");
		assert.deepEqual(await seat({ do: "choose", ask: now.question!.ask, n: 1 }), { ok: true });
		const board = (await seat()).board;
		assert.deepEqual(board.full.perspectives.map((one: { key: string }) => one.key), ["seat-1"], "the page draws the seat's own board");
		assert.ok(hostPi.calls.some((call) => call.model === "jev-c") && hostPi.calls.every((call) => call.model !== "jev-c" || call.key === key), "the seat's AI suggests on its player's key");
		await hostPi.magic("end Page check done.");
		await awaiting((one) => one.stage === "over", "the end");
		const journal = readdirSync(join(home, "magic", "games")).filter((name) => name.startsWith("mardu-discard-vs-jund-sacrifice") && name.endsWith(".jsonl"))
			.map((name) => join(home, "magic", "games", name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
		const rows = readFileSync(journal, "utf8").split("\n").filter((line) => line.includes('"row"')).map((line) => JSON.parse(line).row);
		assert.ok(rows.some((row) => row.seat === 1 && row.by === "person"), "the player's pick is the person's row");
		assert.ok(!readFileSync(journal, "utf8").includes("aaaa"), "and the key is nowhere in the journal");
	} finally { await hostPi.magic("watch off"); await hostPi.shutdown(); }
});

test("a table's looks are set before the start and recorded with the game", async () => {
	const hostPi = fakePi();
	try {
		await hostPi.magic("host Mardu Discard vs Jund Sacrifice");
		await hostPi.magic("first 0");
		await hostPi.magic("seat 1 avatar Karn");
		assert.match(hostPi.notes.at(-1)!, /No avatar named Karn\. Choose .*noir-karn/);
		await hostPi.magic("seat 0 avatar noir-karn");
		await hostPi.magic("seat 1 avatar noir-karn");
		await hostPi.magic("seat 1 background https://example.com/table.png");
		await hostPi.magic("seat 1 colors purple #cbb8e6");
		assert.match(hostPi.notes.at(-1)!, /primary and a secondary hex colour/);
		await hostPi.magic("seat 1 colors 2a1040 cbb8e6");
		await hostPi.magic("colors #0f2a40 #8fd6ec");
		await hostPi.magic("colors auto");
		assert.match(hostPi.notes.at(-1)!, /take their background's colours/);
		await hostPi.magic("background");
		assert.match(hostPi.notes.at(-1)!, /^Backgrounds: .*sunken-citadel/);
		await hostPi.magic("background sunken-citadel");
		assert.match((await hostPi.status()), /Seat 1 .*noir-karn on https:\/\/example\.com\/table\.png in #2a1040\/#cbb8e6[^]*The host's pictures: sunken-citadel\./);
		await hostPi.magic("start");
		await until(() => hostPi.said(/^Prepared mardu-discard-vs-jund-sacrifice/), "preparation", hostPi.notes);
		const id = /^Prepared (\S+)\./.exec(hostPi.notes.find((note) => note.startsWith("Prepared "))!)![1]!;
		const header = JSON.parse(readFileSync(join(home, "magic", "games", `${id}.jsonl`), "utf8").split("\n")[0]!).header;
		assert.deepEqual([header.seats[1].avatar, header.seats[1].background, header.seats[1].colors?.primary, header.background, header.colors], ["noir-karn", "https://example.com/table.png", "#2a1040", "sunken-citadel", undefined], "the game records its looks");
		assert.ok(header.seats[0].avatar && header.seats[0].avatar !== "noir-karn", "a portrait named for one seat is no other seat's");
	} finally { await hostPi.shutdown(); }
});
