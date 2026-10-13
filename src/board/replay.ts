/**
 * A saved game as a page to replay in a browser. Every moment's board, as the
 * audience and each seat saw it, is a cardboard-api scene that the page draws
 * live with cardboard's own browser scripts: switch perspective at any moment,
 * hover a card for its details, click one to bring it forward. Beside the
 * board: what that viewer saw happen, each seat's counts, life over the game,
 * and the game's totals. The page wears the frame colours of the board being
 * looked at. The folder holds the page, the game's data with its card art, and
 * cardboard's scripts, so it opens with no network.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Universe } from "../core/cards.ts";
import type { Table } from "../core/table.ts";
import type { Viewer } from "../core/types.ts";
import { cardboardScene, portrait } from "./cardboard.ts";
import { colorsFor, imageOf, type Colors } from "./looks.ts";
import type { Dress } from "./render.ts";
import { viewerKey, when, type Moment } from "./series.ts";

/** What the game's records count, per seat and for the game, and what its run cost when a result was saved. */
export type Stats = { seats: { name: string; deck: string; result?: string; counts: [string, number][] }[]; game: [string, string][] };

/** The run's own numbers, from its saved result: time, model calls and what they cost. */
export type Run = { elapsedMs: number; calls: number; input: number; output: number; cost: number; roles: { role: string; calls: number; cost: number }[] };

/** Counted from the game's log and ledger after a replay, so any saved game has them. */
export function gameStats(table: Table, played?: string, run?: Run): Stats {
	const tokens = new Map<string, number>();
	const owner = (id: string) => /^(\d+)-/.test(id) ? Number(/^(\d+)-/.exec(id)![1]) : tokens.get(id);
	const counts = table.seats.map(() => new Map<string, number>());
	const add = (seat: number | undefined, what: string, amount = 1) => { if (seat !== undefined && counts[seat]) counts[seat]!.set(what, (counts[seat]!.get(what) ?? 0) + amount); };
	for (const entry of table.log) for (const change of entry.changes as unknown as Record<string, unknown>[]) {
		if (change.do === "token") tokens.set(String(change.id), Number(change.controller));
		if (change.do === "move") {
			const seat = owner(String(change.what)), reason = String(change.reason);
			if (reason === "play-land") add(seat, "Lands played");
			if (reason === "cast") add(seat, "Spells cast");
			if (reason === "draw" && entry.reason !== "game-setup") add(seat, "Cards drawn");
			if (reason === "discard") add(seat, "Cards discarded");
			if (reason === "destroy" || reason === "sacrifice") add(seat, "Permanents destroyed or sacrificed");
		}
		if (change.do === "attack") for (const one of change.attackers as { id: string }[]) add(owner(one.id), "Attackers declared");
		if (change.do === "damage" && (change.target as { player?: number }).player !== undefined)
			add(owner(String(change.source)), change.combat ? "Combat damage to players" : "Other damage to players", Number(change.amount));
	}
	const rows = table.ledger, by = (key: "why" | "by", value: string) => rows.filter((row) => row[key] === value).length;
	const winner = table.outcome && table.seats.filter((seat) => table.outcome!.results[seat.id] === "win").map((seat) => seat.name);
	const minutes = run && `${Math.floor(run.elapsedMs / 60_000)}m ${Math.round(run.elapsedMs / 1000) % 60}s`;
	return {
		seats: table.seats.map((seat, at) => ({ name: seat.name, deck: seat.deck.name, ...(table.outcome ? { result: table.outcome.results[seat.id] } : {}),
			counts: ["Lands played", "Spells cast", "Cards drawn", "Cards discarded", "Attackers declared", "Combat damage to players", "Other damage to players", "Permanents destroyed or sacrificed"]
				.map((what): [string, number] => [what, counts[at]!.get(what) ?? 0]) })),
		game: [
			["Result", !table.outcome ? "Unfinished" : winner?.length ? `${winner.join(" and ")} won on turn ${table.cursor.turn}` : `A draw on turn ${table.cursor.turn}`],
			["On the play", table.seats[0]?.name ?? "?"],
			...(played ? [["Played", new Date(played).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })] as [string, string]] : []),
			["Decisions", `${rows.length}: ${by("why", "chosen")} chosen, ${by("why", "forced")} forced, ${by("why", "fallback")} fallback, ${by("why", "timeout")} timeout`],
			["Chosen by", `models ${by("by", "model")}, people ${by("by", "person")}, the engine ${by("by", "engine")}`],
			...(run ? [
				["Wall time", minutes!],
				["Model calls", `${run.calls}, ${Math.round(run.input / 1000)}k tokens in, ${Math.round(run.output / 1000)}k out`],
				["Cost", `$${run.cost.toFixed(2)}${run.roles.length ? ` (${run.roles.map((one) => `${one.role} $${one.cost.toFixed(2)}`).join(", ")})` : ""}`],
			] as [string, string][] : []),
		],
	};
}

const COLORS = ["#e2b878", "#8fb3d9", "#b9d48a", "#d993b8"];
const ORIGINAL: Colors = { primary: "#133d33", secondary: "#d9bf84" };

/** A colour at the board palette's lightness, keeping the chosen hue and a share of its saturation, as the board's frames do. */
function tone(hex: string, shift: number, lightness: number, ratio: number): string {
	const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
	const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
	const h = !d ? 0 : max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
	const s = Math.min(1, (!d ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min)) * ratio), hue = ((h + shift) % 360 + 360) % 360 / 360;
	const q = lightness < 0.5 ? lightness * (1 + s) : lightness + s - lightness * s, p = 2 * lightness - q;
	const channel = (t: number) => { t = (t + 1) % 1; const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; return Math.round(v * 255).toString(16).padStart(2, "0"); };
	return `#${channel(hue + 1 / 3)}${channel(hue)}${channel(hue - 1 / 3)}`;
}
/** The page's colours for a board's frame colours: the table's darkest tone behind, its panel tone for panels, the trim for accents. */
const theme = (colors: Colors) => ({ bg: tone(colors.primary, 1, 0.045, 1.9), panel: tone(colors.primary, 6, 0.09, 1.16), raised: tone(colors.primary, 0, 0.13, 1),
	line: tone(colors.primary, 0, 0.22, 0.74), muted: tone(colors.primary, -24, 0.733, 0.31), accent: tone(colors.secondary, 0, 0.684, 1) });

/** cardboard-api's browser scripts the page loads, in order. */
const SCRIPTS = ["engine", "extras", "perspective", "layout", "scryfall", "renderer", "mtg-layout", "mtg-renderer"];

/**
 * Write the replay into `dir`: `index.html`, `game.js` with every scene, and
 * cardboard's scripts. `art` maps card names to printings; `resolveArt` turns
 * scene card definitions into image data, from the renderer's cache.
 */
export async function writeReplay(dir: string, moments: Moment[], viewers: Viewer[], options: {
	title: string; subtitle: string; stats?: Stats; dress(viewer: Viewer): Dress; art: ReadonlyMap<string, string>; cards: Universe;
	resolveArt(definitions: Record<string, string>[]): Promise<Record<string, string> | null>;
}): Promise<{ scenes: number; bytes: number }> {
	// Images go in once, by content; scenes name them, so a background is not repeated in every scene.
	const images: Record<string, string> = {};
	const image = (value: string | undefined) => {
		if (!value?.startsWith("data:")) return value;
		const key = createHash("sha256").update(value).digest("hex").slice(0, 16);
		images[key] = value;
		return `@${key}`;
	};
	const seats = moments[0]?.views[0]?.snapshot.seats ?? [], definitions = new Map<string, Record<string, string>>();
	const looks = await Promise.all(viewers.map(async (viewer) => {
		const dress = options.dress(viewer), background = image(imageOf("backgrounds", dress.background));
		const avatars = Object.fromEntries(await Promise.all(seats.map(async (seat) => [seat.id, image(await portrait(dress.avatars?.[seat.id], seat.id))] as const)));
		return { avatars, colors: dress.colors ?? colorsFor(dress.background), ...(background ? { background } : {}) };
	}));
	const scene = (view: Moment["views"][number], at: number) => {
		const look = looks[at]!, { decks, ...rest } = cardboardScene(view.snapshot, options.art, { width: 1920, height: 1080 },
			{ avatars: look.avatars, ...(look.background ? { background: look.background } : {}), ...(look.colors ? { colors: look.colors } : {}) });
		for (const card of decks[0]!.cards) definitions.set(card.id!, card as Record<string, string>);
		return rest;
	};
	const shown = moments.map((moment) => ({ when: when(moment.views[0]!.snapshot), turn: moment.views[0]!.snapshot.turn ?? 0,
		counts: moment.views[0]!.snapshot.seats.map((one) => [one.life, one.hand, one.library, one.battlefield.length, one.graveyard.length, one.exile.length]),
		views: moment.views.map((view, at) => ({ lines: view.lines, scene: scene(view, at) })) }));
	const deck = [...definitions.values()];
	const cards = Object.fromEntries(deck.flatMap((one) => {
		const card = options.cards.cards.get(one.name!);
		return one.id === "hidden" ? [] : [[one.id!, card ? { name: card.name, cost: card.mana, type: card.type, text: card.oracle, stats: card.stats } : { name: one.name }]];
	}));
	const data = {
		title: options.title, subtitle: options.subtitle, stats: options.stats ?? null, colors: COLORS, seats: seats.map((one) => one.name),
		perspectives: viewers.map((viewer, at) => ({ key: viewerKey(viewer), label: viewer === "spectator" ? "Audience" : seats.find((one) => one.id === viewer)?.name ?? `Seat ${viewer}`,
			theme: theme(looks[at]!.colors ?? ORIGINAL) })),
		images, art: await options.resolveArt(deck) ?? {}, cards, deck, moments: shown,
	};
	mkdirSync(join(dir, "cardboard"), { recursive: true });
	const cardboard = join(dirname(createRequire(import.meta.url).resolve("cardboard-api/package.json")), "js");
	for (const script of SCRIPTS) copyFileSync(join(cardboard, `${script}.js`), join(dir, "cardboard", `${script}.js`));
	copyFileSync(join(import.meta.dirname, "replay.html"), join(dir, "index.html"));
	const game = `window.GAME = ${JSON.stringify(data).replace(/</g, "\\u003c")};\n`;
	writeFileSync(join(dir, "game.js"), game);
	return { scenes: shown.length * viewers.length, bytes: Buffer.byteLength(game) };
}
