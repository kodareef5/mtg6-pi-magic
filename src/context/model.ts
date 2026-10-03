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
 * The request shape here follows Jev, because that is the shape with an
 * implementation today. The field is young and moving quickly, so nothing
 * outside this file names a vendor. Any API with this shape drops in.
 */

export type ChoiceQuestion = {
	type: "choice";
	instructions: string;
	/** Option id to a neutral description. Equal detail per option, or the wording picks for us. */
	criteria: Record<string, string>;
};

export type ScoreQuestion = {
	type: "score";
	instructions: string;
	/** Two to ten ordered levels, worst first. */
	legend: string[];
};

export type NoulQuestion = {
	type: "noul";
	instructions: string;
};

export type Question = ChoiceQuestion | ScoreQuestion | NoulQuestion;

export type ChoiceAnswer = {
	choice: string;
	probabilities?: Record<string, number>;
	confidence?: number;
};

export type ScoreAnswer = {
	score: number;
	legend: string[];
	probabilities?: Record<string, number>;
	confidence?: number;
};

export type NoulAnswer = { noul: number };

export type Answer = ChoiceAnswer | ScoreAnswer | NoulAnswer;

/**
 * Questions in one request must be independent: each is answered from the
 * state, never from a sibling's answer. A question that needs an earlier answer
 * goes in a later request.
 */
export type DecisionRequest = {
	state: unknown;
	questions: Record<string, Question>;
};

export interface DecisionApi {
	ask(request: DecisionRequest): Promise<Record<string, Answer>>;
}

/**
 * Confidence describes the answer distribution. It is not the chance of
 * winning and it is not evidence that the option list was complete. Any
 * threshold needs calibrating against recorded games before it is trusted.
 */

/**
 * The one adapter. It reads where to send a request from Pi's settings, so no
 * endpoint or key is written here.
 *
 * 1. Read the endpoint, the key and the model name from settings, falling back
 *    to the environment.
 * 2. Nothing configured: throw naming the setting to add. The game does not
 *    start half ready.
 * 3. ask(): post the request, parse the typed answers, return them unchanged.
 *    No retry policy here. A player decides what an unusable answer means.
 */
export function decisionApi(settings: unknown): DecisionApi {
	void settings;
	throw new Error("decisionApi is unwritten. Three steps above.");
}
