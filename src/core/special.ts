/** Accepted special actions use staged payment but never put an ability on the stack. */
import type { Procedure } from "./language.ts";
import type { Activation, Table } from "./table.ts";
import type { Change } from "./syntax.ts";
import { faceUpCost } from "./manifest.ts";
import { symbols } from "./announce.ts";
import { pack } from "./entry.ts";

/** Plot uses its hand card; manifest turns a creature face up from the battlefield.
 * These forms accept mana-only costs and have no resolving instructions. */
export function checkSpecial(procedure: Procedure): void {
	if (procedure.timing !== "special") {
		if (procedure.special) throw new Error("A special action needs special timing.");
		return;
	}
	if (!["plot", "turn-face-up"].includes(procedure.special ?? "") || procedure.source.zones?.length !== 1 || procedure.source.zones[0] !== (procedure.special === "turn-face-up" ? "battlefield" : "hand") ||
		!procedure.cost?.mana || Object.keys(procedure.cost).some(key => key !== "mana") || /\{X\}/.test(procedure.cost.mana) ||
		procedure.targets?.length || procedure.instructions.length || procedure.words?.length || procedure.speed === "instant" && procedure.special === "plot" || procedure.limit)
		throw new Error("A special action needs its specified zone and fixed mana cost, with no targets, instructions or spell properties.");
}

export function specialChanges(table: Table, use: Activation): Change[] {
	const source = table.things.get(use.source.id);
	if (use.special === "turn-face-up") {
		const mana = source && faceUpCost(table.printed[source.card ?? ""], source), price = mana && symbols(mana);
		if (!source || source.incarnation !== use.source.incarnation || source.controller !== use.controller || !price || use.slots.length || use.targets.length || use.instructions.length || use.words?.length || use.x ||
			Object.keys(use.cost).some(key => !["generic", "colors"].includes(key)) || use.cost.generic !== price.generic || [...use.cost.colors].sort().join() !== [...price.colors].sort().join())
			throw new Error("Turning a manifested permanent face up needs its creature card and exact printed mana cost.");
		return [{ do: "reveal", what: source.id }, { do: "turn-face-up", what: source.id, ...(source.card ? { registers: structuredClone(pack(table, use.controller, source.card) ?? []) } : {}) }];
	}
	if (use.special !== "plot" || !source || source.incarnation !== use.source.incarnation || source.zone !== "hand" || source.owner !== use.controller ||
		use.slots.length || use.targets.length || use.instructions.length || use.words?.length || use.x ||
		Object.keys(use.cost).some(key => !["generic", "colors"].includes(key)))
		throw new Error("Plot needs its owner's hand card and a mana-only payment.");
	return [{ do: "move", what: source.id, to: "exile", reason: "exile" },
		{ do: "note", note: { kind: "permit", plotted: true, speed: "sorcery", by: use.controller, who: source.owner,
			on: { id: source.id, incarnation: source.incarnation + 1 }, fromTurn: table.cursor.turn + 1, until: "indefinite", mana: "{0}" } }];
}
