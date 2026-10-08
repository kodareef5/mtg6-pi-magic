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

const quote = (text: string) => text.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
const FAMILIES: [keyof Playbook, string][] = [["sequencing", "Sequencing"], ["resources", "Resources"], ["responses", "Responses"], ["combat", "Combat"], ["recovery", "Recovery"]];

export function strategySections(frame: Frame, brief?: Brief, reader: "analyst" | "coordinator" = "coordinator"): string[] {
	return [matchupPlan(brief), ...(reader === "coordinator" ? [notebook(frame), standingPlan(frame)] : [])];
}

function matchupPlan(brief?: Brief): string {
	if (!brief) return "## Your matchup plan\nNo pregame brief was prepared for this seat.";
	const field = (title: string, note: unknown) => say(note) ? [`### ${title}`, quote(say(note))] : [];
	const policies = brief.policies ? FAMILIES.flatMap(([key, title]) => {
		const one = brief.policies![key];
		return [`### Policy: ${title.toLowerCase()}`, quote([`When: ${one.when}`, "Priorities:", ...one.priorities.map((priority, at) => `${at + 1}. ${priority}`),
			`Reserve: ${one.reserve}`, `Reconsider: ${one.reconsider}`, `Worked example. Position: ${one.example.position}`,
			...one.example.line.map((step, at) => `${at + 1}. ${step}`), `Exception: ${one.example.exception}`].join("\n"))];
	}) : [];
	const steps = Object.entries(brief.steps ?? {}).flatMap(([step, sides]) => (["own", "opponent"] as const).flatMap((side) =>
		say(sides?.[side]) ? [`- ${step.replace(/-/g, " ")} on ${side === "own" ? "your" : "the opponent's"} turn: ${say(sides?.[side])}`] : []));
	const cards = Object.entries(brief.cards ?? {}).map(([card, note]) => `- ${card}: ${say(note)}`);
	return ["## Your matchup plan", "Written before the game by your pregame analysts from both registered lists. Advice, not facts; the board above wins any disagreement.",
		...field("Objective", brief.objective), ...field("Role", brief.role), ...field("Route to a win", brief.route), ...field("Matchup", brief.matchup),
		...field("Traps", brief.traps), ...field("Recovery", brief.recovery), ...policies,
		...(steps.length ? ["### Step notes", quote(steps.join("\n"))] : []), ...(cards.length ? ["### Card notes", quote(cards.join("\n"))] : []),
		...(brief.gaps.length ? ["### Gaps in the preparation", brief.gaps.map((gap) => `- ${gap}`).join("\n")] : [])].join("\n\n");
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
		"### Phase guidance", plan.phases?.length ? quote(plan.phases.map((one) => `${window(one)}: ${one.guidance ?? ""}${one.complete ? ` Then ${one.complete}.` : ""}`).join("\n")) : "None.",
	].join("\n\n");
}
