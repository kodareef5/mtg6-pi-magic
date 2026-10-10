/**
 * Lands the wider pool plays: a shock land's optional entry payment, a Town's own-turn count, and a Verge's
 * conditional mana ability. Each is a registration shape the October 10 pool audit found missing.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { apply, nextDecision } from "../src/core/decisions.ts";
import { editWork } from "../src/core/work-tools.ts";
import { check, PackageSchema, type Package, type Registration } from "../src/core/language.ts";
import { produces } from "../src/core/funding.ts";
import { amount, holds, tableWorld, turnsTaken } from "../src/core/selectors.ts";
import { seat } from "../src/core/table.ts";
import { main, matchup, place } from "./play.ts";
import { start } from "../src/core/commit.ts";
import { deck } from "../src/core/decks.ts";
import { standard } from "../src/core/format.ts";

/** Two pool lists that register the lands under test: Steam Vents for seat 0, Starting Town for seat 1. */
const pool = (seed: string) => start(standard, [{ name: "Izzet", deck: deck("Izzet Spellementals") }, { name: "Jund", deck: deck("Jund Sacrifice") }], seed);

const shock: Package = { card: "Steam Vents", assessed: true, registers: [
	{ basis: "As this land enters, you may pay 2 life. If you don't, it enters tapped.", kind: "enters", tapped: true, unlessPay: { life: 2 } },
] };
const town: Package = { card: "Starting Town", assessed: true, registers: [
	{ basis: "This land enters tapped unless it's your first, second, or third turn of the game.", kind: "enters", tapped: true,
		if: { any: [{ not: { turn: "self" } }, { amount: { turns: "self" }, atLeast: 4 }] } },
	{ basis: "{T}: Add {C}.", kind: "mana", cost: { tap: true }, colors: ["C"] },
	{ basis: "{T}, Pay 1 life: Add one mana of any color.", kind: "mana", cost: { tap: true, life: 1 }, any: 1 },
] };
const verge: Registration = { basis: "{T}: Add {B}. Activate only if you control an Island or a Swamp.", kind: "mana", cost: { tap: true }, colors: ["B"],
	if: { amount: { count: { zones: ["battlefield"], controller: "self", subtypes: ["Island", "Swamp"] } }, atLeast: 1 } };

test("the new registration shapes are accepted by the package schema", () => {
	for (const pack of [shock, town, { card: "Gloomlake Verge", assessed: true, registers: [verge] } satisfies Package]) assert.doesNotThrow(() => check(PackageSchema, pack, pack.card));
});

test("turns taken count from who started, and the turn condition reads whose turn it is", () => {
	assert.deepEqual(turnsTaken(0, [0, 1], 1), { 0: 1, 1: 0 });
	assert.deepEqual(turnsTaken(0, [0, 1], 2), { 0: 1, 1: 1 });
	assert.deepEqual(turnsTaken(0, [0, 1], 5), { 0: 3, 1: 2 });
	assert.deepEqual(turnsTaken(1, [0, 1], 2), { 1: 1, 0: 1 });
	const table = matchup("turns");
	main(table, 0, 3);
	const world = tableWorld(table);
	assert.deepEqual(world.turn, { active: 0, taken: { 0: 2, 1: 1 } });
	assert.equal(amount({ world, controller: 0 }, { turns: "self" }), 2);
	assert.equal(amount({ world, controller: 1 }, { turns: "self" }), 1);
	assert.equal(amount({ world, controller: 1 }, { turns: "opponent" }), 2);
	assert.equal(holds({ world, controller: 0 }, { turn: "self" }), true);
	assert.equal(holds({ world, controller: 1 }, { turn: "self" }), false);
	assert.equal(holds({ world, controller: 1 }, { turn: "opponent" }), true);
});

test("a shock land offers a paid play that enters untapped and a free play that enters tapped", () => {
	const table = pool("shock");
	main(table, 0, 3);
	editWork(table, 0, [{ do: "package.put", package: shock }], "shock-package");
	const [vents] = place(table, 0, "hand", "Steam Vents");
	const options = nextDecision(table)!.options.map((one) => one.id);
	assert.ok(options.includes(`land:${vents!.id}:pay`), "the paid play is offered");
	assert.ok(options.includes(`land:${vents!.id}`), "the unpaid play is offered");
	const life = seat(table, 0).life;
	const paid = structuredClone(table);
	apply(paid, `land:${vents!.id}:pay`, "model", "chosen");
	assert.equal(paid.things.get(vents!.id)!.zone, "battlefield");
	assert.equal(paid.things.get(vents!.id)!.tapped, false, "paid, it enters untapped");
	assert.equal(seat(paid, 0).life, life - 2, "the payment is two life");
	apply(table, `land:${vents!.id}`, "model", "chosen");
	assert.equal(table.things.get(vents!.id)!.tapped, true, "unpaid, it enters tapped");
	assert.equal(seat(table, 0).life, life, "no life changes");
});

test("a Town enters untapped through its controller's third turn and tapped from the fourth", () => {
	// Seat 1 is on the draw: its third turn is the game's sixth, its fourth the eighth.
	for (const [turn, tapped] of [[6, false], [8, true]] as const) {
		const table = pool(`town-${turn}`);
		main(table, 1, turn);
		editWork(table, 1, [{ do: "package.put", package: town }], "town-package");
		const [land] = place(table, 1, "hand", "Starting Town");
		apply(table, `land:${land!.id}`, "model", "chosen");
		assert.equal(table.things.get(land!.id)!.tapped, tapped, `own turn ${turn / 2}: ${tapped ? "tapped" : "untapped"}`);
	}
});

test("a conditional mana ability produces only while its condition holds", () => {
	assert.deepEqual(produces(verge, () => 1, () => false), []);
	assert.equal(produces(verge, () => 1, () => true).length, 1);
	assert.equal(produces(verge, () => 1).length, 1, "with no way to read the condition, the ability is offered");
});
