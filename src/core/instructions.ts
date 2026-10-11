/**
 * One instruction of a resolving spell or ability, as the choices its actor has
 * (608.2c-d). Most have one: do it. A `choose` has one per card it could pick,
 * a `may` can be declined, and an `unless` can be paid. Each choice is the
 * physical changes it makes and what it binds for later instructions.
 *
 * Everything is read through the scope at the moment the instruction applies,
 * so "that much" and "its power" mean what they mean now (608.2h).
 * Past 150 lines because each instruction is a short case of one switch.
 */
import { amount, holds, objects, players, select, type Bound, type Scope, type Seen } from "./selectors.ts";
import { characteristics, has } from "./characteristics.ts";
import { doubleFaced, room, transformable } from "./faces.ts";
import { paymentChoices } from "./costs.ts";
import { manaTerms } from "./funding.ts";
import { inspection } from "./inspection.ts";
import { cardsIn, seat, type Mana, type Note, type Resolution, type Table, type Trigger } from "./table.ts";
import type { Instruction, Modification } from "./language.ts";
import type { Change, Reason, Zone } from "./syntax.ts";
import type { ObjectRef, SeatId } from "./types.ts";

export type Choice = { id: string; label: string; changes: Change[]; objects?: ObjectRef[]; cards?: string[]; pick?: ObjectRef; bind?: Record<string, Bound>; expand?: Resolution["program"]; follow?: ObjectRef };
export type Step = { actor: SeatId; question: string; choices: Choice[] };

const ref = (object: Seen): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
const name = (object?: Seen) => object ? object.card ?? object.token?.name ?? object.id : "nothing";
const COLORS: Mana["color"][] = ["W", "U", "B", "R", "G"];
type Until = Note["until"];

/** What an instruction can still act on: objects that have not left since they were named. */
function live(table: Table, list: Seen[]): Seen[] {
	return list.flatMap((one) => { const now = table.things.get(one.id); return now && now.incarnation === one.incarnation ? [now] : []; });
}
const many = (table: Table, scope: Scope, instruction: { what?: Parameters<typeof objects>[1]; every?: Parameters<typeof select>[1] }) =>
	live(table, instruction.what ? objects(scope, instruction.what) : instruction.every ? select(scope, instruction.every) : []);
const bind = (instruction: Instruction, value: Bound) => instruction.as ? { bind: { [instruction.as]: value } } : {};

/** Amounts inside a change are read now and kept as numbers, so the label applies what was true as it resolved. */
function captured(scope: Scope, change: Modification): Modification {
	return { ...structuredClone(change),
		...(change.power !== undefined ? { power: amount(scope, change.power) } : {}),
		...(change.toughness !== undefined ? { toughness: amount(scope, change.toughness) } : {}),
		...(change.base ? { base: { power: amount(scope, change.base.power), toughness: amount(scope, change.base.toughness) } } : {}) };
}

export function instructionStep(table: Table, scope: Scope, instruction: Instruction, pending: Resolution, claim: string): Step {
	const controller = scope.controller;
	const one = (label: string, changes: Change[], extra: Partial<Choice> = {}): Step => ({ actor: controller, question: label, choices: [{ id: "do", label, changes, ...extra }] });
	const source = scope.source ? ref(scope.source) : undefined;
	switch (instruction.do) {
		case "look": case "order": return inspection(table, scope, instruction, pending);
		case "spell-words": return one(`Future ${instruction.next ? "next matching " : "matching "}spells: ${instruction.words.join(", ")}`,
			players(scope, instruction.who).map((who): Change => ({ do: "note", note: { kind: "cast-words", by: controller, who, words: [...instruction.words],
				until: instruction.until as Until, ...(source ? { source } : {}), ...(instruction.of ? { of: structuredClone(instruction.of) } : {}), ...(instruction.next ? { next: true } : {}) } })));
		case "pay": {
			const who = players(scope, instruction.who)[0] ?? controller;
			const choices = paymentChoices(table, scope, instruction.cost, who, pending.object).map((choice) => ({ ...choice,
				...(!choice.pick ? bind(instruction, { objects: [], players: [], amount: 1 }) : {}) }));
			if (!choices.length) choices.push({ id: "unpaid", label: "The full cost cannot be paid", changes: [], ...bind(instruction, { objects: [], players: [], amount: 0 }) });
			return { actor: who, question: `${claim}: pay the full cost.`, choices };
		}
		case "damage": {
			const dealt = amount(scope, instruction.amount);
			const source = objects(scope, instruction.from ?? "this")[0];
			const from = source ? ref(source) : pending.object;
			const hit = [...(instruction.to ? live(table, objects(scope, instruction.to)) : []), ...(instruction.every ? many(table, scope, { every: instruction.every }) : [])]
				.filter((object) => object.zone === "battlefield");
			const people = typeof instruction.to === "string" ? players(scope, instruction.to) : [];
			const changes: Change[] = dealt <= 0 ? [] : [
				...hit.map((object): Change => ({ do: "damage", source: from, target: ref(object), amount: dealt })),
				...people.map((player): Change => ({ do: "damage", source: from, target: { player }, amount: dealt })),
			];
			return one(`Deal ${dealt} damage to ${[...hit.map(name), ...people.map((id) => seat(table, id).name)].join(", ") || "nothing"}`, changes,
				bind(instruction, { objects: [], players: [], amount: dealt }));
		}
		case "fight": {
			const [a] = live(table, objects(scope, instruction.a)), [b] = live(table, objects(scope, instruction.b));
			const fighters = [a, b].filter((one): one is Seen => !!one && one.zone === "battlefield" && !!characteristics(table, one as never)?.types.includes("creature"));
			// 701.14b: if either is gone or no longer a creature, neither deals damage.
			if (fighters.length < 2) return one("Neither creature fights", []);
			const power = (object: Seen) => Math.max(0, characteristics(table, object as never)?.power ?? 0);
			return one(`${name(a)} and ${name(b)} fight`, [
				...(power(a!) ? [{ do: "damage" as const, source: ref(a!), target: ref(b!), amount: power(a!) }] : []),
				...(power(b!) ? [{ do: "damage" as const, source: ref(b!), target: ref(a!), amount: power(b!) }] : []),
			]);
		}
		case "move": case "destroy": {
			const destroy = instruction.do === "destroy";
			const to: Zone = destroy ? "graveyard" : instruction.to as Zone;
			const terms = instruction.do === "move" ? instruction : undefined;
			const specified = terms?.until && objects(scope, terms.until.leaves)[0];
			const duration = specified && table.things.get(specified.id);
			const waiting = duration?.zone === "battlefield" && duration.incarnation === specified!.incarnation ? ref(duration) : undefined;
			const moving = terms?.until && !waiting ? [] : many(table, scope, instruction).filter((object) => !destroy || (object.zone === "battlefield" && !has(characteristics(table, object as never), "indestructible")));
			if (terms && to === "library" && moving.every((one) => one.zone === "library")) {
				const ordered = inspection(table, scope, { do: "order", who: "you", what: terms.what, every: terms.every, position: terms.position ?? "top", as: terms.as }, pending);
				if (terms.countFrom && terms.as) for (const choice of ordered.choices) {
					const bound = choice.bind?.[terms.as];
					if (bound) bound.amount = moving.filter((one) => one.zone === terms.countFrom).length;
				}
				return ordered;
			}
			const counters = terms?.counters ? Object.fromEntries(Object.entries(terms.counters).map(([kind, value]) => [kind, amount(scope, value)])) : undefined;
			const controlled = terms?.controller ? players(scope, terms.controller)[0] : undefined;
			const changes: Change[] = moving.flatMap((object): Change[] => [
				{ do: "move", what: object.id, to, reason: (destroy ? "destroy" : terms!.reason) as Reason, ...(terms?.position ? { position: terms.position as "top" | "bottom" } : {}),
					...(terms?.face !== undefined ? { face: terms.face } : {}),
					...(terms?.tapped ? { tapped: true as const } : {}), ...(counters ? { counters } : {}), ...(controlled !== undefined ? { controller: controlled } : {}) },
				...(terms?.link && source ? [{ do: "note" as const, note: { kind: "link" as const, by: controller, until: "indefinite" as const, on: { id: object.id, incarnation: object.incarnation + (object.zone === to ? 0 : 1) }, source } }] : []),
				...(waiting && object.zone !== to ? [{ do: "note" as const, note: { kind: "return" as const, by: controller, until: "indefinite" as const,
					on: { id: object.id, incarnation: object.incarnation + 1 }, source: waiting, to: object.zone } }] : []),
			]);
			const follow = source && to === "battlefield" && moving.some((object) => object.id === source.id && object.zone !== to) ? { follow: { id: source.id, incarnation: source.incarnation + 1 } } : {};
			// "That card" follows it to where this put it (400.7).
			const moved = (one: ObjectRef) => moving.some((object) => object.id === one.id && object.incarnation === one.incarnation && object.zone !== to) ? { id: one.id, incarnation: one.incarnation + 1 } : one;
			const followed = Object.fromEntries(Object.entries(pending.bound).filter(([, value]) => value.objects.some((one) => moved(one) !== one))
				.map(([key, value]) => [key, { ...value, objects: value.objects.map(moved) }]));
			const own = bind(instruction, { objects: moving.map((object) => moved(ref(object))), players: [],
				...(terms?.countFrom ? { amount: moving.filter((object) => object.zone === terms.countFrom).length } : {}) });
			return one(`${destroy ? "Destroy" : `Put into ${to}`}: ${moving.map(name).join(", ") || "nothing"}`, changes,
				{ ...follow, ...(Object.keys(followed).length || own.bind ? { bind: { ...followed, ...own.bind } } : {}) });
		}
		case "transform": {
			const ability = table.things.get(pending.object)?.ability;
			const turning = many(table, scope, instruction).filter((object) => transformable(table.printed[object.card ?? ""], object));
			return one(`Transform ${turning.map(name).join(", ") || "nothing"}`, turning.map((object): Change => ({ do: "transform", what: object.id,
				...(ability?.source.id === object.id && ability.source.incarnation === object.incarnation && ability.transformAt !== undefined ? { since: ability.transformAt } : {}) })));
		}
		case "prepare": {
			const objectsToPrepare = live(table, objects(scope, instruction.what));
			return one(`${instruction.prepared ? "Prepare" : "Unprepare"} ${objectsToPrepare.map(name).join(", ") || "nothing"}`,
				objectsToPrepare.map((object): Change => ({ do: "prepare", what: object.id, prepared: instruction.prepared })));
		}
		case "door": {
			const object = live(table, objects(scope, instruction.what))[0];
			const unlocked = instruction.action === "unlock";
			const faces = object?.zone === "battlefield" && room(table.printed[object.card ?? ""]) ? ([0, 1] as const)
				.filter((face) => (instruction.face === undefined || instruction.face === face) && !!object.doors?.includes(face) !== unlocked) : [];
			return faces.length ? { actor: controller, question: `Choose a door to ${instruction.action}.`, choices: faces.map((face) => ({
				id: String(face), label: `${instruction.action} ${table.printed[object!.card!]!.faces![face]!.name}`,
				changes: [{ do: "door", what: object!.id, face, unlocked }],
			})) } : one(`No door to ${instruction.action}`, []);
		}
		case "choose": {
			const who = players(scope, instruction.who)[0] ?? controller;
			const count = amount(scope, instruction.count);
			const picked = pending.picked;
			// "You" in the selector is still the ability's controller, whoever chooses.
			// Identical cards in a library or hand are one choice: nothing tells them apart.
			const seen = new Set<string>();
			const pool = select(scope, instruction.from).filter((object) => !picked.some((one) => one.id === object.id)).filter((object) => {
				if (object.zone !== "library" && object.zone !== "hand") return true;
				const key = `${object.zone}|${object.owner}|${object.card}`;
				return !seen.has(key) && !!seen.add(key);
			});
			const finish = (more: ObjectRef[]): Partial<Choice> => bind(instruction, { objects: [...picked, ...more], players: [] });
			// Once the count is met there is nothing left to pick, even when it is zero.
			const choices: Choice[] = picked.length >= count ? [] : pool.map((object) => {
				const last = picked.length + 1 >= count;
				return { id: object.id, label: `Choose ${name(object)} (${object.zone})`, objects: [ref(object)], ...(object.card ? { cards: [object.card] } : {}), changes: instruction.reveal ? [{ do: "reveal", what: object.id }] : [],
					...(last ? finish([ref(object)]) : { pick: ref(object) }) };
			});
			// Up to, a hidden-zone search, and running out are all ways to stop short (701.23b).
			// Declining gives up what the instruction is for, so the label says so; it reads as finishing otherwise.
			if (instruction.upTo || instruction.may && !picked.length || !pool.length || picked.length >= count) choices.push({ id: "done",
				label: picked.length ? `Stop here, with ${picked.length} chosen` : pool.length && count ? "Decline: choose none of them, so this finds nothing" : "Nothing can be chosen", changes: [], ...finish([]) });
			return { actor: who, question: `${claim}: choose ${count === 1 ? "one" : `${count}`}${instruction.upTo ? " or fewer" : ""} (${picked.length} chosen).`, choices };
		}
		case "shuffle": return one("Shuffle", players(scope, instruction.who).map((whose) => ({ do: "shuffle" as const, whose })));
		case "draw": case "mill": {
			const count = amount(scope, instruction.count), moved: ObjectRef[] = [];
			const changes = players(scope, instruction.who).flatMap((who): Change[] => {
				const top = cardsIn(table, "library", who).slice(0, count);
				moved.push(...top.map((object) => ({ id: object.id, incarnation: object.incarnation + 1 })));
				return [...top.map((object) => ({ do: "move" as const, what: object.id, to: (instruction.do === "draw" ? "hand" : "graveyard") as Zone, reason: instruction.do })),
					...(instruction.do === "draw" && top.length < count ? [{ do: "mark-player" as const, who, key: "drew-from-empty", add: 1 }] : [])];
			});
			return one(`${instruction.do === "draw" ? "Draw" : "Mill"} ${count}`, changes, bind(instruction, { objects: moved, players: [] }));
		}
		case "counters": {
			const count = amount(scope, instruction.amount);
			const on = live(table, instruction.on ? objects(scope, instruction.on) : instruction.every ? select(scope, instruction.every) : []);
			return one(`${count < 0 ? "Remove" : "Put"} ${Math.abs(count)} ${instruction.kind} ${count < 0 ? "from" : "on"} ${on.map(name).join(", ") || "nothing"}`,
				count ? on.map((object) => ({ do: "counters" as const, what: object.id, kind: instruction.kind, amount: count })) : []);
		}
		case "life": {
			const change = amount(scope, instruction.amount);
			return one(`${change < 0 ? "Lose" : "Gain"} ${Math.abs(change)} life`, change ? players(scope, instruction.who).map((who) => ({ do: "change-life" as const, who, amount: change, reason: "resolve" as const })) : [],
				bind(instruction, { objects: [], players: [], amount: Math.abs(change) }));
		}
		case "mana": {
			const times = instruction.times === undefined ? 1 : amount(scope, instruction.times);
			const who = players(scope, instruction.who);
			const duration = instruction.until ? `, lasting until ${instruction.until.replaceAll("-", " ")}` : "";
			const add = (colors: Mana["color"][]) => who.map((one) => ({ do: "add-mana" as const, who: one, colors: Array.from({ length: times }, () => colors).flat(),
				...manaTerms(instruction, scope) }));
			if (instruction.colors) return one(`Add ${instruction.colors.join("")}${times > 1 ? ` ${times} times` : ""}${duration}`, add(instruction.colors as Mana["color"][]));
			return { actor: controller, question: `${claim}: choose a color.`, choices: COLORS.map((color) => ({ id: color, label: `Add ${color.repeat(instruction.any ?? 1)}${duration}`, changes: add(Array(instruction.any ?? 1).fill(color)) })) };
		}
		case "tap": case "untap": {
			const which = many(table, scope, instruction).filter((object) => object.zone === "battlefield");
			return one(`${instruction.do === "tap" ? "Tap" : "Untap"} ${which.map(name).join(", ") || "nothing"}`, which.map((object) => ({ do: instruction.do, what: object.id })));
		}
		case "token": {
			const count = amount(scope, instruction.count);
			const ids = Array.from({ length: count }, (_, at) => `token-${table.cursor.clock + 1}-${at}`);
			return one(`Create ${count} ${instruction.spec.name}`, ids.map((id) => ({ do: "token" as const, id, spec: structuredClone(instruction.spec), controller, ...(instruction.tapped ? { tapped: true as const } : {}) })),
				bind(instruction, { objects: ids.map((id) => ({ id, incarnation: 0 })), players: [] }));
		}
		case "modify": {
			const affected = many(table, scope, instruction).filter((object) => object.zone === "battlefield");
			const change = captured(scope, instruction.change);
			const text = instruction.label ?? claim;
			return one(`${text}: ${affected.map(name).join(", ") || "nothing"}`, affected.map((object): Change => ({ do: "note", note: {
				kind: "label", by: controller, until: instruction.until as Until, on: ref(object), text, change, ...(source ? { source } : {}) } })),
				bind(instruction, { objects: affected.map(ref), players: [] }));
		}
		case "permit": {
			const cards = live(table, objects(scope, instruction.what)), who = players(scope, instruction.who)[0] ?? controller;
			const fromTurn = table.cursor.turn + (instruction.from === "next-turn" ? 1 : 0);
			const until: Until = typeof instruction.until === "string" ? instruction.until as Until : {
				endOfNextTurn: players(scope, instruction.until.endOfNextTurn)[0] ?? controller, afterTurn: table.cursor.turn };
			return one(`${seat(table, who).name} may ${instruction.mana ? `cast for ${instruction.mana === "printed" ? "its printed mana cost" : instruction.mana}` : "play"} ${cards.map(name).join(", ") || "nothing"}${instruction.leavesStack ? `; put it into ${instruction.leavesStack} whenever it leaves the stack` : ""}`, cards.map((object): Change => ({ do: "note", note: {
				kind: "permit", by: controller, until, on: ref(object), who, fromTurn, ...(instruction.mana ? { mana: instruction.mana } : {}),
				...(instruction.of ? { of: structuredClone(instruction.of) } : {}), ...(instruction.leavesStack ? { leavesStack: instruction.leavesStack as Zone } : {}),
				...(source && until === "while-source" ? { source } : {}) } })));
		}
		case "register": {
			const on = live(table, objects(scope, instruction.on));
			const until = (instruction.registration.kind === "replace" ? instruction.registration.until ?? "indefinite" : "indefinite") as Until;
			return one(`Register on ${on.map(name).join(", ") || "nothing"}: ${instruction.registration.basis}`, on.map((object): Change => ({ do: "note", note: {
				kind: "register", by: controller, until, on: ref(object), registration: structuredClone(instruction.registration) } })));
		}
		case "delay": {
			if (!source) return one("No source to delay a trigger for", []);
			const note: Omit<Extract<Note, { kind: "delay" }>, "id" | "written"> = { kind: "delay", by: controller, until: (instruction.until ?? "indefinite") as Until, event: structuredClone(instruction.event),
				effect: structuredClone(instruction.effect), fixed: { source, targets: structuredClone(scope.targets ?? []), bound: structuredClone(pending.bound), ...(scope.x !== undefined ? { x: scope.x } : {}),
					...(doubleFaced(table.printed[scope.source?.card ?? ""]) ? { transformAt: scope.source?.transformed ?? 0 } : {}) },
				once: !instruction.until, ...(instruction.until === "while-source" ? { source } : {}) };
			return one("Create a delayed trigger", [{ do: "note", note }]);
		}
		case "reflect": {
			// "When you do": a trigger made now, put on the stack at the next priority (603.12).
			if (instruction.check && !holds(scope, instruction.check)) return one("It does not trigger: its condition is false", []);
			if (!source) return one("No source for a reflexive trigger", []);
			const event = scope.event;
			const trigger: Trigger = { id: `trigger-${table.cursor.clock + 1}-reflexive`, controller, source, basis: `When you do (${claim})`,
				effect: structuredClone(instruction.effect), ...(instruction.check ? { check: structuredClone(instruction.check) } : {}), bound: structuredClone(pending.bound),
				event: { ...(event?.object ? { object: ref(event.object) } : {}), ...(event?.objects ? { objects: event.objects.map(ref) } : {}),
					...(event?.player !== undefined ? { player: event.player } : {}), ...(event?.source ? { source: ref(event.source) } : {}),
					...(event?.recipient ? { recipient: ref(event.recipient) } : {}), ...(event?.amount !== undefined ? { amount: event.amount } : {}) },
				...(scope.x !== undefined ? { x: scope.x } : {}) };
			return one("It triggers: when you do", [{ do: "trigger", action: "wait", trigger }]);
		}
		case "attach": {
			const [what] = live(table, objects(scope, instruction.what)), [to] = live(table, objects(scope, instruction.to));
			return one(`Attach ${name(what)} to ${name(to)}`, what && to ? [{ do: "attach", what: what.id, to: ref(to) }] : []);
		}
		case "counter": {
			const stacked = live(table, objects(scope, instruction.what)).filter((object) => object.zone === "stack");
			const counter: Change[] = stacked.map((object): Change => object.card ? { do: "move", what: object.id, to: "graveyard", reason: "counter" } : { do: "cease", what: object.id });
			const protectedIds = new Set(stacked.filter((object) => has(characteristics(table, object as never), "can't be countered")).map((one) => one.id));
			const respect: Choice[] = protectedIds.size ? [{ id: "restrictions", label: "Apply can't be countered: leave protected spells on the stack",
				changes: counter.filter((change) => !("what" in change && protectedIds.has(change.what))) }] : [];
			const warning = protectedIds.size ? " (conflicts with can't be countered)" : "";
			const unless = instruction.unless;
			if (!unless) return { actor: controller, question: `Counter ${stacked.map(name).join(", ") || "nothing"}.`,
				choices: [...respect, { id: "do", label: `Counter ${stacked.map(name).join(", ") || "nothing"}${warning}`, changes: counter }] };
			const payer = players(scope, unless.who)[0] ?? controller;
			const pay = paymentChoices(table, scope, unless.pays, payer, pending.object);
			return { actor: payer, question: `${claim}: pay, or apply the counter instruction.`, choices: [...respect, ...pay, { id: "decline", label: `Do not pay; it is countered${warning}`, changes: counter }] };
		}
		case "each": {
			const who = instruction.players === "each-player" ? scope.world.players.map((one) => one.id) : players(scope, "opponent");
			return one(`For each of ${who.length} players`, [], { expand: who.flatMap((player) => instruction.instructions.map((inner) => ({ instruction: inner, player }))) });
		}
	}
}
