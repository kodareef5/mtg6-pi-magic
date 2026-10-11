/** Pairing preparation is advice without dealt objects. Reuse never carries game state. */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { problems } from "../core/language.ts";
import { writeRecord } from "../core/packages.ts";
import type { Brief } from "./brief.ts";

export type BriefCache = { directory?: string; notice?: (message: string) => void; identity: unknown };
const directory = (options: BriefCache) => options.directory ?? join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "magic", "briefs");
const notice = (options: BriefCache, message: string) => (options.notice ?? console.warn)(message);

/** Object key order is immaterial; array order, including relative seats, is not. */
export const briefKey = (value: unknown): string => createHash("sha256").update(JSON.stringify(value, (_key, one) =>
	one && typeof one === "object" && !Array.isArray(one) ? Object.fromEntries(Object.entries(one).sort(([a], [b]) => a.localeCompare(b))) : one)).digest("hex");

export function readBrief(key: string, seat: number, schema: Parameters<typeof problems>[0], options: BriefCache): Brief | undefined {
	const path = join(directory(options), `${key}.json`);
	try {
		const stored = JSON.parse(readFileSync(path, "utf8"));
		if (stored?.key !== key || typeof stored.writtenAt !== "string" || problems(schema, stored.brief).length)
			throw new Error("Invalid matchup brief");
		return { ...stored.brief, version: 3, seat, gaps: [], cache: { key, writtenAt: stored.writtenAt, reused: true } };
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") notice(options, `Skipped matchup brief ${path}: ${String(error)}`);
		return undefined;
	}
}

/** Failed analysts stay visible in this game and cannot become reusable preparation. */
export function saveBrief(key: string, made: Brief, options: BriefCache): Brief {
	if (made.gaps.length) return made;
	const { seat: _seat, version: _version, gaps: _gaps, cache: _cache, ...brief } = made;
	const writtenAt = new Date().toISOString();
	try {
		writeRecord(join(directory(options), `${key}.json`), { key, writtenAt, brief });
		return { ...made, cache: { key, writtenAt, reused: false } };
	} catch (error) { notice(options, `Could not cache matchup brief: ${String(error)}`); return made; }
}
