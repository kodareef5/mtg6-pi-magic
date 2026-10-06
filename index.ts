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
 * Commands and tool registrations stay together past 150 lines so their
 * shared game, roster and journal lifecycle can be read in one file.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

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
import { degraded, run, seat as seatTable, type Inference, type Seated } from "./src/context/sit.ts";
import { gameResult, report, preparationFailure, saveReport } from "./tools/game-report.ts";
import { load, type Universe } from "./src/core/cards.ts";
import { deck } from "./src/core/decks.ts";
import { start } from "./src/core/commit.ts";
import { nextDecision } from "./src/core/decisions.ts";
import { standard } from "./src/core/format.ts";
import {
	exportGame,
	fork as forkGame,
	open as openGame,
	reopen,
	replay as replayGame,
	type Header,
	type Journal,
	save as saveGame,
} from "./src/core/journal.ts";
import { load as loadRules, search as searchRules } from "./src/core/rules.ts";
import type { Table } from "./src/core/table.ts";
import type { SeatId } from "./src/core/types.ts";
import { project, render } from "./src/core/view.ts";
import { CommandsSchema, commands } from "./src/core/work-language.ts";
import { editWork, workFrame } from "./src/core/work-tools.ts";
import { planState } from "./src/core/planning.ts";

/**
 * A new game seats two practice decks from decks/collection. Setup registers
 * them against the card universe, as it would any tournament list.
 */
const PLAY = ["Green Stompy", "Red Burn"];

/**
 * Where the util writes, where its 75MB download is kept, and where the roster
 * lives. Not the package directory: an installed package may be read only, and
 * the download is not something to ship.
 */
const CACHE = join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"), "magic");
const ROSTER = join(CACHE, "roster.json");
const GAMES = join(CACHE, "games");

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
	if (typeof ctx.modelRegistry.getAvailableOfType !== "function") {
		throw new Error("Magic requires Pi 1.0 or newer for classifier models. This repo's CLI is node node_modules/@earendil-works/pi-coding-agent/dist/cli.js -e ./index.ts.");
	}
	return cast(rosterFor(loadCrew(ROSTER), seat), {
		chat: ctx.modelRegistry.getAvailable(),
		classifiers: await ctx.modelRegistry.getAvailableOfType("classifier"),
	});
}

/** What a game needs from Pi: one classifier call and one chat call. */
const inference = (ctx: ExtensionContext): Inference => ({
	classify: (model, request, options) => ctx.modelRegistry.classify(model, request, options),
	stream: (model, context, options) =>
		ctx.modelRegistry.streamSimple(model, context as never, options as never) as never,
});

export default function (pi: ExtensionAPI) {
	let table: Table | null = null;
	let seated: Seated | null = null;
	let running = false;
	const games = new WeakMap<Table, Journal>();

	/**
	 * Deal a table, give every seat a model, and run the pregame.
	 *
	 * `src/context/sit.ts` owns the assembly, so this command and `npm run
	 * smoke` cannot disagree about what a game is made of or what it cost.
	 */
	/**
	 * Deal a new table, or pick up a cloned one.
	 *
	 * Two things, kept apart, because conflating them was a real bug: a command
	 * that said "play this clone" started a fresh game carrying another game's
	 * briefs, which is neither a new game nor that position.
	 *
	 * `play` is a new game, with its own journal. `resume` replays a journal and
	 * plays on from wherever it stops, which for a clone at version zero is a
	 * game whose pregame is already paid for and whose first decision is still
	 * ahead of it.
	 */
	async function open(
		ctx: ExtensionContext,
		from: { seed: string } | { resume: string },
	): Promise<Table> {
		const cards = universe(standard.name);
		const rules = loadRules(RULES);
		const resuming = "resume" in from;

		let opened: Table;
		let header: Header;
		let carried: { seat: SeatId; made: unknown }[] = [];
		let journal: Journal;

		if (resuming) {
			const path = join(GAMES, `${from.resume}.jsonl`);
			if (!existsSync(path)) throw new Error(`No game ${from.resume} in ${GAMES}.`);
			const back = replayGame(
				path,
				(saved) => start(standard, saved.seats.map((at) => ({ name: at.name, deck: at.deck })), saved.seed, cards),
				undefined,
				{ cards, rules },
			);
			if (back.table.outcome) throw new Error(`${from.resume} is finished. Clone it at a version first.`);
			opened = back.table;
			header = back.header;
			carried = back.prepared;
			// Appended to, not replaced. A resumed game is the same game.
			journal = reopen(path, header, back.table);
			// The repair is about the file, not about this game, so it is said
			// once here rather than recorded as a gap in the run.
			if (journal.repaired) {
				ctx.ui.notify(`Resumed past a torn last line. Dropped: ${journal.repaired.slice(0, 80)}`, "warning");
			}
		} else {
			opened = start(standard, PLAY.map((name) => ({ deck: deck(name) })), from.seed, cards);
			header = {
				id: from.seed,
				format: standard.name,
				seed: from.seed,
				seats: opened.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck })),
				cards: { path: cards.path, generated: cards.generated },
				rules: { path: RULES, effective: rules.effective },
				created: new Date().toISOString(),
			};
			journal = openGame(join(GAMES, `${from.seed}.jsonl`), header);
		}

		const began = Date.now();
		seated = await seatTable(opened, (at) => roster(ctx, at), inference(ctx), cards, {
			format: standard.name,
			journal,
			// The rules are already loaded for the replay check, so the dialer costs
			// nothing to switch on: a seat may look a rule up mid decision.
			rules,
			...(carried.length ? { prepared: carried } : {}),
		}).catch((error) => {
			const result = preparationFailure(opened, error, began, { journal: journal.path });
			const path = join(GAMES, `${header.id}-${began}.result.json`);
			const paths = saveReport(path, result);
			ctx.ui.notify([...report(result), ...paths].join("\n"), "warning");
			throw error;
		});
		table = opened;
		games.set(opened, journal);
		return opened;
	}

	pi.registerTool({
		name: "magic_work",
		label: "Magic seat equipment",
		description: "Read one seat's visible objects, its plan and where it stands in it. Supply commands and the equipment revision to edit that seat's equipment atomically: put a plan, request one, or put a package. Edits move no cards and advance no phase. Acceptance proves neither card meaning nor strategic quality. The tool is available while the game is waiting, and cannot edit during an active play loop.",
		parameters: Type.Object({ seat: Type.Integer({ minimum: 0 }), revision: Type.Optional(Type.Integer({ minimum: 0 })), commands: Type.Optional(CommandsSchema) }),
		async execute(actionId, params) {
			if (!table) throw new Error("No table. /magic step opens one for inspection.");
			if (!table.seats.some((seat) => seat.id === params.seat)) throw new Error(`No seat ${params.seat}.`);
			if (params.commands) {
				if (running) throw new Error("The play loop is active. Edit equipment when the game is waiting.");
				if (table.outcome) throw new Error("The game is finished. Clone an unfinished position to continue working on it.");
				if (params.revision === undefined) throw new Error("Read the equipment first and supply its revision.");
				editWork(table, params.seat, commands(params.commands), actionId, params.revision);
				const journal = games.get(table);
				if (journal) saveGame(journal, table);
			}
			const frame = workFrame(table, params.seat);
			const details = { frame, plan: planState(frame) };
			return { content: [{ type: "text", text: JSON.stringify(details, null, 2) }], details };
		},
	});

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
		description: "play [seed] | resume <game> | clone <game> <version> <id> | work [seat] | models | step | log | export | cards | rules",
		handler: async (args, ctx) => {
			const words = args.trim().split(/\s+/).filter(Boolean);
			const verb = words[0] ?? "";
			const seed = words[1] ?? String(table?.log.length ?? 0);

			if (verb === "models") {
				await models(words, ctx);
				return;
			}

			if (verb === "play" || verb === "resume") {
				const opened = await open(ctx, verb === "resume" ? { resume: seed } : { seed });
				const commentator = (await roster(ctx, 0)).find((part) => part.role === "summary");
				running = true;
				let outcome, failure: unknown;
				try { outcome = await run(
					opened,
					seated!,
					inference(ctx),
					commentator,
					(line) => ctx.ui.notify(line, "info"),
					games.get(opened),
				); } catch (error) { failure = error; } finally { running = false; }
				const result = gameResult(opened, seated!, { journal: games.get(opened)?.path, ...(failure ? { error: String(failure) } : {}) });
				const resultPath = join(GAMES, `${seed}-${seated!.timing.startedAt}.result.json`);
				const paths = saveReport(resultPath, result);
				ctx.ui.notify(
					`${verb === "resume" ? "Resumed" : "Seed"} ${seed}.\n` +
						[...report(result), ...paths].join("\n"),
					outcome && !degraded(opened, seated!) ? "info" : "warning",
				);
				return;
			}

			if (verb === "work") {
				if (!table) { ctx.ui.notify("No table. /magic step opens one.", "warning"); return; }
				const id = Number(words[1] ?? 0);
				const frame = workFrame(table, id);
				ctx.ui.notify(JSON.stringify({ equipment: frame.view.work ?? { revision: 0 }, plan: planState(frame) }, null, 2), "info");
				return;
			}

			// One decision at a time, shown as the seat about to answer it reads
			// it. The point is to read the rails, not to watch a result.
			if (verb === "step") {
				const open_ = table ?? (await open(ctx, { seed }));
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
				const mode = words[2] ?? "public";
				const how =
					mode === "full"
						? ({ mode: "full" } as const)
						: mode === "public"
							? ({ mode: "public" } as const)
							: ({ mode: "seat", seat: Number(mode) } as const);
				ctx.ui.notify(
					exportGame(join(GAMES, `${words[1] ?? seed}.jsonl`), how, (header) =>
						start(standard, header.seats.map((at) => ({ name: at.name, deck: at.deck })), header.seed),
					),
					"info",
				);
				return;
			}

			/**
			 * Copy a game up to a point, which is also how a fixture is made. A
			 * clone is the same game continued, so everything up to that point
			 * comes across and nothing has to be matched up afterwards.
			 *
			 * Version zero is the one to clone when the thing being tested is the
			 * play rather than the pregame: nothing has been dealt and the seats
			 * already hold what a model prepared for them.
			 */
			if (verb === "clone") {
				const [, from, at, id] = words;
				if (!from || at === undefined || !id) {
					ctx.ui.notify("Usage: /magic clone <game> <version> <new-id>", "warning");
					return;
				}
				const made = forkGame(join(GAMES, `${from}.jsonl`), Number(at), id, join(GAMES, `${id}.jsonl`));
				ctx.ui.notify(
					`${id} is ${made.forkedFrom!.game} up to version ${made.forkedFrom!.version}, ` +
						`everything included. Continue it with /magic resume ${id}.`,
					"info",
				);
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
						report(gameResult(table, seated)).join("\n"),
					"info",
				);
				return;
			}

			ctx.ui.notify(
				"Usage: /magic play [seed] | /magic resume <game> | " +
					"/magic clone <game> <version> <new-id> | " +
					"/magic models [why|<role> <pattern> [seat]] | /magic step | /magic work [seat] | /magic log | " +
					"/magic export <game> [public|full|<seat>] | " +
					"/magic cards [format|universe] | /magic rules <query|build>",
				"info",
			);
		},
	});

	pi.on("session_shutdown", async () => {
		await Promise.all(Object.values(seated?.players ?? {}).map((player) => player.close()));
		table = null;
		seated = null;
	});
}
