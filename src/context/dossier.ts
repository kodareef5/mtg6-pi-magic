/**
 * The game dossier: projected facts shared by the strategy calls in a session.
 * Every call gets public zones, the seat's hand, mana, triggers, registered
 * lists and odds, card text, recent turns and the pregame matchup advice.
 * Only the coordinator also reads the notebook and standing plan. No physical facts are dropped
 * and no code judges the position. Model-written text is
 * quoted under a heading that names its author, so loud content stays inside
 * its section. Past 150 lines to keep every section beside the layout rules.
 */
import type { Frame, SeatId } from "../core/types.ts";
import type { SeenObject } from "../core/work.ts";
import type { Universe } from "../core/cards.ts";
import { odds, within } from "../core/odds.ts";
import { activeWatches } from "../core/triggers.ts";
import { cardDefinition } from "./strategy-position.ts";
import { manaLines } from "./strategy-facts.ts";
import { useSources } from "../core/readiness.ts";
import type { Brief } from "./brief.ts";
import type { Recap } from "./summary.ts";
import { strategySections } from "./dossier-strategy.ts";

export type DossierInput = { frame: Frame; forecast?: { from: Frame; assumptions: string }; brief?: Brief; cards?: Universe; recaps?: readonly Recap[] };

/** Table cells hold one line; a pipe would end the cell. */
export const cell = (value: unknown) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim() || "-";
export const table = (head: string[], rows: unknown[][]) => rows.length
	? [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)].join("\n") : "None.";
export const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
const percent = (chance: number) => `${(100 * chance).toFixed(1)}%`;
const words = (step: string) => step.replace(/-/g, " ");
export const named = (object: SeenObject) => object.card ?? object.token?.name ?? object.ability?.claim ?? (object.faceDown ? "a face-down card" : "an unknown object");
export const ref = (object: { id: string; incarnation: number }) => `${object.id}@${object.incarnation}`;

export function dossier(input: DossierInput, reader: "analyst" | "coordinator" = "coordinator"): string {
	const { frame } = input;
	const seats = frame.view.seats ?? frame.view.players?.map((one) => ({ id: one.id, name: `Seat ${one.id}` })) ?? [];
	const name = (seat: SeatId) => seats.find((one) => one.id === seat)?.name ?? `Seat ${seat}`;
	const me = name(frame.seat);
	return [
		`# Game dossier for ${me}`,
		"Everything you know as this player. The board, mana, deck lists, odds and printed card text come from the table. Registered triggers are accepted interpretations and can be wrong. Sections marked as written by a model are advice and can be wrong. The request at the end of the conversation says what to do with this.",
		situation(input, name),
		battlefield(frame, name), hand(frame), stack(frame, name), graveyards(frame, name),
		"## Mana", manaLines(frame).map((line) => `- ${line}`).join("\n"),
		triggers(frame, name), decks(frame, name), cardText(input),
		recent(frame, name, input.recaps),
		...strategySections(frame, input.brief, reader),
	].join("\n\n");
}

function situation({ frame, forecast }: DossierInput, name: (seat: SeatId) => string): string {
	const at = frame.view.window, lines: string[] = [];
	const players = frame.view.players ?? [];
	const you = players.find((one) => one.id === frame.seat), others = players.filter((one) => one.id !== frame.seat);
	if (forecast) lines.push(`- This is a forecast, not the current position. ${forecast.assumptions}`,
		`- Observed now: ${forecast.from.view.window.kind === "turn" ? `${name(forecast.from.view.window.active)}'s turn ${forecast.from.view.window.turn}, ${words(forecast.from.view.window.step)}` : "the opening"}.`);
	const decks = frame.view.decks ?? [];
	lines.push(`- You are ${name(frame.seat)} (seat ${frame.seat})${decks.find((one) => one.seat === frame.seat) ? `, playing ${decks.find((one) => one.seat === frame.seat)!.name}` : ""}. ` +
		others.map((one) => `${name(one.id)} (seat ${one.id})${decks.find((deck) => deck.seat === one.id) ? ` plays ${decks.find((deck) => deck.seat === one.id)!.name}` : ""}.`).join(" "));
	if (at.kind === "turn") {
		const mine = at.active === frame.seat;
		lines.push(`- ${forecast ? "Planned" : "Now"}: ${mine ? "your" : `${name(at.active)}'s`} turn ${at.turn} on the table counter, ${words(at.step)} step. ${players.length === 2 ? `Your turns are ${mine ? at.turn : at.turn + 1}, ${(mine ? at.turn : at.turn + 1) + 2} and so on; the opponent's are ${mine ? at.turn + 1 : at.turn}, ${(mine ? at.turn + 1 : at.turn) + 2} and so on.` : ""}`.trimEnd());
		if (frame.view.remainingSteps?.length) lines.push(`- Steps left this turn, in order: ${frame.view.remainingSteps.map(words).join(", ")}.`);
	} else lines.push("- The game is in its opening.");
	lines.push(`- Life: you ${you?.life ?? "unknown"}, ${others.map((one) => `${name(one.id)} ${one.life}`).join(", ")}.`,
		`- Cards in hand: you ${you?.hand ?? 0}, ${others.map((one) => `${name(one.id)} ${one.hand ?? 0}`).join(", ")}. Library: you ${you?.library ?? 0}, ${others.map((one) => `${name(one.id)} ${one.library ?? 0}`).join(", ")}.`);
	if (frame.view.turnDraw?.length) lines.push(`- Drawn this turn: ${frame.view.turnDraw.map((one) => one.card ?? "an unknown card").join(", ")}.`);
	const combat = frame.view.combat;
	if (combat && (combat.attackers.length || combat.choosing.length)) {
		const object = (one: { id: string }) => frame.view.objects?.find((candidate) => candidate.id === one.id);
		lines.push(`- Combat now: attacking ${combat.attackers.map((one) => `${object(one) ? named(object(one)!) : one.id} (${ref(one)})`).join(", ") || "nothing yet"}; ` +
			`blocking ${combat.blockers.map((one) => `${object(one) ? named(object(one)!) : one.id} blocks ${one.blocking.map((aim) => object(aim) ? named(object(aim)!) : aim.id).join(" and ")}`).join("; ") || "nothing yet"}.`);
	}
	return ["## Situation", ...lines].join("\n");
}

function state(frame: Frame, object: SeenObject, name: (seat: SeatId) => string): string {
	const labels = (frame.view.notes ?? []).filter((note) => note.kind === "label" && note.on.id === object.id && note.on.incarnation === object.incarnation).map((note) => note.kind === "label" ? note.text : "");
	const attached = object.attached && frame.view.objects?.find((one) => one.id === object.attached!.id);
	return [object.tapped ? "tapped" : "untapped", object.faceDown ? "face down" : "",
		object.traits?.types.includes("creature") && object.summoningSick ? "summoning-sick" : "",
		object.damage ? `${object.damage} damage marked` : "", attached ? `attached to ${named(attached)}` : "",
		object.controller !== object.owner ? `owned by ${name(object.owner)}` : "", ...labels.map((text) => `label: ${text}`)].filter(Boolean).join(", ");
}

const typeLine = (object: SeenObject) => object.traits
	? `${[...object.traits.supertypes, ...object.traits.types].map((one) => one[0]!.toUpperCase() + one.slice(1)).join(" ")}${object.traits.subtypes.length ? `, ${object.traits.subtypes.join(" ")}` : ""}` : "unknown";
const stats = (object: SeenObject) => object.traits?.power !== undefined ? `${object.traits.power}/${object.traits.toughness}` : "";

function battlefield(frame: Frame, name: (seat: SeatId) => string): string {
	const field = (frame.view.objects ?? []).filter((one) => one.zone === "battlefield");
	const side = (seat: SeatId, title: string) => {
		const mine = field.filter((one) => one.controller === seat).sort((a, b) => Number(!!a.traits?.types.includes("land")) - Number(!!b.traits?.types.includes("land")) || a.id.localeCompare(b.id));
		return `### ${title} (${mine.length})\n${table(["Id", "Permanent", "Type", "P/T", "Abilities now", "Counters", "State"], mine.map((one) => [ref(one), named(one), typeLine(one), stats(one),
			one.traits?.words.join(", ") || "", Object.entries(one.counters).map(([kind, n]) => `${kind} x${n}`).join(", "), state(frame, one, name)]))}`;
	};
	const others = [...new Set((frame.view.players ?? []).map((one) => one.id).filter((id) => id !== frame.seat))];
	return ["## Battlefield", "Power, toughness and abilities are current, after every effect. Ids read as object@incarnation.",
		side(frame.seat, "Yours"), ...others.map((seat) => side(seat, `${name(seat)}'s`))].join("\n\n");
}

function hand(frame: Frame): string {
	const held = (frame.view.objects ?? []).filter((one) => one.zone === "hand" && one.controller === frame.seat);
	return `## Your hand (${held.length})\nFull text is under card text.\n\n${table(["Id", "Card", "Cost", "Type", "P/T"], held.map((one) => {
		const printed = one.card ? frame.view.printed?.[one.card] : undefined;
		return [ref(one), named(one), printed?.mana ?? "", printed?.type ?? typeLine(one), printed?.stats ?? stats(one)];
	}))}`;
}

function stack(frame: Frame, name: (seat: SeatId) => string): string {
	const items = (frame.view.objects ?? []).filter((one) => one.zone === "stack").sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
	if (!items.length) return "## Stack\nEmpty.";
	return `## Stack\nTop first. The top object resolves first once every player passes in a row.\n\n${items.map((one, at) =>
		`${at + 1}. ${name(one.controller)}: ${named(one)} (${ref(one)})${one.ability && one.ability.claim !== named(one) ? `, ${one.ability.claim}` : ""}${one.ability?.targets?.length ? `, targets ${JSON.stringify(one.ability.targets)}` : ""}`).join("\n")}`;
}

function graveyards(frame: Frame, name: (seat: SeatId) => string): string {
	const seats = (frame.view.players ?? []).map((one) => one.id).sort((a, b) => Number(a !== frame.seat) - Number(b !== frame.seat));
	const permits = (frame.view.notes ?? []).filter((note) => note.kind === "permit");
	// Lands this seat may play from where they lie, by a standing permission such as playing lands from a graveyard.
	const lands = new Set(useSources(frame, { source: { zones: ["graveyard", "exile"], controller: "any" }, timing: "land" }).map((one) => ref(one)));
	const list = (zone: "graveyard" | "exile", seat: SeatId) => {
		const here = (frame.view.objects ?? []).filter((one) => one.zone === zone && one.owner === seat);
		return here.length ? here.map((one) => {
			const permit = permits.find((note) => note.kind === "permit" && note.on.id === one.id && note.on.incarnation === one.incarnation);
			return `${named(one)} (${ref(one)})${permit && permit.kind === "permit" ? `, ${permit.who === frame.seat ? "you" : name(permit.who)} may play it from turn ${permit.fromTurn}` : lands.has(ref(one)) ? ", you may play it as your land" : ""}`;
		}).join("; ") : "empty";
	};
	return ["## Graveyards and exile", ...seats.flatMap((seat) => [`- ${seat === frame.seat ? "Your" : `${name(seat)}'s`} graveyard: ${list("graveyard", seat)}.`,
		`- ${seat === frame.seat ? "Your" : `${name(seat)}'s`} exiled cards: ${list("exile", seat)}.`])].join("\n");
}

function triggers(frame: Frame, name: (seat: SeatId) => string): string {
	const watched = activeWatches(frame);
	return `## Triggers on the battlefield\n${watched.length ? watched.map((one) => `- ${one.source.name} (${one.source.id}, ${one.source.controller === frame.seat ? "yours" : name(one.source.controller)}): "${one.basis}"${one.matchingNow?.length ? `. Matching now: ${one.matchingNow.map((match) => match.name).join(", ")}.` : ""}`).join("\n") : "None."}`;
}

function decks(frame: Frame, name: (seat: SeatId) => string): string {
	const lists = frame.view.decks ?? [];
	if (!lists.length) return "## Decks and odds\nNo deck list is registered in this game, so no odds can be counted.";
	const sections = [...lists].sort((a, b) => Number(b.seat === frame.seat) - Number(a.seat === frame.seat)).map((deck) => {
		const found = odds(frame, deck.seat), mine = deck.seat === frame.seat, first = Object.values(found)[0];
		const rows = Object.entries(deck.cards).map(([card, count]) => {
			const one = found[card];
			const remaining = one?.remaining ?? 0;
			return mine ? [card, count, count - remaining, remaining, percent(one?.draw ?? 0), percent(first ? within(found, [card], first.pool, 2) : 0), percent(first ? within(found, [card], first.pool, 3) : 0)]
				: [card, count, count - remaining, remaining, percent(one?.inHand ?? 0), percent(one?.draw ?? 0)];
		}).sort((a, b) => Number(b[3]) - Number(a[3]) || String(a[0]).localeCompare(String(b[0])));
		const player = frame.view.players?.find((one) => one.id === deck.seat);
		const title = mine ? `### Your library: ${player?.library ?? 0} cards, from ${deck.name}` : `### ${name(deck.seat)}'s unseen cards: ${player?.hand ?? 0} in hand and ${player?.library ?? 0} in library, from ${deck.name}`;
		return [title, table(mine ? ["Card", "In list", "Seen", "In library", "Next draw", "Within 2 draws", "Within 3 draws"] : ["Card", "In list", "Seen", "Unaccounted", "In hand now", "Their next draw"], rows),
			first ? `Basis: ${first.basis}.` : ""].filter(Boolean).join("\n\n");
	});
	return ["## Decks and odds", "Counted from the registered lists and what you have seen, never from hidden cards. Each chance stands alone; do not multiply them. Cards revealed earlier and library positions you learned are not yet remembered here.", ...sections].join("\n\n");
}

function cardText({ frame, cards }: DossierInput): string {
	const listed = (frame.view.decks ?? []).flatMap((deck) => Object.keys(deck.cards));
	const visible = (frame.view.objects ?? []).flatMap((one) => one.card ? [one.card] : []);
	const names = [...new Set([...listed, ...visible])].sort();
	const tokens = [...new Map((frame.view.objects ?? []).filter((one) => one.token).map((one) => [one.token!.name, one])).values()];
	return ["## Card text", "Every card on the registered lists and every visible card, once each. Oracle text is quoted as printed.",
		...names.map((card) => {
			const printed = cardDefinition(frame, card, cards);
			return printed ? `### ${card}\n${[printed.mana, printed.type, printed.stats].filter(Boolean).join(", ")}\n\n${quote(printed.oracle || "No rules text.")}` : `### ${card}\nNo printed definition is available.`;
		}),
		...tokens.map((one) => `### ${one.token!.name} (token)\n${typeLine(one)}${stats(one) ? `, ${stats(one)}` : ""}${one.traits?.words.length ? `\n\n${quote(one.traits.words.join(", "))}` : ""}`),
	].join("\n\n");
}

/** Noise in a condensed turn: taps, mana bookkeeping and the start of a resolution. */
const bookkeeping = /^(tapped |untapped |.+ added |.+ spent |Begin resolving |triggered: )/;

function recent(frame: Frame, name: (seat: SeatId) => string, recaps?: readonly Recap[]): string {
	const turns = frame.view.recent ?? [];
	if (!turns.length) return "## Recent turns\nNothing has happened yet this game.";
	const full = new Set(turns.slice(-2).map((one) => one.turn));
	const lines = (one: (typeof turns)[number]) => one.lines.map((line) => line.split("; ").filter((part) => !/ spent mana-/.test(part) && (full.has(one.turn) || !bookkeeping.test(part))).join("; ")).filter(Boolean);
	const sections = turns.map((one) => `### Turn ${one.turn}, ${one.active === frame.seat ? "your turn" : `${name(one.active)}'s turn`}${full.has(one.turn) ? "" : ", condensed"}\n${lines(one).map((line) => `- ${line}`).join("\n") || "- Nothing recorded."}`);
	const said = (recaps ?? []).filter((one) => turns.some((turn) => turn.turn === one.turn));
	return ["## Recent turns", "The last five turns from your seat, oldest first. The last two are in full; earlier turns omit taps and mana bookkeeping.", ...sections,
		...(said.length ? ["### Turn summaries", quote(said.map((one) => `Turn ${one.turn}: ${one.line}`).join("\n"))] : [])].join("\n\n");
}
