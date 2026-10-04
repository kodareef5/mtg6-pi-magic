/** Independent concern questions share one classifier request. No approval of optimality. */
import type { Frame } from "../core/types.ts";
import type { Review } from "../core/agenda.ts";
import type { Answer as PlayerAnswer } from "../core/player.ts";
import { asState, chose, type DecisionApi, type Question } from "./model.ts";
import type { Packet } from "./packet.ts";

export async function answerReview(api: DecisionApi, packet: Packet, due: Review, frame: Frame, actionId: string): Promise<PlayerAnswer> {
	const questions: Record<string, Question> = Object.fromEntries(due.items.map((item, index) => [`concern-${index}`, {
		type: "choice",
		instructions: [
			`Review ${item.concern} for ${item.label}.`, due.guidance,
			"Assign a disposition under the prepared guidance. These questions are independent:",
			"another concern's answer cannot supply a payment or complete an action.",
			"A recorded review does not prove optimal play or complete a card instruction.",
			...(packet.refused ?? []),
		].join("\n"),
		criteria: Object.fromEntries(due.choices.map((choice) => [choice.id, choice.label])),
	}]));
	const answers = due.items.length ? await api.ask({ state: asState(packet), questions }) : {};
	const dispositions: Record<string, string> = {};
	for (const [index, item] of due.items.entries()) {
		const choice = chose(answers, `concern-${index}`);
		if (typeof choice === "string") throw new Error(choice);
		dispositions[item.id] = choice.choice;
	}
	return { kind: "work", revision: frame.view.work!.revision, actionId,
		tools: [{ do: "review.answer", task: due.task, occurrence: due.occurrence, stamp: due.stamp, answers: dispositions }] };
}
