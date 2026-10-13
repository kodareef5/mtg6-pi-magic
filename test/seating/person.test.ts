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
import { menu, person, type Asking } from "../../src/seating/person.ts";

/** A priority question in seat 1's own precombat main, which smart stops ask about; `where` moves it. */
const ask = (version: number, ...ids: string[]) => at({}, version, ...ids);
function at(where: { active?: number; step?: string; stack?: number; situation?: string; turn?: number }, version: number, ...ids: string[]): Frame {
	return { seat: 1, version, view: { since: [], window: { kind: "turn", turn: where.turn ?? 4, active: where.active ?? 1, step: where.step ?? "precombat-main" },
		objects: where.stack === undefined ? [] : [{ id: "s", zone: "stack", controller: where.stack }] } as unknown as Frame["view"],
		decision: { situation: where.situation ?? "priority", seat: 1, question: "Act?", options: ids.map((id) => ({ id, label: id })) } } as unknown as Frame;
}
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
	const asked = planner.asked;
	assert.equal((await seat.player.answer(ask(2, "pass")) as { by?: string }).by, "person", "one listed option: the person's standing pass, at once");
	assert.equal(planner.asked, asked, "and the autopilot is not asked");
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

test("handing an open question to the autopilot takes it from the person at once, and gives it back if the autopilot fails", async () => {
	let think!: (answer: Answer) => void, fail!: (error: Error) => void;
	const pilot: Player = { name: "pilot", observe() {}, close() {}, answer: () => new Promise<Answer>((settle, refuse) => { think = settle; fail = refuse; }) };
	const { seen, show } = shown(), seat = person("B", pilot, "manual", show);
	const first = seat.player.answer(ask(1, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(seen.at(-1), "the person is asked, and their clock runs");
	const handing = seat.switch("auto");
	assert.equal(seen.at(-1), null, "the moment the autopilot takes it, the person is no longer asked: their clock stops");
	assert.equal(seat.asking(), null);
	think({ kind: "pick", option: "land:7", actionId: "pilot" });
	assert.equal(await handing, null);
	assert.deepEqual(await first, { kind: "pick", option: "land:7", actionId: "pilot" }, "and the autopilot's answer is the seat's");
	await seat.switch("manual");
	const second = seat.player.answer(ask(2, "pass", "land:7"));
	await new Promise((go) => setTimeout(go, 0));
	const asked = seen.at(-1)!.ask, failing = seat.switch("auto");
	fail(new Error("The provider is down."));
	assert.match((await failing)!, /could not answer; the question is yours again/);
	assert.equal(seen.at(-1)?.ask, asked, "the same question comes back to the person");
	assert.equal(seat.choose(2, asked), null);
	assert.equal((await second as { option: string }).option, "land:7");
});

test("a question with one real option is answered at once, and stepping back is not a real option", async () => {
	const pilot = autopilot(() => ({ kind: "pick", option: "announce:cost:0", actionId: "pilot" }));
	const seat = person("B", pilot, "suggest", () => {});
	const answer = await seat.player.answer(ask(1, "announce:cost:0", "announce:cancel"));
	assert.deepEqual([(answer as { option: string }).option, (answer as { by?: string }).by, pilot.asked], ["announce:cost:0", "person", 0]);
});

test("smart stops pass where the person did not ask to stop, unless the autopilot wants to act or another seat's spell waits", async () => {
	const alone = person("C", undefined, "manual", () => {});
	assert.equal((await alone.player.answer(at({ active: 0 }, 1, "pass", "cast:x")) as { option: string }).option, "pass", "another seat's main phase, nothing on the stack");
	assert.equal((await alone.player.answer(at({ step: "upkeep" }, 2, "pass", "cast:x")) as { option: string }).option, "pass", "an upkeep");
	const responding = alone.player.answer(at({ active: 0, stack: 0 }, 3, "pass", "cast:x"));
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(alone.asking(), "another seat's spell on the stack is a chance to respond");
	alone.choose(2);
	assert.equal((await responding as { option: string }).option, "cast:x");
	assert.ok(!alone.asking() && await Promise.race([alone.player.answer(at({ situation: "turn-based", active: 0 }, 4, "block:a", "block:done")).then(() => "answered"), new Promise((go) => setTimeout(() => go("asked"), 10))]) === "asked", "blocks always ask");

	const eager = person("B", autopilot(() => ({ kind: "pick", option: "cast:x", actionId: "pilot" })), "suggest", () => {});
	const wanted = eager.player.answer(at({ active: 0 }, 5, "pass", "cast:x"));
	await new Promise((go) => setTimeout(go, 0));
	assert.equal(eager.asking()?.suggestion?.option, "cast:x", "the autopilot sees a play at this stop, so the person is asked");
	eager.accept();
	await wanted;

	alone.setStops("all");
	void alone.player.answer(at({ active: 0 }, 6, "pass", "cast:x"));
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(alone.asking(), "all stops asks at every priority");
	assert.equal(alone.pass("turn"), null);
	assert.equal((await alone.player.answer(ask(7, "pass", "cast:x")) as { option: string }).option, "pass", "passing the turn passes even its own main phase");
	void alone.player.answer(at({ turn: 5 }, 8, "pass", "cast:x"));
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(alone.asking(), "a new turn ends the pass");
});

test("a person's menu folds equal payments, leads a trigger with its target, and names a broken rule", () => {
	const frame = { ...ask(1), decision: { situation: "priority", seat: 1, question: "Select mana sources one at a time. Still needs 1 mana, including {B}.", options: [
		{ id: "p1", label: "Add to payment: tap Gene Pollinator (1-21) and Azog (1-0) for {W}" },
		{ id: "p2", label: "Add to payment: tap Gene Pollinator (1-21) and Azog (1-0) for {B}" },
		{ id: "p3", label: "Add to payment: tap Blood Crypt (1-8) for {B}" },
		{ id: "land:1-9", label: "Play Blooming Marsh" }, { id: "land:1-10", label: "Play Blooming Marsh" },
		{ id: "t1", label: "Put on the stack: Azog: When Azog enters, destroy a creature. Target 1: Inti (0-32@5, opponent's, 2/2).",
			trigger: { id: "x", name: "Azog (1-0@3)", text: "When Azog enters, destroy a creature.", targets: [] } },
		{ id: "b1", label: "Block Hardened Academic with Gene Pollinator", shows: "Conflicts with flying: needs flying or reach. In normal combat damage..." },
	] } } as unknown as Frame;
	const lines = menu({ frame });
	assert.deepEqual(lines.map((line) => line.option.id), ["p1", "p2", "p3", "land:1-9", "t1", "b1"], "copies are one line; different mana is not");
	assert.equal(lines[1]!.label, "Add to payment: tap Gene Pollinator and Azog for {B}");
	assert.equal(lines[4]!.label, "Put Azog's trigger on the stack: Target 1: Inti (0-32@5, opponent's, 2/2).");
	assert.match(lines[5]!.label, /\(Conflicts with flying: needs flying or reach\)$/);
});

test("payments fold only over permanents alike in everything the seat sees", () => {
	const forest = (id: string, more = {}) => ({ id, incarnation: 1, card: "Forest", zone: "battlefield", controller: 1, owner: 1, ...more });
	const paying = (id: string) => ({ id: `announce:payment:${id}`, label: `Confirm and pay: tap Forest (${id}) for {G}`, objects: [{ id, incarnation: 1 }] });
	const frame = { ...ask(1), view: { ...ask(1).view, objects: [forest("1-3"), forest("1-4"), forest("1-5", { counters: { "+1/+1": 2 } })] },
		decision: { situation: "priority", seat: 1, question: "Choose a complete payment.", options: ["1-3", "1-4", "1-5"].map(paying) } } as unknown as Frame;
	const lines = menu({ frame });
	assert.deepEqual(lines.map((line) => line.option.id), ["announce:payment:1-3", "announce:payment:1-5"], "two plain Forests are one line; the one with counters is its own");
	assert.deepEqual(lines.map((line) => line.label), ["Confirm and pay: tap Forest (1-3) for {G}", "Confirm and pay: tap Forest (1-5) for {G}"], "lines that would read the same keep their ids");
});

test("payments that fold into one line need no person", async () => {
	const seat = person("B", undefined, "manual", () => {});
	const frame = { ...ask(1), decision: { situation: "priority", seat: 1, question: "Choose a complete payment.", options: [
		{ id: "announce:payment:a", label: "Confirm and pay: tap Blood Crypt (1-8) for {B}; tap Verge (1-6) for {R}" },
		{ id: "announce:payment:b", label: "Confirm and pay: tap Blood Crypt (1-8) for {R}; tap Verge (1-6) for {B}" },
		{ id: "announce:individual", label: "Choose mana sources individually; spend nothing yet" },
		{ id: "announce:cancel", label: "Cancel this use and return to priority; spend nothing" },
	] } } as unknown as Frame;
	assert.equal((await seat.player.answer(frame) as { option: string }).option, "announce:payment:a");
});

test("an answer worked out for a withdrawn or taken-over question is never shown or played", async () => {
	const waiting: ((answer: Answer) => void)[] = [];
	const held = (): Player => ({ name: "pilot", observe() {}, close() {}, answer: () => new Promise<Answer>((settle) => waiting.push(settle)) });
	const seat = person("B", held(), "suggest", () => {});
	const old = seat.player.answer(ask(1, "pass", "land:7"));
	seat.player.reset!();
	const fresh = seat.player.answer(ask(2, "pass", "land:7"));
	waiting[1]!({ kind: "pick", option: "pass", actionId: "fresh" });
	await new Promise((go) => setTimeout(go, 0));
	waiting[0]!({ kind: "pick", option: "land:7", actionId: "late" });
	await old;
	assert.equal(seat.asking()?.frame.version, 2, "a late suggestion does not replace the question asked after the rewind");
	seat.choose(2);
	assert.equal((await fresh as { option: string }).option, "land:7");

	const taken = person("B", held(), "auto", () => {});
	const open = taken.player.answer(ask(1, "pass", "land:7"));
	await taken.switch("manual");
	waiting[2]!({ kind: "pick", option: "land:7", actionId: "auto" });
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(taken.asking() && !taken.asking()!.suggestion, "taking over mid-thought asks the person, without the autopilot's move");
	taken.choose(1);
	assert.deepEqual({ ...await open, actionId: "" }, { kind: "pick", option: "pass", actionId: "", by: "person" });
});

test("preparation and a due plan go to the autopilot first; manual mode keeps it idle", async () => {
	const work: Answer = { kind: "work", tools: [], revision: 0, actionId: "plan" };
	let observed = 0;
	const pilot = { ...autopilot(() => work), observe() { observed++; } };
	const seat = person("B", pilot, "suggest", () => {});
	const due = { ...ask(1, "pass"), view: { ...ask(1).view, work: { revision: 0, request: "Plan the turn." } } } as unknown as Frame;
	assert.equal(await seat.player.answer(due), work, "one option, but the turn's plan is owed");
	await seat.switch("manual");
	const shock = { ...ask(2, "pass", "cast:shock"), decision: { ...ask(2, "pass", "cast:shock").decision!, preparation: [{ card: "Shock", uses: [] }] } } as unknown as Frame;
	assert.equal(await seat.player.answer(shock), work, "preparing a card's uses is no choice, so even manual mode hands it over");
	seat.player.observe(ask(3, "pass"));
	assert.equal(observed, 0, "manual mode starts no background work");
});

test("a person's words reach the autopilot's strategy as one plan request, in a turn", async () => {
	const pilot = autopilot(() => ({ kind: "pick", option: "pass", actionId: "pilot" }));
	const seat = person("B", pilot, "suggest", () => {});
	const opening = { ...ask(1, "keep", "mulligan"), view: { ...ask(1).view, window: { kind: "opening", action: "declare" } } } as unknown as Frame;
	assert.equal(seat.tell("Attack with everything but the Elf."), null);
	const kept = seat.player.answer(opening);
	await new Promise((go) => setTimeout(go, 0));
	assert.ok(seat.asking(), "the opening is no time to plan a turn: the request waits");
	seat.choose(1);
	await kept;
	const request = await seat.player.answer(ask(2, "pass", "attack:x")) as Extract<Answer, { kind: "work" }>;
	assert.equal(request.kind, "work");
	assert.match(JSON.stringify(request.tools), /plan\.request.*The person playing this seat asks: Attack with everything but the Elf\./);
	assert.equal((await seat.player.answer(at({ active: 0 }, 3, "pass", "attack:x")) as { kind: string }).kind, "pick", "once");

	const open = seat.player.answer(ask(4, "pass", "attack:x"));
	await new Promise((go) => setTimeout(go, 0));
	seat.tell("Hold the Shock.");
	assert.equal((await open as { kind: string }).kind, "work", "an open question gives way to the request");
	await seat.switch("manual");
	assert.match(seat.tell("Anything.") ?? "", /manual mode/);
	assert.match(person("C", undefined, "manual", () => {}).tell("Anything.") ?? "", /no autopilot/);
});
