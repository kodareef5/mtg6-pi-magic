/** Future spell properties apply during announcement, without a trigger or a response window. */
import { matches, type Scope, type Seen } from "./selectors.ts";
import type { Traits } from "./characteristics.ts";
import type { Note } from "./table.ts";

export function castWords(scope: Scope, spell: Seen, traits?: Traits): Extract<Note, { kind: "cast-words" }>[] {
	return scope.world.notes.filter((note): note is Extract<Note, { kind: "cast-words" }> => note.kind === "cast-words" && note.who === scope.controller &&
		(!note.of || matches(scope, spell, { zones: ["stack"], ...note.of }, traits)));
}
