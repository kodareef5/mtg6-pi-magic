/**
 * A game's numbers, counted from its log and ledger after a replay, so any
 * saved game has them, and its run's time and cost when a result was saved.
 * Apart from the replay page so a worker thread can count them without
 * loading the board's renderer.
 */
import type { Table } from "../core/table.ts";

/** What the game's records count, per seat and for the game, and what its run cost when a result was saved. */
export type Stats = { seats: { name: string; deck: string; result?: string; counts: [string, number][] }[]; game: [string, string][] };

/** The run's own numbers, from its saved result: time, model calls and what they cost. */
export type Run = { elapsedMs: number; calls: number; input: number; output: number; cost: number; roles: { role: string; calls: number; cost: number }[] };

/** Counted from the game's log and ledger after a replay, so any saved game has them. */
export function gameStats(table: Table, played?: string, run?: Run): Stats {
	const tokens = new Map<string, number>();
	const owner = (id: string) => /^(\d+)-/.test(id) ? Number(/^(\d+)-/.exec(id)![1]) : tokens.get(id);
	const counts = table.seats.map(() => new Map<string, number>());
	const add = (seat: number | undefined, what: string, amount = 1) => { if (seat !== undefined && counts[seat]) counts[seat]!.set(what, (counts[seat]!.get(what) ?? 0) + amount); };
	for (const entry of table.log) for (const change of entry.changes as unknown as Record<string, unknown>[]) {
		if (change.do === "token") tokens.set(String(change.id), Number(change.controller));
		if (change.do === "move") {
			const seat = owner(String(change.what)), reason = String(change.reason);
			if (reason === "play-land") add(seat, "Lands played");
			if (reason === "cast") add(seat, "Spells cast");
			if (reason === "draw" && entry.reason !== "game-setup") add(seat, "Cards drawn");
			if (reason === "discard") add(seat, "Cards discarded");
			if (reason === "destroy" || reason === "sacrifice") add(seat, "Permanents destroyed or sacrificed");
		}
		if (change.do === "attack") for (const one of change.attackers as { id: string }[]) add(owner(one.id), "Attackers declared");
		// A damage source is an object's id or a reference to the object.
		if (change.do === "damage" && (change.target as { player?: number }).player !== undefined)
			add(owner(typeof change.source === "object" ? String((change.source as { id: string }).id) : String(change.source)), change.combat ? "Combat damage to players" : "Other damage to players", Number(change.amount));
	}
	const rows = table.ledger, by = (key: "why" | "by", value: string) => rows.filter((row) => row[key] === value).length;
	const winner = table.outcome && table.seats.filter((seat) => table.outcome!.results[seat.id] === "win").map((seat) => seat.name);
	const minutes = run && `${Math.floor(run.elapsedMs / 60_000)}m ${Math.round(run.elapsedMs / 1000) % 60}s`;
	return {
		seats: table.seats.map((seat, at) => ({ name: seat.name, deck: seat.deck.name, ...(table.outcome ? { result: table.outcome.results[seat.id] } : {}),
			counts: ["Lands played", "Spells cast", "Cards drawn", "Cards discarded", "Attackers declared", "Combat damage to players", "Other damage to players", "Permanents destroyed or sacrificed"]
				.map((what): [string, number] => [what, counts[at]!.get(what) ?? 0]) })),
		game: [
			["Result", !table.outcome ? "Unfinished" : winner?.length ? `${winner.join(" and ")} won on turn ${table.cursor.turn}` : `A draw on turn ${table.cursor.turn}`],
			["On the play", table.seats[0]?.name ?? "?"],
			...(played ? [["Played", new Date(played).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })] as [string, string]] : []),
			["Decisions", `${rows.length}: ${by("why", "chosen")} chosen, ${by("why", "forced")} forced, ${by("why", "fallback")} fallback, ${by("why", "timeout")} timeout`],
			["Chosen by", `models ${by("by", "model")}, people ${by("by", "person")}, the engine ${by("by", "engine")}`],
			...(run ? [
				["Wall time", minutes!],
				["Model calls", `${run.calls}, ${Math.round(run.input / 1000)}k tokens in, ${Math.round(run.output / 1000)}k out`],
				["Cost", `$${run.cost.toFixed(2)}${run.roles.length ? ` (${run.roles.map((one) => `${one.role} $${one.cost.toFixed(2)}`).join(", ")})` : ""}`],
			] as [string, string][] : []),
		],
	};
}

