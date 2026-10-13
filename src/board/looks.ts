/**
 * How a table looks in pictures: each seat's portrait, and the background
 * and frame colours of a viewer's board. The defaults are the files in
 * assets/, named by file; any http(s) image URL stands in for one. A default
 * background brings the frame colours it was made for, from
 * assets/backgrounds/colors.json, unless colours are set. Pictures only:
 * nothing here touches a game, and a look that cannot be drawn leaves its
 * picture plainer.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(import.meta.dirname, "..", "..", "assets");
export type Art = "avatars" | "backgrounds";
/** Frame colours: a primary for the table and panels, a secondary for the trim, each `#rrggbb`. */
export type Colors = { primary: string; secondary: string };
/** A seat's portrait, and the background and frame colours of its own pictures: a default's name or an image URL, and colours when set. */
export type Look = { avatar: string; background: string; colors?: Colors };

export const isUrl = (value: string) => /^https?:\/\/\S+$/.test(value) && URL.canParse(value);

/** The defaults of one kind, by name. */
export const defaults = (kind: Art): string[] =>
	readdirSync(join(ASSETS, kind)).filter((file) => file.endsWith(".jpg")).map((file) => file.slice(0, -4)).sort();

/** A default by name, an image URL, or `random` for a default not in `taken` while one is left. */
export function choose(kind: Art, value: string, taken: readonly string[] = []): string {
	const named = defaults(kind);
	if (value === "random") {
		const left = named.filter((one) => !taken.includes(one));
		return (left.length ? left : named)[Math.floor(Math.random() * (left.length || named.length))]!;
	}
	if (named.includes(value) || isUrl(value)) return value;
	throw new Error(`No ${kind === "avatars" ? "avatar" : "background"} named ${value}. Choose ${named.join(", ")}, random, or an http(s) image URL.`);
}

/** Random looks for a table's seats, a different portrait each while the defaults last. */
export function deal(seats: number): Look[] {
	const looks: Look[] = [];
	for (let at = 0; at < seats; at++)
		looks.push({ avatar: choose("avatars", "random", looks.map((one) => one.avatar)), background: choose("backgrounds", "random") });
	return looks;
}

/** What a picture embeds: a default as a data URL, read once, or the URL as given. Unknown names draw nothing. */
const read = new Map<string, string | undefined>();
export function imageOf(kind: Art, value: string | undefined): string | undefined {
	if (!value || isUrl(value)) return value;
	const key = `${kind}/${value}`;
	if (!read.has(key)) {
		let data: string | undefined;
		try { data = `data:image/jpeg;base64,${readFileSync(join(ASSETS, kind, `${value}.jpg`)).toString("base64")}`; } catch { data = undefined; }
		read.set(key, data);
	}
	return read.get(key);
}

/** The frame colours a default background was made for; none for a URL or a background without them. */
let matching: Record<string, Colors> | undefined;
export function colorsFor(background: string | undefined): Colors | undefined {
	matching ??= JSON.parse(readFileSync(join(ASSETS, "backgrounds", "colors.json"), "utf8")) as Record<string, Colors>;
	return background ? matching[background] : undefined;
}

/** Frame colours from two hex colours, with or without `#`. */
export function chooseColors(primary: string | undefined, secondary: string | undefined): Colors {
	const hex = (value: string | undefined) => value && /^#?[0-9a-f]{6}$/i.test(value) ? `#${value.replace(/^#/, "").toLowerCase()}` : undefined;
	const colors = { primary: hex(primary), secondary: hex(secondary) };
	if (!colors.primary || !colors.secondary) throw new Error("Frame colours are a primary and a secondary hex colour, as in #2a1040 #cbb8e6, or auto for the background's own.");
	return colors as Colors;
}

/** A look as one line: a default's name, or the URL cut short. */
export const named = (value: string) => value.length > 48 ? `${value.slice(0, 45)}...` : value;
