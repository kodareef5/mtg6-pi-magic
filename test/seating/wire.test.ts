/**
 * The wire. An invite is a capability whose secret never travels in a request
 * line; a chair judges each answer against its ask; and a seat answered over
 * HTTP plays the game a local seat would, seeing only its own projection.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { start } from "../../src/core/commit.ts";
import { deck } from "../../src/core/decks.ts";
import { standard } from "../../src/core/format.ts";
import { play } from "../../src/core/loop.ts";
import { PlayerUnavailable, type Player } from "../../src/core/player.ts";
import type { Table } from "../../src/core/table.ts";
import type { Frame } from "../../src/core/types.ts";
import { chair } from "../../src/seating/chair.ts";
import { follow, join } from "../../src/seating/guest.ts";
import { hostTable } from "../../src/seating/host.ts";
import { formatInvite, mintInvite, parseInvite, redactInvite, type State } from "../../src/seating/protocol.ts";

const dealt = () => start(standard, [{ name: "A", deck: deck("Green Stompy") }, { name: "B", deck: deck("Dimir Control") }], "wired");
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}-${frame.refused?.length ?? 0}` }; } });
const physical = (table: Table) => JSON.stringify({ ledger: table.ledger, log: table.log, things: [...table.things], cursor: table.cursor });
const stop = new Error("stop");
async function through(table: Table, players: Record<number, Player>, turn: number) {
	try { await play(table, players, {}, { watch: () => { if (table.cursor.turn > turn) throw stop; } }); } catch (error) { if (error !== stop) throw error; }
}

test("an invite round trips, keeps its secret out of the request line, and refuses what is not one", () => {
	const minted = mintInvite("http://127.0.0.1:49321", "a1b2c3");
	assert.deepEqual(parseInvite(formatInvite(minted)), minted);
	assert.notEqual(mintInvite("http://x", "t").secret, mintInvite("http://x", "t").secret);
	assert.ok(!formatInvite(minted).split("#")[0]!.includes(minted.secret));
	assert.ok(!redactInvite(minted).includes(minted.secret));
	assert.deepEqual(parseInvite(formatInvite(mintInvite("https://bright-river.trycloudflare.com", "t1"))).base, "https://bright-river.trycloudflare.com");
	for (const bad of ["sit down please", "pimagic://127.0.0.1:1/t/a#" + "x".repeat(43), "http://127.0.0.1:1/t/a#short", "http://127.0.0.1:1/a#" + "x".repeat(43)])
		assert.throws(() => parseInvite(bad), Error, bad);
});

test("a chair judges each answer against its ask", async () => {
	const seat = chair("B", () => {});
	assert.deepEqual(seat.supply({ ask: 1, answer: { kind: "pick", option: "keep", actionId: "x" } }), { ok: false, refused: "not-your-turn" });
	const frame = { seat: 1, version: 3, view: {} as Frame["view"], decision: { situation: "pregame", seat: 1, question: "Keep?", options: [{ id: "keep", label: "Keep" }, { id: "mulligan", label: "Mulligan" }] } } as unknown as Frame;
	const answered = seat.player.answer(frame);
	const ask = seat.seen().ask!;
	assert.deepEqual(seat.supply({ ask: ask + 1, answer: { kind: "pick", option: "keep", actionId: "a" } }), { ok: false, refused: "stale" });
	assert.deepEqual(seat.supply({ ask, answer: { kind: "pick", option: "keep", actionId: "c" } }), { ok: true });
	assert.deepEqual(await answered, { kind: "pick", option: "keep", actionId: "c" });
	assert.deepEqual(seat.supply({ ask, answer: { kind: "pick", option: "keep", actionId: "c" } }), { ok: true }, "a resent answer is a replay");
	assert.deepEqual(seat.supply({ ask, answer: { kind: "pick", option: "mulligan", actionId: "c" } }), { ok: false, refused: "duplicate" });
	const withdrawn = seat.player.answer(frame), open = seat.seen().ask!;
	seat.player.reset!();
	await assert.rejects(withdrawn, /withdrawn/, "a rewind withdraws the open ask");
	assert.equal(seat.seen().ask, undefined);
	assert.deepEqual(seat.supply({ ask: open, answer: { kind: "pick", option: "keep", actionId: "d" } }), { ok: false, refused: "not-your-turn" });
	const failing = seat.player.answer(frame);
	seat.supply({ ask: seat.seen().ask!, failed: "the model fell over" });
	await assert.rejects(failing, /fell over/, "a guest's failure reaches the loop as a failure");
	const agreed = seat.request("prepare");
	assert.equal(seat.seen().agreement, "prepare");
	assert.deepEqual(seat.agree("begin", true).ok, false, "only the agreement asked for");
	seat.agree("prepare", true);
	assert.equal(await agreed, true);
});

test("a seat answered over HTTP plays the game a local seat would, and sees only its own projection", async () => {
	const local = dealt();
	await through(local, { 0: steady("A"), 1: steady("B") }, 3);

	const table = dealt();
	let stage: "playing" | "over" = "playing";
	const host = await hostTable({ game: "test", work: () => ({ ok: false, refused: "not-now" }), brief: () => ({ ok: false, refused: "not-now" }),
		view: () => ({ stage, seat: 1, seats: table.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck })), recaps: [] }) });
	const { invite, chair: remote } = host.open(1, "B");
	const guest = await join(invite, "guest B");
	assert.equal(guest.welcome.setAs, 1);
	await assert.rejects(join(invite, "late"), /already taken/, "a chair is claimed once");
	const seen: State[] = [], leaving = new AbortController();
	const following = follow(guest, { agree: async () => true, player: () => steady("B"), seen: (state) => void seen.push(state) }, leaving.signal);
	await through(table, { 0: steady("A"), 1: remote.player }, 3);
	stage = "over";
	host.changed();
	assert.equal(await following, undefined, "a game that stops without a result ends the guest's follow too");
	leaving.abort();
	await host.close();

	assert.equal(physical(table), physical(local));
	const frames = seen.flatMap((state) => state.frame ? [state.frame] : []);
	assert.ok(frames.length > 10, "the guest followed the game");
	assert.ok(frames.every((frame) => frame.seat === 1), "every frame is the chair's own");
	assert.ok(frames.every((frame) => (frame.view.objects ?? []).every((object) => object.zone !== "hand" || object.owner === 1 || !object.card)), "another seat's hand never names a card");
});

test("over HTTP, an unusable answer or a failing player is asked again as the loop asks any seat, and leaving closes the player", async () => {
	const local = dealt();
	await through(local, { 0: steady("A"), 1: steady("B") }, 2);

	const table = dealt();
	const host = await hostTable({ game: "test", work: () => ({ ok: false, refused: "not-now" }), brief: () => ({ ok: false, refused: "not-now" }),
		view: () => ({ stage: "playing", seat: 1, seats: table.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck })), recaps: [] }) });
	try {
		const { invite, chair: remote } = host.open(1, "B");
		let asked = 0, closed = 0;
		// The first decision gets an unlisted pick, the second a throw; each retry, and every later ask, a good answer.
		const wobbly: Player = { name: "B", observe() {}, close() { closed++; }, async answer(frame) {
			asked++;
			if (asked === 1) return { kind: "pick", option: "shuffle-their-library", actionId: "bad" };
			if (asked === 3) throw new Error("The model fell over.");
			return steady("B").answer(frame);
		} };
		const leaving = new AbortController();
		const following = follow(await join(invite, "guest B"), { agree: async () => true, player: () => wobbly }, leaving.signal);
		await through(table, { 0: steady("A"), 1: remote.player }, 2);
		assert.ok(asked > 4, "the guest was asked again after each");
		assert.equal(physical(table), physical(local), "a refused answer and a failure leave no trace in the game");
		assert.ok(table.gaps.length === 0 && !table.ledger.some((row) => row.why === "fallback"), "each was answered on the retry");
		leaving.abort();
		await following;
		assert.equal(closed, 1, "leaving closes the seat's player");
	} finally { await host.close(); }
});

test("an unavailable guest leaves the decision pending as a local seat would, and a guest that leaves while it prepares agrees to nothing", async () => {
	const down: Player = { name: "B", observe() {}, close() {}, async answer() { throw new PlayerUnavailable("The provider is down."); } };
	const local = dealt();
	await through(local, { 0: steady("A"), 1: down }, 2);

	const table = dealt();
	const host = await hostTable({ game: "test", work: () => ({ ok: false, refused: "not-now" }), brief: () => ({ ok: false, refused: "not-now" }),
		view: () => ({ stage: "preparing", seat: 1, seats: table.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck })), recaps: [] }) });
	const leaving = new AbortController(), going = new AbortController();
	try {
		const { invite, chair: remote } = host.open(1, "B");
		const following = follow(await join(invite, "guest B"), { agree: async () => true, player: () => down }, leaving.signal);
		await through(table, { 0: steady("A"), 1: remote.player }, 2);
		assert.equal(physical(table), physical(local));
		assert.ok(!table.ledger.some((row) => row.why === "fallback") && table.gaps.some((gap) => /unavailable/.test(gap)), "no fallback move: the decision stays pending");
		leaving.abort();
		await following;

		let ready!: (yes: boolean) => void;
		const { invite: second, chair: other } = host.open(0, "A");
		const agreed = other.request("begin");
		const preparing = follow(await join(second, "guest A"), { agree: () => new Promise<boolean>((settle) => { ready = settle; }), player: () => undefined }, going.signal);
		await new Promise((go) => setTimeout(go, 50));
		going.abort();
		ready(true);
		const said = await Promise.race([agreed, new Promise((go) => setTimeout(() => go("nothing"), 50))]);
		assert.equal(said, "nothing", "preparation that finishes after leaving posts no agreement");
		await preparing;
	} finally { leaving.abort(); going.abort(); await host.close(); }
});
