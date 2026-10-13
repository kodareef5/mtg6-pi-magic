/**
 * A person at a seat. In suggest mode the autopilot proposes and the person
 * confirms or overrides; its planning goes through; a single listed option is
 * answered at once; auto hands the seat over; manual needs no autopilot; and
 * every pick says whether the person made it.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Answer, Player } from "../../src/core/player.ts";
import type { Frame } from "../../src/core/types.ts";
import { person, type Asking } from "../../src/seating/person.ts";

const ask = (version: number, ...ids: string[]) => ({ seat: 1, version, view: { since: [] } as unknown as Frame["view"],
	decision: { situation: "priority", seat: 1, question: "Act?", options: ids.map((id) => ({ id, label: id })) } }) as unknown as Frame;
const autopilot = (answer: (frame: Frame) => Answer): Player & { asked: number } => {
	const pilot = { name: "pilot", asked: 0, observe() {}, close() {}, async answer(frame: Frame) { pilot.asked++; return answer(frame); } };
	return pilot;
};
const shown = () => { const seen: (Asking | null)[] = []; return { seen, show: (asking: Asking | null) => void seen.push(asking) }; };

test("in suggest mode the autopilot proposes, and the person confirms or picks another", async () => {
	const pilot = autopilot((frame) => ({ kind: "pick", option: frame.decision!.options[0]!.id, actionId: "pilot" })), { seen, show } = shown();
	const seat = person("B", pilot, "suggest", show);
	const first = seat.player.answer(ask(1, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	assert.equal(seen.at(-1)?.suggestion?.option, "pass", "the person sees the autopilot's choice");
	assert.equal(seat.choose(3), "Choose 1 to 2.");
	assert.equal(seat.choose(2), null);
	assert.deepEqual({ ...await first, actionId: "" }, { kind: "pick", option: "land:7", actionId: "", by: "person" }, "an override is the person's pick");
	const second = seat.player.answer(ask(2, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	assert.equal(seat.accept(), null);
	assert.deepEqual(await second, { kind: "pick", option: "pass", actionId: "pilot" }, "taking the suggestion is the autopilot's pick");
	assert.equal(seat.accept(), "Nothing is being asked of this seat.");
});

test("planning goes through, a single option is answered at once, and auto hands the seat over", async () => {
	const work: Answer = { kind: "work", tools: [], revision: 0, actionId: "plan" };
	const planner = autopilot((frame) => frame.version === 1 ? work : { kind: "pick", option: "pass", actionId: "pilot" });
	const seat = person("B", planner, "suggest", () => {});
	assert.equal(await seat.player.answer(ask(1, "pass", "land:7")), work, "the autopilot's planning moves no cards and is not asked");
	assert.equal((await seat.player.answer(ask(2, "pass")) as { by?: string }).by, undefined, "one listed option: the autopilot's pass, at once");
	assert.equal(await seat.switch("auto"), null);
	assert.deepEqual(await seat.player.answer(ask(3, "pass", "land:7")), { kind: "pick", option: "pass", actionId: "pilot" });
});

test("handing an open question to the autopilot answers it; manual needs none; a person can concede", async () => {
	const pilot = autopilot(() => ({ kind: "pick", option: "land:7", actionId: "pilot" }));
	const seat = person("B", pilot, "suggest", () => {});
	const open = seat.player.answer(ask(1, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	await seat.switch("auto");
	assert.equal((await open as { option: string }).option, "land:7");

	const alone = person("C", undefined, "suggest", () => {});
	assert.equal(alone.mode(), "manual", "without an autopilot a person plays manual");
	assert.equal(await alone.switch("suggest"), "This seat has no autopilot.");
	const asked = alone.player.answer(ask(1, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	alone.concede();
	assert.deepEqual(await asked, { kind: "concede", by: "person" });
	assert.deepEqual(await alone.player.answer(ask(2, "pass", "land:7")), { kind: "concede", by: "person" }, "a concession stands for the next ask too");
});
