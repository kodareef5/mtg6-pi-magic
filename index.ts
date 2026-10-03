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

import {
	assign,
	cast,
	load as loadCrew,
	readRoster,
	readWhy,
	ROLES,
	rosterFor,
	save as saveCrew,
	type Cast,
	type Role,
} from "./src/context/roles.ts";
import { report, run, seat as seatTable, type Seated } from "./src/context/sit.ts";
import { checkDeck, load, type Universe } from "./src/core/cards.ts";
import { start } from "./src/core/commit.ts";
import { nextDecision } from "./src/core/decisions.ts";
import { standard } from "./src/core/format.ts";
import { exportGame } from "./src/core/journal.ts";
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
	let seated: Seated | null = null;

	/**
	 * Deal a table, give every seat a model, and run the pregame.
	 *
	 * `src/context/sit.ts` owns the assembly, so this command and `npm run
	 * smoke` cannot disagree about what a game is made of or what it cost.
	 */
	async function open(seed: string, ctx: ExtensionContext): Promise<Table> {
		const cards = universe(standard.name);
		const entrants = [{ deck: landDeck("Forest") }, { deck: landDeck("Swamp") }];
		for (const entrant of entrants) {
			const problems = checkDeck(cards, entrant.deck, standard);
			if (problems.length) throw new Error(`Illegal deck: ${problems.join("; ")}`);
		}

		const opened = start(standard, entrants, seed);
		seated = await seatTable(
			opened,
			(at) => roster(ctx, at),
			{
				classify: (model, request, options) => ctx.modelRegistry.classify(model, request, options),
				stream: (model, context, options) =>
					ctx.modelRegistry.streamSimple(model, context as never, options as never) as never,
			},
			cards,
			{ format: standard.name },
		);
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
		if (role === "why") {
			ctx.ui.notify(readWhy().join("\n"), "info");
			return;
		}
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
		const lines = [
			`Roster in ${ROSTER}. Edit it there, or with /magic models <role> <pattern> [seat].`,
			`/magic models why says what each default was chosen for.`,
		];
		for (const at of seats) {
			lines.push("", `Seat ${at.id}, ${at.name}:`, ...mine(await roster(ctx, at.id), "seat"));
		}
		lines.push("", "The table:", ...mine(await roster(ctx), "table"));
		ctx.ui.notify(lines.join("\n"), "info");
	}

	pi.registerCommand("magic", {
		description: "play [seed] | models [why|<role> <pattern> [seat]] | step | log | export | cards | rules",
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
				const commentator = (await roster(ctx, 0)).find((part) => part.role === "summary");
				const outcome = await run(
					opened,
					seated!,
					{
						classify: (model, request, options) => ctx.modelRegistry.classify(model, request, options),
						stream: (model, context, options) =>
							ctx.modelRegistry.streamSimple(model, context as never, options as never) as never,
					},
					commentator,
					(line) => ctx.ui.notify(line, "info"),
				);
				ctx.ui.notify(
					`Seed ${seed}.\n${report(opened, seated!, outcome, Date.now() - began).join("\n")}`,
					outcome ? "info" : "warning",
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
				if (!table || !seated) {
					ctx.ui.notify("No table. Run /magic play.", "warning");
					return;
				}
				ctx.ui.notify(
					`${table.format.name}, ${table.seats.length} seats, ` +
						`${table.log.length} committed events, ${table.said.length} things said.\n` +
						report(table, seated, table.outcome, 0).join("\n"),
					"info",
				);
				return;
			}

			ctx.ui.notify(
				"Usage: /magic play [seed] | /magic models [why|<role> <pattern> [seat]] | /magic step | " +
					"/magic log | /magic export [public|full|<seat>] | /magic cards [format|universe] | " +
					"/magic rules <query|build>",
				"info",
			);
		},
	});

	pi.on("session_shutdown", async () => {
		for (const player of Object.values(seated?.players ?? {})) player.close();
		table = null;
		seated = null;
	});
}
