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

import { claudeCli } from "./src/context/claude-cli.ts";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Container, Image, Text } from "@earendil-works/pi-tui";
import { boardFeed } from "./src/board/feed.ts";
import { artIds, boardPicture, type BoardRenderer, type Dress } from "./src/board/render.ts";
import { choose, chooseColors, defaults, named, type Art, type Colors, type Look } from "./src/board/looks.ts";
import { boardSnapshot } from "./src/board/snapshot.ts";
import { menu, person, type Mode, type Person } from "./src/seating/person.ts";
import { panel } from "./src/seating/panel.ts";
import { cardboardArt, cardboardRenderer } from "./src/board/cardboard.ts";
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
	seatKeys,
	type Cast,
	type Role,
} from "./src/context/roles.ts";
import { keep as keepBrief } from "./src/core/journal.ts";
import { degraded, restartOf, run, seat as seatTable, type Inference, type Seated } from "./src/context/sit.ts";
import { endByHost, rollbackByHost } from "./src/core/host.ts";
import { hold, type Hold } from "./src/seating/hold.ts";
import { agree, GAME_TYPES, lobby, seatOrder, type Agreement, type Lobby } from "./src/seating/lobby.ts";
import { hostTable, type Hosted, type Hosting } from "./src/seating/host.ts";
import { follow, join as joinTable, type Guest } from "./src/seating/guest.ts";
import type { Briefing, Result, State, Working } from "./src/seating/protocol.ts";
import { aiPlayer, seatBrief, setupWork } from "./src/context/sit.ts";
import { startingIntent } from "./src/context/plan.ts";
import { bill, tally as newTally } from "./src/context/spend.ts";
import type { Player } from "./src/core/player.ts";
import type { Chronicle } from "./src/context/packet.ts";
import { gameResult, report, preparationFailure, saveReport } from "./tools/game-report.ts";
import { load, type Universe } from "./src/core/cards.ts";
import { alpha, deck, seatLabels } from "./src/core/decks.ts";
import { admittedAlpha } from "./src/core/packages.ts";
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
import { gameStats, writeReplay } from "./src/board/replay.ts";
import { dressOf, momentsOf, runOf } from "./src/watch/games.ts";
import { watchServer, type Watch } from "./src/watch/server.ts";
import { quickTunnel } from "./src/watch/tunnel.ts";
import { project, render } from "./src/core/view.ts";
import { CommandsSchema, commands } from "./src/core/work-language.ts";
import { editWork, workFrame } from "./src/core/work-tools.ts";
import { planState } from "./src/core/planning.ts";

/**
 * A table set without naming decks, where no menu can ask, seats two practice
 * decks from decks/collection. Setup registers them against the card universe,
 * as it would any tournament list.
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
/** This Pi's own Magic settings: whether it shows its games, and where. Not the roster, which is the seats' models. */
const SETTINGS = join(CACHE, "settings.json");
type Settings = { watch?: "off" | "local" | "public"; port?: number };
const settings = (): Settings => { try { return JSON.parse(readFileSync(SETTINGS, "utf8")) as Settings; } catch { return {}; } };

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

/** What a game needs from Pi: one classifier call and one chat call, with a seat's own key for a provider when it has one. */
const inference = (ctx: ExtensionContext, keys: Record<string, string> = {}): Inference => ({
	classify: (model, request, options) => ctx.modelRegistry.classify(model, request, { ...options, ...(keys[model.provider] ? { apiKey: keys[model.provider] } : {}) }),
	stream: (model, context, options) =>
		ctx.modelRegistry.streamSimple(model, context as never, { ...options, ...(keys[model.provider] ? { apiKey: keys[model.provider] } : {}) } as never) as never,
});

const slug = (text: string) => text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

export default function (pi: ExtensionAPI) {
	pi.registerProvider(claudeCli());
	let table: Table | null = null;
	let seated: Seated | null = null;
	let running = false;
	const games = new WeakMap<Table, Journal>();
	// Board pictures: one after each turn and one at the end, saved beside the game and shown above the
	// editor where the terminal draws images; elsewhere the widget names the file.
	let renderer: Promise<BoardRenderer | null> | undefined;
	// Without a terminal to show them in there are no pictures: a headless Pi draws nothing and fetches no art.
	const feedFor = (ctx: ExtensionContext, game: Table) => !ctx.hasUI ? { take() {}, settled: async () => {} } : boardFeed(game, renderer ??= cardboardRenderer(artIds(), join(CACHE, "art")),
		join(GAMES, `${basename(games.get(game)?.path ?? "table", ".jsonl")}-boards`),
		(png, path) => {
			if (ctx.hasUI) ctx.ui.setWidget("magic-board", (_tui, theme) => new Image(Buffer.from(png).toString("base64"), "image/png",
				{ fallbackColor: (text) => theme.fg("dim", text) }, { maxWidthCells: 120, filename: path }));
		},
		(message) => ctx.ui.notify(message, "warning"), () => dressFor(game));
	/** What the host's pictures wear: the looks the host's table set, or those the game's journal recorded. */
	function dressFor(game: Table): Dress {
		if (!host || table !== game) return dressOf(games.get(game)?.header, "spectator");
		const { seats, background, colors } = host.lobby;
		return { avatars: Object.fromEntries(seats.map((one, at) => [at, one.look.avatar])), background, ...(colors ? { colors } : {}) };
	}
	/**
	 * Showing this Pi's games: a read-only server for spectators and rewatchers,
	 * on this machine alone or, when the settings say public, behind a Cloudflare
	 * quick tunnel. A game this Pi is playing is watched live, from the audience.
	 */
	let watching: { server: Watch; mode: "local" | "public"; tunnel?: { url: string; close(): void } } | null = null;
	let live: Awaited<ReturnType<Watch["live"]>> | undefined;
	const watchUrl = () => watching ? watching.tunnel?.url ?? watching.server.base : undefined;
	async function watchLive(game: Table) {
		const journal = games.get(game);
		if (!watching || !journal || live) return;
		live = await watching.server.live(basename(journal.path, ".jsonl"), journal.header, game);
	}
	async function watchGames(ctx: ExtensionContext, mode: "off" | "local" | "public") {
		watching?.tunnel?.close();
		live?.finish(); live = undefined;
		await watching?.server.close();
		watching = null;
		mkdirSync(CACHE, { recursive: true });
		writeFileSync(SETTINGS, JSON.stringify({ ...settings(), watch: mode }, null, 2) + "\n");
		if (mode === "off") { ctx.ui.notify("This Pi no longer shows its games.", "info"); showTable(ctx); return; }
		const options = { dir: GAMES, cards: () => universe(standard.name), rules: () => loadRules(RULES), art: artIds(), paths: { cards: universe(standard.name).path, rules: RULES },
			resolveArt: async (definitions: Record<string, string>[]) => await cardboardArt(definitions, join(CACHE, "art")) };
		let server: Watch;
		try { server = await watchServer({ ...options, port: settings().port ?? 4747 }); }
		catch { server = await watchServer(options); }
		watching = { server, mode };
		if (mode === "public") {
			try { watching.tunnel = await quickTunnel(server.base); }
			catch (error) { ctx.ui.notify(`No public address, so the games show on this machine only: ${error instanceof Error ? error.message : String(error)}`, "warning"); }
		}
		if (running && table) await watchLive(table);
		const at = watchUrl()!, playing = table && games.get(table) ? `${at}/games/${basename(games.get(table)!.path, ".jsonl")}/` : undefined;
		ctx.ui.notify([`This Pi shows its games at ${at}${watching.tunnel ? ", for anyone with the address" : ", on this machine"}.`,
			...(playing ? [`This table: ${playing}`] : [])].join("\n"), "info");
		showTable(ctx);
	}

	/**
	 * A saved game as a page to replay in a browser: its journal replays,
	 * calling no models, and every moment something visible happened is kept as
	 * a scene for the audience and each seat, which the page draws with
	 * cardboard-api. Seconds to write, where pictures took minutes.
	 */
	async function replayPage(ctx: ExtensionContext, id: string | undefined) {
		const game = id ?? (table ? basename(games.get(table)?.path ?? "", ".jsonl") : saved()[0]);
		const path = game && join(GAMES, `${game}.jsonl`);
		if (!path || !existsSync(path)) { ctx.ui.notify(game ? `No game ${game} in ${GAMES}.` : "No saved games yet.", "warning"); return; }
		const cards = universe(standard.name), back = momentsOf(path, cards, loadRules(RULES)), { moments, viewers } = back, dir = join(GAMES, `${game}-replay`);
		const art = (definitions: Record<string, string>[]) => cardboardArt(definitions, join(CACHE, "art"));
		if (!await art([])) { ctx.ui.notify("The replay draws with cardboard-api, which is not installed (an optional dependency).", "warning"); return; }
		const written = await writeReplay(dir, moments, viewers, { title: back.table.seats.map((one) => one.name).join(" vs "), subtitle: `${game} · play by play`,
			stats: gameStats(back.table, back.header.created, runOf(GAMES, game)), dress: (viewer) => dressOf(back.header, viewer), art: artIds(), cards, resolveArt: art });
		ctx.ui.notify(`Wrote a replay of ${game}: ${moments.length} moments from ${viewers.length} perspectives, ${(written.bytes / 1e6).toFixed(1)} MB. Open ${join(dir, "index.html")}.`, "info");
	}

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
		from: { seed: string; decks?: string[]; alpha?: true; setAs?: SeatId[]; remote?: Record<SeatId, Player>; clock?: number | null; looks?: Look[]; background?: string; colors?: Colors } | { resume: string },
	): Promise<{ opened: Table; sitting: Seated }> {
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
			const chosen = from.decks ?? PLAY, names = seatLabels(chosen);
			opened = start(standard, chosen.map((name, at) => ({ name: names[at]!, deck: from.alpha ? alpha(deck(name)) : deck(name) })), from.seed, cards, { announcementsFrom: 0, excessManaFrom: 0, searchesFrom: 0, deathtouchFrom: 0, discardsFrom: 0 });
			header = {
				announcementsFrom: 0, excessManaFrom: 0, searchesFrom: 0, deathtouchFrom: 0, discardsFrom: 0,
				id: from.seed,
				format: standard.name,
				seed: from.seed,
				seats: opened.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck, ...(from.setAs ? { setAs: from.setAs[at.id]! } : {}), ...from.looks?.[at.id] })),
				...(from.clock ? { clock: from.clock } : {}),
				...(from.background ? { background: from.background } : {}),
				...(from.colors ? { colors: from.colors } : {}),
				cards: { path: cards.path, generated: cards.generated, ...(cards.faces ? { faces: cards.faces } : {}), ...(cards.names ? { names: cards.names } : {}) },
				rules: { path: RULES, effective: rules.effective },
				created: new Date().toISOString(),
			};
			journal = openGame(join(GAMES, `${from.seed}.jsonl`), header);
		}

		const began = Date.now();
		// A seat's roster and keys belong to the seat the host set up, which a coin flip may have moved.
		const setAs = (at: SeatId) => header.seats[at]?.setAs ?? at;
		const sitting = await seatTable(opened, (at) => roster(ctx, setAs(at)), inference(ctx), cards, {
			format: standard.name,
			reusePackages: !resuming,
			packageNotice: (message) => ctx.ui.notify(message, "warning"),
			seatInference: (at) => inference(ctx, seatKeys(loadCrew(ROSTER), setAs(at))),
			...("remote" in from && from.remote ? { remote: from.remote } : {}),
			journal,
			// The rules are already loaded for the replay check, so the dialer costs
			// nothing to switch on: a seat may look a rule up mid decision.
			rules,
			...(carried.length ? { prepared: carried } : {}),
		}).catch((error) => {
			const result = preparationFailure(opened, error, began, { journal: journal.path });
			const path = join(GAMES, `${header.id}-${began}.result.json`);
			const paths = saveReport(path, result, opened);
			ctx.ui.notify([...report(result), ...paths].join("\n"), "warning");
			throw error;
		});
		games.set(opened, journal);
		return { opened, sitting };
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
		const keys = loadCrew(ROSTER).keys ?? {};
		for (const at of seats) {
			// The roster file names seats as the host set them up; a coin flip may have moved one to another chair.
			const setAs = (table && games.get(table)?.header.seats[at.id]?.setAs) ?? at.id;
			lines.push("", `Seat ${at.id}, ${at.name}${setAs !== at.id ? ` (set up as seat ${setAs})` : ""}:`, ...mine(await roster(ctx, setAs), "seat"));
			for (const [provider, named] of Object.entries(keys[String(setAs)] ?? {}))
				lines.push(`  ${provider} calls use this seat's key from ${named}${process.env[named.replace(/^\$/, "")] ? "" : ", which is not set"}.`);
		}
		lines.push("", "The table:", ...mine(await roster(ctx), "table"));
		ctx.ui.notify(lines.join("\n"), "info");
	}

	/**
	 * The table the host is running: its lobby, the hold on a game in play, and
	 * the game's run. The host is never a seat, so nothing here answers a
	 * decision; the host's view is the spectator's.
	 */
	let host: { lobby: Lobby; hold?: Hold; game?: Promise<void>; ticker?: ReturnType<typeof setInterval>; feed: string[]; wire?: Hosted; asking?: string } | null = null;

	/** The host's status widget: the game type, the stage, each seat, and who the table is waiting on. */
	function showTable(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("magic-table", host ? tableLines() : undefined);
	}

	/** Something every chair may see changed: the stage, a recap, the outcome. */
	function told(ctx: ExtensionContext) {
		showTable(ctx);
		host?.wire?.changed();
	}

	function tableLines(): string[] {
		if (!host) return ["No table. /magic host sets one."];
		const { lobby: setup, hold: holding } = host;
		const lines = [`Magic · ${GAME_TYPES[setup.game].name} · ${setup.stage}${holding?.paused() ? " · paused" : ""}`];
		const view = table && setup.stage !== "setting" ? project(table, "spectator") : undefined;
		setup.seats.forEach((one, at) => {
			const life = view?.players?.find((facts) => facts.id === at)?.life;
			const moved = one.setAs !== undefined && one.setAs !== at ? ` (set up as seat ${one.setAs})` : "";
			const guest = one.by === "remote" ? host!.wire?.guest(one.setAs ?? at) : undefined;
			const who = one.by === "ai" ? "model" : guest ? `guest ${guest.name}` : "open, waiting for a guest";
			lines.push(`  Seat ${at}${moved}  ${table?.seats[at]?.name ?? one.deck}  ${who}${life !== undefined ? `  life ${life}` : ""}${setup.stage === "setting" ? `  · ${named(one.look.avatar)} on ${named(one.look.background)}${tinted(one.look.colors)}` : ""}`);
		});
		if (setup.stage === "setting") lines.push(`  The host's pictures: ${named(setup.background)}${tinted(setup.colors)}. /magic seat <n> avatar|background|colors, /magic background, /magic colors`);
		if (view?.window.kind === "turn") lines.push(`  Turn ${view.window.turn}, ${table!.seats[view.window.active]?.name}'s ${view.window.step.replace(/-/g, " ")}. Version ${table!.ledger.length}.`);
		const asking = holding?.asking();
		if (asking) lines.push(`  Waiting on seat ${asking.seat} for ${Math.round((Date.now() - asking.since) / 1000)}s${asking.clock ? ` of its ${asking.clock}s` : ""}.`);
		else if (setup.stage === "setting" && setup.seats.some((one) => one.by === "remote")) lines.push(`  Clock: ${setup.clock ? `${setup.clock}s a decision for guest seats, then they concede` : "off"}. /magic clock <seconds|off>`);
		else if (host.asking) lines.push(`  ${host.asking}`);
		// Pi shows ten lines of a text widget: the status, the last few public lines, and what the host can do next.
		// Pi shows a text widget's first ten lines: a watched game gives one feed line to its address.
		const watched = watchUrl() && table && games.get(table) ? `${watchUrl()}/games/${basename(games.get(table)!.path, ".jsonl")}/` : undefined;
		if (watched && setup.stage !== "setting") lines.push(`  Watch: ${watched}`);
		if (setup.stage === "playing") lines.push(...host.feed.slice(watched ? -(FEED - 1) : -FEED).map((line) => `  · ${line.length > 110 ? `${line.slice(0, 107)}...` : line}`));
		lines.push(`  ${setup.stage === "prepared" && table?.ledger.length ? `/magic begin asks every seat to play on from version ${table.ledger.length}.` : NEXT[setup.stage]}`);
		return lines;
	}

	/** Public lines the host's widget keeps in view; the turn recaps also go to the chat. */
	const FEED = 4;
	const NEXT: Record<Lobby["stage"], string> = {
		setting: "/magic seat <n> deck <name|random> | open | ai, /magic first <coin|n>, then /magic start asks every seat to prepare.",
		preparing: "Decks register, card assessments load and model seats write their briefs.",
		prepared: "/magic begin asks every seat to begin: the hands are dealt and the mulligans start.",
		playing: "/magic pause | continue | rollback <version> [why] | end [why]",
		over: "/magic host sets a new table. /magic rollback <version> rewinds this one; /magic resume seats it again.",
	};

	/** Colours set over a background's own, for the table widget. */
	const tinted = (colors: Colors | undefined) => colors ? ` in ${colors.primary}/${colors.secondary}` : "";

	/** The defaults a look can take, for a command given no value. */
	const choices = (kind: Art) => `${kind === "avatars" ? "Avatars" : "Backgrounds"}: ${defaults(kind).join(", ")}. Or random, or an http(s) image URL.`;

/** Admitted alpha decks: legal main decks whose cards all have standing assessments. */
	const pool = (ctx: ExtensionContext) =>
		admittedAlpha(universe(standard.name), { notice: (message) => ctx.ui.notify(message, "warning") }).map((one) => one.name);

	/**
	 * Set a table. Decks come from the words (`A vs B`, `random`), or from a menu
	 * per seat. Nothing is prepared or dealt: the two agreements come later.
	 */
	async function setTable(ctx: ExtensionContext, rest: string) {
		if (running) { ctx.ui.notify("A game is in play. /magic end it, or /magic pause and leave it, first.", "warning"); return; }
		if (guest) { ctx.ui.notify("This Pi is a guest at another table. /magic leave first.", "warning"); return; }
		const decks = pool(ctx);
		const random = () => decks[Math.floor(Math.random() * decks.length)]!;
		let chosen: string[];
		if (/^random\b/.test(rest)) { chosen = [random()]; while (chosen.length < 2) { const next = random(); if (!chosen.includes(next)) chosen.push(next); } }
		else if (/ vs /.test(rest)) chosen = rest.split(/ vs /).map((one) => one.trim());
		else if (ctx.hasUI) {
			chosen = [];
			for (const at of [0, 1]) {
				const picked = await ctx.ui.select(`Seat ${at}: which deck?`, ["Random", ...decks]);
				if (!picked) return;
				chosen.push(picked === "Random" ? random() : picked);
			}
		} else chosen = [...PLAY];
		const unknown = chosen.filter((name) => !decks.includes(name));
		if (unknown.length) { ctx.ui.notify(`Not an admitted deck: ${unknown.join(", ")}. The decks are: ${decks.join(", ")}.`, "warning"); return; }
		await Promise.all(Object.values(seated?.players ?? {}).map((player) => player.close()));
		await host?.wire?.close();
		host = { lobby: lobby(chosen), feed: [] };
		table = null; seated = null;
		showTable(ctx);
		ctx.ui.notify(`Table set: ${chosen.join(" vs ")}. Both seats are model seats. ${NEXT.setting}`, "info");
	}

	/**
	 * Open a seat to a guest: the table's server starts if it is not running, and
	 * the seat gets one invite. Whoever presents it first takes the seat, with
	 * its own player and models.
	 */
	async function openSeat(ctx: ExtensionContext, at: SeatId) {
		const ours = host!;
		ours.wire ??= await hostTable({ game: GAME_TYPES[ours.lobby.game].name, view: (setAs) => chairView(ours, setAs), work: (setAs, post) => chairWork(ours, setAs, post), brief: (setAs, post) => chairBrief(ours, setAs, post),
			claimed: (setAs, name) => { showTable(ctx); ctx.ui.notify(`${name} took the seat set up as seat ${setAs}.`, "info"); } });
		const one = ours.lobby.seats[at]!;
		ours.lobby.seats[at] = { ...one, by: "remote" };
		const { invite } = ours.wire.open(at, one.deck);
		showTable(ctx);
		ctx.ui.notify(`Seat ${at} (${one.deck}) is open. On the same machine, the guest types:\n/magic join ${invite}`, "info");
	}

	/** The table seat a chair answers once a coin flip has ordered the table, or undefined before. */
	const chairSeat = (ours: NonNullable<typeof host>, setAs: SeatId) => ours.lobby.stage === "setting" ? undefined : ours.lobby.seats.findIndex((one, at) => (one.setAs ?? at) === setAs);

	/** What a chair's guest sees beside its own frames: the stage and what is public. Never another seat's view. */
	function chairView(ours: NonNullable<typeof host>, setAs: SeatId): ReturnType<Hosting["view"]> {
		const seat = chairSeat(ours, setAs), decks = ours.lobby.seats.map((one) => one.deck), names = seatLabels(decks);
		const game = host === ours ? table : null;
		return {
			stage: ours.lobby.stage, ...(ours.hold?.paused() ? { paused: true as const } : {}),
			...(ours.lobby.clock ? { clock: ours.lobby.clock } : {}),
			...((asking) => asking?.clock && asking.seat === seat && !ours.hold?.paused() ? { remaining: Math.max(0, asking.since + asking.clock * 1000 - Date.now()) } : {})(ours.hold?.asking()),
			...(seat !== undefined && seat >= 0 ? { seat, seats: (game?.seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck })) ?? decks.map((name, at) => ({ id: at, name: names[at]!, deck: alpha(deck(name)) })))
				.map((one) => ({ ...one, ...ours.lobby.seats[one.id]?.look })) } : {}),
			recaps: (host === ours ? seated?.chronicle.recaps ?? [] : []).map((one) => ({ ...one })),
			// Known once preparation has seated the table's roles.
			...(game && host === ours && seated ? { judge: !!seated.judge } : {}),
			...(game?.outcome ? { outcome: game.outcome } : {}),
			// Before play there is no loop to project a frame: the chair's own equipment, for its setup edits.
			...(game && seat !== undefined && seat >= 0 && ours.lobby.stage === "prepared" ? { frame: workFrame(game, seat) } : {}),
		};
	}

	/** A guest's setup edit to its own seat's equipment, while the game waits. */
	function chairWork(ours: NonNullable<typeof host>, setAs: SeatId, post: Working): Result {
		const seat = chairSeat(ours, setAs);
		if (host !== ours || !table || running || seat === undefined || seat < 0 || ours.lobby.stage !== "prepared") return { ok: false, refused: "not-now", message: "Seat edits wait for a prepared table that is not playing." };
		try { editWork(table, seat, commands(post.tools), post.actionId, post.revision); }
		catch (error) { return { ok: false, refused: "bad-request", message: error instanceof Error ? error.message : String(error) }; }
		const journal = games.get(table);
		if (journal) saveGame(journal, table);
		host.wire?.changed();
		return { ok: true };
	}

	/** A guest's pregame brief, journaled like any seat's preparation so a clone or resume carries it. */
	function chairBrief(ours: NonNullable<typeof host>, setAs: SeatId, post: Briefing): Result {
		const seat = chairSeat(ours, setAs);
		if (host !== ours || !table || running || seat === undefined || seat < 0 || ours.lobby.stage !== "prepared" || table.ledger.length)
			return { ok: false, refused: "not-now", message: "A brief is kept before the first decision of a prepared table." };
		const made = post?.brief as { version?: number; seat?: number } | undefined;
		if (made?.version !== 3 || made.seat !== seat) return { ok: false, refused: "bad-request", message: `A brief for seat ${seat} in the current shape.` };
		const journal = games.get(table);
		if (journal) keepBrief(journal, seat, made);
		return { ok: true };
	}

	/** Ask every seat at once: a model seat agrees when asked, a guest answers when it answers. */
	async function askSeats(ctx: ExtensionContext, ours: NonNullable<typeof host>, what: Agreement): Promise<boolean> {
		ours.asking = `Asking every seat to ${what}.`;
		told(ctx);
		const declined = await agree(ours.lobby, what, async (at, one) => one.by === "ai" || !!await ours.wire?.open(one.setAs ?? at, one.deck).chair.request(what));
		delete ours.asking;
		if (declined.length) ctx.ui.notify(`Seat ${declined.join(", ")} did not agree to ${what}.`, "warning");
		return host === ours && !declined.length;
	}

	/** First agreement: every seat agrees to prepare. The coin flip orders the seats, then preparation runs beside the session. */
	async function startTable(ctx: ExtensionContext) {
		if (!host || host.lobby.stage !== "setting") { ctx.ui.notify(host ? `The table is ${host.lobby.stage}.` : "No table. /magic host sets one.", "warning"); return; }
		const ours = host, setup = ours.lobby;
		if (setup.seats.some((one, at) => one.by === "remote" && !ours.wire?.guest(at))) ctx.ui.notify("An open seat has no guest yet; the agreement waits for one.", "info");
		void (async () => {
			if (!await askSeats(ctx, ours, "prepare") || setup.stage !== "setting") return showTable(ctx);
			const { order, by } = seatOrder(setup);
			setup.seats = order.map((at) => ({ ...setup.seats[at]!, setAs: at }));
			const decks = setup.seats.map((one) => one.deck);
			const base = `${slug(decks[0]!)}-vs-${slug(decks[1]!)}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
			let id = base;
			for (let n = 2; existsSync(join(GAMES, `${id}.jsonl`)); n++) id = `${base}-${n}`;
			setup.stage = "preparing";
			told(ctx);
			ctx.ui.notify(`Every seat agreed to prepare. ${by === "coin" ? "The coin flip" : "The host"} put ${decks[0]} on the play. Preparing ${id}.`, "info");
			const remote = Object.fromEntries(setup.seats.flatMap((one, at) => one.by === "remote" ? [[at, ours.wire!.open(one.setAs!, one.deck).chair.player]] : []));
			try {
				const { opened, sitting } = await open(ctx, { seed: id, decks, alpha: true, setAs: order, remote, ...(Object.keys(remote).length ? { clock: setup.clock } : {}),
					looks: setup.seats.map((one) => one.look), background: setup.background, ...(setup.colors ? { colors: setup.colors } : {}) });
				// A table replaced while this one prepared keeps its own game: this preparation is closed, not installed.
				if (host !== ours) { await Promise.all(Object.values(sitting.players).map((player) => player.close())); return; }
				table = opened; seated = sitting;
				ours.lobby.stage = "prepared";
				ctx.ui.notify(`Prepared ${id}. ${NEXT.prepared}`, "info");
			} catch (error) {
				ours.lobby.stage = "setting";
				if (host === ours) ctx.ui.notify(`Preparation failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
			told(ctx);
		})();
	}

	/** Second agreement: every seat agrees to begin, and the game plays beside the session so the host can still direct it. */
	async function beginTable(ctx: ExtensionContext) {
		if (!host || host.lobby.stage !== "prepared" || !table || !seated) { ctx.ui.notify(host ? `The table is ${host.lobby.stage}, not prepared.` : "No table. /magic host sets one.", "warning"); return; }
		const ours = host, game = table, sitting = seated;
		void (async () => {
			if (!await askSeats(ctx, ours, "begin") || ours.lobby.stage !== "prepared") return showTable(ctx);
			const holding = hold(restartOf(game, universe(standard.name)), (direction, now, refused) => {
				if (refused) { ctx.ui.notify(`The table refused ${direction.do}: ${refused} Play goes on.`, "warning"); return; }
				if (direction.do === "timeout") {
					ours.feed.push(`Seat ${direction.seat} ran out of time on the clock and conceded.`);
					ctx.ui.notify(`Seat ${direction.seat} did not answer within ${ours.lobby.clock}s and conceded.`, "warning");
					return;
				}
				if (direction.do !== "rollback") return;
				ours.feed.push(`The host rolled the game back to version ${direction.to}: ${direction.note}`);
				ctx.ui.notify(`Rolled back to version ${direction.to}. Every seat plans again.`, "info");
				const board = feedFor(ctx, now);
				board.take(`rolled-back-to-${direction.to}`);
			});
			// The clock is for guest seats: the host's own models are bounded by their call limits.
			const clocked = (at: number) => ours.lobby.seats[at]?.by === "remote" && ours.lobby.clock ? ours.lobby.clock : undefined;
			sitting.players = Object.fromEntries(Object.entries(sitting.players).map(([id, player]) => [id, holding.seat(player, Number(id), clocked(Number(id)))]));
			Object.assign(ours, { hold: holding, ticker: setInterval(() => showTable(ctx), 5_000) });
			ours.lobby.stage = "playing";
			told(ctx);
			ctx.ui.notify(`Every seat agreed to begin. ${game.ledger.length ? "Play goes on." : "Dealing; the mulligans come first."}`, "info");
			ours.game = playOn(ctx, game, sitting, ours);
		})();
	}

	/** The game's run, the board pictures and the report. Never awaited by a command. */
	async function playOn(ctx: ExtensionContext, opened: Table, sitting: Seated, ours: NonNullable<typeof host>) {
		const commentator = (await roster(ctx, 0)).find((part) => part.role === "summary");
		running = true;
		const board = feedFor(ctx, opened);
		let outcome, failure: unknown;
		const watch = (line: string) => {
			ours.feed.push(line);
			if (ours.feed.length > 200) ours.feed.splice(0, ours.feed.length - 200);
			if (/^Turn \d+: /.test(line)) ctx.ui.notify(line, "info");
			showTable(ctx);
		};
		await watchLive(opened);
		// Watchers see the table before each decision, before a pause or a direction can stop the loop there.
		const holding = ours.hold && { checkpoint: () => { live?.take(opened); ours.hold!.checkpoint(); }, halted: (game: Table) => ours.hold!.halted(game) };
		try { outcome = await run(opened, sitting, inference(ctx), commentator, watch, games.get(opened), 30_000,
			(turn) => board.take(`after-turn-${String(turn).padStart(2, "0")}`), holding); }
		catch (error) { failure = error; }
		finally { running = false; clearInterval(ours.ticker); live?.take(opened); live?.finish(); live = undefined; }
		board.take("final");
		await board.settled();
		// The run closed its seats either way; a stopped game is seated again by resuming it.
		ours.lobby.stage = "over";
		// The file's own name: a clone's header still carries the game it was copied from.
		const id = basename(games.get(opened)?.path ?? "game", ".jsonl");
		const result = gameResult(opened, sitting, { journal: games.get(opened)?.path, ...(failure ? { error: String(failure) } : {}) });
		const paths = saveReport(join(GAMES, `${id}-${sitting.timing.startedAt}.result.json`), result, opened);
		ctx.ui.notify(`${id}${opened.outcome ? "" : ` stopped at version ${opened.ledger.length}; /magic resume ${id} seats it again`}.\n` + [...report(result), ...paths].join("\n"),
			outcome && !degraded(opened, sitting) ? "info" : "warning");
		showTable(ctx);
	}

	/** Roll back or end: through the hold while the game plays, straight to the table and its journal when it does not. */
	function direct(ctx: ExtensionContext, words: string[]) {
		const [verb, at, ...why] = words;
		if (!table) { ctx.ui.notify("No game. /magic resume <game> opens a saved one.", "warning"); return; }
		const journal = games.get(table);
		if (verb === "rollback") {
			const to = Number(at), note = why.join(" ") || "The host rolled the game back.";
			// Checked before the game is interrupted: a bad version must not stop play.
			if (!Number.isInteger(to) || to < 0 || to >= table.ledger.length) { ctx.ui.notify(`/magic rollback <version> [why], from 0 to ${table.ledger.length - 1}. The game is at version ${table.ledger.length}.`, "warning"); return; }
			if (running && host?.hold) { host.hold.direct({ do: "rollback", to, note }); ctx.ui.notify(`Rolling back to version ${to}.${host.hold.paused() ? " Still paused: /magic continue." : ""}`, "info"); return; }
			rollbackByHost(table, to, note, restartOf(table, universe(standard.name)));
			if (journal) saveGame(journal, table);
			if (host) host.lobby.stage = "over";
			ctx.ui.notify(`Rolled back to version ${to} and saved. /magic resume ${journal ? basename(journal.path, ".jsonl") : "<game>"} seats it again.`, "info");
		} else {
			const note = [at, ...why].filter(Boolean).join(" ") || "The host ended the game.";
			if (running && host?.hold) { host.hold.direct({ do: "end", note }); return; }
			if (table.outcome) { ctx.ui.notify("The game is already over.", "warning"); return; }
			endByHost(table, note);
			if (journal) saveGame(journal, table);
			if (host) host.lobby.stage = "over";
			ctx.ui.notify(`Ended with no winner at version ${table.ledger.length}, and saved.`, "info");
		}
		showTable(ctx);
	}

	/** Saved games, newest first. */
	const saved = () => existsSync(GAMES) ? readdirSync(GAMES).filter((name) => name.endsWith(".jsonl"))
		.map((name) => ({ id: name.slice(0, -6), at: statSync(join(GAMES, name)).mtimeMs })).sort((a, b) => b.at - a.at).map((one) => one.id) : [];

	async function resumeGame(ctx: ExtensionContext, id: string) {
		if (running) { ctx.ui.notify("A game is in play. /magic end it, or let it finish, first.", "warning"); return; }
		const { opened, sitting } = await open(ctx, { resume: id });
		await Promise.all(Object.values(seated?.players ?? {}).map((player) => player.close()));
		table = opened; seated = sitting;
		const header = games.get(opened)?.header;
		const setup = lobby(opened.seats.map((one) => one.deck.name));
		// A game saved before tables had looks is dealt new ones for this session.
		host = { lobby: { ...setup, seats: setup.seats.map((one, at) => {
			const saved = header?.seats[at];
			return { ...one, setAs: saved?.setAs ?? at, look: { avatar: saved?.avatar ?? one.look.avatar, background: saved?.background ?? one.look.background, ...(saved?.colors ? { colors: saved.colors } : {}) } };
		}), background: header?.background ?? setup.background, ...(header?.colors ? { colors: header.colors } : {}), stage: "prepared" }, feed: [] };
		showTable(ctx);
		ctx.ui.notify(`Resumed ${id} at version ${opened.ledger.length}. ${opened.ledger.length ? `/magic begin asks every seat to play on from version ${opened.ledger.length}.` : NEXT.prepared}`, "info");
	}

	/**
	 * This Pi as a guest at another host's table: the claimed chair, the seat's
	 * player once it has prepared, and the loop that follows the chair. The seat
	 * plays with this Pi's models and keys, under the seat the host set it up as;
	 * the host never runs them and never pays for them.
	 */
	type Seating = { client: Guest; leaving: AbortController; state?: State; player?: Player; preparing?: Promise<boolean>; spend: ReturnType<typeof newTally>; gaps: string[];
		/** A person at this seat, with the autopilot behind them; absent while the seat prepares. */
		person?: Person; mode: Mode; pictured?: string;
		/** This Pi's own choice of background and frame colours for the seat's pictures, over the host's. */
		background?: string; colors?: Colors };
	let guest: Seating | null = null;

	// A component rather than lines: Pi cuts a text widget at ten lines, and a person's seat needs the whole question.
	function showSeat(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		if (!guest) { ctx.ui.setWidget("magic-seat", undefined); return; }
		const lines = seatLines();
		ctx.ui.setWidget("magic-seat", (_tui, theme) => {
			const box = new Container();
			for (const line of lines) box.addChild(new Text(line.startsWith("  ") ? line : theme.fg("accent", line), 1, 0));
			return box;
		});
	}

	/** The seat's own picture, once a turn and at the end, drawn from its own frame: what this seat may see. */
	function pictureSeat(ctx: ExtensionContext, ours: Seating, state: State) {
		const frame = state.frame, seat = state.seat, at = frame?.view.window.kind === "turn" ? `turn-${frame.view.window.turn}` : state.outcome ? "final" : undefined;
		if (!ctx.hasUI || !frame || seat === undefined || !at || ours.pictured === at) return;
		ours.pictured = at;
		const seats = (state.seats ?? []).map((one) => ({ id: one.id, name: one.name, deck: one.deck.name }));
		// Colours set for the seat go with the background set for it; a background this Pi chose brings its own.
		const mine = state.seats?.find((one) => one.id === seat), background = ours.background ?? mine?.background, colors = ours.colors ?? (ours.background ? undefined : mine?.colors);
		const dress: Dress = { avatars: Object.fromEntries((state.seats ?? []).flatMap((one) => one.avatar ? [[one.id, one.avatar]] : [])), ...(background ? { background } : {}), ...(colors ? { colors } : {}) };
		void (renderer ??= cardboardRenderer(artIds(), join(CACHE, "art"))).then(async (drawing) => {
			if (!drawing) return;
			const picture = await boardPicture(drawing, boardSnapshot(frame.view, seats, seat), dress), png = picture.png();
			const path = join(GAMES, `guest-${ours.client.welcome.table}-seat-${seat}`, `${at}.webp`);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, await picture.webp());
			ctx.ui.setWidget("magic-board", (_tui, theme) => new Image(Buffer.from(png).toString("base64"), "image/png",
				{ fallbackColor: (text) => theme.fg("dim", text) }, { maxWidthCells: 120, filename: path }));
		}).catch((error) => ctx.ui.notify(`The seat's picture failed: ${error instanceof Error ? error.message : String(error)}`, "warning"));
	}

	function seatLines(): string[] {
		if (guest?.person && guest.state?.frame) {
			const header = `Magic · seat ${guest.state.seat} at ${guest.client.welcome.game}${guest.state.paused ? " · paused by the host" : ""}${guest.state.judge ? " · a judge hears objections" : ""}`;
			return [header, ...panel(guest.state, guest.person.mode(), guest.person.asking(), guest.person.stops()).map((line) => line.startsWith("  ") ? line : `  ${line}`),
				"  /magic pass [turn] · /magic stops smart|all · /magic mode suggest|auto|manual · /magic concede · /magic leave"];
		}
		if (!guest) return ["Not seated. /magic join <invite> takes a chair at another Pi's table."];
		const state = guest.state, me = state?.seats?.find((one) => one.id === state.seat);
		const lines = [`Magic · a guest at ${guest.client.welcome.game} · ${state?.stage ?? "joining"}${state?.paused ? " · paused by the host" : ""}`];
		if (me) lines.push(`  You are seat ${me.id}, ${me.name}, against ${state!.seats!.filter((one) => one !== me).map((one) => one.name).join(", ")}.`);
		const view = state?.frame?.view;
		if (view?.window.kind === "turn") lines.push(`  Turn ${view.window.turn}, ${view.window.step.replace(/-/g, " ")}. Life ${(view.players ?? []).map((one) => `${state!.seats?.[one.id]?.name ?? one.id} ${one.life}`).join(", ")}.`);
		if (state?.judge) lines.push("  A judge hears objections at this table.");
		if (state?.agreement) lines.push(`  The host asks every seat to ${state.agreement}.`);
		else if (state?.ask) lines.push(`  Your seat is choosing.${state.remaining !== undefined ? ` About ${Math.round(state.remaining / 1000)}s left on the clock when asked; then it concedes.` : ""}`);
		lines.push("  /magic leave gives up the chair.");
		return lines;
	}

	/**
	 * Take a chair at another Pi's table. A person plays it, with this Pi's
	 * models as the autopilot behind them; `auto` hands the seat to the
	 * autopilot from the start, and `manual` plays it without asking one. A
	 * manual seat needs no decision model; its autopilot then only prepares.
	 */
	async function joinSeat(ctx: ExtensionContext, invite: string, mode: Mode = "suggest") {
		if (host || guest) { ctx.ui.notify(host ? "This Pi is hosting a table. A host is never a seat; join from another Pi." : "This Pi already has a chair. /magic leave first.", "warning"); return; }
		const client = await joinTable(invite, process.env.USER ?? "guest");
		const ours: Seating = { client, leaving: new AbortController(), spend: newTally(), gaps: [], mode };
		guest = ours;
		const { setAs } = client.welcome;
		const chronicle: Chronicle = { briefs: {}, recaps: [] };
		ctx.ui.notify(`Joined ${client.welcome.game} as the seat set up as seat ${setAs}. This Pi's models play it. Waiting for the host.`, "info");
		showSeat(ctx);

		const cards = universe(standard.name), rules = loadRules(RULES);
		let parts: Cast[] = [], seatInference = inference(ctx);
		// The seat's own preparation, once the table is ordered: its brief from the public lists.
		const prepare = async (state: State): Promise<boolean> => {
			try {
				const me = state.seats!.find((one) => one.id === state.seat)!, others = state.seats!.filter((one) => one.id !== state.seat);
				parts = await roster(ctx, setAs);
				seatInference = inference(ctx, seatKeys(loadCrew(ROSTER), setAs));
				chronicle.briefs[me.id] = await seatBrief(me, others, parts, cards, seatInference, ours.spend, { format: standard.name, rules, cache: {} });
				return true;
			} catch (error) {
				ctx.ui.notify(`This seat could not prepare: ${error instanceof Error ? error.message : String(error)}`, "error");
				return false;
			}
		};

		void follow(client, {
			async agree(what, state) {
				if (what === "prepare") return true;
				ours.preparing ??= prepare(state);
				if (!await ours.preparing || state.seat === undefined || ours.leaving.signal.aborted) return false;
				// The player is made once the table is prepared, when it is known whether a judge hears objections.
				const me = state.seats!.find((one) => one.id === state.seat)!;
				let made: ReturnType<typeof aiPlayer>;
				try {
					made = aiPlayer(me, parts, seatInference, cards, { chronicle, tally: ours.spend, intent: startingIntent(me.id), judge: !!state.judge, rules,
						undecided: ours.mode === "manual", onGap: (note) => void ours.gaps.push(note), onDial() {}, onPlanned() {} });
				} catch (error) { ctx.ui.notify(`This seat cannot play: ${error instanceof Error ? error.message : String(error)}`, "error"); return false; }
				if (!made.deciding) ctx.ui.notify("This Pi's roster has no decision model, so the person makes every choice; the autopilot only prepares cards.", "warning");
				let work = state.frame?.view.work;
				// A seat with card uses left to interpret needs its own strategy model: nobody else at the table will.
				if (!made.planning && work?.packages?.some((pack) => pack.deferred?.length)) {
					ctx.ui.notify("This seat's deck has card uses to interpret during play, and this Pi's roster has no strategy model. It declines to begin.", "warning");
					await made.player.close();
					return false;
				}
				// The host journals the brief, so a clone or resume of this game carries this seat's preparation.
				const kept = await client.brief({ brief: chronicle.briefs[me.id] });
				if (!kept.ok) ctx.ui.notify(`The host did not keep this seat's brief: ${kept.message ?? kept.refused}`, "warning");
				for (const edit of made.planning ? setupWork(work, 0, me.id) : []) {
					const done = await client.work({ tools: edit.tools, revision: work?.revision ?? 0, actionId: edit.actionId });
					if (!done.ok) { ctx.ui.notify(`The host refused this seat's setup: ${done.message ?? done.refused}`, "warning"); await made.player.close(); return false; }
					work = { ...work, revision: (work?.revision ?? 0) + 1 } as typeof work;
				}
				// Left while the setup was posted: the seat never sat, and its player stops.
				if (ours.leaving.signal.aborted) { await made.player.close(); return false; }
				ours.person = person(me.name, made.player, ours.mode, () => showSeat(ctx), made.deciding);
				ours.player = ours.person.player;
				seatTools(true);
				return true;
			},
			player: () => ours.player,
			seen(state) {
				ours.state = state;
				pictureSeat(ctx, ours, state);
				chronicle.recaps.splice(0, chronicle.recaps.length, ...state.recaps.map((one) => ({ ...one })));
				if (state.stage === "preparing" && state.seat !== undefined) ours.preparing ??= prepare(state);
				showSeat(ctx);
			},
		}, ours.leaving.signal).then((outcome) => {
			const seat = ours.state?.seat, result = outcome && seat !== undefined ? outcome.results[seat] : undefined;
			const said = outcome ? `The game is over: this seat's result is ${result ?? "unknown"}.` : ours.state?.stage === "over" ? "The host's game stopped without a result." : "Left the table.";
			ctx.ui.notify([said, ...bill(ours.spend.spent()), ...ours.gaps.map((gap) => `gap: ${gap}`)].join("\n"), "info");
		}, (error) => ctx.ui.notify(`The seat stopped: ${error instanceof Error ? error.message : String(error)}`, "error")).finally(() => {
			if (guest === ours) { guest = null; seatTools(false); }
			showSeat(ctx);
		});
	}

	/**
	 * The seat assistant: the Pi chat agent at a person's seat. It reads only
	 * what this seat may see, passes the person's words to the seat's
	 * autopilot, and answers the open question when the person names a choice.
	 * The tools are active only while this Pi holds a person's seat.
	 */
	const SEAT_TOOLS = ["magic_seat", "magic_choose", "magic_tell"];
	const seatTools = (on: boolean) => pi.setActiveTools([...new Set([...pi.getActiveTools().filter((name) => !SEAT_TOOLS.includes(name)), ...(on ? SEAT_TOOLS : [])])]);
	const seatedPerson = (): Person => {
		if (!guest?.person) throw new Error("This Pi has no seat at a Magic table. /magic join <invite> takes one.");
		return guest.person;
	};

	/** What the assistant reads: the seat's panel, and the printed text of every card the seat can see. Nothing another seat hides. */
	function seatReading(): string {
		const seat = seatedPerson(), frame = seat.asking()?.frame ?? guest!.state?.frame;
		if (!frame) return "The game has not started; the seat has nothing to read yet.";
		const cards = universe(standard.name).cards, names = [...new Set((frame.view.objects ?? []).flatMap((one) => !one.faceDown && one.card ? [one.card] : []))].sort();
		return [...seatLines(), "", "Cards this seat can see:", ...names.map((name) => {
			const card = cards.get(name);
			return card ? `${name} (${card.mana || "no cost"}; ${card.type}${card.stats ? `; ${card.stats}` : ""}): ${card.oracle.replace(/\n/g, " ")}` : name;
		})].join("\n");
	}

	pi.registerTool({
		name: "magic_seat", label: "Magic seat", defaultActive: false,
		description: "Read the Magic seat this Pi holds for its person: life, each battlefield, this seat's own hand, the stack, what happened since its last choice, its plan, the open question with numbered options and the autopilot's choice, and the printed text of every card the seat can see. It is this seat's view only: another seat's hand and library are counts.",
		promptSnippet: "Read the person's Magic seat: board, hand, the open question and its options, and card text",
		promptGuidelines: [
			"You assist a person playing a Magic seat. magic_seat is your only view of the game: it shows what this seat may see. Never guess or claim another seat's hidden cards, and never read files or run commands to learn about the game.",
			"When the person says how to play, pass their words to the seat with magic_tell; the seat's autopilot plans from them and plays or suggests that plan. Use magic_choose only for a choice the person names, or when they ask you to decide the open question.",
			"The table has a clock: an open question left unanswered too long concedes the seat. Keep advice short when a question is open.",
		],
		parameters: Type.Object({}),
		async execute() { return { content: [{ type: "text", text: seatReading() }], details: {} }; },
	});
	pi.registerTool({
		name: "magic_choose", label: "Magic choice", defaultActive: false,
		description: "Answer the open question at the person's Magic seat: a number from the options magic_seat lists, ok for the autopilot's choice, or pass. The answer is final once the table applies it; the table judges it like any seat's answer.",
		parameters: Type.Object({ choice: Type.Union([Type.Integer({ minimum: 1 }), Type.Literal("ok"), Type.Literal("pass")]) }),
		async execute(_id, params) {
			const seat = seatedPerson(), problem = params.choice === "ok" ? seat.accept() : params.choice === "pass" ? seat.pass("now") : seat.choose(params.choice);
			if (problem) throw new Error(problem);
			return { content: [{ type: "text", text: "Answered. Read magic_seat for what the table asks next." }], details: {} };
		},
	});
	pi.registerTool({
		name: "magic_tell", label: "Magic instruction", defaultActive: false,
		description: "Pass the person's instruction for this seat, in their words, to the seat's autopilot. Its strategy plans the rest of this turn and the opponent's next turn from them at the seat's next question, and says what the rules do not allow. In suggest mode the suggestions follow that plan; in auto mode the autopilot plays it. Nothing moves until a question is answered.",
		parameters: Type.Object({ instruction: Type.String({ minLength: 1, maxLength: 1000 }) }),
		async execute(_id, params) {
			const problem = seatedPerson().tell(params.instruction);
			if (problem) throw new Error(problem);
			return { content: [{ type: "text", text: "Passed to the seat's autopilot. It plans from it at the seat's next question." }], details: {} };
		},
	});

	const VERBS = ["host", "seat", "first", "clock", "background", "colors", "replay", "watch", "start", "begin", "pause", "continue", "rollback", "end", "status", "join", "leave", "pick", "ok", "show", "mode", "concede", "pass", "stops", "tell", "resume", "clone", "models", "board", "step", "work", "log", "export", "cards", "rules"];
	const USAGE = "/magic opens the menu. /magic host [A vs B | random] | seat <n> deck <name|random> | seat <n> open | seat <n> ai | seat <n> avatar|background <name|url|random> | " +
	"seat <n> colors <primary> <secondary> | auto | first <coin|n> | clock <seconds|off> | background <name|url|random> | colors <primary> <secondary> | auto | start | begin | " +
		"join <invite> [suggest|auto|manual] | pick <n> | ok | pass [turn] | stops <smart|all> | show <n> | tell <words> | mode <suggest|auto|manual> | concede | leave | " +
		"pause | continue | rollback <version> [why] | end [why] | status | resume <game> | clone <game> <version> <new-id> | " +
		"models [why|<role> <pattern> [seat]] | board | replay [game] | watch [local|public|off] | step | work [seat] | log | export <game> [public|full|<seat>] | cards [format|universe] | rules <query|build>";

	pi.registerCommand("magic", {
		description: "Host a Magic table: host, start, begin, pause, rollback, end, resume, models, and more. /magic alone opens the menu.",
		getArgumentCompletions: (prefix) => prefix.includes(" ") ? null : VERBS.filter((verb) => verb.startsWith(prefix)).map((verb) => ({ value: verb, label: verb })),
		handler: async (args, ctx) => {
			const words = args.trim().split(/\s+/).filter(Boolean);
			let verb = words[0] ?? "";
			const seed = words[1] ?? String(table?.log.length ?? 0);
			const rest = args.trim().slice(verb.length).trim();

			// Nothing starts by itself: the menu sets a table or opens a saved game.
			if (!verb) {
				if (!ctx.hasUI) { ctx.ui.notify(USAGE, "info"); return; }
				const choice = await ctx.ui.select("Magic", [...(host || guest ? ["Table status"] : []), "Host a table", "Join a table", "Resume a saved game", "Models", "Help"]);
				if (choice === "Host a table") return setTable(ctx, "");
				if (choice === "Join a table") {
					const invite = await ctx.ui.input("Paste the invite the host's Pi printed", "http://127.0.0.1:.../t/...#...");
					if (invite) try { await joinSeat(ctx, invite); } catch (error) { ctx.ui.notify(`Could not join: ${error instanceof Error ? error.message : String(error)}`, "error"); }
					return;
				}
				if (choice === "Table status") verb = "status";
				else if (choice === "Models") return models(["models"], ctx);
				else if (choice === "Help") { ctx.ui.notify(USAGE, "info"); return; }
				else if (choice === "Resume a saved game") {
					const id = await ctx.ui.select("Which game?", saved().slice(0, 15));
					if (id) await resumeGame(ctx, id);
					return;
				} else return;
			}

			if (verb === "host" || verb === "play") return setTable(ctx, rest);
			if (verb === "start") return startTable(ctx);
			if (verb === "begin") return beginTable(ctx);
			if (verb === "status") { ctx.ui.notify((guest ? seatLines() : tableLines()).join("\n"), "info"); return; }
			if (verb === "join") {
				const mode = (["suggest", "auto", "manual"] as const).find((one) => one === words[2]);
				if (!words[1] || (words[2] && !mode)) { ctx.ui.notify("/magic join <invite> [suggest|auto|manual], with the invite as the host's Pi printed it.", "warning"); return; }
				try { await joinSeat(ctx, words[1], mode); } catch (error) { ctx.ui.notify(`Could not join: ${error instanceof Error ? error.message : String(error)}`, "error"); }
				return;
			}
			if (["pick", "ok", "show", "mode", "concede", "pass", "stops", "tell"].includes(verb)) {
				const seat = guest?.person;
				if (!seat) { ctx.ui.notify("This Pi has no seat to play. /magic join <invite> takes one.", "warning"); return; }
				if (verb === "mode") {
					const mode = (["suggest", "auto", "manual"] as const).find((one) => one === words[1]);
					const problem = mode ? await seat.switch(mode) : "/magic mode suggest|auto|manual";
					ctx.ui.notify(problem ?? `This seat is in ${mode} mode.`, problem ? "warning" : "info");
				} else if (verb === "concede") seat.concede();
				else if (verb === "tell") {
					const problem = rest ? seat.tell(rest) : "/magic tell <how to play this turn, in your words>";
					ctx.ui.notify(problem ?? "Passed to the autopilot; it plans from it at the seat's next question.", problem ? "warning" : "info");
				}
				else if (verb === "stops") {
					const stops = (["smart", "all"] as const).find((one) => one === words[1]);
					if (stops) seat.setStops(stops);
					ctx.ui.notify(stops ? (stops === "all" ? "This seat is asked at every priority." : "This seat is asked in its own main phases and when another seat has something on the stack.") : "/magic stops smart|all", stops ? "info" : "warning");
				} else if (verb === "pass") {
					const problem = seat.pass(words[1] === "turn" ? "turn" : "now");
					if (problem) ctx.ui.notify(problem, "warning");
					else if (words[1] === "turn") ctx.ui.notify("Passing for the rest of this turn, unless another seat puts something on the stack.", "info");
				} else if (verb === "show") {
					const asking = seat.asking(), option = asking && menu(asking)[Number(words[1]) - 1]?.option;
					ctx.ui.notify(option ? [option.label, option.shows ?? "Nothing more to show for this option."].join("\n") : "/magic show <n>, for an option of the question being asked.", option ? "info" : "warning");
				} else {
					const problem = verb === "ok" ? seat.accept() : seat.choose(Number(words[1]));
					if (problem) ctx.ui.notify(problem, "warning");
				}
				showSeat(ctx);
				return;
			}
			if (verb === "leave") {
				if (!guest) { ctx.ui.notify("This Pi has no chair.", "warning"); return; }
				guest.leaving.abort();
				return;
			}
			if (verb === "rollback" || verb === "end") return direct(ctx, words);
			if (verb === "resume") return resumeGame(ctx, seed);

			if (verb === "clock") {
				if (!host || host.lobby.stage !== "setting") { ctx.ui.notify("The clock is set before /magic start.", "warning"); return; }
				const seconds = words[1] === "off" ? null : Number(words[1]);
				if (seconds !== null && (!Number.isFinite(seconds) || seconds <= 0)) { ctx.ui.notify("/magic clock <seconds|off>. A guest seat that does not answer within it concedes.", "warning"); return; }
				host.lobby.clock = seconds;
				ctx.ui.notify(seconds ? `Guest seats have ${seconds}s for each decision, then concede.` : "No clock: the table waits for every seat however long it takes.", "info");
				showTable(ctx);
				return;
			}
			if (verb === "seat" || verb === "first") {
				if (!host || host.lobby.stage !== "setting") { ctx.ui.notify("Seats and who plays first are set before /magic start.", "warning"); return; }
				if (verb === "first") {
					const first = words[1] === "coin" ? "coin" as const : Number(words[1]);
					if (first !== "coin" && !host.lobby.seats[first]) { ctx.ui.notify("/magic first <coin|seat>", "warning"); return; }
					host.lobby.first = first;
				} else if (words[2] === "open" || words[2] === "ai") {
					const at = Number(words[1]);
					if (!host.lobby.seats[at]) { ctx.ui.notify("/magic seat <n> open | ai", "warning"); return; }
					if (words[2] === "open") return openSeat(ctx, at);
					if (host.wire?.guest(at)) { ctx.ui.notify(`A guest holds seat ${at}. Set a new table to change who answers it.`, "warning"); return; }
					host.lobby.seats[at] = { ...host.lobby.seats[at]!, by: "ai" };
				} else if (words[2] === "colors") {
					const at = Number(words[1]), one = host.lobby.seats[at];
					if (!one) { ctx.ui.notify("/magic seat <n> colors <primary> <secondary> | auto", "warning"); return; }
					try {
						const { colors: _, ...rest } = one.look;
						host.lobby.seats[at] = { ...one, look: words[3] === "auto" ? rest : { ...rest, colors: chooseColors(words[3], words[4]) } };
					} catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning"); return; }
				} else if (words[2] === "avatar" || words[2] === "background") {
					const at = Number(words[1]), part = words[2], kind: Art = part === "avatar" ? "avatars" : "backgrounds", one = host.lobby.seats[at];
					if (!one) { ctx.ui.notify("/magic seat <n> avatar|background <name|url|random>", "warning"); return; }
					if (!words[3]) { ctx.ui.notify(choices(kind), "info"); return; }
					try {
						const seats = host.lobby.seats, chosen = choose(kind, words[3], part === "avatar" ? seats.filter((_, other) => other !== at).map((other) => other.look.avatar) : []);
						seats[at] = { ...one, look: { ...one.look, [part]: chosen } };
						// A portrait named for this seat leaves any other seat that had it, which is dealt another.
						if (part === "avatar") seats.forEach((other, there) => {
							if (there !== at && other.look.avatar === chosen) seats[there] = { ...other, look: { ...other.look, avatar: choose("avatars", "random", seats.map((seat) => seat.look.avatar)) } };
						});
					} catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning"); return; }
				} else {
					const at = Number(words[1]), name = words.slice(3).join(" "), decks = pool(ctx);
					if (!host.lobby.seats[at] || words[2] !== "deck" || !name) { ctx.ui.notify("/magic seat <n> deck <name|random>", "warning"); return; }
					const chosen = name === "random" ? decks[Math.floor(Math.random() * decks.length)]! : name;
					if (!decks.includes(chosen)) { ctx.ui.notify(`Not an admitted deck: ${chosen}. The decks are: ${decks.join(", ")}.`, "warning"); return; }
					host.lobby.seats[at] = { ...host.lobby.seats[at]!, deck: chosen };
				}
				showTable(ctx);
				return;
			}

			// The frame colours of this Pi's own pictures; auto follows the background. Any time.
			if (verb === "colors") {
				let colors: Colors | undefined;
				try { colors = words[1] === "auto" ? undefined : chooseColors(words[1], words[2]); } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning"); return; }
				const own = guest ?? host?.lobby;
				if (!own) { ctx.ui.notify("No table. /magic host sets one.", "warning"); return; }
				if (colors) own.colors = colors; else delete own.colors;
				if (guest) { delete guest.pictured; if (guest.state) pictureSeat(ctx, guest, guest.state); } else showTable(ctx);
				ctx.ui.notify(`${guest ? "This seat's" : "The host's"} pictures ${colors ? `are framed in ${colors.primary} and ${colors.secondary}` : "take their background's colours"}.`, "info");
				return;
			}

			// The background of this Pi's own pictures: the host's view of the table, or a guest's view of its seat. Any time.
			if (verb === "background") {
				if (!words[1]) { ctx.ui.notify(choices("backgrounds"), "info"); return; }
				let chosen: string;
				try { chosen = choose("backgrounds", words[1]); } catch (error) { ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning"); return; }
				if (guest) {
					guest.background = chosen;
					delete guest.pictured;
					if (guest.state) pictureSeat(ctx, guest, guest.state);
				} else if (host) {
					host.lobby.background = chosen;
					showTable(ctx);
				} else { ctx.ui.notify("No table. /magic host sets one.", "warning"); return; }
				ctx.ui.notify(`${guest ? "This seat's" : "The host's"} pictures are on ${named(chosen)}.`, "info");
				return;
			}

			if (verb === "pause" || verb === "continue") {
				if (!running || !host?.hold) { ctx.ui.notify("No game is in play.", "warning"); return; }
				if (verb === "pause") host.hold.pause(); else host.hold.resume();
				ctx.ui.notify(verb === "pause" ? "Paused. The next seat asked waits; /magic continue releases it." : "Play goes on.", "info");
				showTable(ctx);
				return;
			}

			if (verb === "models") {
				await models(words, ctx);
				return;
			}

			if (verb === "watch") {
				const mode = (["local", "public", "off"] as const).find((one) => one === words[1]);
				if (words[1] && !mode) { ctx.ui.notify("/magic watch local | public | off", "warning"); return; }
				if (mode) {
					try { await watchGames(ctx, mode); }
					catch (error) { ctx.ui.notify(`The games could not be shown: ${error instanceof Error ? error.message : String(error)}`, "error"); }
					return;
				}
				ctx.ui.notify(watching ? `This Pi shows its games at ${watchUrl()}${watching.tunnel ? ", for anyone with the address" : ", on this machine"}. /magic watch off stops.`
					: "This Pi does not show its games. /magic watch local shows them on this machine; /magic watch public gives them a public address.", "info");
				return;
			}

			if (verb === "replay") {
				try { await replayPage(ctx, words[1]); }
				catch (error) { ctx.ui.notify(`Could not write the replay: ${error instanceof Error ? error.message : String(error)}`, "error"); }
				return;
			}

			if (verb === "board") {
				if (!table) { ctx.ui.notify("No table. /magic host sets one.", "warning"); return; }
				const board = feedFor(ctx, table);
				board.take(`now-${table.cursor.clock}`);
				await board.settled();
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
				if (!table) { const made = await open(ctx, { seed }); table = made.opened; seated = made.sitting; }
				const open_ = table;
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
					ctx.ui.notify("No table. /magic host sets one.", "warning");
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

			ctx.ui.notify(USAGE, "info");
		},
	});

	// A person answers the open question by typing its number, ok for the autopilot's choice, or p to pass. Anything else is chat.
	pi.on("input", async (event, ctx) => {
		const seat = guest?.person, text = event.text.trim().toLowerCase();
		if (!seat?.asking() || !/^(\d{1,3}|ok|y|yes|p|pass)$/.test(text)) return { action: "continue" };
		const problem = /^\d/.test(text) ? seat.choose(Number(text)) : /^p/.test(text) ? seat.pass("now") : seat.accept();
		if (problem) ctx.ui.notify(problem, "warning");
		showSeat(ctx);
		return { action: "handled" };
	});

	// A closing Pi leaves a game in play resumable: it stops the run and writes no end.
	// A Pi set to show its games shows them from the start of each session.
	pi.on("session_start", async (_event, ctx) => {
		const mode = settings().watch;
		if ((mode === "local" || mode === "public") && !watching) await watchGames(ctx, mode).catch((error) => ctx.ui.notify(`The games could not be shown: ${String(error)}`, "warning"));
	});

	pi.on("session_shutdown", async () => {
		watching?.tunnel?.close();
		await watching?.server.close();
		watching = null;
		if (running && host?.hold) { host.hold.direct({ do: "leave" }); await host.game; }
		guest?.leaving.abort();
		await host?.wire?.close();
		await Promise.all(Object.values(seated?.players ?? {}).map((player) => player.close()));
		table = null;
		seated = null;
		host = null;
	});
}
