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
	/** Decisions answered when it was said, which is the version a rollback names. */
	at: number;
};

