/**
 * The decision model, and the one adapter that reaches it.
 *
 * It belongs to the decision context engine, not to the game. The table never
 * calls it, and a seat played by a person or a remote agent never loads it.
 *
 * A decision API takes the program state plus typed questions and returns typed
 * answers with calibrated probabilities. It does not write prose and it does
 * not invent a move: a choice answer is one of the ids we supplied.
 *
 * The vocabulary below is Pi's, not a copy of Pi's. Pi already carries this
 * shape as a first-class classifier API, with the Jev wire format as one
 * implementation of it, so re-declaring the types here would mean a second
 * definition that drifts. We rename them to this repo's words and nothing else.
 * Jev's `noul` arrives through Pi as `bool`; that mapping is Pi's and we do not
 * repeat it.
 */

import type {
	ClassifierAnswer,
	ClassifierApi,
	ClassifierChoiceAnswer,
	ClassifierContext,
	ClassifierModel,
	ClassifierQuestion,
	ClassifierResult,
	JsonObject,
} from "@earendil-works/pi-ai";

import { CEILING, meter, type Tally } from "./spend.ts";
import { PlayerUnavailable } from "../core/player.ts";

export type Question = ClassifierQuestion;
export type Answer = ClassifierAnswer;
export type DecisionRequest = ClassifierContext;

/** Observed System One provider boundary; navigation reserves room for help and rules. */
export const CHOICE_LIMIT = 255;

/**
 * What a seat calls. One method, because every decision is one request.
 *
 * Questions in one request must be independent: each is answered from the
 * state, never from a sibling's answer. A question that needs an earlier answer
 * goes in a later request.
 */
export interface DecisionApi {
	/** Named for the gap text and the run report, not for a decision. */
	readonly named: string;
	ask(request: DecisionRequest, about?: string): Promise<Record<string, Answer>>;
}

/**
 * The part of Pi this adapter uses. `ctx.modelRegistry` satisfies it, and so
 * does a test double, which is how the whole seat path runs offline.
 */
export type Classify = (
	model: ClassifierModel<ClassifierApi>,
	context: ClassifierContext,
	options?: { signal?: AbortSignal; temperature?: number },
) => Promise<ClassifierResult>;

/**
 * The one adapter.
 *
 * It holds no endpoint and no key. Pi resolved the model, Pi authenticates the
 * request, and this turns a result into either answers or a throw.
 *
 * No retry policy here. `src/core/loop.ts` owns the retry and the fallback
 * accounting for every kind of player, so a failure is reported as a failure
 * and the loop decides what it means.
 *
 * Every attempt is recorded, including a failed one, which is the whole reason
 * the tally is passed in. Counting a request only once an answer came back made
 * an attempted call report as no call at all, so a run that was rate limited for
 * a minute looked free.
 */
/** The classifier refused a request longer than its window. The same decision fits when asked in smaller inspection steps. */
export class RequestTooLarge extends PlayerUnavailable {}

export function decisionApi(
	classify: Classify,
	model: ClassifierModel<ClassifierApi>,
	options: { signal?: AbortSignal; tally?: Tally; about?: string; seat?: number } = {},
): DecisionApi {
	const named = `${model.provider}/${model.id}`;
	return {
		named,
		async ask(request, about = "pick") {
			for (const [key, question] of Object.entries(request.questions)) {
				if (question.type === "choice" && Object.keys(question.criteria).length > CHOICE_LIMIT)
					throw new PlayerUnavailable(`${named}: ${key} exceeds the ${CHOICE_LIMIT}-choice capacity. The decision needs further inspection; no request was sent.`);
			}
			const began = Date.now();
			const finish = meter(options.tally, { role: "decide", type: "classifier", seat: options.seat, about: options.about ?? about, model: named, ceiling: CEILING.decide, at: began });
			let result: ClassifierResult;
			try {
				// classify never rejects, so the stop reason is the error channel.
				result = await classify(model, request, options);
			} catch (error) {
				finish({ failed: String(error) });
				throw new PlayerUnavailable(String(error));
			}
			const wrong =
				result.stopReason === "stop"
					? null
					: `${named} ${result.stopReason}: ${result.errorMessage ?? "no reason given"}`;
			finish({
				...(result.provider && result.model ? { model: `${result.provider}/${result.model}` } : {}),
				...(result.usage ? { usage: result.usage } : {}),
				...(wrong ? { failed: wrong } : {}),
			});
			if (wrong) throw /max_tokens_exceeded/.test(wrong) ? new RequestTooLarge(wrong) : new PlayerUnavailable(wrong);
			return result.answers;
		},
	};
}

/**
 * Prove the state is JSON rather than asserting it.
 *
 * The packet crosses a wire, so a field that cannot be serialised is a request
 * that fails at the far end with an error about our data. One round trip at the
 * boundary costs nothing against a network call and drops undefined fields,
 * which is what a reader of the request would expect anyway.
 */
export const asState = (packet: unknown): JsonObject => JSON.parse(JSON.stringify(packet)) as JsonObject;

/**
 * Read one choice answer, or say what came back instead.
 *
 * Returning the id rather than the whole answer is deliberate at the call site:
 * a seat picks an id. The probabilities are for the record and for calibration,
 * and nothing in the engine reads them to decide anything.
 */
export function chose(answers: Record<string, Answer>, key: string): ClassifierChoiceAnswer | string {
	const answer = answers[key];
	if (!answer) return `No answer for ${key}. Answered: ${Object.keys(answers).join(", ") || "nothing"}.`;
	if (answer.type !== "choice") return `${key} came back as a ${answer.type} answer, not a choice.`;
	return answer;
}

/**
 * Confidence describes the answer distribution. It is not the chance of
 * winning and it is not evidence that the option list was complete. Any
 * threshold needs calibrating against recorded games before it is trusted.
 */
