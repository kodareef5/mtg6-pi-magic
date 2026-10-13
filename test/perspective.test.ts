/**
 * Perspective. A card a viewer cannot identify never reaches it by id: an id
 * is a card's place in its public registered list, so it would name the card.
 * Face-down permanents, libraries and other seats' hands arrive under aliases
 * the viewer cannot reverse, in an order that says nothing, and an answer that
 * names an alias comes back in the table's ids. Checked on a frame, and on
 * every frame a whole game hands its seats.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { commit } from "../src/core/commit.ts";
import { play } from "../src/core/loop.ts";
import { perspective } from "../src/core/perspective.ts";
import type { Player } from "../src/core/player.ts";
import { cardsIn, type Table } from "../src/core/table.ts";
import type { Frame, Viewer } from "../src/core/types.ts";
import { project, sight } from "../src/core/view.ts";
import { main, matchup } from "./play.ts";

/** The ids of every object this viewer cannot identify, and whether a text names any of them. */
function unknown(table: Table, viewer: Viewer) {
	const { knows } = sight(table, viewer), ids = [...table.things.values()].filter((one) => !knows(one)).map((one) => one.id);
	return { ids, named: (text: string) => ids.filter((id) => new RegExp(`(?<![\\w-])${id}(?![\\w-])`).test(text)) };
}

/** Red's first creature in its library, put onto the battlefield face down, as manifest does. */
function faceDown() {
	const table = matchup("perspective");
	main(table, 0);
	const hidden = cardsIn(table, "library", 1).find((one) => one.card !== "Mountain")!;
	commit(table, [{ do: "move", what: hidden.id, to: "battlefield", faceDown: "manifest", reason: "game-setup" }], "game-setup");
	return { table, hidden: table.things.get(hidden.id)! };
}

test("a face-down permanent reaches the other seat and the audience under an alias, and an answer naming it comes back in the table's id", () => {
	const { table, hidden } = faceDown();
	const frame = (viewer: Viewer): Frame => ({ seat: viewer === "spectator" ? 0 : viewer, version: table.cursor.clock, view: project(table, viewer) });
	assert.ok(JSON.stringify(frame(0)).includes(hidden.id), "the engine's own projection names it by id: that is what must not cross");
	for (const viewer of [0, "spectator"] as const) {
		const lens = perspective(table, viewer), seen = lens.hide(frame(viewer)), text = JSON.stringify(seen);
		assert.deepEqual(unknown(table, viewer).named(text), [], `${viewer} is handed no id of a card it cannot identify`);
		const { printed: _printed, decks: _decks, ...rest } = seen.view;
		assert.ok(!JSON.stringify(rest).includes(hidden.card!), "nor its name, outside the public registered lists");
		const object = seen.view.objects!.find((one) => one.zone === "battlefield" && one.faceDown)!;
		assert.match(object.id, /^hidden-[0-9a-f]{12}$/);
		assert.equal(perspective(table, viewer).hide(frame(viewer)).view.objects!.find((one) => one.faceDown)!.id, object.id, "the same alias every time");
		const objects = seen.view.objects!, first = objects.findIndex((one) => one.id.startsWith("hidden-"));
		assert.ok(objects.slice(first).every((one) => one.id.startsWith("hidden-")), "and after everything it can identify, so its place in the list says nothing");
		const option = `target:${hidden.id}@${hidden.incarnation}`, offered = lens.hide({ options: [{ id: option, label: `Target the face-down creature (${hidden.id})` }] });
		assert.ok(!JSON.stringify(offered).includes(hidden.id));
		assert.deepEqual(lens.reveal({ kind: "pick", option: offered.options[0]!.id }), { kind: "pick", option }, "an answer naming the alias is the table's option");
	}
	const ours = perspective(table, 1).hide(frame(1));
	assert.ok(ours.view.objects!.some((one) => one.id === hidden.id && one.card === hidden.card), "its controller may look at it, and holds it by its id");
	assert.notEqual(perspective(table, 0).hide(frame(0)).view.objects!.find((one) => one.faceDown)!.id,
		perspective(table, "spectator").hide(frame("spectator")).view.objects!.find((one) => one.faceDown)!.id, "each viewer has its own aliases");
});

test("no frame a game hands a seat names a card that seat cannot identify, and play goes on through the aliases", async () => {
	const { table, hidden } = faceDown(), stop = new Error("stop"), leaks: string[] = [];
	let frames = 0, raw = 0;
	const watched = (name: string, seat: 0 | 1): Player => {
		const check = (frame: Frame) => {
			frames++;
			const found = unknown(table, seat).named(JSON.stringify(frame));
			if (found.length) leaks.push(`${name}: ${found.join(", ")}`);
			if (seat === 0 && unknown(table, 0).named(JSON.stringify(project(table, 0))).length) raw++;
		};
		return { name, close() {}, observe: check, async answer(frame) {
			check(frame);
			const options = frame.decision!.options;
			return { kind: "pick", option: (options.find((one) => one.id.startsWith("land:")) ?? options.find((one) => one.id.startsWith("cast:")) ?? options[0]!).id, actionId: `${name}-${frame.version}` };
		} };
	};
	try { await play(table, { 0: watched("Green", 0), 1: watched("Red", 1) }, {}, { watch: () => { if (table.cursor.turn > 6) throw stop; } }); }
	catch (error) { if (error !== stop) throw error; }
	assert.ok(table.cursor.turn > 6 && frames > 50, "a game of several turns was played");
	assert.ok(raw > 0 && table.ledger.some((row) => row.picked.includes(hidden.id)), "the engine's own view named the face-down creature, and play used it");
	assert.deepEqual(leaks, []);
	assert.equal(table.gaps.filter((gap) => /refused|not offered|No option/i.test(gap)).length, 0, "every answer was the table's own option");
});
