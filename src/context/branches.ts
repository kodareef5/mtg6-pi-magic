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
import { isDeepStrictEqual } from "node:util";
import { useSources } from "../core/readiness.ts";

export type FirstAction = { key: string; label: string; action: ReturnType<typeof actions>[string]["action"]; aliases: string[] };
export type Branch = { key: string; first: string; ledger: string[]; attackers: string; damage: number; theirLife: number; fails?: string };
export type Branches = { branches: Branch[]; failed?: string[]; candidates: number; aliases: number };

/** Bound concurrent calls, not the actions considered. */
const CONCURRENCY = 8;

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

const ask = (first: FirstAction) => [
	"## Your request",
	`Branch question. Commit to this first action this turn: ${first.label}. Other analysts take the other first actions, so do not compare them.`,
	`Reusable action key: ${first.key}. Accepted first-action terms: ${JSON.stringify(first.action)}. These terms do not certify legality.`,
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
export function firstActions(frame: Frame, available: ReturnType<typeof actions>): FirstAction[] {
	const lands: FirstAction[] = [], casts: FirstAction[] = [], uses: FirstAction[] = [];
	for (const [key, one] of Object.entries(available)) {
		const first = { key, ...one, aliases: [] };
		if (key.startsWith("land ")) lands.push(first);
		if (!("procedure" in one.action)) continue;
		const procedure = one.action.procedure, card = procedure.source.card;
		if (!useSources(frame, procedure).length) continue;
		if (procedure.timing === "spell") casts.push(first);
		else uses.push({ ...first, label: `${one.label}${card ? ` (${card})` : ""}` });
	}
	const distinct: FirstAction[] = [];
	for (const first of [...lands, ...casts, ...uses]) {
		const earlier = distinct.find((one) => isDeepStrictEqual(one.action, first.action));
		if (earlier) earlier.aliases.push(first.key);
		else distinct.push(first);
	}
	return distinct;
}

export async function branchReports(frame: Frame, dossier: string, available: ReturnType<typeof actions>, reasoner: Pick<Reasoner, "work">, signal?: AbortSignal): Promise<Branches> {
	signal?.throwIfAborted();
	const candidates = firstActions(frame, available);
	const result: Branches = { branches: [], candidates: candidates.length, aliases: candidates.reduce((n, one) => n + one.aliases.length, 0) };
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
		while (next < candidates.length) {
			signal?.throwIfAborted();
			const first = candidates[next++]!;
			try {
				const answer = await reasoner.work(`branch ${first.key}`, { system: ANALYST_SYSTEM, user: dossier, task: ask(first) }, { submit: REPORT, turns: 2, signal, timeoutMs: ANALYST_TIMEOUT }, 1200);
				result.branches.push({ key: first.key, first: first.label, ...answer } as Branch);
			} catch (error) {
				signal?.throwIfAborted();
				(result.failed ??= []).push(`${first.key}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	}));
	signal?.throwIfAborted();
	// Ordered by the damage each analyst claims, a model claim like a relevance rating.
	result.branches.sort((a, b) => Number(!!a.fails) - Number(!!b.fails) || b.damage - a.damage || a.first.localeCompare(b.first) || a.key.localeCompare(b.key));
	return result;
}

/** The branches as a section the coordinator reads. */
export function branchesSection(found: Branches): string {
	const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
	return ["## Branches from each first action",
		`Coverage: ${found.candidates} distinct accepted-action candidates, ${found.aliases} aliases, ${found.branches.length} reports, ${found.failed?.length ?? 0} failed calls. Costs, timing and targets still need checking.`,
		"Each analyst committed to one first action and wrote the line after it. Ordered by the damage they claim, which nothing has checked. A ledger row can be wrong.",
		...(found.branches.length ? found.branches.map((one) => one.fails ? `### First action: ${one.first}. Cannot be taken\nAction key: ${one.key}\n${quote(one.fails)}`
			: `### First action: ${one.first}. Claims ${one.damage} damage, their life ${one.theirLife}\nAction key: ${one.key}\n${quote([...one.ledger.map((row, at) => `${at + 1}. ${row}`), `Attackers: ${one.attackers}`].join("\n"))}`) : ["No branch came back."]),
		...(found.failed?.length ? [`Branches that failed: ${found.failed.join("; ")}.`] : [])].join("\n\n");
}
