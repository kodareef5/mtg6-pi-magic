/**
 * What a seat reads.
 *
 * Two jobs, kept together because they are one thought and splitting them means
 * reading two files to answer one question.
 *
 *   project   the table, filtered to what one seat has earned, in words
 *   render    a frame, laid out for a model to act on
 *
 * The engine writes the words because it is the only thing that knows which
 * facts this seat has earned. The reader only lays them out. That is also why
 * nothing here needs to understand Magic.
 */

import { cardsIn, seat, type Receipt, type Table } from "./table.ts";
import type { Frame, SeatView, Viewer } from "./types.ts";

/**
 * The only way facts leave the engine. Nothing else reads the table on a
 * seat's behalf.
 *
 * Hidden things keep their shape. Six unknown cards in an opponent's hand are
 * six unknown cards: not nothing, not six names. A seat's knowledge is what it
 * has legitimately seen, minus what has since been hidden, plus what is public.
 * Shuffling a revealed card away leaves the knowledge that it is in there.
 *
 * A spectator has no private entitlements, so its view is the publishable one.
 * Everything a game puts on a URL comes through here first. Publishing the
 * stored game instead would hand over every hand, and no care at the edge
 * fixes that.
 */
export function project(table: Table, viewer: Viewer, since = table.log.length): SeatView {
	const cursor = table.cursor;
	const step = cursor.steps[0] ?? "between turns";
	const holder = cursor.priority === null ? "nobody" : seat(table, cursor.priority).name;

	const lines = [
		`Turn ${cursor.turn}, ${step}. ${seat(table, cursor.active).name} is active, ${holder} has priority.`,
	];
	for (const s of table.seats) {
		const field = cardsIn(table, "battlefield").filter((t) => t.controller === s.id);
		lines.push(
			`${s.name}: ${s.life} life, ${cardsIn(table, "hand", s.id).length} in hand, ` +
				`${cardsIn(table, "library", s.id).length} in library, ` +
				`${cardsIn(table, "graveyard", s.id).length} in graveyard, ` +
				`${field.length} on the battlefield` +
				(s.result ? `, has ${s.result}` : ""),
		);
	}
	for (const permanent of cardsIn(table, "battlefield")) {
		const marks = [
			permanent.tapped ? "tapped" : null,
			permanent.damage ? `${permanent.damage} damage marked` : null,
			...Object.entries(permanent.counters).map(([kind, n]) => `${n} ${kind}`),
		].filter(Boolean);
		lines.push(
			`  ${permanent.card} (${seat(table, permanent.controller).name})` +
				(marks.length ? `, ${marks.join(", ")}` : ""),
		);
	}
	for (const item of cardsIn(table, "stack")) lines.push(`  on the stack: ${item.card}`);

	// A spectator has earned nothing private, so it gets the public lines only.
	const yours: string[] = [];
	if (viewer !== "spectator") {
		const hand = cardsIn(table, "hand", viewer);
		yours.push(
			hand.length ? `Your hand: ${hand.map((c) => c.card).sort().join(", ")}` : "Your hand is empty",
		);
		const pool = seat(table, viewer).pool;
		for (const mana of pool) {
			yours.push(`Mana: ${mana.color}${mana.spendOnly ? ` (only on ${mana.spendOnly})` : ""}`);
		}
		const owed = table.opening?.owed[viewer] ?? 0;
		if (owed) yours.push(`${owed} card${owed === 1 ? "" : "s"} still owed to the bottom of your library`);
	}

	return { table: lines, yours, since: table.log.slice(since).map((r) => describe(table, r)) };
}

/**
 * One receipt in a player's words, with the reason. "Blue sacrificed a
 * Treasure", never "object 14 moved to graveyard".
 *
 * Public facts only. Which card moved between two hidden zones is not one, so a
 * move nobody could see says only that it happened.
 */
export function describe(table: Table, receipt: Receipt): string {
	const parts: string[] = [];
	for (const change of receipt.changes) {
		switch (change.do) {
			case "move": {
				const moved = table.things.get(change.what);
				if (!moved) break;
				const who = seat(table, moved.owner).name;
				const hidden = change.to === "hand" || change.to === "library";
				parts.push(
					hidden
						? `${who} moved a card to their ${change.to} (${change.reason})`
						: `${who} put ${moved.card} into ${change.to} (${change.reason})`,
				);
				break;
			}
			case "tap":
			case "untap":
				parts.push(`${change.do}ped ${table.things.get(change.what)?.card ?? "a permanent"}`);
				break;
			case "shuffle":
				parts.push(`${seat(table, change.whose).name} shuffled`);
				break;
			case "change-life":
				parts.push(
					`${seat(table, change.who).name} ${change.amount < 0 ? "lost" : "gained"} ` +
						`${Math.abs(change.amount)} life (${change.reason})`,
				);
				break;
			case "mark-player":
				parts.push(`${seat(table, change.who).name}: ${change.key} +${change.add}`);
				break;
			case "end-game":
				parts.push(`${seat(table, change.who).name} ${change.result}s the game`);
				break;
		}
	}
	// Several identical lines in one group read worse than a count of them.
	const counted = new Map<string, number>();
	for (const part of parts) counted.set(part, (counted.get(part) ?? 0) + 1);
	return [...counted]
		.map(([part, n]) => (n > 1 ? `${part} (x${n})` : part))
		.join("; ");
}

/**
 * The frame as text. This is the whole guidance a player gets, so it says what
 * is true and nothing about what is good. Advice here would make every seat
 * play the same way and hide the alternatives.
 */
export function render(frame: Frame): string {
	const out = [
		`Chair ${frame.seat}, version ${frame.version}.`,
		...frame.view.table,
	];
	if (frame.view.yours.length) out.push("", ...frame.view.yours);
	if (frame.view.since.length) out.push("", "Since your last look:", ...frame.view.since.map((l) => `  ${l}`));

	if (!frame.decision) {
		out.push("", "Not your turn to act.");
		return out.join("\n");
	}

	out.push("", frame.decision.question);
	for (const option of frame.decision.options) {
		out.push(`  ${option.id}  ${option.label}`);
		if (option.shows) out.push(`      ${option.shows}`);
	}
	// The one route out. It stays at this decision: it does not pass, undo a
	// paid cost, change a locked choice, or reveal anything unearned.
	out.push("", "Answer with one option id, or ask for more options.");
	return out.join("\n");
}
