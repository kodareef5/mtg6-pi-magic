/** Accepted special actions use staged payment but never put an ability on the stack. */
import type { Procedure } from "./language.ts";
import type { Activation, Table } from "./table.ts";
import type { Change } from "./syntax.ts";

/** This first form supports plotting from hand for a fixed mana cost (702.170).
 * Other plotting zones, nonmana costs and plot-specific reductions need terms. */
export function checkSpecial(procedure: Procedure): void {
	if (procedure.timing !== "special") {
		if (procedure.special) throw new Error("A special action needs special timing.");
		return;
	}
	if (procedure.special !== "plot" || procedure.source.zones?.length !== 1 || procedure.source.zones[0] !== "hand" ||
		!procedure.cost?.mana || Object.keys(procedure.cost).some(key => key !== "mana") || /\{X\}/.test(procedure.cost.mana) ||
		procedure.targets?.length || procedure.instructions.length || procedure.words?.length || procedure.speed === "instant" || procedure.limit)
		throw new Error("Plot needs a hand source and fixed mana cost, with no targets, instructions or spell properties.");
}

export function specialChanges(table: Table, use: Activation): Change[] {
	const source = table.things.get(use.source.id);
	if (use.special !== "plot" || !source || source.incarnation !== use.source.incarnation || source.zone !== "hand" || source.owner !== use.controller ||
		use.slots.length || use.targets.length || use.instructions.length || use.words?.length || use.x ||
		Object.keys(use.cost).some(key => !["generic", "colors"].includes(key)))
		throw new Error("Plot needs its owner's hand card and a mana-only payment.");
	return [{ do: "move", what: source.id, to: "exile", reason: "exile" },
		{ do: "note", note: { kind: "permit", plotted: true, speed: "sorcery", by: use.controller, who: source.owner,
			on: { id: source.id, incarnation: source.incarnation + 1 }, fromTurn: table.cursor.turn + 1, until: "indefinite", mana: "{0}" } }];
}
