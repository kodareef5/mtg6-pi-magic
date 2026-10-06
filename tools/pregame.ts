#!/usr/bin/env node
/**
 * The pregame alone: two decks from the collection briefed against each other
 * with a chosen model, every request and reply kept. For comparing models and
 * for collecting worked examples to teach the cheaper one.
 *
 *   npm run pregame -- --decks "Mono-Green Landfall,Mono-Red Aggro" --model gpt-6.1-sol:high
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import type { Api, Model } from "@earendil-works/pi-ai";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";
import { load as loadRules } from "../src/core/rules.ts";
import { brief } from "../src/context/brief.ts";
import { reasoner } from "../src/context/reason.ts";
import { cast, rosterFor } from "../src/context/roles.ts";
import { bill, tally } from "../src/context/spend.ts";
import { traceInference } from "../src/context/trace.ts";
import { matchup, universe } from "./matchup-fixture.ts";

const { values } = parseArgs({ options: { decks: { type: "string", default: matchup.decks.join(",") }, model: { type: "string" }, out: { type: "string", default: ".pi/pregame" } } });
const names = values.decks!.split(",").map((name) => name.trim());
if (names.length !== 2) throw new Error("--decks names two decks from decks/collection, separated by a comma.");
const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
const runtime = await ModelRuntime.create();
const part = cast(rosterFor({ every: values.model ? { pregame: values.model } : {} }), { chat: await runtime.getAvailable(), classifiers: [] })
	.find((one) => one.role === "pregame")!;
if (!part.model) throw new Error(`No pregame model: ${part.problem ?? part.pattern}`);

const table = start(standard, names.map((name, seat) => ({ name: seat ? "B" : "A", deck: deck(name) })), "pregame", universe);
const id = `${names.map((name) => name.replace(/\W+/g, "-")).join("-vs-")}-${part.pattern.replace(/\W+/g, "-")}-${Date.now()}`;
mkdirSync(values.out!, { recursive: true });
const calls = join(values.out!, `${id}.calls.jsonl`);
const inference = traceInference({ classify: async () => { throw new Error("No classifier in the pregame"); },
	stream: (model, request, options) => runtime.streamSimple(model as never, request as never, options as never) as never }, (event) => appendFileSync(calls, JSON.stringify(event) + "\n"));
const counted = tally(), rules = loadRules(matchup.rules.path), began = Date.now();
const briefs = await Promise.all(table.seats.map((seat) => brief(seat, table.seats.filter((other) => other.id !== seat.id), universe, () => reasoner({
	role: "pregame", stream: inference.stream, model: part.model as Model<Api>, tally: counted, ...(part.thinkingLevel ? { thinking: part.thinkingLevel } : {}),
}), { format: standard.name, rules }).catch((error: unknown) => ({ seat: seat.id, failed: String(error) }))));
writeFileSync(join(values.out!, `${id}.briefs.json`), JSON.stringify({ decks: names, model: part.pattern, elapsedMs: Date.now() - began, briefs, calls: counted.spent() }, null, 2) + "\n");
console.log(`${names.join(" vs ")} with ${part.pattern}: ${((Date.now() - began) / 1000).toFixed(0)}s. Briefs in ${join(values.out!, `${id}.briefs.json`)}`);
for (const made of briefs) if ("failed" in made) console.log(`Seat ${made.seat} failed: ${made.failed}`);
console.log(bill(counted.spent()).join("\n"));

// Model transports may retain connections after the saved component has finished.
process.exit(briefs.some((made) => "failed" in made || made.gaps.length) ? 1 : 0);
