/**
 * The seam between a board snapshot and a picture. A renderer turns a snapshot into SVG;
 * resvg turns SVG into pixels with no browser, encoded as PNG for a terminal to show or as WebP,
 * about a tenth the size, to keep. Swapping the look means swapping the renderer.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
const fetched = new Map<string, Promise<{ bytes: Buffer; type: string } | undefined>>();
function fetchOnce(href: string): Promise<{ bytes: Buffer; type: string } | undefined> {
	if (!fetched.has(href)) fetched.set(href, fetch(href, { signal: AbortSignal.timeout(10_000) }).then(async (response) => {
		const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
		if (!response.ok || !type.startsWith("image/")) return undefined;
		const bytes = Buffer.from(await response.arrayBuffer());
		return bytes.length <= 8_000_000 ? { bytes, type } : undefined;
	}).catch(() => undefined));
	return fetched.get(href)!;
}
export const fetchImage = async (href: string): Promise<Buffer | undefined> => (await fetchOnce(href))?.bytes;
/** An image URL as a data URL, for a page that must open with no network: only the formats cardboard takes. */
export async function imageData(href: string): Promise<string | undefined> {
	const got = await fetchOnce(href);
	return got && /^image\/(png|jpeg|webp|gif|avif)$/.test(got.type) ? `data:${got.type};base64,${got.bytes.toString("base64")}` : undefined;
}

/** A drawn picture: PNG for a terminal, WebP to keep. */
export type Picture = { png(): Uint8Array; webp(): Promise<Uint8Array> };

/** SVG to pixels. System fonts are loaded for each picture, which costs about half a second. */
export async function rasterize(svg: string): Promise<Picture> {
	const { Resvg } = await import("@resvg/resvg-js");
	const drawing = new Resvg(svg, { font: { loadSystemFonts: true } });
	for (const href of drawing.imagesToResolve()) {
		const bytes = await fetchImage(href);
		if (bytes) drawing.resolveImage(href, bytes);
	}
	const image = drawing.render();
	return { png: () => image.asPng(), webp: () => webp(image.pixels, image.width, image.height) };
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
	return (await rasterize(svg)).png();
}

export async function boardPicture(renderer: BoardRenderer, snapshot: BoardSnapshot, dress?: Dress, size: BoardSize = { width: 1920, height: 1080 }): Promise<Picture> {
	return rasterize(await renderer.svg(snapshot, size, dress));
}

export async function boardPng(renderer: BoardRenderer, snapshot: BoardSnapshot, dress?: Dress, size?: BoardSize): Promise<Uint8Array> {
	return (await boardPicture(renderer, snapshot, dress, size)).png();
}

/**
 * RGBA pixels to WebP at quality 85, through jSquash's libwebp build. In Node the encoder is given
 * its WebAssembly from disk; Node 22 has WebAssembly SIMD, and the encoder picks its SIMD build then.
 */
let encoder: Promise<(data: { data: Uint8ClampedArray; width: number; height: number }, options: { quality: number }) => Promise<ArrayBuffer>> | undefined;
async function webp(pixels: Buffer, width: number, height: number): Promise<Uint8Array> {
	encoder ??= (async () => {
		const { default: encode, init } = await import("@jsquash/webp/encode.js");
		const root = dirname(createRequire(import.meta.url).resolve("@jsquash/webp/package.json"));
		await init(await WebAssembly.compile(readFileSync(join(root, "codec", "enc", "webp_enc_simd.wasm"))));
		return encode as never;
	})();
	return new Uint8Array(await (await encoder)({ data: new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length), width, height }, { quality: 85 }));
}
