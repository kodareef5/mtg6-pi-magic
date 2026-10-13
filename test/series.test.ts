/**
 * A game as pictures. Replaying a journal yields a moment each time something
 * visible happened, as the audience and each seat saw it, with the lines that
 * say what; a moment that leaves every board as it was joins the one before; a
 * seat sees its own hand and the audience none; and a replay keeps every
 * scene for a page that draws any perspective with cardboard, in its board's
 * colours.
 */
import { strict as assert } from "node:assert";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { open, replay, save, type Header } from "../src/core/journal.ts";
import { play } from "../src/core/loop.ts";
import type { Player } from "../src/core/player.ts";
import type { Frame } from "../src/core/types.ts";
import { load } from "../src/core/cards.ts";
import { artIds, type Dress } from "../src/board/render.ts";
import { gameStats, writeReplay } from "../src/board/replay.ts";
import { playByPlay } from "../src/board/series.ts";

const made: Header = {
	id: "pictured", format: standard.name, seed: "pictured",
	seats: [{ id: 0, name: "A", deck: deck("Green Stompy") }, { id: 1, name: "B", deck: deck("Dimir Control") }],
	cards: { path: "cards/standard.tsv", generated: "2026-10-03" }, rules: { path: "rules/cr.tsv", effective: "September 25, 2026" }, created: "2026-10-13T00:00:00.000Z",
};
const dealt = () => start(standard, made.seats.map((at) => ({ name: at.name, deck: at.deck })), made.seed);
const landsFirst = (frame: Frame): string => { const options = frame.decision!.options; return (options.find((option) => option.id.startsWith("land:")) ?? options[0]!).id; };
const steady = (name: string): Player => ({ name, observe() {}, close() {}, async answer(frame) { return { kind: "pick", option: landsFirst(frame), actionId: `${name}-${frame.version}` }; } });

async function savedGame(): Promise<string> {
	const table = dealt(), journal = open(join(mkdtempSync(join(tmpdir(), "series-")), "pictured.jsonl"), made), stop = new Error("stop");
	try { await play(table, { 0: steady("A"), 1: steady("B") }, {}, { watch: () => { if (table.cursor.turn > 3) throw stop; } }); }
	catch (error) { if (error !== stop) throw error; }
	save(journal, table);
	return journal.path;
}
function series(path: string) {
	const seen = playByPlay(made.seats.map((one) => ({ id: one.id, name: one.name })));
	const back = replay(path, dealt, undefined, undefined, { observe: (table) => seen.take(table) });
	seen.take(back.table);
	return { moments: seen.moments, viewers: seen.viewers, table: back.table };
}

test("a replayed game is a moment each time something visible happened, as the audience and each seat saw it", async () => {
	const { moments, viewers } = series(await savedGame());
	assert.deepEqual(viewers, ["spectator", 0, 1]);
	assert.ok(moments.length >= 6, `a moment for the deal, the keeps and each land: ${moments.length}`);
	assert.ok(moments.every((one) => one.views.length === 3 && one.views.some((view) => view.lines.length)), "every moment says what happened to someone");
	assert.ok(moments.some((one) => one.views[0]!.lines.some((line) => /into battlefield \(play-land\)/.test(line))));
	const boards = (one: (typeof moments)[number]) => JSON.stringify(one.views.map((view) => ({ ...view.snapshot, step: undefined })));
	assert.ok(moments.every((one, at) => at === 0 || boards(one) !== boards(moments[at - 1]!)), "a moment that leaves every board as it was joins the one before");
	assert.ok(moments.every((one) => one.views[0]!.snapshot.seats.every((seat) => !seat.handCards)), "the audience sees no hand");
	assert.ok(moments.some((one) => one.views[2]!.snapshot.seats[1]!.handCards?.length) && moments.every((one) => !one.views[2]!.snapshot.seats[0]!.handCards),
		"a seat sees its own hand and no other");
	assert.ok(moments.some((one) => one.views[1]!.lines.some((line) => /^A put (?!an unknown card)\S.* into hand \(draw\)/.test(line))), "a seat's lines name its own draws");
	assert.ok(moments.every((one) => !one.views[0]!.lines.some((line) => /put (?!an unknown card)\S.* into hand \(draw\)/.test(line))), "the audience's never do");
});

test("a replay holds every moment's scene for each perspective, its art and looks once, and a page that draws them with cardboard", async () => {
	const { moments, viewers, table } = series(await savedGame()), dir = mkdtempSync(join(tmpdir(), "replay-"));
	const stats = gameStats(table, "2026-10-13T12:00:00.000Z", { elapsedMs: 754_000, calls: 12, input: 40_000, output: 3_000, cost: 0.4, roles: [{ role: "decide", calls: 10, cost: 0.1 }] });
	const facts = Object.fromEntries(stats.game);
	assert.equal(facts.Result, "Unfinished");
	assert.match(facts.Decisions!, new RegExp(`^${table.ledger.length}: `));
	assert.deepEqual([facts["Wall time"], facts.Cost], ["12m 34s", "$0.40 (decide $0.10)"]);
	assert.ok(stats.seats.every((seat) => seat.counts.find(([what]) => what === "Lands played")![1] >= 1), "each seat played a land");
	moments[1]!.views[0]!.lines.push("A line that says </script><script>alert(1)</script>");
	const looks: Record<string, Dress> = { spectator: { background: "dragonforge-arena" }, 0: { avatars: { 0: "noir-karn" }, colors: { primary: "#2a1040", secondary: "#cbb8e6" } }, 1: {} };
	const asked: string[] = [];
	const written = await writeReplay(dir, moments, viewers, { title: "A vs B", subtitle: "pictured", stats, dress: (viewer) => looks[String(viewer)]!, art: artIds(), cards: load(join(import.meta.dirname, "..", "cards", "standard.tsv")),
		resolveArt: async (definitions) => { asked.push(...definitions.map((one) => one.id!)); return Object.fromEntries(definitions.filter((one) => one.scryfallId).map((one) => [`art:${one.id}`, "data:image/jpeg;base64,AA=="])); } });
	assert.equal(written.scenes, moments.length * 3);
	assert.deepEqual(readdirSync(dir).sort(), ["cardboard", "game.js", "index.html"]);
	assert.deepEqual(readdirSync(join(dir, "cardboard")).sort(), ["engine.js", "extras.js", "layout.js", "mtg-layout.js", "mtg-renderer.js", "perspective.js", "renderer.js", "scryfall.js"]);
	const text = readFileSync(join(dir, "game.js"), "utf8");
	assert.equal(text.match(/<\/script>/g), null, "a line cannot close a script");
	const game = JSON.parse(text.replace(/^window\.GAME = /, "").replace(/;\n$/, ""));
	assert.deepEqual(game.perspectives.map((one: { key: string; label: string }) => [one.key, one.label]), [["audience", "Audience"], ["seat-0", "A"], ["seat-1", "B"]]);
	assert.equal(game.perspectives[2].theme.accent, "#d9bf84", "a board with no colours of its own wears the original gold");
	assert.equal(new Set(game.perspectives.map((one: { theme: { accent: string } }) => one.theme.accent)).size, 3);
	assert.equal(game.moments.length, moments.length);
	assert.equal(new Set(asked).size, asked.length, "each card definition's art is asked for once");
	assert.ok(game.deck.every((one: { id: string }) => asked.includes(one.id)) && game.deck.length === asked.length);
	// Scenes name shared images rather than repeat them.
	const scenes = game.moments.flatMap((one: { views: { scene: { players: { avatarUrl?: string }[]; view: { mtg: { backgroundUrl?: string; colors?: unknown } } } }[] }) => one.views.map((view) => view.scene));
	const named = new Set(scenes.flatMap((one: { players: { avatarUrl?: string }[]; view: { mtg: { backgroundUrl?: string } } }) => [one.view.mtg.backgroundUrl, ...one.players.map((player) => player.avatarUrl)]).filter(Boolean));
	assert.ok([...named].every((one) => /^@[0-9a-f]{16}$/.test(String(one)) && game.images[String(one).slice(1)]?.startsWith("data:image/jpeg")), "every image is named once and kept once");
	assert.equal(game.moments[0].views[1].scene.view.mtg.colors.primary, "#2a1040", "seat 0's board in the colours set for it");
	assert.equal(game.moments[0].views[0].scene.view.mtg.colors.primary, "#3d1410", "the audience's in its dragonforge's own");
	assert.ok(scenes.every((one: { decks?: unknown }) => !one.decks), "the deck is kept once, not in every scene");
	// The audience's scenes never name a card in a hand; a seat's name its own.
	const hands = (view: number) => game.moments.flatMap((one: { views: { scene: { players: { id: string; zones: { id: string; cardIds: string[] }[] }[] } }[] }) =>
		one.views[view]!.scene.players.flatMap((player) => player.zones.filter((zone) => zone.id === "hand").flatMap((zone) => zone.cardIds.map((id) => `${player.id}:${id}`))));
	assert.deepEqual(hands(0), [], "the audience sees no hand");
	assert.ok(hands(2).some((one: string) => one.startsWith("p1:c-")) && !hands(2).some((one: string) => one.startsWith("p0:")), "seat 1 sees its own hand and no other");
	const forest = Object.entries(game.cards).find(([, card]) => (card as { name: string }).name === "Forest");
	assert.ok(forest && (forest[1] as { type: string }).type.includes("Land"), "a card's printed text rides along for the page");
	const page = readFileSync(join(dir, "index.html"), "utf8"), script = /<script>\n([^]*)<\/script>/.exec(page)![1]!;
	assert.doesNotThrow(() => new Function(script), "the page's script compiles");
	assert.ok(["engine", "extras", "perspective", "layout", "scryfall", "renderer", "mtg-layout", "mtg-renderer", "game"].every((name) => page.includes(`src="${name === "game" ? "game.js" : `cardboard/${name}.js`}"`)));
});

test("the page's own data draws in cardboard as the page draws it", async () => {
	const Tabletop = await import("cardboard-api/tabletop.mjs" as string).then((one) => one.default, () => null);
	if (!Tabletop) return;
	const { moments, viewers } = series(await savedGame()), dir = mkdtempSync(join(tmpdir(), "replay-drawn-"));
	await writeReplay(dir, moments, viewers, { title: "A vs B", subtitle: "", dress: () => ({ background: "sunken-citadel" }), art: new Map(), cards: load(join(import.meta.dirname, "..", "cards", "standard.tsv")), resolveArt: async () => ({}) });
	const game = JSON.parse(readFileSync(join(dir, "game.js"), "utf8").replace(/^window\.GAME = /, "").replace(/;\n$/, ""));
	for (const [at, moment] of game.moments.entries()) for (const view of moment.views) {
		// What the page's scene() does, then what draw() does.
		const scene = structuredClone(view.scene);
		scene.decks = [{ id: "board", name: "Board", cards: game.deck }]; scene.activeDeckId = "board";
		for (const player of scene.players) if (player.avatarUrl?.startsWith("@")) player.avatarUrl = game.images[player.avatarUrl.slice(1)];
		if (scene.view.mtg.backgroundUrl?.startsWith("@")) scene.view.mtg.backgroundUrl = game.images[scene.view.mtg.backgroundUrl.slice(1)];
		const svg = Tabletop.renderDetailed(Tabletop.normalize(scene), { assets: new Map() }).svg;
		assert.match(svg, /^<svg /, `moment ${at + 1}`);
	}
});
