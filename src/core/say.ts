/**
 * Table talk. A fixed list, picked from, never written.
 *
 * Two reasons it is a list and not a text field. A log of canned messages stays
 * readable, and a seat cannot be talked into anything: free text between agents
 * is a way to put instructions in another seat's reasoning, and there is no
 * version of that worth the flavour.
 *
 * The list is the classic MTG Arena set, minus the two that would only repeat
 * what the table already says.
 */

export const MESSAGES = {
	hello: "Hello.",
	"good-luck": "Good luck.",
	nice: "Nice.",
	thanks: "Thanks.",
	oops: "Oops.",
	sorry: "Sorry.",
	thinking: "Thinking.",
	"good-game": "Good game.",
} as const;

export type MessageId = keyof typeof MESSAGES;

export type Said = {
	seat: number;
	message: MessageId;
	/** The log length when it was said, so a reader can place it. */
	at: number;
};

/**
 * One per seat per phase ending, or none, which is the expected answer. A
 * message changes nothing, so it is not a receipt and replay does not read it.
 */
export const SAY_LIMIT_PER_PHASE = 1;
