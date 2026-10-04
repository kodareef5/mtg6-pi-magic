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
 * The projection and its receipt renderer stay together past 150 lines so
 * both use the same visibility filter.
 */

import { cardsIn, playing, seat, type Receipt, type Table, type Thing } from "./table.ts";
import { happened } from "./selectors.ts";
import { owedFor, mulligansSettled } from "./pregame.ts";
import { STEPS } from "./steps.ts";
import { characteristics } from "./characteristics.ts";
import type { Frame, SeatView, Viewer, Window } from "./types.ts";

const PUBLIC = new Set(["battlefield", "graveyard", "stack", "exile", "command", "dungeon"]);
const visible = (thing?: Thing): thing is Thing => !!thing && !thing.faceDown && PUBLIC.has(thing.zone);
const publicName = (thing?: Thing) => visible(thing) ? thing.card ?? thing.token?.name ?? thing.ability?.claim ?? "an unnamed object" : "an unknown card";

function window(table: Table): Window {
	if (table.outcome) return { kind: "finished" };
	const opening = table.opening;
	if (!opening) return { kind: "opening", action: "deal" };
	if (!mulligansSettled(table)) {
		const action = Object.values(opening.owed).some((n) => n > 0) ? "bottom" :
			table.seats.some((s) => !opening.kept.includes(s.id) && !opening.declared[s.id]) ? "declare" : "redraw";
		return { kind: "opening", action };
	}
	const { turn, active, steps } = table.cursor;
	const step = steps[0]!;
	return { kind: "turn", turn, active, step, phase: STEPS[step].phase };
}

/**
 * The only way facts leave the engine. Nothing else reads the table on a
 * seat's behalf.
 *
 * Hidden things keep their shape. Six unknown cards in an opponent's hand are
 * six unknown cards. Registered deck counts are public, but carry no object
 * ids or hidden order. Remembered reveals and known library positions still
 * need the knowledge transitions in knowledge.ts.
 *
 * A spectator has no private entitlements, so its view is the publishable one.
 * Everything a game puts on a URL comes through here first. Publishing the
 * stored game instead would hand over every hand, and no care at the edge
 * fixes that.
 */
export function project(table: Table, viewer: Viewer, since = table.log.length): SeatView {
	const cursor = table.cursor;
	const at = window(table);
	const holder = cursor.priority === null ? "nobody" : seat(table, cursor.priority).name;

	const lines = [at.kind === "turn"
		? `Turn ${at.turn}, ${at.phase}, ${at.step}. ${seat(table, at.active).name} is active, ${holder} has priority.`
		: at.kind === "opening" ? `Opening: ${at.action}. ${table.seats[0]!.name} starts. Nobody has priority.`
		: "Game over."];
	for (const s of table.seats) {
		const field = cardsIn(table, "battlefield").filter((t) => t.controller === s.id);
		lines.push(
			`${s.name}: ${s.life} life, ${cardsIn(table, "hand", s.id).length} in hand, ` +
				`${cardsIn(table, "library", s.id).length} in library, ` +
				`${cardsIn(table, "graveyard", s.id).length} in graveyard, ` +
				`${field.length} on the battlefield` +
				(s.result ? `, has ${s.result}` : ""),
		);
		if (at.kind === "opening") {
			const opening = table.opening;
			lines.push(`  ${opening?.taken[s.id] ?? 0} mulligans; ` +
				(opening?.kept.includes(s.id) ? "kept" : opening?.declared[s.id] ?? "has not declared"));
		}
		if (s.pool.length) lines.push(`  Mana for ${s.name}: ${s.pool.map((mana) => `${mana.id} ${mana.color}${mana.spendOnly ? ` (only on ${JSON.stringify(mana.spendOnly)})` : ""}${mana.persists ? " (persists)" : ""}`).join(", ")}`);
	}
	for (const permanent of cardsIn(table, "battlefield")) {
		const marks = [
			permanent.tapped ? "tapped" : null,
			permanent.damage ? `${permanent.damage} damage marked` : null,
			...Object.entries(permanent.counters).map(([kind, n]) => `${n} ${kind}`),
			...table.notes.flatMap((note) => note.kind === "label" && note.on.id === permanent.id && note.on.incarnation === permanent.incarnation ? [`"${note.text}" until ${note.until}`] : []),
		].filter(Boolean);
		lines.push(
			`  ${publicName(permanent)} (${seat(table, permanent.controller).name})` +
				(marks.length ? `, ${marks.join(", ")}` : ""),
		);
	}
	for (const zone of ["stack", "graveyard", "exile", "command", "dungeon"] as const) {
		for (const item of cardsIn(table, zone)) {
			lines.push(`  ${zone}: ${publicName(item)} (${seat(table, item.owner).name})`);
		}
	}

	// A spectator has earned nothing private, so it gets the public lines only.
	const yours: string[] = [];
	if (viewer !== "spectator") {
		const hand = cardsIn(table, "hand", viewer);
		yours.push(
			hand.length ? `Your hand: ${hand.map((c) => c.card).sort().join(", ")}` : "Your hand is empty",
		);
		const pool = seat(table, viewer).pool;
		for (const mana of pool) {
			yours.push(`Mana: ${mana.color}${mana.spendOnly ? ` (only on ${JSON.stringify(mana.spendOnly)})` : ""}`);
		}
		const owed = table.opening?.owed[viewer] ?? 0;
		if (owed) yours.push(`${owed} card${owed === 1 ? "" : "s"} still owed to the bottom of your library`);
		else if (at.kind === "opening" && at.action === "declare" && table.format.mulliganBottom === "on-keep") {
			yours.push(`Keeping this hand puts ${owedFor(table, viewer)} on the bottom.`);
		}
	}

	const objects = [...table.things.values()]
		.filter((item) => PUBLIC.has(item.zone) || (viewer !== "spectator" && item.zone === "hand" && item.owner === viewer))
		.map((item) => {
			const { card, ...seen } = structuredClone(item);
			// Read through the layers on every projection, never stored on the object.
			const traits = characteristics(table, item);
			return item.faceDown ? seen : { ...seen, card, ...(traits ? { traits: structuredClone(traits) } : {}) };
		});
	if (table.combat) {
		const combat = table.combat, named = (one: { id: string }) => publicName(table.things.get(one.id));
		for (const one of combat.attackers) lines.push(`Attacking ${seat(table, one.defending).name}: ${named(one)}${combat.blocked.some((aimed) => aimed.id === one.id) ? ", blocked" : ""}`);
		for (const one of combat.blockers) lines.push(`Blocking: ${named(one)} blocks ${one.blocking.map(named).join(", ")}`);
		for (const pick of combat.choosing) lines.push("blocker" in pick ? `Declaring a block: ${named(pick.blocker)} on ${named(pick.attacker)}` : `Declaring an attacker: ${named(pick.attacker)}`);
	}
	for (const trigger of table.waiting) {
		const source = table.things.get(trigger.source.id);
		lines.push(`Waiting to go on the stack: ${seat(table, trigger.controller).name}'s ${source && source.incarnation === trigger.source.incarnation ? publicName(source) : "trigger"}: ${trigger.basis}`);
	}
	// A rollback does not make anyone forget: every seat is told it happened.
	for (const { case: open, ruling, kept } of table.rulings) {
		const by = seat(table, open.raisedBy).name;
		lines.push(kept !== undefined ? `The judge upheld ${by}'s objection to action ${open.row} (${ruling.rule}: ${ruling.because}); the game went back to just before it, and what was seen since stays known.`
			: `The judge heard ${by}'s objection to action ${open.row} and let it stand (${ruling.rule}: ${ruling.because}).`);
	}
	if (table.resolution) lines.push(`Resolving ${publicName(table.things.get(table.resolution.object))}, ${table.resolution.program.length} instruction${table.resolution.program.length === 1 ? "" : "s"} left. Nobody has priority during this choice.`);
	const names = [...new Set(objects.flatMap((object) => "card" in object && object.card ? [object.card] : []))].sort();
	return { ...(viewer !== "spectator" ? { began: table.cursor.began[viewer], landsPlayed: seat(table, viewer).landsPlayed } : {}),
		printed: Object.fromEntries(names.flatMap((name) => table.printed[name] ? [[name, table.printed[name]]] : [])), window: at, table: lines, yours, objects, pools: table.seats.map((seat) => ({ seat: seat.id, mana: structuredClone(seat.pool) })),
		...(table.format.decksRegistered ? { decks: table.seats.map(({ id, deck }) => ({ seat: id, name: deck.name,
			cards: Object.fromEntries(Object.entries(deck.main).sort(([a], [b]) => a.localeCompare(b))),
			sideboard: Object.fromEntries(Object.entries(deck.sideboard).sort(([a], [b]) => a.localeCompare(b))),
		})) } : {}),
		...(table.resolution ? { resolution: structuredClone(table.resolution) } : {}),
		players: playing(table).map((one) => ({ id: one.id, life: one.life, hand: cardsIn(table, "hand", one.id).length, library: cardsIn(table, "library", one.id).length })),
		notes: structuredClone(table.notes), combat: structuredClone(table.combat), history: happened(table),
		...(at.kind === "turn" ? { visit: table.cursor.visit } : {}),
		...(viewer !== "spectator" && table.work[viewer] ? { work: structuredClone(table.work[viewer]), done: table.ledger.flatMap((row) =>
			row.seat === viewer && row.execution?.plan === table.work[viewer]!.planned && row.execution?.step !== undefined ? [row.execution.step] : []) } : {}),
		since: table.log.slice(since).map((r) => describe(table, r)).filter(Boolean) };
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
			case "opening":
				if (change.action === "declare") parts.push(`${seat(table, change.who).name} declared ${change.choice}`);
				break;
			case "move": {
				// Removed objects have no after snapshot. Keep their event-time
				// identity from before the group.
				const was = receipt.before[change.what];
				const moved = receipt.after[change.what] ?? was;
				if (!moved) break;
				const who = seat(table, moved.owner).name;
				const name = visible(moved) ? moved.card : publicName(was);
				const terms = change.to === "battlefield" ? [change.tapped ? "tapped" : "", ...Object.entries(change.counters ?? {}).map(([kind, n]) => `${n} ${kind}`)].filter(Boolean) : [];
				parts.push(`${who} put ${name} into ${change.to} (${change.reason})${terms.length ? `, ${terms.join(", ")}` : ""}`);
				break;
			}
			case "tap":
			case "untap":
				parts.push(`${change.do}ped ${publicName(receipt.before[change.what])}`);
				break;
			case "damage":
				parts.push(`${"player" in change.target ? seat(table, change.target.player).name : publicName(receipt.before[change.target.id])} took ${change.amount}${change.combat ? " combat" : ""} damage from ${publicName(receipt.before[change.source] ?? table.things.get(change.source))}`);
				break;
			case "activate":
				parts.push(`${seat(table, change.ability.controller).name} announced: ${change.ability.claim} (${change.ability.timing === "mana" ? "immediate mana" : change.ability.timing === "spell" ? "spell on the stack" : "on the stack"})`);
				break;
			case "trigger":
				if (change.action === "wait") parts.push(`triggered: ${change.trigger.basis}`);
				else parts.push(change.ability ? `${seat(table, change.ability.controller).name} put on the stack: ${change.ability.claim}` : "a trigger with no legal targets was removed");
				break;
			case "add-mana":
				parts.push(`${seat(table, change.who).name} added ${change.colors.join(" ")}`);
				break;
			case "spend-mana":
				parts.push(`${seat(table, change.who).name} spent ${change.ids.join(", ")}`);
				break;
			case "resolution":
				if (change.action === "begin") parts.push(`Begin resolving ${publicName(receipt.before[change.what])}`);
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
			case "reveal": {
				// Revealing is the one motion that names a hidden card to everyone.
				const shown = receipt.before[change.what];
				if (shown) parts.push(`${seat(table, shown.owner).name} revealed ${shown.card ?? shown.token?.name ?? "a card"} from ${shown.zone}`);
				break;
			}
			case "counters":
				parts.push(`${change.amount < 0 ? "removed" : "put"} ${Math.abs(change.amount)} ${change.kind} ${change.amount < 0 ? "from" : "on"} ${publicName(receipt.before[change.what])}`);
				break;
			case "attach":
				parts.push(change.to ? `attached ${publicName(receipt.before[change.what])} to ${publicName(table.things.get(change.to.id) ?? receipt.before[change.to.id])}` : `unattached ${publicName(receipt.before[change.what])}`);
				break;
			case "note":
				if (change.note.kind === "label") parts.push(`labelled ${publicName(table.things.get(change.note.on.id) ?? receipt.before[change.note.on.id])}: ${change.note.text}`);
				if (change.note.kind === "register") parts.push(`${publicName(table.things.get(change.note.on.id) ?? receipt.before[change.note.on.id])} registered: ${change.note.registration.basis}`);
				break;
			case "cease":
				parts.push(`${publicName(receipt.before[change.what])} ceased to exist`);
				break;
			case "attack":
				parts.push(change.attackers.length ? `attacking: ${change.attackers.map((one) => publicName(receipt.before[one.id] ?? table.things.get(one.id))).join(", ")}` : "no attackers");
				break;
			case "block":
				parts.push(change.blockers.length ? `blocking: ${change.blockers.map((one) => `${publicName(table.things.get(one.id))} blocks ${one.blocking.map((aimed) => publicName(table.things.get(aimed.id))).join(", ")}`).join("; ")}` : "no blockers");
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
	for (const deck of frame.view.decks ?? []) out.push(`Registered deck for seat ${deck.seat}: ${Object.entries(deck.cards).map(([name, count]) => `${count} ${name}`).join(", ")}. Counts do not identify a hand or library order.`);
	if (frame.view.since.length) out.push("", "Since your last look:", ...frame.view.since.map((l) => `  ${l}`));
	if (frame.view.work) {
		const work = frame.view.work;
		const done = new Set(frame.view.done ?? []);
		out.push("", `Your equipment, revision ${work.revision}:`,
			...(work.plan ? [`Objective: ${work.plan.objective}`, ...work.plan.steps.map((step, at) => `${done.has(at) ? "Done" : "Step"} ${at + 1}: ${step.label}`),
				...(work.plan.may ?? []).map((branch) => `Branch: ${branch.label}`)] : ["No plan accepted."]),
			...(work.request ? [`Strategy requested: ${work.request}`] : []));
	}

	if (!frame.decision) {
		out.push("", "Not your turn to act.");
		return out.join("\n");
	}

	if (frame.refused?.length) {
		out.push("", "This decision is still open. What came back was not taken:");
		out.push(...frame.refused.map((why) => `  ${why}`));
	}

	out.push("", frame.decision.question);
	for (const option of frame.decision.options) {
		out.push(`  ${option.id}  ${option.label}`);
		if (option.shows) out.push(`      ${option.shows}`);
	}
	out.push("", "Answer with one listed option id. The view may be stale; an accepted pick is not a resolved effect.");
	out.push("Prepared procedures can execute and delegate unique continuations. Raw declarations, objections, free-form delegation and option widening remain unwritten.");
	return out.join("\n");
}
