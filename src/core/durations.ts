/** Exile-until durations end immediately after the specified event (610.3). */
import type { Table } from "./table.ts";
import type { Change } from "./syntax.ts";

/** All durations ending after one group return together, before any further instruction or priority. */
export function returns(table: Table): Change[] {
	return table.notes.flatMap((note): Change[] => {
		if (note.kind !== "return") return [];
		const source = table.things.get(note.source.id);
		if (source?.zone === "battlefield" && source.incarnation === note.source.incarnation) return [];
		const object = table.things.get(note.on.id);
		return [{ do: "use-note", id: note.id },
			// A token that left the battlefield cannot move again, even before the next state check (111.8).
			...(object?.zone === "exile" && object.incarnation === note.on.incarnation && !object.token
				? [{ do: "move" as const, what: object.id, to: note.to, reason: "resolve" as const }] : [])];
	});
}
