/**
 * pi-magic. A table, its seats, and the game it is running.
 *
 * pi-magic owns the table. This file wires commands to it and holds no game
 * logic. Both seats here are answered by a decision model, because that is the
 * only kind of seat that needs nothing outside this process. A seat played over
 * p2p, by a person or through MCP drops into the same place and loads none of
 * src/context/.
 *
 * Inference is Pi's. Pi holds the providers, the credentials and the model
 * catalogue, so nothing here names an endpoint or reads a key. Declaring a game
 * means naming a model per part, and src/context/roles.ts is the whole of that.
 *
 * Past 150 lines because it is one command with eight verbs. Splitting a
 * command handler by verb means reading five files to learn what /magic does.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { decisionApi } from "./src/context/model.ts";
import { startingIntent } from "./src/context/plan.ts";
import {
	assign,
	cast,
	load as loadCrew,
	readRoster,
	ROLES,
	rosterFor,
	save as saveCrew,
	type Cast,
	type Role,
} from "./src/context/roles.ts";
import { aiSeat } from "./src/context/seat.ts";
import { checkDeck, load, type Universe } from "./src/core/cards.ts";
import { start } from "./src/core/commit.ts";
import { nextDecision } from "./src/core/decisions.ts";
import { standard } from "./src/core/format.ts";
import type { Intent } from "./src/core/intent.ts";
import { exportGame } from "./src/core/journal.ts";
import { play } from "./src/core/loop.ts";
import type { Player } from "./src/core/player.ts";
import { load as loadRules, search as searchRules } from "./src/core/rules.ts";
import type { Table } from "./src/core/table.ts";
import type { SeatId } from "./src/core/types.ts";
import { project, render } from "./src/core/view.ts";

/**
 * Milestone one plays with nothing but lands: pass, play a land, untap, draw,
 * mulligan. It proves the loop and the ledger before a card has an ability.
 * design-ref/CIRCUITRY.md section 12.
 *
 * Sixty basics is a legal Standard deck, which is the point: it goes through
 * the same legality check a tournament list will.
 */
const landDeck = (name: string): string[] => Array.from({ length: 60 }, () => name);

/**
 * Where the util writes, where its 75MB download is kept, and where the roster
 * lives. Not the package directory: an installed package may be read only, and
 * the download is not something to ship.
 */
const CACHE = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "magic");
const ROSTER = join(CACHE, "roster.json");

/** Shipped with the package, so a game runs with nothing downloaded. */
const SHIPPED = join(import.meta.dirname, "cards", "standard.tsv");
const RULES = join(import.meta.dirname, "rules", "cr.tsv");

/**
 * The card list a game reads. The shipped standard list answers the common
 * case; the cache answers a format the util was run for; a missing file names
 * the command rather than failing to parse.
 */
function universe(format: string): Universe {
	const built = join(CACHE, `${format}.tsv`);
	if (format === standard.name && existsSync(SHIPPED)) return load(SHIPPED);
	if (existsSync(built)) return load(built);
	throw new Error(`No card list for ${format}. Run /magic cards ${format}.`);
}

/** Every role resolved for one seat, or for the table when no seat is named. */
async function roster(ctx: ExtensionContext, seat?: SeatId): Promise<Cast[]> {
	return cast(rosterFor(loadCrew(ROSTER), seat), {
		chat: ctx.modelRegistry.getAvailable(),
		classifiers: await ctx.modelRegistry.getAvailableOfType("classifier"),
	});
}

export default function (pi: ExtensionAPI) {
	let table: Table | null = null;
	const players: Record<SeatId, Player> = {};
	const intents: Record<SeatId, Intent> = {};
	let calls = 0;

	/**
	 * Deal a table and give every seat a model to answer with.
	 *
	 * It refuses rather than starting half ready. A seat whose decide role did
	 * not resolve has nothing to answer it, and a game that starts anyway spends
	 * its first decision finding that out.
	 */
	async function open(seed: string, ctx: ExtensionContext): Promise<Table> {
		const cards = universe(standard.name);
		const entrants = [{ deck: landDeck("Forest") }, { deck: landDeck("Swamp") }];
		for (const entrant of entrants) {
			const problems = checkDeck(cards, entrant.deck, standard);
			if (problems.length) throw new Error(`Illegal deck: ${problems.join("; ")}`);
		}

		const opened = start(standard, entrants, seed);
		calls = 0;
		for (const seat of opened.seats) {
			const parts = await roster(ctx, seat.id);
			const decide = parts.find((part) => part.role === "decide");
			if (!decide?.model || decide.model.type !== "classifier") {
				throw new Error(
					`Seat ${seat.id} has no decision model. ` +
						`${decide?.problem ?? `${decide?.pattern} is not a classifier.`} ` +
						`Run /magic models to read the roster, and /magic models decide <pattern> to change it.`,
				);
			}
			const api = decisionApi(
				(model, request, options) => ctx.modelRegistry.classify(model, request, options),
				decide.model,
			);
			const intent = startingIntent(seat.id);
			intents[seat.id] = intent;
			players[seat.id] = aiSeat({
				name: seat.name,
				api,
				intent,
				onGap: (note) => void opened.gaps.push(note),
				onAsk: () => void (calls += 1),
			});
		}
		table = opened;
		return opened;
	}

	/**
	 * The util, run as a tool. It downloads the Scryfall bulk file once into the
	 * cache and reads it again for every later list, so a second format costs a
	 * stream and no network.
	 *
	 * v2: compare the cached file's date against Scryfall's updated_at and say
	 * when it is a day behind. For now it is as fresh as the last run.
	 */
	async function build(util: "cards" | "rules", what: string, ctx: ExtensionContext) {
		const tool = join(import.meta.dirname, "tools", `${util}.ts`);
		const args =
			util === "rules"
				? ["--verify", "-o", join(CACHE, "cr.tsv")]
				: what === "universe"
					? ["--verify", "-o", join(CACHE, "universe.tsv")]
					: ["--format", what, "--columns", "lean", "--verify", "-o", join(CACHE, `${what}.tsv`)];
		ctx.ui.notify(`Building ${what}. A first card run downloads about 75MB.`, "info");
		mkdirSync(CACHE, { recursive: true });
		// cwd rather than an env var: each util caches its download beside its
		// output by default, and pi.exec passes no environment.
		const result = await pi.exec("node", [tool, ...args], { cwd: CACHE });
		ctx.ui.notify(result.stdout.trim() || result.stderr.trim(), result.code === 0 ? "info" : "error");
	}

	/**
	 * Which model answers which part, and a one word change to any of it.
	 *
	 * With no argument it reads the roster, every seat's and the table's, and
	 * says what each pattern resolved to among the models Pi has credentials
	 * for. That listing is the whole configuration surface.
	 */
	async function models(words: string[], ctx: ExtensionContext) {
		const [, role, pattern, seat] = words;
		if (role && pattern) {
			if (!(role in ROLES)) {
				ctx.ui.notify(`No role ${role}. The roles are ${Object.keys(ROLES).join(", ")}.`, "error");
				return;
			}
			const where = seat === undefined ? undefined : Number(seat);
			saveCrew(ROSTER, assign(loadCrew(ROSTER), role as Role, pattern, where));
			ctx.ui.notify(
				`${role} is ${pattern} ${where === undefined ? "for every seat" : `for seat ${where}`}. ` +
					`Written to ${ROSTER}.`,
				"info",
			);
			return;
		}

		const seats = table?.seats ?? [{ id: 0, name: "unseated" }, { id: 1, name: "unseated" }];
		const mine = (parts: Cast[], whose: "seat" | "table") =>
			readRoster(parts.filter((part) => ROLES[part.role].whose === whose));
		const lines = [`Roster in ${ROSTER}. Edit it there, or with /magic models <role> <pattern> [seat].`];
		for (const at of seats) {
			lines.push("", `Seat ${at.id}, ${at.name}:`, ...mine(await roster(ctx, at.id), "seat"));
		}
		lines.push("", "The table:", ...mine(await roster(ctx), "table"));
		for (const [named, about] of Object.entries(ROLES)) {
			if (about.instead) lines.push("", `${named} instead: ${about.instead}`);
		}
		ctx.ui.notify(lines.join("\n"), "info");
	}

	pi.registerCommand("magic", {
		description: "play [seed] | models [role pattern [seat]] | step | log | export | cards | rules",
		handler: async (args, ctx) => {
			const words = args.trim().split(/\s+/).filter(Boolean);
			const verb = words[0] ?? "";
			const seed = words[1] ?? String(table?.log.length ?? 0);

			if (verb === "models") {
				await models(words, ctx);
				return;
			}

			if (verb === "play") {
				const opened = await open(seed, ctx);
				const began = Date.now();
				const outcome = await play(opened, players, intents, (line) => ctx.ui.notify(line, "info"));
				const forced = opened.ledger.filter((row) => row.why === "forced").length;
				const report =
					`${opened.ledger.length} decisions, ${forced} forced ` +
					`(${((forced / Math.max(1, opened.ledger.length)) * 100).toFixed(1)}%), ` +
					`${calls} model calls, ${opened.gaps.length} gaps, ` +
					`${((Date.now() - began) / 1000).toFixed(1)}s.`;
				if (!outcome) {
					ctx.ui.notify(
						`The table is waiting for a usable answer. ${report}\n` +
							`Run /magic step to read the pending decision.` +
							(opened.gaps.length ? `\nGaps: ${opened.gaps.join("; ")}` : ""),
						"warning",
					);
					return;
				}
				ctx.ui.notify(
					`Game over on seed ${seed}. ${JSON.stringify(outcome.results)}\n${report}` +
						(outcome.gaps.length ? `\nGaps: ${outcome.gaps.join("; ")}` : ""),
					"info",
				);
				return;
			}

			// One decision at a time, shown as the seat about to answer it reads
			// it. The point is to read the rails, not to watch a result.
			if (verb === "step") {
				const open_ = table ?? (await open(seed, ctx));
				const decision = nextDecision(open_);
				const seat = decision?.seat ?? open_.cursor.active;
				ctx.ui.notify(
					render({
						seat,
						version: open_.cursor.clock,
						view: project(open_, seat),
						...(decision ? { decision } : {}),
					}),
					"info",
				);
				return;
			}

			if (verb === "cards") {
				await build("cards", words[1] ?? standard.name, ctx);
				return;
			}

			if (verb === "rules") {
				const query = words.slice(1).join(" ");
				if (query === "build") {
					await build("rules", "the rules", ctx);
					return;
				}
				const found = loadRules(RULES);
				const hits = searchRules(found, query, 5);
				ctx.ui.notify(
					hits.length
						? `${found.effective}\n\n` + hits.map((hit) => `${hit.ref}  ${hit.text}`).join("\n\n")
						: `Nothing in the rules matches ${query}.`,
					"info",
				);
				return;
			}

			// full is the journal and holds every hand, so it stays on disk.
			// public is the only mode safe to send anywhere. docs/STATE.md.
			if (verb === "export") {
				if (!table) {
					ctx.ui.notify("No table. Run /magic play.", "warning");
					return;
				}
				const mode = words[1] ?? "public";
				const how =
					mode === "full"
						? ({ mode: "full" } as const)
						: mode === "public"
							? ({ mode: "public" } as const)
							: ({ mode: "seat", seat: Number(mode) } as const);
				ctx.ui.notify(exportGame(join(CACHE, "games", `${seed}.jsonl`), how), "info");
				return;
			}

			if (verb === "log") {
				if (!table) {
					ctx.ui.notify("No table. Run /magic play.", "warning");
					return;
				}
				const count = (why: string) => table!.ledger.filter((row) => row.why === why).length;
				ctx.ui.notify(
					`${table.format.name}, ${table.seats.length} seats. ${table.ledger.length} decisions: ` +
						`${count("forced")} forced, ${count("delegated")} delegated, ` +
						`${count("chosen")} chosen, ${count("declared")} declared, ${count("fallback")} fallback. ` +
						`${table.log.length} committed events, ${calls} model calls, ` +
						`${table.said.length} things said.`,
					"info",
				);
				return;
			}

			ctx.ui.notify(
				"Usage: /magic play [seed] | /magic models [<role> <pattern> [seat]] | /magic step | " +
					"/magic log | /magic export [public|full|<seat>] | /magic cards [format|universe] | " +
					"/magic rules <query|build>",
				"info",
			);
		},
	});

	pi.on("session_shutdown", async () => {
		for (const player of Object.values(players)) player.close();
		table = null;
	});
}
