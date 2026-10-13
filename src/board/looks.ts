/**
 * How a table looks in pictures: each seat's portrait, and the background
 * behind a viewer's board. The defaults are the files in assets/, named by
 * file; any http(s) image URL stands in for one. Pictures only: nothing here
 * touches a game, and a look that cannot be drawn leaves its picture plainer.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ASSETS = join(import.meta.dirname, "..", "..", "assets");
export type Art = "avatars" | "backgrounds";
/** A seat's portrait and the background of its own pictures: each a default's name or an image URL. */
export type Look = { avatar: string; background: string };

const url = (value: string) => /^https?:\/\/\S+$/.test(value) && URL.canParse(value);

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
	if (named.includes(value) || url(value)) return value;
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
	if (!value || url(value)) return value;
	const key = `${kind}/${value}`;
	if (!read.has(key)) {
		let data: string | undefined;
		try { data = `data:image/jpeg;base64,${readFileSync(join(ASSETS, kind, `${value}.jpg`)).toString("base64")}`; } catch { data = undefined; }
		read.set(key, data);
	}
	return read.get(key);
}

/** A look as one line: a default's name, or the URL cut short. */
export const named = (value: string) => value.length > 48 ? `${value.slice(0, 45)}...` : value;
