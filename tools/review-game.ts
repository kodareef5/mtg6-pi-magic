#!/usr/bin/env node
/** Extract private source evidence from a retained Standard journal without model calls. */
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { replay } from "../src/core/journal.ts";
import { dealtTable, matchup } from "./matchup-fixture.ts";
import { saveSourceReview } from "./source-review.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: "string", short: "o" }, help: { type: "boolean" } } });
if (values.help || positionals.length !== 1) {
	console.log("usage: node tools/review-game.ts game.jsonl [-o review.md]\nWrites private card meanings beside pinned sources. Calls no models and does not certify play.");
	process.exit(values.help ? 0 : 1);
}
const source = positionals[0]!, path = values.out ?? source.replace(/\.jsonl$/, "") + ".source-review.md";
const { table } = replay(source, dealtTable, undefined, { cards: matchup.cards, rules: matchup.rules });
mkdirSync(dirname(path), { recursive: true });
saveSourceReview(path, table);
console.log(`${resolve(path)} (private)`);
