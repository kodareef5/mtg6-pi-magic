/** Printed face selection. A face or unlocked door is physical state; its
 * characteristics are derived here, never copied onto the card object. */
import type { Printed } from "./printed.ts";
import type { Thing } from "./table.ts";

export type Faced = Pick<Thing, "card" | "faceDown"> & Partial<Pick<Thing, "zone" | "face" | "doors">>;
export const room = (printed?: Printed) => printed?.layout === "split" && !!printed.faces?.some((face) => /\bRoom\b/.test(face.type));
export const faceFacts = (printed: Printed | undefined, face = 0): Printed | undefined => {
	const chosen = printed?.faces?.[face];
	return chosen ? { ...chosen, text: chosen.oracle.replace(/\([^)]*\)/g, "").trim().length > 0 } : face === 0 ? printed : undefined;
};

export function activeFaces(printed: Printed, object: Faced): number[] {
	if (object.zone === "stack") return [object.face ?? 0];
	if (room(printed) && object.zone === "battlefield") return object.doors ?? [];
	if (printed.layout === "split") return [0, 1];
	return [object.zone === "battlefield" ? object.face ?? 0 : 0];
}

export function currentFacts(printed: Printed | undefined, object: Faced): Printed | undefined {
	if (!printed?.faces) return printed;
	const active = activeFaces(printed, object), chosen = active.map((face) => faceFacts(printed, face)!);
	if (chosen.length === 1) return chosen[0];
	const types = [...new Set(chosen.flatMap((face) => face.type.split("—")[0]!.trim().split(/\s+/)))];
	const subtypes = [...new Set(chosen.flatMap((face) => face.type.split("—")[1]?.trim().split(/\s+/) ?? []))];
	return { name: chosen.map((face) => face.name).join(" // "), mana: chosen.map((face) => face.mana).join(""),
		type: room(printed) ? printed.faces[0]!.type : `${types.join(" ")}${subtypes.length ? ` — ${subtypes.join(" ")}` : ""}`,
		stats: "", oracle: chosen.map((face) => face.oracle).join("\n"), text: chosen.some((face) => face.text),
		colors: [...new Set(chosen.flatMap((face) => face.colors ?? []))] };
}

/** Alternate faces may be cast only when their layout permits it. Prepare creates a separate copy. */
export function castableFace(printed: Printed | undefined, face: number): boolean {
	if (!printed?.faces) return face === 0;
	if (!printed.faces[face]) return false;
	return face === 0 || ["adventure", "split", "modal_dfc"].includes(printed.layout ?? "");
}
