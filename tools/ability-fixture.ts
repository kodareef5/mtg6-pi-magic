/** Two established Merchants activate across one priority exchange. Authored models
 * writing real plans; real payments, stack, resolution and game loop. Setup is a
 * fixture, not a claim that these permanents were cast during this game.
 */
import { commit, start } from "../src/core/commit.ts";
import { standard } from "../src/core/format.ts";
import { card, load } from "../src/core/cards.ts";
import { deck } from "../src/core/decks.ts";
import { cardsIn, type Mana } from "../src/core/table.ts";
import { editWork } from "../src/core/work-tools.ts";
import { play } from "../src/core/loop.ts";
import type { Frame } from "../src/core/types.ts";
import type { Procedure } from "../src/core/work-language.ts";
import type { Plan } from "../src/core/language.ts";
import { aiSeat } from "../src/context/seat.ts";
import { decisionApi, type Classify } from "../src/context/model.ts";
import { startingIntent } from "../src/context/plan.ts";
import { planWork } from "../src/context/strategy.ts";
import type { Reasoner } from "../src/context/reason.ts";
import { tally } from "../src/context/spend.ts";

/** Dimir Control against itself, each seat starting with its first Merchant and an Island in play. */
export function abilityTable(seed = "ability-experiment") {
	const table = start(standard, [{ name: "A", deck: deck("Dimir Control") }, { name: "B", deck: deck("Dimir Control") }], seed);
	const first = (seat: number, card: string) => cardsIn(table, "library", seat).find((one) => one.card === card)!.id;
	commit(table, [0, 1].flatMap((seat) => [first(seat, "Qiqirn Merchant"), first(seat, "Island")]).map((what) => ({ do: "move" as const, what, to: "battlefield" as const, reason: "game-setup" as const })), "game-setup");
	return table;
}

export function manaProcedure(card: string, color: Mana["color"]): Procedure {
	return { source: { zones: ["battlefield"], controller: "self", card }, claim: `Tap ${card} for ${color}`,
		basis: `Basic land type ${card}; CR 305.6.`, timing: "mana", cost: { tap: true }, instructions: [{ do: "mana", who: "you", colors: [color] }] };
}

export function lootProcedure(basis = "{1}, {T}: Draw a card, then discard a card."): Procedure {
	return { source: { zones: ["battlefield"], controller: "self", card: "Qiqirn Merchant" }, claim: "Qiqirn Merchant: draw, then discard",
		basis, timing: "stack", cost: { mana: "{1}", tap: true }, instructions: [
			{ do: "draw", who: "you", count: 1 },
			{ do: "choose", who: "you", from: { zones: ["hand"], owner: "you" }, count: 1, as: "discard" },
			{ do: "move", what: "bound:discard", to: "graveyard", reason: "discard" },
		] };
}

/**
 * A loots on its third-turn upkeep as a plan step; B answers with its own loot
 * from a standing branch while A's ability is on the stack. Each discard is
 * the seat's own choice.
 */
export async function abilityExercise() {
	const table = abilityTable(), universe = load("cards/standard.tsv"), counted = tally();
	const basis = card(universe, "Qiqirn Merchant").oracle.split("\n")[0]!;
	let plans = 0, exchangeCalls = 0;
	const paused: { version: number; seat: number; frame: Frame }[] = [];
	const upkeep = (active: "self" | "opponent") => ({ active, step: "upkeep" as const, fromTurn: 3, throughTurn: 3 });
	const thinking: Pick<Reasoner, "work"> = { async work(_about, prompt, { submit }) {
		plans += 1;
		const { seat } = JSON.parse(prompt.user) as { seat: number };
		const plan: Plan = seat === 0
			? { objective: "Loot at the third upkeep, then let the opponent respond.", guidance: "Pay with the Island; choose the discard after seeing the draw.",
				steps: [{ label: "Loot with the Merchant", when: upkeep("self"), action: { procedure: lootProcedure(basis) } }] }
			: { objective: "Answer the opponent's loot with our own before theirs resolves.", guidance: "Respond only while their ability is on the stack.", steps: [],
				may: [{ label: "Loot in response", when: upkeep("opponent"), if: { amount: { count: { zones: ["stack"], controller: "opponent" } }, atLeast: 1 },
					action: { procedure: lootProcedure(basis) } }] };
		const problem = submit.check({ plan });
		if (problem) throw new Error(problem);
		return { plan };
	} };
	const classify: Classify = async (_model, request) => {
		const answers = Object.fromEntries(Object.entries(request.questions).map(([key, question]) => {
			if (question.type !== "choice") throw new Error("The fixture expects choices.");
			const entries = Object.entries(question.criteria);
			// Take what the plan marks, else pass, else the first real option.
			const choice = entries.find(([, text]) => /Plan (step|branch)/.test(text))?.[0] ?? entries.find(([id]) => id === "pass")?.[0] ?? entries.find(([id]) => id !== "ask:help")![0];
			return [key, { type: "choice", choice, probabilities: { [choice]: 1 }, confidence: 1 }];
		}));
		if (!exchangeCalls && table.ledger.filter((row) => row.activation?.timing === "stack").length === 2 && !cardsIn(table, "stack").length) exchangeCalls = counted.spent().length;
		return { api: "typesafe-system-one", provider: "typesafe", model: "jev-latest", answers, stopReason: "stop", timestamp: 0 } as never;
	};
	const model = { type: "classifier", id: "jev-latest", provider: "typesafe", api: "typesafe-system-one" } as never;
	const players = Object.fromEntries(table.seats.map((seat) => {
		editWork(table, seat.id, [{ do: "plan.request", reason: "Prepare the fixture's one activation and response." }], `prepare-${seat.id}`);
		const player = aiSeat({ name: seat.name, api: decisionApi(classify, model, { tally: counted }), intent: startingIntent(seat.id), dials: 0,
			plan: (frame) => planWork(frame, { cards: universe }, thinking), onGap: (gap) => table.gaps.push(gap) });
		return [seat.id, { ...player, async answer(frame: Frame) {
			if (frame.decision?.situation === "resolution") paused.push({ version: table.ledger.length, seat: seat.id, frame: structuredClone(frame) });
			return player.answer(frame);
		} }];
	}));
	const outcome = await play(table, players, Object.fromEntries(table.seats.map((seat) => [seat.id, startingIntent(seat.id)])));
	return { table, outcome, paused, plans, exchangeCalls, calls: counted.spent().length };
}
