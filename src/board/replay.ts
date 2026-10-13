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
import type { Viewer } from "../core/types.ts";
import { cardboardScene, portrait } from "./cardboard.ts";
import { colorsFor, imageOf, isUrl, type Colors } from "./looks.ts";
import { imageData, type Dress } from "./render.ts";
import { viewerKey, when, type Moment } from "./series.ts";
import { boardKey } from "./snapshot.ts";

import type { Stats } from "./stats.ts";
export { gameStats, type Run, type Stats } from "./stats.ts";

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

export type ReplayOptions = {
	title: string; subtitle: string; stats?: Stats; dress(viewer: Viewer): Dress; art: ReadonlyMap<string, string>; cards: Universe;
	/** Card art for scene definitions, keyed as cardboard looks it up. */
	resolveArt(definitions: Record<string, string>[]): Promise<Record<string, unknown> | null>;
	/** How long a live board waits for new art before it is published without it, in milliseconds. A file waits for all of it. */
	artWait?: number;
};
/** A moment as the page shows it: a scene per viewer, what each saw, the key of each board, and every seat's counts. */
type Shown = { when: string; turn: number; counts: number[][]; views: { lines: string[]; scene: unknown; board: string }[] };

/**
 * The page's data, built a moment at a time: a file writes it whole, and a
 * live game sends what is new as it plays. Images, card definitions and card
 * art go in once, in the order they arrive, so a client that has the first n
 * of each needs only the rest. The last moment can still grow while play stays
 * in it, so an update always sends it again.
 *
 * Card art comes from a service that can be slow or down. A card is published
 * with its text at once, and its art follows whenever it comes; one that fails
 * is asked for again at most every 15 seconds. A board is never held back for
 * its pictures.
 */
export async function replayBuilder(seats: { id: number; name: string }[], viewers: Viewer[], options: ReplayOptions) {
	// Images go in once, by content; scenes name them, so a background is not repeated in every scene.
	const images = new Map<string, string>(), definitions = new Map<string, Record<string, string>>(), art: Record<string, unknown> = {}, cards: Record<string, unknown> = {};
	const image = (value: string | undefined) => {
		if (!value?.startsWith("data:")) return value;
		const key = createHash("sha256").update(value).digest("hex").slice(0, 16);
		images.set(key, value);
		return `@${key}`;
	};
	// An image given by URL is fetched and kept like a default one, so the page opens with no network.
	const embed = async (value: string | undefined) => value && isUrl(value) ? await imageData(value) : value;
	const looks = await Promise.all(viewers.map(async (viewer) => {
		const dress = options.dress(viewer), background = image(await embed(imageOf("backgrounds", dress.background)));
		const avatars = Object.fromEntries(await Promise.all(seats.map(async (seat) =>
			[seat.id, image(await embed(await portrait(dress.avatars?.[seat.id], seat.id)) ?? await portrait(undefined, seat.id))] as const)));
		return { avatars, colors: dress.colors ?? colorsFor(dress.background), ...(background ? { background } : {}) };
	}));
	const scene = (view: Moment["views"][number], at: number, fresh: Map<string, Record<string, string>>) => {
		const look = looks[at]!, { decks, ...rest } = cardboardScene(view.snapshot, options.art, { width: 1920, height: 1080 },
			{ avatars: look.avatars, ...(look.background ? { background: look.background } : {}), ...(look.colors ? { colors: look.colors } : {}) });
		for (const card of decks[0]!.cards) if (!definitions.has(card.id!)) fresh.set(card.id!, card as Record<string, string>);
		return rest;
	};
	const shown: Shown[] = [];
	let version = 0, sent = 0, retried = 0;
	// Definitions still without their art, and those being asked about now.
	const missing = new Map<string, Record<string, string>>(), asking = new Set<string>();
	const drawn = (one: Record<string, string>) => Object.keys(art).some((key) => key.startsWith(`${one.scryfallId}:`));
	async function draw(fresh: Record<string, string>[]) {
		const due = missing.size && Date.now() - retried > 15_000 ? [...missing.values()].filter((one) => !asking.has(one.id!)) : [];
		const wanted = [...fresh.filter((one) => one.scryfallId), ...due];
		if (!wanted.length) return;
		if (due.length) retried = Date.now();
		for (const one of wanted) { missing.set(one.id!, one); asking.add(one.id!); }
		const asked = Promise.resolve().then(() => options.resolveArt(wanted))
			.then((found) => { for (const [key, value] of Object.entries(found ?? {})) if (!(key in art)) art[key] = value; }, () => {})
			.finally(() => { for (const one of wanted) { asking.delete(one.id!); if (drawn(one)) missing.delete(one.id!); } });
		await (options.artWait === undefined ? asked : Promise.race([asked, new Promise((go) => setTimeout(go, options.artWait))]));
	}
	const perspectives = viewers.map((viewer, at) => ({ key: viewerKey(viewer), label: viewer === "spectator" ? "Audience" : seats.find((one) => one.id === viewer)?.name ?? `Seat ${viewer}`,
		theme: theme(looks[at]!.colors ?? ORIGINAL) }));
	return {
		/**
		 * Bring the shown moments up to `moments`: the last shown one again, since it may have grown, and every one
		 * after it, each new card with its text. True when there is anything new, art that came late included.
		 */
		async sync(moments: Moment[]): Promise<boolean> {
			const from = Math.max(0, shown.length - 1);
			if (moments.length === shown.length && moments.length && JSON.stringify(shown.at(-1)!.views.map((one) => one.lines)) === JSON.stringify(moments.at(-1)!.views.map((one) => one.lines))) {
				await draw([]);
				if (Object.keys(art).length === sent) return false;
				sent = Object.keys(art).length;
				version++;
				return true;
			}
			const fresh = new Map<string, Record<string, string>>(), built: Shown[] = [];
			for (let at = from; at < moments.length; at++) {
				// A long game's scenes are built in turns with whatever else this thread serves, a live table's seats among them.
				if (at > from && (at - from) % 20 === 0) await new Promise((go) => setImmediate(go));
				const moment = moments[at]!, first = moment.views[0]!.snapshot;
				built.push({ when: when(first), turn: first.turn ?? 0,
					counts: first.seats.map((one) => [one.life, one.hand, one.library, one.battlefield.length, one.graveyard.length, one.exile.length]),
					views: moment.views.map((view, index) => ({ lines: view.lines, scene: scene(view, index, fresh), board: boardKey(view.snapshot) })) });
			}
			for (const [id, one] of fresh) {
				definitions.set(id, one);
				const card = options.cards.cards.get(one.name!);
				if (id !== "hidden") cards[id] = card ? { name: card.name, cost: card.mana, type: card.type, text: card.oracle, stats: card.stats } : { name: one.name };
			}
			await draw([...fresh.values()]);
			sent = Object.keys(art).length;
			shown.splice(from, Infinity, ...built);
			version++;
			return true;
		},
		/** Everything, as a file holds it. */
		data(extra: Record<string, unknown> = {}) {
			return { title: options.title, subtitle: options.subtitle, stats: options.stats ?? null, colors: COLORS, seats: seats.map((one) => one.name), perspectives,
				images: Object.fromEntries(images), art, cards, deck: [...definitions.values()], moments: shown, version, ...extra };
		},
		/** What a client holding `moments` moments, `deck` definitions, `images` images and `art` pictures lacks, from its last moment on. */
		since(have: { moments: number; deck: number; images: number; art: number }) {
			const deck = [...definitions.values()].slice(have.deck), from = Math.max(0, Math.min(have.moments, shown.length) - 1);
			return { version, from, moments: shown.slice(from), deck, images: [...images].slice(have.images),
				cards: Object.fromEntries(deck.flatMap((one) => cards[one.id!] ? [[one.id!, cards[one.id!]]] : [])),
				art: Object.fromEntries(Object.entries(art).slice(have.art)) };
		},
		get version() { return version; },
	};
}

/** The page's data as `game.js` sets it. */
export const gameScript = (data: unknown) => `window.GAME = ${JSON.stringify(data).replace(/</g, "\\u003c")};\n`;

/** The files a replay folder holds beside `game.js`: the page, and cardboard's scripts by name. */
export const replayPage = () => join(import.meta.dirname, "replay.html");
export const cardboardScript = (name: string) => SCRIPTS.includes(name)
	? join(dirname(createRequire(import.meta.url).resolve("cardboard-api/package.json")), "js", `${name}.js`) : undefined;

/** Write a whole replay into `dir`: `index.html`, `game.js` with every scene, and cardboard's scripts. */
export async function writeReplay(dir: string, moments: Moment[], viewers: Viewer[], options: ReplayOptions): Promise<{ scenes: number; bytes: number }> {
	const built = await replayBuilder(moments[0]?.views[0]?.snapshot.seats ?? [], viewers, options);
	await built.sync(moments);
	mkdirSync(join(dir, "cardboard"), { recursive: true });
	for (const script of SCRIPTS) copyFileSync(cardboardScript(script)!, join(dir, "cardboard", `${script}.js`));
	copyFileSync(replayPage(), join(dir, "index.html"));
	const game = gameScript(built.data());
	writeFileSync(join(dir, "game.js"), game);
	return { scenes: moments.length * viewers.length, bytes: Buffer.byteLength(game) };
}
