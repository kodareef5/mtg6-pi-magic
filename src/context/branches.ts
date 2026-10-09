/**
 * Branch questions: one analyst per first action this turn, asked in parallel
 * beside the focused questions. Code lists the first actions the seat could
 * take, each land play and each accepted cast or activation, and judges none of
 * them. Each analyst commits to its action and writes the line after it as an
 * ordered ledger with the damage it claims. Nothing checks the ledger; the
 * coordinator audits the claims against the dossier.
 */
import type { Frame } from "../core/types.ts";
import type { Reasoner } from "./reason.ts";
import type { actions } from "./plan-edit.ts";
import { ANALYST_SYSTEM, ANALYST_TIMEOUT } from "./survey.ts";

export type Branch = { first: string; ledger: string[]; attackers: string; damage: number; theirLife: number; fails?: string };
export type Branches = { branches: Branch[]; failed?: string[] };

/** At most this many first actions; land plays and casts from hand come before activations. */
const LIMIT = 8;

const REPORT = { name: "submit", description: "Submit the line after your first action. Acceptance checks its shape, not its rules or arithmetic.",
	parameters: { type: "object", additionalProperties: false, required: ["ledger", "attackers", "damage", "theirLife"], properties: {
		ledger: { type: "array", minItems: 1, items: { type: "string" }, description: "One row per action or event in order, starting with your first action: the sources that pay it, each trigger it causes with its target, then each changed creature's power and toughness and the untapped sources left." },
		attackers: { type: "string", description: "The creatures that attack and the blocks you expect." },
		damage: { type: "integer", minimum: 0, description: "Damage to the opponent this turn through their best legal blocks, burn included." },
		theirLife: { type: "integer", description: "Their life after this turn." },
		fails: { type: "string", description: "Only if your first action cannot be taken: why." },
	} },
	check: (args: Record<string, unknown>) => {
		if (!Array.isArray(args.ledger) || !args.ledger.length || args.ledger.some((one) => typeof one !== "string")) return "ledger needs at least one row, each as text.";
		if (typeof args.attackers !== "string") return "attackers is text.";
		if (!Number.isInteger(args.damage) || Number(args.damage) < 0 || !Number.isInteger(args.theirLife)) return "damage and theirLife are integers.";
		return args.fails === undefined || typeof args.fails === "string" ? null : "fails is text.";
	} };

const ask = (first: string) => [
	"## Your request",
	`Branch question. Commit to this first action this turn: ${first}. Other analysts take the other first actions, so do not compare them.`,
	"From the current position, find the line after this commitment that deals the most damage this turn, using your other cards, your land play, abilities and the mana left.",
	"",
	"Write a ledger, one row per action or event, in order:",
	"- the action or land entry, and the named sources that pay its cost",
	"- each triggered ability it causes, in the order you resolve it, with its target",
	"- after they resolve: each changed creature's power and toughness, and the untapped sources left",
	"",
	"A tapped source stays tapped until an effect untaps it. Every land that enters under your control, played or put there, triggers each of your landfall abilities. End with the attackers, the damage through their best legal blocks, and their life after. If the first action cannot be taken, say why in fails.",
	"",
	"Answer through submit. Do not write plan syntax.",
].join("\n");

/** The first actions to branch on: land plays now, then accepted uses with a source this seat can see. Facts only, never ranked. */
export function firstActions(frame: Frame, available: ReturnType<typeof actions>): string[] {
	const hand = new Set((frame.view.objects ?? []).filter((one) => one.zone === "hand" && one.controller === frame.seat && one.card).map((one) => one.card!));
	const field = new Set((frame.view.objects ?? []).filter((one) => one.zone === "battlefield" && one.controller === frame.seat && one.card).map((one) => one.card!));
	const lands: string[] = [], casts: string[] = [], uses: string[] = [];
	for (const [key, one] of Object.entries(available)) {
		if (key.startsWith("land ")) lands.push(one.label);
		if (!("procedure" in one.action)) continue;
		const procedure = one.action.procedure, card = procedure.source.card;
		if (!card) continue;
		const zones = procedure.source.zones ?? ["hand"];
		if (procedure.timing === "spell" && zones.includes("hand") && hand.has(card)) casts.push(one.label);
		else if (procedure.timing !== "spell" && zones.includes("battlefield") && field.has(card)) uses.push(`${one.label} (${card})`);
	}
	return [...new Set([...lands, ...casts, ...uses])].slice(0, LIMIT);
}

export async function branchReports(frame: Frame, dossier: string, available: ReturnType<typeof actions>, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Branches> {
	signal?.throwIfAborted();
	const result: Branches = { branches: [] };
	await Promise.all(firstActions(frame, available).map(async (first) => {
		try {
			const answer = await reasoner.work(`branch ${first}`, { system: ANALYST_SYSTEM, user: dossier, task: ask(first) }, { submit: REPORT, turns: 2, signal, timeoutMs: ANALYST_TIMEOUT }, 1200);
			result.branches.push({ first, ...answer } as Branch);
		} catch (error) {
			signal?.throwIfAborted();
			(result.failed ??= []).push(`${first}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}));
	signal?.throwIfAborted();
	// Ordered by the damage each analyst claims, a model claim like a relevance rating.
	result.branches.sort((a, b) => Number(!!a.fails) - Number(!!b.fails) || b.damage - a.damage || a.first.localeCompare(b.first));
	return result;
}

/** The branches as a section the coordinator reads. */
export function branchesSection(found: Branches): string {
	const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
	return ["## Branches from each first action",
		"Each analyst committed to one first action and wrote the line after it. Ordered by the damage they claim, which nothing has checked. A ledger row can be wrong.",
		...(found.branches.length ? found.branches.map((one) => one.fails ? `### First action: ${one.first}. Cannot be taken\n${quote(one.fails)}`
			: `### First action: ${one.first}. Claims ${one.damage} damage, their life ${one.theirLife}\n${quote([...one.ledger.map((row, at) => `${at + 1}. ${row}`), `Attackers: ${one.attackers}`].join("\n"))}`) : ["No branch came back."]),
		...(found.failed?.length ? [`Branches that failed: ${found.failed.join("; ")}.`] : [])].join("\n\n");
}
