/** Board pictures: the snapshot shows what its viewer may see, the scene mapping keeps it, the table wears its looks, and SVG becomes PNG without a browser. */
import test from "node:test";
import assert from "node:assert/strict";
import { advance, apply, nextDecision } from "../src/core/decisions.ts";
import { commit } from "../src/core/commit.ts";
import { project } from "../src/core/view.ts";
import type { Table } from "../src/core/table.ts";
import { boardSnapshot } from "../src/board/snapshot.ts";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { artIds, svgToPng } from "../src/board/render.ts";
import { cardboardRenderer, cardboardScene } from "../src/board/cardboard.ts";
import { choose, chooseColors, colorsFor, deal, defaults, imageOf } from "../src/board/looks.ts";
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

/** The preset itself accepts a scene, when cardboard-api is installed: a wrong reference is refused there, not drawn wrong. */
async function accepted(scene: unknown) {
	const Tabletop = await import("cardboard-api/tabletop.mjs" as string).then((one) => one.default, () => null);
	if (Tabletop) Tabletop.validate(Tabletop.normalize(scene));
}

test("attackers are marked, and the stack lists its items top first with their targets", async () => {
	const table = matchup("board-combat");
	const chocobo = establish(table, 0, "Sazh's Chocobo", []);
	for (let guard = 0; guard < 3000; guard++) {
		const decision = nextDecision(table);
		if (!decision) { advance(table); continue; }
		if (decision.situation === "turn-based" && table.cursor.steps[0] === "declare-attackers" && table.cursor.turn === 3) break;
		apply(table, decision.situation === "pregame" ? "keep" : quiet(decision.options).id, "engine", "forced");
	}
	apply(table, `attack:${chocobo.id}`, "model", "chosen"); apply(table, "attack:done", "model", "chosen");
	const fight = snap(table, "spectator");
	assert.equal(fight.seats[0]!.battlefield.find((one) => one.id === chocobo.id)!.attacking, true);
	assert.deepEqual(fight.combat, [{ attacker: chocobo.id, defending: 1, blockers: [] }]);
	const declared = cardboardScene(fight, new Map(), { width: 800, height: 600 }).view.mtg;
	const field = fight.seats[0]!.battlefield.filter((one) => !one.types.includes("land"));
	assert.deepEqual(declared.combat, [{ attacker: { playerId: "p0", zoneId: "battlefield", index: field.findIndex((one) => one.id === chocobo.id) }, defenderId: "p1", blockers: [] }]);
	assert.equal(declared.phase, "combat");
	await accepted(cardboardScene(fight, new Map(), { width: 800, height: 600 }));

	const shock = matchup("board-stack");
	const target = establish(shock, 0, "Sazh's Chocobo", []);
	place(shock, 1, "battlefield", "Mountain");
	place(shock, 1, "hand", "Shock");
	main(shock, 1, 2);
	announce(shock, example("Cast Shock"), (option) => option.activation.targets[0]!.some((one) => "id" in one && one.id === target.id));
	const stack = snap(shock, "spectator").stack;
	assert.equal(stack.length, 1);
	assert.deepEqual([stack[0]!.name, stack[0]!.controller, stack[0]!.targets], ["Shock", 1, [target.id]]);
	const scene = cardboardScene(snap(shock, "spectator"), artIds(), { width: 800, height: 600 });
	assert.ok(scene.extras.highlights.some((one) => (one as { preset: string }).preset === "arcane"), "the stack's target glows");
	assert.deepEqual(scene.view.mtg.stack, [{ playerId: "p1", zoneId: "stack", index: 0 }], "the stack is referenced top first");
	await accepted(scene);
});

test("the cardboard scene keeps hidden zones as counts and carries art ids and annotations", async () => {
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
	const battlefield = green.zones.find((zone) => zone.id === "battlefield")!;
	assert.deepEqual(scene.view.mtg.lands.p0!.map((at) => battlefield.cardIds[at]), battlefield.cardIds.filter((id) => id === "c-forest"), "lands sit on the land rail");
	assert.deepEqual([scene.view.mode, scene.view.viewerId], ["overview", null]);
	place(table, 0, "hand", "Llanowar Elves");
	const mine = cardboardScene(snap(table, 0), art, { width: 800, height: 600 }), own = mine.players[0]!.zones.find((zone) => zone.id === "hand")!;
	assert.deepEqual([mine.view.mode, mine.view.viewerId, own.visibility], ["player", "p0", "owner"]);
	assert.ok(own.cardIds.includes("c-llanowar-elves"), "the seat's picture shows its own hand");
	assert.equal(mine.players[1]!.zones.find((zone) => zone.id === "hand")!.visibility, "hidden");
	await accepted(scene); await accepted(mine);
});

test("a board with nothing visible yet is still a scene", async () => {
	const table = matchup("board-empty");
	const scene = cardboardScene(snap(table, "spectator"), artIds(), { width: 800, height: 600 });
	assert.equal(scene.decks[0]!.cards.length, 1);
	await accepted(scene);
});

test("an ability on the stack named by long rules text is still a card the preset accepts", async () => {
	const text = "{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.";
	const seat = (id: number) => ({ id, name: `P${id}`, life: 20, library: 40, hand: 7, battlefield: [], graveyard: [], exile: [] });
	const ability = (name: string, id: string) => ({ id, name, types: [], controller: 0, targets: [] });
	const scene = cardboardScene({ viewer: "spectator", seats: [seat(0), seat(1)], stack: [ability(text, "s1"), ability(`${text} Twice.`, "s2"), ability("x".repeat(400), "s3")] },
		new Map(), { width: 800, height: 600 });
	const cards = scene.decks[0]!.cards;
	assert.equal(new Set(cards.map((one) => one.id)).size, 3, "two long names that share a beginning keep their own ids");
	assert.ok(cards.every((one) => one.id!.length <= 100 && one.name!.length <= 150));
	await accepted(scene);
});

test("an SVG becomes a PNG with no browser", async () => {
	const png = await svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/></svg>');
	assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("looks are a default by name, an image URL, or random, and seats are dealt different portraits", () => {
	assert.ok(defaults("avatars").length >= 7 && defaults("backgrounds").length >= 5);
	assert.equal(choose("avatars", "noir-karn"), "noir-karn");
	assert.equal(choose("backgrounds", "https://example.com/table.png"), "https://example.com/table.png");
	assert.throws(() => choose("avatars", "Karn"), /Choose .*noir-karn.*random, or an http\(s\) image URL/);
	assert.throws(() => choose("avatars", "file:///etc/passwd"));
	const looks = deal(4);
	assert.equal(new Set(looks.map((one) => one.avatar)).size, 4, "a different portrait for each seat while the defaults last");
	assert.ok(looks.every((one) => defaults("backgrounds").includes(one.background)));
	assert.equal(choose("avatars", "random", defaults("avatars").slice(1)), defaults("avatars")[0], "random avoids portraits taken");
	assert.match(imageOf("avatars", "noir-karn")!, /^data:image\/jpeg;base64,/);
	assert.equal(imageOf("avatars", "https://example.com/me.png"), "https://example.com/me.png");
	assert.equal(imageOf("avatars", "gone-from-this-version"), undefined, "a name this version lacks draws nothing");
	assert.ok(defaults("backgrounds").every((one) => colorsFor(one)), "every default background brings its frame colours");
	assert.equal(colorsFor("https://example.com/table.png"), undefined);
	assert.deepEqual(chooseColors("2A1040", "#cbb8e6"), { primary: "#2a1040", secondary: "#cbb8e6" });
	assert.throws(() => chooseColors("purple", "#cbb8e6"), /primary and a secondary hex colour/);
	assert.throws(() => chooseColors("#2a1040", undefined), /primary and a secondary hex colour/);
});

test("a scene wears each seat's portrait and the viewer's background", async () => {
	const table = matchup("board-looks");
	const scene = cardboardScene(snap(table, 0), artIds(), { width: 800, height: 600 }, { avatars: { 1: "https://example.com/them.png" }, background: "https://example.com/table.jpg" });
	assert.deepEqual(scene.players.map((one) => (one as { avatarUrl?: string }).avatarUrl), [undefined, "https://example.com/them.png"]);
	assert.deepEqual([scene.view.mtg.background, (scene.view.mtg as { backgroundUrl?: string }).backgroundUrl], ["none", "https://example.com/table.jpg"]);
	assert.equal((cardboardScene(snap(table, 0), artIds(), { width: 800, height: 600 }).view.mtg as { backgroundUrl?: string }).backgroundUrl, undefined, "no look, a plain table");
	await accepted(scene);
	const drawer = await cardboardRenderer(new Map());
	if (!drawer) return;
	const Tabletop = (await import("cardboard-api/tabletop.mjs" as string)).default;
	const svg = await drawer.svg(snap(table, 0), { width: 800, height: 600 }, { avatars: { 0: "noir-karn", 1: "http://127.0.0.1:9/gone.png" }, background: "dragonforge-arena" });
	assert.ok(svg.includes(`href="${imageOf("backgrounds", "dragonforge-arena")}"`), "the background is drawn");
	assert.ok(svg.includes(imageOf("avatars", "noir-karn")!), "the portrait is drawn");
	assert.ok(svg.includes(imageOf("avatars", defaults("avatars")[1])!), "a portrait that does not load gives way to a default, never an initial");
	assert.ok(svg.includes(Tabletop.mtg.palette(colorsFor("dragonforge-arena")).gold), "a default background brings its frame colours");
	const set = await drawer.svg(snap(table, 0), { width: 800, height: 600 }, { background: "dragonforge-arena", colors: { primary: "#0f2a40", secondary: "#8fd6ec" } });
	assert.ok(set.includes(Tabletop.mtg.palette({ primary: "#0f2a40", secondary: "#8fd6ec" }).panel) && !set.includes(Tabletop.mtg.palette(colorsFor("dragonforge-arena")).gold), "colours set win over the background's");
});

test("an image URL in a picture is fetched for it; one that fails is left out", async () => {
	const red = await svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#ff0000"/></svg>');
	const server = createServer((request, response) => {
		if (request.url === "/red.png") { response.writeHead(200, { "content-type": "image/png" }); response.end(red); }
		else { response.writeHead(404); response.end(); }
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	try {
		const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		const picture = (href: string) => svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#0000ff"/><image href="${href}" width="4" height="4"/></svg>`);
		const { Resvg } = await import("@resvg/resvg-js");
		const pixel = async (png: Uint8Array) => [...new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><image href="data:image/png;base64,${Buffer.from(png).toString("base64")}" width="4" height="4"/></svg>`).render().pixels.slice(0, 3)];
		assert.deepEqual(await pixel(await picture(`${base}/red.png`)), [255, 0, 0], "the fetched image is drawn");
		assert.deepEqual(await pixel(await picture(`${base}/missing.png`)), [0, 0, 255], "a missing image leaves what is under it");
	} finally { server.close(); }
});
