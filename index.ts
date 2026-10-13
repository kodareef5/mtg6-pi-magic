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
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Image } from "@earendil-works/pi-tui";
import { boardFeed } from "./src/board/feed.ts";
import { artIds, type BoardRenderer } from "./src/board/render.ts";
import { cardboardRenderer } from "./src/board/cardboard.ts";
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
import { degraded, restartOf, run, seat as seatTable, type Inference, type Seated } from "./src/context/sit.ts";
import { endByHost, rollbackByHost } from "./src/core/host.ts";
import { hold, type Hold } from "./src/seating/hold.ts";
import { agree, GAME_TYPES, lobby, seatOrder, type Lobby } from "./src/seating/lobby.ts";
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
		(message) => ctx.ui.notify(message, "warning"));

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
		from: { seed: string; decks?: string[]; alpha?: true; setAs?: SeatId[] } | { resume: string },
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
				seats: opened.seats.map((at) => ({ id: at.id, name: at.name, deck: at.deck, ...(from.setAs ? { setAs: from.setAs[at.id]! } : {}) })),
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
	let host: { lobby: Lobby; hold?: Hold; game?: Promise<void>; ticker?: ReturnType<typeof setInterval>; feed: string[] } | null = null;

	/** The host's status widget: the game type, the stage, each seat, and who the table is waiting on. */
	function showTable(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;
		ctx.ui.setWidget("magic-table", host ? tableLines() : undefined);
	}

	function tableLines(): string[] {
		if (!host) return ["No table. /magic host sets one."];
		const { lobby: setup, hold: holding } = host;
		const lines = [`Magic · ${GAME_TYPES[setup.game].name} · ${setup.stage}${holding?.paused() ? " · paused" : ""}`];
		const view = table && setup.stage !== "setting" ? project(table, "spectator") : undefined;
		setup.seats.forEach((one, at) => {
			const life = view?.players?.find((facts) => facts.id === at)?.life;
			const moved = one.setAs !== undefined && one.setAs !== at ? ` (set up as seat ${one.setAs})` : "";
			lines.push(`  Seat ${at}${moved}  ${table?.seats[at]?.name ?? one.deck}  ${one.by === "ai" ? "model" : one.by}${life !== undefined ? `  life ${life}` : ""}`);
		});
		if (view?.window.kind === "turn") lines.push(`  Turn ${view.window.turn}, ${table!.seats[view.window.active]?.name}'s ${view.window.step.replace(/-/g, " ")}. Version ${table!.ledger.length}.`);
		const asking = holding?.asking();
		if (asking) lines.push(`  Waiting on seat ${asking.seat} for ${Math.round((Date.now() - asking.since) / 1000)}s.`);
		// Pi shows ten lines of a text widget: the status, the last few public lines, and what the host can do next.
		if (setup.stage === "playing") lines.push(...host.feed.slice(-FEED).map((line) => `  · ${line.length > 110 ? `${line.slice(0, 107)}...` : line}`));
		lines.push(`  ${setup.stage === "prepared" && table?.ledger.length ? `/magic begin asks every seat to play on from version ${table.ledger.length}.` : NEXT[setup.stage]}`);
		return lines;
	}

	/** Public lines the host's widget keeps in view; the turn recaps also go to the chat. */
	const FEED = 4;
	const NEXT: Record<Lobby["stage"], string> = {
		setting: "/magic seat <n> deck <name|random>, /magic first <coin|n>, then /magic start asks every seat to prepare.",
		preparing: "Decks register, card assessments load and model seats write their briefs.",
		prepared: "/magic begin asks every seat to begin: the hands are dealt and the mulligans start.",
		playing: "/magic pause | continue | rollback <version> [why] | end [why]",
		over: "/magic host sets a new table. /magic rollback <version> rewinds this one; /magic resume seats it again.",
	};

	/** Admitted alpha decks: legal main decks whose cards all have standing assessments. */
	const pool = (ctx: ExtensionContext) =>
		admittedAlpha(universe(standard.name), { notice: (message) => ctx.ui.notify(message, "warning") }).map((one) => one.name);

	/**
	 * Set a table. Decks come from the words (`A vs B`, `random`), or from a menu
	 * per seat. Nothing is prepared or dealt: the two agreements come later.
	 */
	async function setTable(ctx: ExtensionContext, rest: string) {
		if (running) { ctx.ui.notify("A game is in play. /magic end it, or /magic pause and leave it, first.", "warning"); return; }
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
		host = { lobby: lobby(chosen), feed: [] };
		table = null; seated = null;
		showTable(ctx);
		ctx.ui.notify(`Table set: ${chosen.join(" vs ")}. Both seats are model seats. ${NEXT.setting}`, "info");
	}

	/** First agreement: every seat agrees to prepare. The coin flip orders the seats, then preparation runs beside the session. */
	async function startTable(ctx: ExtensionContext) {
		if (!host || host.lobby.stage !== "setting") { ctx.ui.notify(host ? `The table is ${host.lobby.stage}.` : "No table. /magic host sets one.", "warning"); return; }
		const setup = host.lobby;
		const declined = await agree(setup, "prepare", async () => true);
		if (declined.length) { ctx.ui.notify(`Seat ${declined.join(", ")} did not agree to prepare.`, "warning"); return; }
		const { order, by } = seatOrder(setup);
		setup.seats = order.map((at) => ({ ...setup.seats[at]!, setAs: at }));
		const decks = setup.seats.map((one) => one.deck);
		const base = `${slug(decks[0]!)}-vs-${slug(decks[1]!)}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
		let id = base;
		for (let n = 2; existsSync(join(GAMES, `${id}.jsonl`)); n++) id = `${base}-${n}`;
		setup.stage = "preparing";
		showTable(ctx);
		ctx.ui.notify(`Every seat agreed to prepare. ${by === "coin" ? "The coin flip" : "The host"} put ${decks[0]} on the play. Preparing ${id}.`, "info");
		const ours = host;
		void open(ctx, { seed: id, decks, alpha: true, setAs: order }).then(
			async ({ opened, sitting }) => {
				// A table replaced while this one prepared keeps its own game: this preparation is closed, not installed.
				if (host !== ours) { await Promise.all(Object.values(sitting.players).map((player) => player.close())); return; }
				table = opened; seated = sitting;
				ours.lobby.stage = "prepared";
				ctx.ui.notify(`Prepared ${id}. ${NEXT.prepared}`, "info");
			},
			(error) => { ours.lobby.stage = "setting"; if (host === ours) ctx.ui.notify(`Preparation failed: ${error instanceof Error ? error.message : String(error)}`, "error"); },
		).finally(() => showTable(ctx));
	}

	/** Second agreement: every seat agrees to begin, and the game plays beside the session so the host can still direct it. */
	async function beginTable(ctx: ExtensionContext) {
		if (!host || host.lobby.stage !== "prepared" || !table || !seated) { ctx.ui.notify(host ? `The table is ${host.lobby.stage}, not prepared.` : "No table. /magic host sets one.", "warning"); return; }
		const declined = await agree(host.lobby, "begin", async () => true);
		if (declined.length) { ctx.ui.notify(`Seat ${declined.join(", ")} did not agree to begin.`, "warning"); return; }
		const holding = hold(restartOf(table, universe(standard.name)), (direction, now, refused) => {
			if (refused) { ctx.ui.notify(`The table refused ${direction.do}: ${refused} Play goes on.`, "warning"); return; }
			if (direction.do !== "rollback") return;
			host?.feed.push(`The host rolled the game back to version ${direction.to}: ${direction.note}`);
			ctx.ui.notify(`Rolled back to version ${direction.to}. Every seat plans again.`, "info");
			const board = feedFor(ctx, now);
			board.take(`rolled-back-to-${direction.to}`);
		});
		seated.players = Object.fromEntries(Object.entries(seated.players).map(([id, player]) => [id, holding.seat(player, Number(id))]));
		Object.assign(host, { hold: holding, ticker: setInterval(() => showTable(ctx), 5_000) });
		host.lobby.stage = "playing";
		showTable(ctx);
		ctx.ui.notify(`Every seat agreed to begin. ${table.ledger.length ? "Play goes on." : "Dealing; the mulligans come first."}`, "info");
		host.game = playOn(ctx, table, seated, host);
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
		try { outcome = await run(opened, sitting, inference(ctx), commentator, watch, games.get(opened), 30_000,
			(turn) => board.take(`after-turn-${String(turn).padStart(2, "0")}`), ours.hold); }
		catch (error) { failure = error; }
		finally { running = false; clearInterval(ours.ticker); }
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
		const setAs = games.get(opened)?.header.seats;
		const setup = lobby(opened.seats.map((one) => one.deck.name));
		host = { lobby: { ...setup, seats: setup.seats.map((one, at) => ({ ...one, setAs: setAs?.[at]?.setAs ?? at })), stage: "prepared" }, feed: [] };
		showTable(ctx);
		ctx.ui.notify(`Resumed ${id} at version ${opened.ledger.length}. ${NEXT.prepared}`, "info");
	}

	const VERBS = ["host", "seat", "first", "start", "begin", "pause", "continue", "rollback", "end", "status", "resume", "clone", "models", "board", "step", "work", "log", "export", "cards", "rules"];
	const USAGE = "/magic opens the menu. /magic host [A vs B | random] | seat <n> deck <name|random> | first <coin|n> | start | begin | " +
		"pause | continue | rollback <version> [why] | end [why] | status | resume <game> | clone <game> <version> <new-id> | " +
		"models [why|<role> <pattern> [seat]] | board | step | work [seat] | log | export <game> [public|full|<seat>] | cards [format|universe] | rules <query|build>";

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
				const choice = await ctx.ui.select("Magic", [...(host ? ["Table status"] : []), "Host a table", "Resume a saved game", "Models", "Help"]);
				if (choice === "Host a table") return setTable(ctx, "");
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
			if (verb === "status") { ctx.ui.notify(tableLines().join("\n"), "info"); return; }
			if (verb === "rollback" || verb === "end") return direct(ctx, words);
			if (verb === "resume") return resumeGame(ctx, seed);

			if (verb === "seat" || verb === "first") {
				if (!host || host.lobby.stage !== "setting") { ctx.ui.notify("Seats and who plays first are set before /magic start.", "warning"); return; }
				if (verb === "first") {
					const first = words[1] === "coin" ? "coin" as const : Number(words[1]);
					if (first !== "coin" && !host.lobby.seats[first]) { ctx.ui.notify("/magic first <coin|seat>", "warning"); return; }
					host.lobby.first = first;
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

	// A closing Pi leaves a game in play resumable: it stops the run and writes no end.
	pi.on("session_shutdown", async () => {
		if (running && host?.hold) { host.hold.direct({ do: "leave" }); await host.game; }
		await Promise.all(Object.values(seated?.players ?? {}).map((player) => player.close()));
		table = null;
		seated = null;
		host = null;
	});
}
