/**
 * The seam between a board snapshot and a picture. A renderer turns a snapshot into SVG;
 * resvg turns SVG into PNG with no browser. Swapping the look means swapping the renderer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BoardSnapshot } from "./snapshot.ts";

export type BoardSize = { width: number; height: number };
export type BoardRenderer = { name: string; svg(snapshot: BoardSnapshot, size: BoardSize): Promise<string> };

/** Card name to one Scryfall printing, for art only (cards/standard.art.tsv, built by tools/card-art.ts). */
export function artIds(path = join(import.meta.dirname, "..", "..", "cards", "standard.art.tsv")): Map<string, string> {
	const rows = readFileSync(path, "utf8").split("\n").filter((line) => line && !line.startsWith("#")).slice(1);
	return new Map(rows.map((line) => line.split("\t") as [string, string]));
}

/** SVG to PNG. System fonts are loaded for each picture, which costs about half a second. */
export async function svgToPng(svg: string): Promise<Uint8Array> {
	const { Resvg } = await import("@resvg/resvg-js");
	return new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng();
}

export async function boardPng(renderer: BoardRenderer, snapshot: BoardSnapshot, size: BoardSize = { width: 1600, height: 1200 }): Promise<Uint8Array> {
	return svgToPng(await renderer.svg(snapshot, size));
}
