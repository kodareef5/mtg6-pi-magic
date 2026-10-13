/**
 * The seam between a board snapshot and a picture. A renderer turns a snapshot into SVG;
 * resvg turns SVG into PNG with no browser. Swapping the look means swapping the renderer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SeatId } from "../core/types.ts";
import type { Colors } from "./looks.ts";
import type { BoardSnapshot } from "./snapshot.ts";

export type BoardSize = { width: number; height: number };
/** What a picture is dressed in: each seat's portrait, the background and the frame colours, as in looks.ts. */
export type Dress = { avatars?: Partial<Record<SeatId, string>>; background?: string; colors?: Colors };
export type BoardRenderer = { name: string; svg(snapshot: BoardSnapshot, size: BoardSize, dress?: Dress): Promise<string> };

/** Card name to one Scryfall printing, for art only (cards/standard.art.tsv, built by tools/card-art.ts). */
export function artIds(path = join(import.meta.dirname, "..", "..", "cards", "standard.art.tsv")): Map<string, string> {
	const rows = readFileSync(path, "utf8").split("\n").filter((line) => line && !line.startsWith("#")).slice(1);
	return new Map(rows.map((line) => line.split("\t") as [string, string]));
}

/** An image URL a picture names, fetched once a session. One that fails is left out, and a portrait shows initials instead. */
const fetched = new Map<string, Promise<Buffer | undefined>>();
export function fetchImage(href: string): Promise<Buffer | undefined> {
	if (!fetched.has(href)) fetched.set(href, fetch(href, { signal: AbortSignal.timeout(10_000) }).then(async (response) => {
		if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) return undefined;
		const bytes = Buffer.from(await response.arrayBuffer());
		return bytes.length <= 8_000_000 ? bytes : undefined;
	}).catch(() => undefined));
	return fetched.get(href)!;
}

/** SVG to PNG. System fonts are loaded for each picture, which costs about half a second. */
export async function svgToPng(svg: string): Promise<Uint8Array> {
	const { Resvg } = await import("@resvg/resvg-js");
	const drawing = new Resvg(svg, { font: { loadSystemFonts: true } });
	for (const href of drawing.imagesToResolve()) {
		const bytes = await fetchImage(href);
		if (bytes) drawing.resolveImage(href, bytes);
	}
	return drawing.render().asPng();
}

export async function boardPng(renderer: BoardRenderer, snapshot: BoardSnapshot, dress?: Dress, size: BoardSize = { width: 1920, height: 1080 }): Promise<Uint8Array> {
	return svgToPng(await renderer.svg(snapshot, size, dress));
}
