/**
 * The interim renderer: a board snapshot as a cardboard-api scene. That package (an optional
 * dependency) draws the SVG and fetches card art from Scryfall into a disk cache. Look and layout
 * are its business; this file only maps Magic facts onto its zones, annotations and highlights.
 */
import type { BoardCard, BoardSnapshot } from "./snapshot.ts";
import type { BoardRenderer, BoardSize } from "./render.ts";

const COLORS = ["#e2b878", "#8fb3d9", "#b9d48a", "#d993b8"];
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The cardboard request for a snapshot. Pure, so the mapping is testable without the package. */
export function cardboardScene(snapshot: BoardSnapshot, art: ReadonlyMap<string, string>, size: BoardSize) {
	const definitions = new Map<string, Record<string, string>>(), annotations: Record<string, unknown>[] = [], highlights: Record<string, unknown>[] = [];
	const define = (one: BoardCard) => {
		const id = one.name ? `${one.token ? "t" : "c"}-${slug(one.name)}` : "hidden";
		const scryfallId = !one.token && one.name ? art.get(one.name) : undefined;
		if (!definitions.has(id)) definitions.set(id, { id, name: one.name ?? "Face-down card", ...(scryfallId ? { scryfallId } : {}) });
		return id;
	};
	const targeted = new Set(snapshot.stack.flatMap((item) => item.targets.filter((aim): aim is string => typeof aim === "string")));
	const zone = (playerId: string, id: string, name: string, layout: string, cards: BoardCard[]) => {
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
		return { id, name, layout, visibility: "public", faceDown: false, count: cards.length, cardIds: cards.map(define), offset: 0 };
	};
	const players = snapshot.seats.map((seat, at) => {
		const playerId = `p${seat.id}`, lands = (one: BoardCard) => one.types.includes("land");
		return { id: playerId, name: seat.deck ? `${seat.name} · ${seat.deck}` : seat.name, color: COLORS[at % COLORS.length]!,
			stats: { life: seat.life }, counters: [{ id: "life", name: "Life", count: seat.life }],
			zones: [
				zone(playerId, "battlefield", "Battlefield", "grid", [...seat.battlefield.filter((one) => !lands(one)), ...seat.battlefield.filter(lands)]),
				seat.handCards ? zone(playerId, "hand", "Hand", "fan", seat.handCards)
					: { id: "hand", name: "Hand", layout: "fan", visibility: "hidden", faceDown: true, count: seat.hand, cardIds: [], offset: 0 },
				{ id: "library", name: "Library", layout: "stack", visibility: "hidden", faceDown: true, count: seat.library, cardIds: [], offset: 0 },
				zone(playerId, "graveyard", "Graveyard", "stack", seat.graveyard),
				zone(playerId, "exile", "Exile", "stack", seat.exile),
				zone(playerId, "stack", "Stack", "grid", snapshot.stack.filter((item) => item.controller === seat.id)),
			] };
	});
	const when = snapshot.finished ? "Game over" : snapshot.turn ? `Turn ${snapshot.turn} · ${snapshot.step?.replace(/-/g, " ")}` : "Opening";
	return { stage: { width: size.width, height: size.height, theme: "evergreen" }, activeDeckId: "board",
		decks: [{ id: "board", name: when, cards: [...definitions.values()] }], players, view: { mode: "overview" },
		extras: { highlights, cards: annotations, focus: null } };
}

/** The renderer, or null when cardboard-api is not installed. Card art is cached under `cache`. */
export async function cardboardRenderer(art: ReadonlyMap<string, string>, cache?: string): Promise<BoardRenderer | null> {
	if (cache) process.env.TABLETOP_SCRYFALL_CACHE ??= cache;
	let Tabletop: { renderAsync(request: unknown): Promise<string> };
	try { Tabletop = (await import("cardboard-api/tabletop.mjs" as string)).default; } catch { return null; }
	return { name: "cardboard-api", svg: (snapshot, size) => Tabletop.renderAsync(cardboardScene(snapshot, art, size)) };
}
