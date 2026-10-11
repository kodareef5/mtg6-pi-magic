/** Private review evidence beside a journal. This does not judge card meaning or certify play. */
import { writeFileSync } from "node:fs";
import type { Activation, Table } from "../src/core/table.ts";
import type { Package } from "../src/core/language.ts";
import type { Printed } from "../src/core/printed.ts";
import type { Change } from "../src/core/syntax.ts";
import type { ObjectRef } from "../src/core/types.ts";
import type { Tap } from "../src/core/funding.ts";

const terms = (pack: Package) => ({ registers: pack.registers, ...(pack.printedCast ? { printedCast: true } : {}),
	...(pack.printedFaces ? { printedFaces: pack.printedFaces } : {}), procedures: pack.procedures ?? [], deferred: pack.deferred ?? [] });
type Terms = ReturnType<typeof terms>;
type Program = Pick<Activation, "claim" | "basis" | "timing" | "special" | "face" | "speed" | "cost" | "slots" | "instructions" | "words" | "x" | "leavesStack">;
const canonical = (value: unknown) => JSON.stringify(value, (_key, one) => one && typeof one === "object" && !Array.isArray(one)
	? Object.fromEntries(Object.entries(one).sort(([a], [b]) => a.localeCompare(b))) : one);
export type CardReview = {
	seat: number; card: string; source?: Printed; initial?: Terms;
	prepared: { decision: number; clock: number; note: string; terms: Terms }[];
	announced: { rows: number[]; program: Program }[];
	mana: { rows: number[]; clocks: number[]; sources: ObjectRef[]; output: Extract<Change, { do: "add-mana" }>; payment?: Omit<Tap, "source">; registrations: Package["registers"] }[];
};

/** Retain every changed accepted meaning, including unused or later corrected procedures.
 * Seat and card are part of identity; neither a claim nor the latest package is sufficient. */
export function sourceReview(table: Table, fromVersion = 0) {
	const cards = new Map<string, CardReview>(), previous = new Map<string, string>(), initial = new Map<string, Terms>();
	const key = (seat: number, card: string) => `${seat}\0${card}`;
	const get = (seat: number, card: string) => {
		const id = key(seat, card);
		if (!cards.has(id)) cards.set(id, { seat, card, source: table.printed[card], initial: initial.get(id), prepared: [], announced: [], mana: [] });
		return cards.get(id)!;
	};
	for (const work of table.workLog) for (const pack of work.workspace.packages ?? []) {
		const id = key(work.seat, pack.card), meaning = terms(pack), signature = canonical(meaning);
		if (previous.get(id) === signature) continue;
		previous.set(id, signature);
		if (!work.at) { initial.set(id, meaning); continue; }
		get(work.seat, pack.card).prepared.push({ decision: work.at, clock: work.clock, note: work.note, terms: meaning });
	}
	for (const row of table.ledger) if (row.activation) {
		const { source, claim, basis, timing, special, face, speed, cost, slots, instructions, words, x, leavesStack } = row.activation;
		// Cards keep their names across incarnations. A ceased token may need the event-time snapshot.
		const object = table.things.get(source.id) ?? table.log.findLast((receipt) => receipt.before[source.id]?.incarnation === source.incarnation)?.before[source.id];
		const card = object?.card ?? object?.token?.name ?? `Unknown source ${source.id}@${source.incarnation}`;
		const review = get(row.seat, card), program = { claim, basis, timing, special, face, speed, cost, slots, instructions, words, x, leavesStack };
		const same = review.announced.find((one) => canonical(one.program) === canonical(program));
		if (same) same.rows.push(row.seq); else review.announced.push({ rows: [row.seq], program });
	}
	// Read actual outputs, including payments made while an instruction resolves.
	// A funding tap can be followed by life payment or sacrifice before adding mana.
	const rows = new Map(table.ledger.map(row => [row.clock, row]));
	for (const receipt of table.log) {
		let tapped: string | undefined;
		for (const change of receipt.changes) {
			if (change.do === "tap") tapped = change.what;
			if (change.do !== "add-mana") continue;
			const source = tapped && receipt.before[tapped], traits = tapped ? receipt.known?.[tapped] : undefined;
			tapped = undefined;
			if (!source) continue; // Unattributed floating mana is not assigned an invented source.
			const card = source.card ?? source.token?.name ?? `Unknown source ${source.id}@${source.incarnation}`;
			const review = get(change.who, card), output = { ...change };
			const row = receipt.clock === undefined ? undefined : rows.get(receipt.clock);
			const funding = row?.activation?.funding?.find(one => one.source.id === source.id && one.source.incarnation === source.incarnation);
			let payment: Omit<Tap, "source"> | undefined;
			if (funding) { const { source: _source, ...terms } = funding; payment = terms; }
			const registrations = (traits?.registrations ?? source.registrations ?? []).filter(one => one.kind === "mana");
			let use = review.mana.find(one => canonical([one.output, one.payment, one.registrations]) === canonical([output, payment, registrations]));
			if (!use) { use = { rows: [], clocks: [], sources: [], output, ...(payment ? { payment } : {}), registrations }; review.mana.push(use); }
			if (receipt.clock !== undefined) {
				use.clocks.push(receipt.clock);
				if (row) use.rows.push(row.seq);
			}
			if (!use.sources.some(one => one.id === source.id && one.incarnation === source.incarnation)) use.sources.push({ id: source.id, incarnation: source.incarnation });
		}
	}
	return structuredClone({ seed: table.rng.seed, outcome: table.outcome, decisions: table.ledger.length, fromVersion,
		cards: [...cards.values()].sort((a, b) => (a.prepared[0]?.decision ?? Infinity) - (b.prepared[0]?.decision ?? Infinity) || a.seat - b.seat || a.card.localeCompare(b.card)) });
}

/** The file may name privately interpreted cards that were never cast. Never publish it as a spectator view. */
export function saveSourceReview(path: string, table: Table, fromVersion = 0): string {
	const review = sourceReview(table, fromVersion), cell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
	const json = (value: unknown) => `\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\`\n`;
	const lines = ["# Private card source review", "",
		`Game: ${review.seed}. Decisions: ${review.decisions}. This invocation began at decision ${fromVersion}.`, "",
		"This file includes private preparation. It lists changed card meanings, announced programs and actual mana outputs from the retained game prefix, beside pinned source text. An announcement does not prove its instructions resolved, its payment was legal, or its meaning matched the card. Replay and gap checks do not replace that review. Check each mana source's printed output against the amount and colors it actually supplied.", "",
		"| Card | Seat | New meaning at decision | Announcement rows | Mana payment rows |", "| --- | --- | --- | --- | --- |",
		...review.cards.map((one) => `| ${cell(one.card)} | ${one.seat} | ${one.prepared.map((made) => made.decision).join(", ") || "Prepared before play"} | ${one.announced.flatMap((use) => use.rows).join(", ") || "Not announced"} | ${one.mana.flatMap(use => use.rows).join(", ") || "None"} |`), ""];
	for (const card of review.cards) {
		lines.push(`## ${card.card} (seat ${card.seat})`, "", "### Pinned source", "");
		const faces = card.source?.faces ?? (card.source ? [{ name: card.card, ...card.source }] : []);
		if (!faces.length) lines.push("No pinned card source was found. Check the originating token or ability in the journal.", "");
		for (const face of faces) lines.push(`${face.name ?? card.card}: ${face.mana} ${face.type} ${face.stats}`,
			...face.oracle.replaceAll("\\n", "\n").split("\n").map((line) => `> ${line}`), "");
		if (card.initial) lines.push("### Accepted before play", json(card.initial));
		for (const made of card.prepared) lines.push(`### Meaning accepted at decision ${made.decision}, clock ${made.clock}`,
			"", made.note, json(made.terms));
		for (const use of card.announced) lines.push(`### Announced at rows ${use.rows.join(", ")}`, json(use.program));
		for (const use of card.mana) lines.push(`### Mana produced at clocks ${use.clocks.join(", ")}`, json(use));
	}
	writeFileSync(path, lines.join("\n") + "\n", { mode: 0o600 });
	return path;
}
