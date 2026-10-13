/**
 * The interim renderer: a board snapshot as a cardboard-api scene in its MTG 26 preset. That package
 * (an optional dependency) draws the SVG and fetches card art from Scryfall into a disk cache. Look and
 * layout are its business; this file only maps Magic facts onto its zones, references and annotations,
 * and dresses the table in the seats' portraits and the viewer's background.
 */
import { createHash } from "node:crypto";
import { STEPS, type Step } from "../core/steps.ts";
import type { SeatId } from "../core/types.ts";
import { colorsFor, defaults, imageOf, isUrl, type Colors } from "./looks.ts";
import { fetchImage } from "./render.ts";
import type { BoardCard, BoardSnapshot } from "./snapshot.ts";
import type { BoardRenderer, BoardSize } from "./render.ts";

const COLORS = ["#e2b878", "#8fb3d9", "#b9d48a", "#d993b8"];
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** Within cardboard's limits of 100 characters for an id and 150 for a name. An ability on the stack is named by its text. */
const cardId = (prefix: string, name: string) => {
	const plain = `${prefix}-${slug(name)}`;
	return plain.length <= 100 ? plain : `${plain.slice(0, 88)}-${createHash("sha256").update(name).digest("hex").slice(0, 10)}`;
};
const cardName = (name: string) => name.length <= 150 ? name : `${name.slice(0, 149)}…`;
export type Place = { playerId: string; zoneId: string; index: number };

/**
 * Where each card a snapshot shows sits in its scene: the player, the zone and
 * the place in it, as cardboard names a card. A seat's page finds a card by
 * these, never by its engine id, which names the card's place in its deck's
 * registered list even while it is face down.
 */
export function boardPlaces(snapshot: BoardSnapshot): Map<string, Place> {
	const where = new Map<string, Place>(), land = (one: BoardCard) => one.types.includes("land");
	for (const seat of snapshot.seats) {
		const playerId = `p${seat.id}`;
		const zones: [string, { id: string }[]][] = [["battlefield", [...seat.battlefield.filter((one) => !land(one)), ...seat.battlefield.filter(land)]],
			["graveyard", seat.graveyard], ["exile", seat.exile], ["hand", seat.handCards ?? []], ["stack", snapshot.stack.filter((item) => item.controller === seat.id)]];
		for (const [zoneId, cards] of zones) cards.forEach((one, index) => where.set(one.id, { playerId, zoneId, index }));
	}
	return where;
}

/** The cardboard request for a snapshot, with each seat's portrait and the background as image URLs, and the frame colours. Pure, so the mapping is testable without the package. */
export function cardboardScene(snapshot: BoardSnapshot, art: ReadonlyMap<string, string>, size: BoardSize,
	images: { avatars?: Partial<Record<SeatId, string>>; background?: string; colors?: Colors } = {}) {
	const avatars = images.avatars ?? {};
	const definitions = new Map<string, Record<string, string>>(), annotations: Record<string, unknown>[] = [], highlights: Record<string, unknown>[] = [];
	const where = boardPlaces(snapshot);
	const define = (one: BoardCard) => {
		const id = one.name ? cardId(one.token ? "t" : "c", one.name) : "hidden";
		const scryfallId = !one.token && one.name ? art.get(one.name) : undefined;
		if (!definitions.has(id)) definitions.set(id, { id, name: one.name ? cardName(one.name) : "Face-down card", ...(scryfallId ? { scryfallId } : {}) });
		return id;
	};
	const targeted = new Set(snapshot.stack.flatMap((item) => item.targets.filter((aim): aim is string => typeof aim === "string")));
	const zone = (playerId: string, id: string, name: string, layout: string, cards: BoardCard[], visibility = "public") => {
		cards.forEach((one, index) => {
			const target = { playerId, zoneId: id, index };
			const tags = [...(one.token ? ["Token"] : []), ...(one.attacking ? ["Attacking"] : []), ...(one.blocking ? ["Blocking"] : []), ...(one.words ?? [])].slice(0, 6);
			const counters = Object.entries(one.counters ?? {}).map(([kind, count]) => ({ id: slug(kind), name: kind, count }));
			const badge = one.power !== undefined ? `${one.power} / ${one.toughness}${one.damage ? ` (${one.damage} dmg)` : ""}` : undefined;
			if (one.tapped || badge || tags.length || counters.length) annotations.push({ target, ...(one.tapped ? { tapped: true } : {}), ...(badge ? { badge } : {}),
				...(tags.length ? { tags } : {}), ...(counters.length ? { counters } : {}) });
			if (one.attacking) highlights.push({ target, preset: "neon" });
			else if (targeted.has(one.id)) highlights.push({ target, preset: "arcane" });
		});
		return { id, name, layout, visibility, faceDown: false, count: cards.length, cardIds: cards.map(define), offset: 0 };
	};
	const hidden = (id: string, name: string, layout: string, count: number) => ({ id, name, layout, visibility: "hidden", faceDown: true, count, cardIds: [], offset: 0 });
	// Lands sit on the preset's land rail: positions within the battlefield, after the other permanents.
	const lands: Record<string, number[]> = {};
	const players = snapshot.seats.map((seat, at) => {
		const playerId = `p${seat.id}`, land = (one: BoardCard) => one.types.includes("land");
		const others = seat.battlefield.filter((one) => !land(one)), rail = seat.battlefield.filter(land);
		lands[playerId] = rail.map((_, index) => others.length + index);
		return { id: playerId, name: seat.name, color: COLORS[at % COLORS.length]!, ...(avatars[seat.id] ? { avatarUrl: avatars[seat.id] } : {}),
			stats: { life: seat.life }, counters: [{ id: "life", name: "Life", count: seat.life }],
			zones: [
				hidden("library", "Library", "stack", seat.library),
				zone(playerId, "battlefield", "Battlefield", "grid", [...others, ...rail]),
				zone(playerId, "graveyard", "Graveyard", "stack", seat.graveyard),
				zone(playerId, "exile", "Exile", "stack", seat.exile),
				seat.handCards ? zone(playerId, "hand", "Hand", "fan", seat.handCards, "owner") : hidden("hand", "Hand", "fan", seat.hand),
				zone(playerId, "command", "Command", "grid", []),
				zone(playerId, "stack", "Stack", "grid", snapshot.stack.filter((item) => item.controller === seat.id)),
			] };
	});
	const onField = (id: string) => where.get(id)?.zoneId === "battlefield" ? where.get(id)! : undefined;
	// A creature that left the battlefield is out of combat; the preset refuses a reference to it.
	const combat = (snapshot.combat ?? []).flatMap((fight) => {
		const attacker = onField(fight.attacker);
		return attacker ? [{ attacker, defenderId: `p${fight.defending}`, blockers: fight.blockers.flatMap((id) => onField(id) ?? []) }] : [];
	});
	const step = snapshot.step as Step | undefined, phase = step && STEPS[step]?.phase;
	const label = snapshot.finished ? "Game over" : step ? (step[0]!.toUpperCase() + step.slice(1)).replace(/-/g, " ") : "Opening hands";
	// The preset needs one card definition; before anything is visible, the back of a card.
	if (!definitions.size) definitions.set("hidden", { id: "hidden", name: "Face-down card" });
	return {
		theme: "mtg26", stage: { width: size.width, height: size.height }, activeDeckId: "board",
		decks: [{ id: "board", name: "Board", cards: [...definitions.values()] }], players,
		view: {
			...(snapshot.viewer === "spectator" ? { mode: "overview", viewerId: null } : { mode: "player", viewerId: `p${snapshot.viewer}` }),
			mtg: { focus: "table", background: "none", ...(images.background ? { backgroundUrl: images.background } : {}), ...(images.colors ? { colors: images.colors } : {}), step: label, lands, combat, stack: snapshot.stack.flatMap((item) => where.get(item.id) ?? []),
				...(snapshot.turn ? { turn: snapshot.turn } : {}), ...(phase ? { phase } : {}),
				...(snapshot.active !== undefined ? { activePlayerId: `p${snapshot.active}` } : {}) },
		},
		extras: { highlights, cards: annotations, focus: null },
	};
}

type Tabletop = { renderAsync(request: unknown): Promise<string>; resolveScryfall(cards: unknown[]): Promise<Map<string, string>> };
/** cardboard-api, or null when it is not installed. Card art is cached under `cache`. */
async function tabletop(cache?: string): Promise<Tabletop | null> {
	if (cache) process.env.TABLETOP_SCRYFALL_CACHE ??= cache;
	try { return (await import("cardboard-api/tabletop.mjs" as string)).default as Tabletop; } catch { return null; }
}

/** Card art for scene definitions, keyed as cardboard looks it up, so a page can draw them with no network. Null without the package. */
export async function cardboardArt(definitions: Record<string, string>[], cache?: string): Promise<Record<string, string> | null> {
	const Tabletop = await tabletop(cache);
	return Tabletop && Object.fromEntries(await Tabletop.resolveScryfall(definitions));
}

/** The renderer, or null when cardboard-api is not installed. Card art is cached under `cache`. */
export async function cardboardRenderer(art: ReadonlyMap<string, string>, cache?: string): Promise<BoardRenderer | null> {
	const Tabletop = await tabletop(cache);
	if (!Tabletop) return null;
	return { name: "cardboard-api", async svg(snapshot, size, dress = {}) {
		const avatars = Object.fromEntries(await Promise.all(snapshot.seats.map(async (seat) => [seat.id, await portrait(dress.avatars?.[seat.id], seat.id)] as const)));
		const background = imageOf("backgrounds", dress.background), colors = dress.colors ?? colorsFor(dress.background);
		return Tabletop.renderAsync(cardboardScene(snapshot, art, size, { avatars, ...(background ? { background } : {}), ...(colors ? { colors } : {}) }));
	} };
}

/** A seat's portrait to draw: its own if it loads, else a default, so a seat is never only an initial. */
export async function portrait(look: string | undefined, seat: SeatId): Promise<string | undefined> {
	const own = !look ? undefined : isUrl(look) ? await fetchImage(look) && look : imageOf("avatars", look);
	const standing = defaults("avatars");
	return own || imageOf("avatars", standing[seat % standing.length]);
}
