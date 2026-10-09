/**
 * The dossier's strategy sections: the whole pregame brief, the notebook and the
 * standing plan. All of it was written by models, so each section names its
 * author and quotes the text; none of it is a fact about the table.
 */
import type { Frame } from "../core/types.ts";
import type { Plan, PlanOption } from "../core/language.ts";
import { currentPlan } from "../core/query.ts";
import { say, type Brief } from "./brief.ts";
import type { Playbook } from "./playbook.ts";
import type { Lookup } from "./reason.ts";

const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
const FAMILIES: [keyof Playbook, string][] = [["sequencing", "Sequencing"], ["resources", "Resources"], ["responses", "Responses"], ["combat", "Combat"], ["recovery", "Recovery"]];

/** The seat's own sections, last, so the analysts' dossier stays a prefix of the coordinator's. */
export function strategySections(frame: Frame, reader: "analyst" | "coordinator" = "coordinator"): string[] {
	return reader === "coordinator" ? [notebook(frame), standingPlan(frame)] : [];
}

/**
 * The pregame advice that applies to this session: the policies' when, priorities, reserve and reconsider,
 * step notes for the windows still ahead, and notes for cards this seat can see. Worked examples describe
 * invented positions and stay behind a lookup. A response reads only its response and combat policies.
 */
export function matchupPlan(frame: Frame, brief?: Brief, scope: "turn" | "preparation" | "response" = "turn"): string {
	if (!brief) return "## Your matchup plan\nNo pregame brief was prepared for this seat.";
	const field = (title: string, note: unknown) => say(note) ? [`### ${title}`, quote(say(note))] : [];
	const families = scope === "response" ? FAMILIES.filter(([key]) => key === "responses" || key === "combat") : FAMILIES;
	const policies = brief.policies ? families.flatMap(([key, title]) => {
		const one = brief.policies![key];
		return [`### Policy: ${title.toLowerCase()}`, quote([`When: ${one.when}`, "Priorities:", ...one.priorities.map((priority, at) => `${at + 1}. ${priority}`),
			`Reserve: ${one.reserve}`, `Reconsider: ${one.reconsider}`].join("\n"))];
	}) : [];
	const at = frame.view.window, mine = at.kind === "turn" && at.active === frame.seat, remaining = new Set(frame.view.remainingSteps ?? []);
	// Notes for the windows still ahead: the rest of this turn, and the other player's next turn.
	const ahead = (step: string, side: "own" | "opponent") => at.kind !== "turn" || ((side === "own") === mine ? remaining.has(step as never) : scope !== "response");
	const steps = Object.entries(brief.steps ?? {}).flatMap(([step, sides]) => (["own", "opponent"] as const).flatMap((side) =>
		say(sides?.[side]) && ahead(step, side) ? [`- ${step.replace(/-/g, " ")} on ${side === "own" ? "your" : "the opponent's"} turn: ${say(sides?.[side])}`] : []));
	const seen = new Set((frame.view.objects ?? []).flatMap((one) => one.card && one.zone !== "library" && (one.zone !== "hand" || one.controller === frame.seat) ? [one.card] : []));
	const cards = Object.entries(brief.cards ?? {}).filter(([card]) => seen.has(card)).map(([card, note]) => `- ${card}: ${say(note)}`);
	return ["## Your matchup plan", "Written before the game by your pregame analysts from both registered lists. Advice, not facts; the board below wins any disagreement. A policy that names a card applies only when that card is in your hand or on the battlefield.",
		...field("Objective", brief.objective), ...field("Role", brief.role), ...field("Route to a win", brief.route), ...field("Matchup", brief.matchup),
		...field("Traps", brief.traps), ...field("Recovery", brief.recovery), ...policies,
		...(steps.length ? ["### Step notes for the windows ahead", quote(steps.join("\n"))] : []), ...(cards.length ? ["### Notes for cards you can see", quote(cards.join("\n"))] : []),
		...(brief.gaps.length ? ["### Gaps in the preparation", brief.gaps.map((gap) => `- ${gap}`).join("\n")] : [])].join("\n\n");
}

/** The policies' worked examples, on request. Each describes an invented position, not this game. */
export function matchupExamples(brief?: Brief): Lookup {
	return { name: "matchup_examples", description: "Read the worked examples from your matchup plan's policies. Each describes an invented position written before the game, not this one.",
		parameters: { type: "object", properties: {}, additionalProperties: false },
		answer: () => !brief?.policies ? "No worked examples were prepared." : FAMILIES.map(([key, title]) => {
			const one = brief.policies![key];
			return [`## ${title}`, `Invented position: ${one.example.position}`, ...one.example.line.map((step, at) => `${at + 1}. ${step}`), `Exception: ${one.example.exception}`].join("\n");
		}).join("\n\n") };
}

function notebook(frame: Frame): string {
	const entries = frame.view.work?.notebook ?? [];
	return ["## Your notebook", entries.length ? ["Written by your strategy in earlier turns.", quote(entries.map((one) => `${one.topic}: ${one.note}`).join("\n"))].join("\n\n") : "Empty."].join("\n");
}

const window = (option: Pick<PlanOption, "when">) => [option.when.active === "self" ? "your turn" : option.when.active === "opponent" ? "the opponent's turn" : "",
	option.when.step?.replace(/-/g, " ") ?? option.when.phase?.replace(/-/g, " ") ?? "any step"].filter(Boolean).join(", ");
const action = (option: PlanOption) => "option" in option.action && option.action.option ? `pick ${option.action.option}`
	: "procedure" in option.action ? `use ${option.action.procedure.claim}` : `${option.action.prefix ?? ""} ${JSON.stringify(option.action.objects ?? {})}`.trim();

/** The plan as it stands, with completed steps marked. */
function standingPlan(frame: Frame): string {
	const plan: Plan | undefined = currentPlan(frame);
	if (!plan) return "## Your standing plan\nNo plan is in force.";
	const done = new Set(frame.view.done ?? []);
	const line = (option: PlanOption, at: number, kind: "step" | "branch") => `${at + 1}. ${kind === "step" && done.has(at) ? "Done. " : ""}${option.label} (${window(option)}; ${action(option)})` +
		`${option.if ? `. Only if ${JSON.stringify(option.if)}` : ""}${option.purpose ? `. Purpose: ${option.purpose}` : ""}`;
	return ["## Your standing plan", `Written by your strategy${plan.throughTurn ? ` for the turns through ${plan.throughTurn}` : ""}. It can be stale; the board wins any disagreement.`,
		quote([`Objective: ${plan.objective}`, `Guidance: ${plan.guidance}`].join("\n")),
		"### Steps", plan.steps.length ? plan.steps.map((one, at) => line(one, at, "step")).join("\n") : "None.",
		"### Branches", plan.may?.length ? plan.may.map((one, at) => line(one, at, "branch")).join("\n") : "None.",
		"### Holds", plan.holds?.length ? plan.holds.map((one) => `- ${one.purpose}: ${JSON.stringify(one.objects)}${one.releaseAt ? `, released at ${window({ when: one.releaseAt })}` : ""}${one.releaseWhen ? `, released when ${JSON.stringify(one.releaseWhen)}` : ""}`).join("\n") : "None.",
		"### Trigger orders", plan.triggers?.length ? plan.triggers.map((one) => `- ${one.when ? `${window({ when: one.when })}: ` : ""}resolve ${one.resolve.map((query) => JSON.stringify(query)).join(", then ")}${one.targets?.length ? `; targets ${one.targets.map((aim) => `${JSON.stringify(aim.source)} at ${JSON.stringify(aim.target)}`).join(", ")}` : ""}${one.purpose ? `. Purpose: ${one.purpose}` : ""}`).join("\n") : "None.",
		"### Phase guidance", plan.phases?.length ? quote(plan.phases.map((one) => `${window(one)}: ${one.guidance ?? ""}${one.complete ? ` Then ${one.complete}.` : ""}`).join("\n")) : "None.",
	].join("\n\n");
}
