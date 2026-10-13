/**
 * A person's seat in words: the board as that seat may see it, what happened
 * since its last choice, its plan, and the question with numbered options. It
 * reads only the seat's own frame, so it shows nothing the seat could not see.
 * The picture beside it comes from the same snapshot.
 */

import { boardSnapshot, type BoardCard } from "../board/snapshot.ts";
import type { SeatId } from "../core/types.ts";
import { menu, type Asking, type Mode, type Stops } from "./person.ts";
import type { State } from "./protocol.ts";

const card = (one: BoardCard) => [one.name ?? "a face-down card", one.power !== undefined ? ` ${one.power}/${one.toughness}` : "",
	one.counters && Object.keys(one.counters).length ? ` (${Object.entries(one.counters).map(([kind, n]) => `${n} ${kind}`).join(", ")})` : "",
	one.tapped ? " (tapped)" : "", one.summoningSick ? " (new)" : "", one.attacking ? " (attacking)" : "", one.blocking ? " (blocking)" : ""].join("");
const list = (cards: BoardCard[]) => cards.length ? cards.map(card).join(", ") : "nothing";

export function panel(state: State, mode: Mode, asking: Asking | null, stops: Stops = "smart"): string[] {
	const frame = asking?.frame ?? state.frame, seats = state.seats ?? [], me = state.seat;
	if (!frame || me === undefined) return [];
	const board = boardSnapshot(frame.view, seats.map((one) => ({ id: one.id, name: one.name, deck: one.deck.name })), me as SeatId);
	const mine = board.seats.find((one) => one.id === me), theirs = board.seats.filter((one) => one.id !== me);
	const lines = [
		`${board.finished ? "Game over" : board.turn ? `Turn ${board.turn}, ${board.active === me ? "your" : `${seats.find((one) => one.id === board.active)?.name}'s`} ${board.step?.replace(/-/g, " ")}` : "Opening hands"} · ${mode} mode, ${stops} stops` +
			` · life: you ${mine?.life ?? "?"}, ${theirs.map((one) => `${one.name} ${one.life}`).join(", ")}`,
		...theirs.map((one) => `${one.name}: hand ${one.hand}, library ${one.library}, graveyard ${one.graveyard.length} · battlefield: ${list(one.battlefield)}`),
		`You: library ${mine?.library ?? "?"}, graveyard ${mine?.graveyard.length ?? 0} · battlefield: ${list(mine?.battlefield ?? [])}`,
		`Your hand: ${list(mine?.handCards ?? [])}`,
		...(board.stack.length ? [`Stack, top first: ${board.stack.map((one) => `${one.name ?? one.claim ?? "an ability"} (${seats.find((seat) => seat.id === one.controller)?.name})`).join("; ")}`] : []),
		...frame.view.since.slice(-3).map((line) => `  ${line}`),
		...(frame.view.work?.plan ? [`Plan: ${frame.view.work.plan.objective}`] : []),
	];
	if (!asking) return [...lines, mode === "auto" ? "The autopilot is playing this seat. /magic mode suggest or manual takes it back." : "Waiting for the table."];
	return [...lines,
		...(asking.frame.refused?.length ? [`Refused: ${asking.frame.refused.at(-1)}`] : []),
		asking.frame.decision?.question ?? "Choose.",
		...menu(asking).map((line, at) => `  ${at + 1}. ${line.label}${asking.suggestion?.option === line.option.id ? "   <- autopilot" : ""}`),
		`Type a number${asking.suggestion ? ", or ok for the autopilot's choice" : ""}.${state.remaining !== undefined ? ` About ${Math.round(state.remaining / 1000)}s on the clock when asked.` : ""} /magic show <n> explains an option.`,
	];
}
