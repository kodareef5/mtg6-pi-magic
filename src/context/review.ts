/** One pilot question about one checklist item, before choosing a physical action. */
import type { ReviewItem } from "../core/review.ts";
import type { WorkCommand } from "../core/work-language.ts";
import type { Packet } from "./packet.ts";
import type { Question } from "./model.ts";

export function reviewQuestion(packet: Packet, item: ReviewItem, help: boolean): Question {
	const options = packet.options.filter((one) => item.options.includes(one.id));
	return {
		type: "choice",
		instructions: [
			`Review this use before choosing a move: ${item.label}.`,
			"This question records your assessment only. It does not move a card, complete a plan step, pass priority, or establish legality.",
			"Read its printed card text, current characteristics, costs and restrictions beside the phase guidance. Account for mana already spent, the current summoningSick value, targets and responses. Execute the strategist's line; ask for help if it conflicts with those facts.",
			"known, resources and lately in the supplied state hold the current facts and recent events.",
			"watches lists registered triggers on the battlefield now. A permanent cannot see events that finished before it entered; its own entry can trigger it. Ask for help if the planned order depends on a missed trigger.",
			...(packet.plan ? [`Objective: ${packet.plan.objective}`, ...(packet.plan.script?.guidance ?? [packet.plan.guidance ?? ""]), ...packet.plan.held.map((one) => `Held: ${one}`)] : packet.guidance),
			...(item.kind === "response" ? ["The stack is still waiting. Decide whether you need a response before it resolves; each seat will separately choose its priority pass."]
				: options.length ? options.map((one) => `${one.label}: ${one.shows ?? ""}`) : ["No option currently carries this item out. It is unfinished, not completed. Check whether its condition is false, it belongs later, or the plan needs repair."]),
			...(packet.refused ?? []),
		].join("\n"),
		criteria: {
			...(options.length || (item.kind === "response" && packet.options.some((one) => one.id !== "pass"))
				? { "review:act": "Take an available action for this item now; the following move question will choose the exact action, targets and payment." } : {}),
			"review:hold": "Keep this use for a later window or response under the plan; take no action for it now.",
			"review:skip": "No action for this item in the current position: its condition is unmet, its use is unavailable, or the plan calls for no use now.",
			...(help ? { "ask:help": "This item conflicts with the position or card restrictions, or its required use is missing. Ask strategy to repair the unfinished line." } : {}),
		},
	};
}

/** The chosen reason is recorded verbatim, separate from the ledger of physical actions. */
export function reviewCommand(item: ReviewItem, choice: string): WorkCommand | undefined {
	const verdict = choice.slice("review:".length);
	if (!choice.startsWith("review:") || (verdict !== "act" && verdict !== "hold" && verdict !== "skip")) return undefined;
	const reason = verdict === "act" ? `Use now: ${item.label}.` : verdict === "hold" ? `Hold for a later window or response: ${item.label}.` : `No use in the current position: ${item.label}.`;
	return { do: "review.record", item: item.id, verdict, reason };
}
