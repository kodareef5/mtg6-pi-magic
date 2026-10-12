/** Board pictures: the snapshot shows what its viewer may see, the scene mapping keeps it, and SVG becomes PNG without a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";
import type { Table } from "../src/core/table.ts";
import { boardSnapshot } from "../src/board/snapshot.ts";
import { artIds, svgToPng } from "../src/board/render.ts";
import { cardboardScene } from "../src/board/cardboard.ts";
import { announce, establish, example, main, matchup, place, quiet } from "./play.ts";

const seats = (table: Table) => table.seats.map((seat) => ({ id: seat.id, name: seat.name, deck: seat.deck.name }));
const snap = (table: Table, viewer: 0 | 1 | "spectator") => boardSnapshot(project(table, viewer), seats(table), viewer);

test("a spectator sees hand sizes and the public board; a seat also sees its own hand", () => {
	const table = matchup("board-view");
	main(table, 0, 3);
	const [forest] = place(table, 0, "battlefield", "Forest");
	const [elf] = place(table, 0, "battlefield", "Llanowar Elves");
	place(table, 0, "hand", "Mossborn Hydra");
	commit(table, [{ do: "tap", what: forest!.id }, { do: "counters", what: elf!.id, kind: "+1/+1", amount: 2 }], "game-setup");
	const watcher = snap(table, "spectator"), green = watcher.seats[0]!;
	assert.equal(watcher.turn, 3);
	assert.equal(green.handCards, undefined, "a spectator never receives a hand's cards");
	assert.equal(green.hand, project(table, "spectator").players!.find((one) => one.id === 0)!.hand);
	assert.ok(!JSON.stringify(watcher).includes("Mossborn Hydra"), "no hidden card name anywhere in the snapshot");
	const tapped = green.battlefield.find((one) => one.id === forest!.id)!, grown = green.battlefield.find((one) => one.id === elf!.id)!;
	assert.equal(tapped.tapped, true);
	assert.deepEqual([grown.power, grown.toughness, grown.counters?.["+1/+1"]], [3, 3, 2]);
	assert.ok(snap(table, 0).seats[0]!.handCards!.some((one) => one.name === "Mossborn Hydra"), "the seat sees its own hand");
	assert.equal(snap(table, 1).seats[0]!.handCards, undefined, "the opponent does not");
});

test("attackers are marked, and the stack lists its items top first with their targets", () => {
	const table = matchup("board-combat");
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	for (let guard = 0; guard < 3000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers" && table.cursor.turn === 3) break;
		apply(table, decision.situation === "pregame" ? "keep" : quiet(decision.options).id, "engine", "forced");
	}
	apply(table, `attack:${chocobo.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
	assert.equal(snap(table, "spectator").seats[0]!.battlefield.find((one) => one.id === chocobo.id)!.attacking, true);

	const shock = matchup("board-stack");
	const target = establish(shock, 0, "Sazh's Chocobo", []);
	place(shock, 1, "battlefield", "Mountain");
	place(shock, 1, "hand", "Shock");
	main(shock, 1, 2);
	announce(shock, example("Cast Shock"), (option) => option.activation.targets[0]!.some((one) => "id" in one && one.id === target.id));
	const stack = snap(shock, "spectator").stack;
	assert.equal(stack.length, 1);
	assert.deepEqual([stack[0]!.name, stack[0]!.controller, stack[0]!.targets], ["Shock", 1, [target.id]]);
	const scene = cardboardScene(snap(shock, "spectator"), new Map([["Shock", "scryfall-shock"]]), { width: 800, height: 600 });
	assert.ok(scene.extras.highlights.some((one) => (one as { preset: string }).preset === "arcane"), "the stack's target glows");
});

test("the cardboard scene keeps hidden zones as counts and carries art ids and annotations", () => {
	const table = matchup("board-scene");
	main(table, 0, 3);
	const [forest] = place(table, 0, "battlefield", "Forest");
	commit(table, [{ do: "tap", what: forest!.id }], "game-setup");
	const art = artIds();
	assert.equal(art.size, 5164, "one printing for every Standard card");
	const scene = cardboardScene(snap(table, "spectator"), art, { width: 800, height: 600 });
	const green = scene.players[0]!, hand = green.zones.find((zone) => zone.id === "hand")!;
	assert.equal(hand.visibility, "hidden"); assert.deepEqual(hand.cardIds, []);
	assert.equal(hand.count, snap(table, "spectator").seats[0]!.hand);
	assert.ok(scene.decks[0]!.cards.some((card) => card.name === "Forest" && card.scryfallId === art.get("Forest")));
	assert.ok(scene.extras.cards.some((one) => (one as { tapped?: boolean }).tapped), "the tapped Forest is annotated");
});

test("an SVG becomes a PNG with no browser", async () => {
	const png = await svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/></svg>');
	assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
