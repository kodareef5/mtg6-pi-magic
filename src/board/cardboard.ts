/**
 * The interim renderer: a board snapshot as a cardboard-api scene in its MTG 26 preset. That package
 * (an optional dependency) draws the SVG and fetches card art from Scryfall into a disk cache. Look and
 * layout are its business; this file only maps Magic facts onto its zones, references and annotations.
 */
import { STEPS, type Step } from "../core/steps.ts";
import type { BoardCard, BoardSnapshot } from "./snapshot.ts";
import type { BoardRenderer, BoardSize } from "./render.ts";

const COLORS = ["#e2b878", "#8fb3d9", "#b9d48a", "#d993b8"];
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
type Place = { playerId: string; zoneId: string; index: number };

/** The cardboard request for a snapshot. Pure, so the mapping is testable without the package. */
export function cardboardScene(snapshot: BoardSnapshot, art: ReadonlyMap<string, string>, size: BoardSize) {
	const definitions = new Map<string, Record<string, string>>(), annotations: Record<string, unknown>[] = [], highlights: Record<string, unknown>[] = [];
	const where = new Map<string, Place>();
	const define = (one: BoardCard) => {
		const id = one.name ? `${one.token ? "t" : "c"}-${slug(one.name)}` : "hidden";
		const scryfallId = !one.token && one.name ? art.get(one.name) : undefined;
		if (!definitions.has(id)) definitions.set(id, { id, name: one.name ?? "Face-down card", ...(scryfallId ? { scryfallId } : {}) });
		return id;
	};
	const targeted = new Set(snapshot.stack.flatMap((item) => item.targets.filter((aim): aim is string => typeof aim === "string")));
	const zone = (playerId: string, id: string, name: string, layout: string, cards: BoardCard[], visibility = "public") => {
		cards.forEach((one, index) => {
			const target = { playerId, zoneId: id, index };
			where.set(one.id, target);
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
		return { id: playerId, name: seat.name, color: COLORS[at % COLORS.length]!,
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
			mtg: { focus: "table", background: "sunrise", step: label, lands, combat, stack: snapshot.stack.flatMap((item) => where.get(item.id) ?? []),
				...(snapshot.turn ? { turn: snapshot.turn } : {}), ...(phase ? { phase } : {}),
				...(snapshot.active !== undefined ? { activePlayerId: `p${snapshot.active}` } : {}) },
		},
		extras: { highlights, cards: annotations, focus: null },
	};
}

/** The renderer, or null when cardboard-api is not installed. Card art is cached under `cache`. */
export async function cardboardRenderer(art: ReadonlyMap<string, string>, cache?: string): Promise<BoardRenderer | null> {
	if (cache) process.env.TABLETOP_SCRYFALL_CACHE ??= cache;
	let Tabletop: { renderAsync(request: unknown): Promise<string> };
	try { Tabletop = (await import("cardboard-api/tabletop.mjs" as string)).default; } catch { return null; }
	return { name: "cardboard-api", svg: (snapshot, size) => Tabletop.renderAsync(cardboardScene(snapshot, art, size)) };
}
