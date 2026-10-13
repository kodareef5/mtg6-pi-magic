/**
 * Replays saved games off the main thread, so the games list can say which
 * are over, and how, from the journals themselves. A replay can take seconds,
 * and a Pi playing a game must not stop for one. Run as a worker thread, with
 * the card list and rules files as its data.
 */
import { parentPort, workerData } from "node:worker_threads";
import { load } from "../core/cards.ts";
import { start } from "../core/commit.ts";
import { standard } from "../core/format.ts";
import { replay } from "../core/journal.ts";
import { load as loadRules } from "../core/rules.ts";

const { cards: cardsPath, rules: rulesPath } = workerData as { cards: string; rules: string };
const cards = load(cardsPath), rules = loadRules(rulesPath);
parentPort!.on("message", ({ id, path }: { id: string; path: string }) => {
	try {
		const { table } = replay(path, (saved) => start(standard, saved.seats.map((at) => ({ name: at.name, deck: at.deck })), saved.seed, cards), undefined, { cards, rules });
		parentPort!.postMessage({ id, outcome: table.outcome?.results ?? null, turn: table.cursor.turn, decisions: table.ledger.length });
	} catch (error) {
		parentPort!.postMessage({ id, error: String(error) });
	}
});
