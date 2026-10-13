/**
 * Replays saved games off the main thread, so a Pi playing a game never stops
 * for one: the games list learns which are over, and how, from the journals
 * themselves, and a saved game's page gets its moments. A replay can take
 * seconds. Run as a worker thread, with the card list and rules files as its
 * data.
 */
import { parentPort, workerData } from "node:worker_threads";
import { gameStats, type Run } from "../board/stats.ts";
import { audienceOnly } from "../board/series.ts";
import { load } from "../core/cards.ts";
import { start } from "../core/commit.ts";
import { standard } from "../core/format.ts";
import { replay } from "../core/journal.ts";
import { load as loadRules } from "../core/rules.ts";
import { momentsOf } from "./games.ts";

const { cards: cardsPath, rules: rulesPath } = workerData as { cards: string; rules: string };
const cards = load(cardsPath), rules = loadRules(rulesPath);
parentPort!.on("message", ({ id, path, moments, run }: { id: string; path: string; moments?: true; run?: Run }) => {
	try {
		if (moments) {
			// A game with a result shows every perspective; any other, the audience's alone.
			const back = momentsOf(path, cards, rules), finished = !!back.table.outcome;
			parentPort!.postMessage({ id, header: back.header, finished, seats: back.table.seats.map((one) => ({ id: one.id, name: one.name })),
				stats: gameStats(back.table, back.header.created, run), viewers: finished ? back.viewers : ["spectator"], moments: finished ? back.moments : audienceOnly(back.moments) });
			return;
		}
		const { table } = replay(path, (saved) => start(standard, saved.seats.map((at) => ({ name: at.name, deck: at.deck })), saved.seed, cards), undefined, { cards, rules });
		parentPort!.postMessage({ id, outcome: table.outcome?.results ?? null, turn: table.cursor.turn, decisions: table.ledger.length });
	} catch (error) {
		parentPort!.postMessage({ id, error: String(error) });
	}
});
