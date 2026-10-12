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
import { amount, damageSource, holds, objects, players, select, tableWorld, targetKey, type Bound, type Chosen, type Scope, type Seen } from "./selectors.ts";
import { assignedAmount } from "./targeting.ts";
import { damageResult } from "./damage.ts";
import { orderedDraw } from "./draw.ts";
import { characteristics, has } from "./characteristics.ts";
import { doubleFaced, room, transformable } from "./faces.ts";
import { paymentChoices } from "./costs.ts";
import { colorChoices, manaTerms } from "./funding.ts";
import { inspection, selectionBlock } from "./inspection.ts";
import { beginSearch, searchQuality } from "./search.ts";
import { libraryKeyword } from "./library-keywords.ts";
import { chooseActions } from "./choice-actions.ts";
import { project } from "./view.ts";
import { summary } from "./announce.ts";
import { cardNameChoices } from "./card-names.ts";
import { defenders } from "./combat.ts";
import { tokenCopy, copySpell } from "./copies.ts";
import { STEPS } from "./steps.ts";
import { cardsIn, seat, type Mana, type Note, type Resolution, type Table, type Trigger } from "./table.ts";
import type { Instruction, Modification, Selector } from "./language.ts";
import type { Change, Reason, Zone } from "./syntax.ts";
import type { Decision, ObjectRef, SeatId } from "./types.ts";

export type Choice = { id: string; label: string; changes: Change[]; objects?: ObjectRef[]; cards?: string[]; pick?: Chosen; bind?: Record<string, Bound>; expand?: Resolution["program"]; follow?: ObjectRef; search?: { who: number; whose: number[] }; actionChoices?: Resolution["actionChoices"] };
export type Step = { actor: SeatId; question: string; choices: Choice[]; blocked?: string; preparation?: Decision["preparation"] };

const ref = (object: Seen): ObjectRef => ({ id: object.id, incarnation: object.incarnation });
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
	const visible = new Set((project(table, controller).objects ?? []).filter((one) => !one.faceDown || one.card).map((one) => `${one.id}@${one.incarnation}`));
	const name = (object?: Seen) => !object ? "nothing" : !visible.has(`${object.id}@${object.incarnation}`) ? "an unknown card" : object.card ?? object.token?.name ?? object.copied?.spec.name ?? object.id;
	const one = (label: string, changes: Change[], extra: Partial<Choice> = {}): Step => ({ actor: controller, question: label, choices: [{ id: "do", label, changes, ...extra }] });
	const source = scope.source ? ref(scope.source) : undefined;
	switch (instruction.do) {
		case "choose-actions": return chooseActions(table, scope, instruction, pending);
		case "keyword": return libraryKeyword(table, scope, instruction);
		case "reveal": {
			const revealing = many(table, scope, instruction);
			if (revealing.some((one) => one.faceDown)) return { actor: controller, question: "Reveal the selected face-down objects.", choices: [], blocked: "Revealing face-down objects requires identity visibility that this operation does not yet provide." };
			// The confirmation precedes disclosure; no private names belong in this option.
			return one(`Reveal ${revealing.length} card${revealing.length === 1 ? "" : "s"} publicly`,
				revealing.map((object) => ({ do: "reveal", what: object.id })), bind(instruction, { objects: revealing.map(ref), players: [] }));
		}
		case "name-card": {
			const actor = players(scope, instruction.who)[0] ?? controller, on = live(table, objects(scope, instruction.on));
			if (!table.cardNames) return { actor, question: "Choose an Oracle card name.", choices: [], blocked: "No pinned Oracle name catalog; the name choice remains pending." };
			return { actor, question: `Choose ${instruction.types?.join(" or ") ?? "a"} card name from the Oracle catalog.`,
				choices: cardNameChoices(table.cardNames, instruction.types).map((value) => ({ id: `name:${value}`, label: `Choose the name ${value}`, changes:
					on.map((object) => ({ do: "name-card" as const, what: object.id, key: instruction.key, name: value })) })) };
		}
		case "damage-rule": return one(`${instruction.combat === undefined ? "All" : instruction.combat ? "Combat" : "Noncombat"} damage ${instruction.mode === "prevent" ? "is prevented" : "can't be prevented"} until ${instruction.until.replaceAll("-", " ")}`,
			[{ do: "note", note: { kind: "damage-rule", by: controller, mode: instruction.mode, until: instruction.until as Until,
				...(instruction.combat !== undefined ? { combat: instruction.combat } : {}), ...(source ? { source } : {}) } }]);
		case "look": case "order": return inspection(table, scope, instruction, pending);
		case "activation-timing": return one(`${players(scope, instruction.who).map((who) => seat(table, who).name).join(", ")} may activate matching loyalty abilities at instant speed until ${instruction.until.replaceAll("-", " ")}`,
			players(scope, instruction.who).map((who): Change => ({ do: "note", note: { kind: "activation-timing", by: controller, who, ability: instruction.ability,
				of: structuredClone(instruction.of), until: instruction.until as Until, ...(source ? { source } : {}) } })));
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
			const dealt = typeof instruction.amount === "object" && "divided" in instruction.amount
				? "the announced share of" : amount(scope, instruction.amount);
			const source = objects(scope, instruction.from ?? "this")[0];
			const from = source ? ref(source) : pending.object;
			const hit = [...(instruction.to ? live(table, objects(scope, instruction.to)) : []), ...(instruction.every ? many(table, scope, { every: instruction.every }) : [])]
				.filter((object) => object.zone === "battlefield");
			const people = typeof instruction.to === "string" ? players(scope, instruction.to) : [];
			const changes: Extract<Change, { do: "damage" }>[] = [...hit.map(ref), ...people.map(player => ({ player }))]
				.map(target => ({ do: "damage" as const, source: from, target, amount: assignedAmount(scope, instruction.amount, target) }))
				.filter(change => change.amount > 0);
			const world = instruction.as ? tableWorld(table) : undefined;
			const delivered = instruction.as ? changes.map(change => damageResult(world!, change, damageSource(table, from))).filter(change => change.amount > 0) : [];
			return one(`Deal ${dealt} damage to ${[...hit.map(name), ...people.map((id) => seat(table, id).name)].join(", ") || "nothing"}`, changes,
				bind(instruction, { objects: delivered.flatMap(change => "id" in change.target ? [change.target] : []),
					players: delivered.flatMap(change => "player" in change.target ? [change.target.player] : []), amount: delivered.reduce((sum, change) => sum + change.amount, 0) }));
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
			if (terms?.faceDown === "manifest" && (moving.length > 1 || moving.some(object => object.zone === "battlefield")))
				return { actor: controller, question: "Manifest one card onto the battlefield.", choices: [], blocked: "Manifest moves one card at a time from another zone; use a repeated keyword operation for multiple cards." };
			const counters = terms?.counters ? Object.fromEntries(Object.entries(terms.counters).map(([kind, value]) => [kind, amount(scope, value)])) : undefined;
			const controlled = terms?.controller ? players(scope, terms.controller)[0] : undefined;
			const changes: Change[] = moving.flatMap((object): Change[] => [
				...(terms?.change && object.zone !== "battlefield" ? [{ do: "note" as const, note: { kind: "label" as const, by: controller,
					until: "indefinite" as const, on: { id: object.id, incarnation: object.incarnation + 1 }, text: claim,
					change: captured(scope, terms.change), ...(source ? { source } : {}) } }] : []),
				{ do: "move", what: object.id, to, reason: (destroy ? "destroy" : terms!.reason) as Reason, ...(terms?.position ? { position: terms.position as "top" | "bottom" } : {}),
					...(terms?.face !== undefined ? { face: terms.face } : {}),
					...(terms?.faceDown ? { faceDown: terms.faceDown } : {}),
					...(terms?.tapped ? { tapped: true as const } : {}), ...(counters ? { counters } : {}), ...(controlled !== undefined ? { controller: controlled } : {}) },
				...(terms?.link && source ? [{ do: "note" as const, note: { kind: "link" as const, by: controller, until: "indefinite" as const, on: { id: object.id, incarnation: object.incarnation + (object.zone !== to || to === "exile" ? 1 : 0) }, source } }] : []),
				...(waiting && object.zone !== to ? [{ do: "note" as const, note: { kind: "return" as const, by: controller, until: "indefinite" as const,
					on: { id: object.id, incarnation: object.incarnation + 1 }, source: waiting, to: object.zone } }] : []),
			]);
			const follow = source && to === "battlefield" && moving.some((object) => object.id === source.id && object.zone !== to) ? { follow: { id: source.id, incarnation: source.incarnation + 1 } } : {};
			// "That card" follows it to where this put it (400.7).
			const moved = (one: ObjectRef) => moving.some((object) => object.id === one.id && object.incarnation === one.incarnation && (object.zone !== to || to === "exile")) ? { id: one.id, incarnation: one.incarnation + 1 } : one;
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
				...(ability?.source?.id === object.id && ability.source.incarnation === object.incarnation && ability.transformAt !== undefined ? { since: ability.transformAt } : {}) })));
		}
		case "designate": {
			const marked = live(table, objects(scope, instruction.what)).filter(object => object.zone === "battlefield" && !object.designations?.includes(instruction.designation));
			return one(`Designate ${marked.map(name).join(", ") || "nothing"} as ${instruction.designation}`,
				marked.map((object): Change => ({ do: "designate", what: object.id, designation: instruction.designation })));
		}
		case "prepare": {
			const objectsToPrepare = live(table, objects(scope, instruction.what));
			return one(`${instruction.prepared ? "Prepare" : "Unprepare"} ${objectsToPrepare.map(name).join(", ") || "nothing"}`,
				objectsToPrepare.map((object): Change => ({ do: "prepare", what: object.id, prepared: instruction.prepared })));
		}
		case "door": {
			const object = live(table, objects(scope, instruction.what))[0];
			const unlocked = instruction.action === "unlock";
			const faces = object?.zone === "battlefield" && !object.faceDown && room(table.printed[object.card ?? ""]) ? ([0, 1] as const)
				.filter((face) => (instruction.face === undefined || instruction.face === face) && !!object.doors?.includes(face) !== unlocked) : [];
			return faces.length ? { actor: controller, question: `Choose a door to ${instruction.action}.`, choices: faces.map((face) => ({
				id: String(face), label: `${instruction.action} ${table.printed[object!.card!]!.faces![face]!.name}`,
				changes: [{ do: "door", what: object!.id, face, unlocked }],
			})) } : one(`No door to ${instruction.action}`, []);
		}
		case "choose": {
			const who = players(scope, instruction.who)[0] ?? controller;
			const blocked = selectionBlock(table, scope, instruction.from, who);
			if (blocked) return { actor: who, question: blocked, choices: [], blocked };
			const search = beginSearch(table, scope, instruction, pending, who);
			if (search) return search;
			const count = amount(scope, instruction.count);
			const picked = pending.picked.filter((one) => "id" in one);
			// "You" in the selector is still the ability's controller, whoever chooses.
			// Identical cards in a library or hand are one choice: nothing tells them apart.
			const seen = new Set<string>();
			const pool = select(scope, instruction.from).filter((object) => !picked.some((one) => one.id === object.id)).filter((object) => {
				if (object.zone !== "library" && object.zone !== "hand") return true;
				const key = `${object.zone}|${object.owner}|${object.faceDown ? object.id : object.card}`;
				return !seen.has(key) && !!seen.add(key);
			});
			const finish = (more: ObjectRef[]): Partial<Choice> => bind(instruction, { objects: [...picked, ...more], players: [] });
			// Once the count is met there is nothing left to pick, even when it is zero.
			const choices: Choice[] = picked.length >= count ? [] : pool.map((object) => {
				const last = picked.length + 1 >= count;
				return { id: object.id, label: `Choose ${object.faceDown ? `face-down creature ${object.id}` : object.card ?? object.token?.name ?? "an unknown card"} (${object.zone})`, objects: [ref(object)], ...(!object.faceDown && object.card ? { cards: [object.card] } : {}), changes: instruction.reveal ? [{ do: "reveal", what: object.id }] : [],
					...(last ? finish([ref(object)]) : { pick: ref(object) }) };
			});
			// Up to, a hidden-zone search, and running out are all ways to stop short (701.23b).
			// Declining gives up what the instruction is for, so the label says so; it reads as finishing otherwise.
			if (instruction.upTo || instruction.may && !pending.searching && !picked.length || pending.searching && searchQuality(instruction.from) || !pool.length || picked.length >= count) choices.push({ id: "done",
				label: picked.length ? `Stop here, with ${picked.length} chosen` : pending.searching ? "Finish search without finding a card" : pool.length && count ? "Decline: choose none of them, so this finds nothing" : "Nothing can be chosen", changes: [], ...finish([]) });
			return { actor: who, question: `${claim}: choose ${count === 1 ? "one" : `${count}`}${instruction.upTo ? " or fewer" : ""} (${picked.length} chosen).`, choices };
		}
		case "shuffle": return one("Shuffle", players(scope, instruction.who).map((whose) => ({ do: "shuffle" as const, whose })));
		case "draw": case "mill": {
			const count = Math.max(0, amount(scope, instruction.count)), moved: ObjectRef[] = [];
			const recipients = players(scope, instruction.who);
			if (instruction.do === "draw" && (recipients.length > 1 && scope.world.objects.some(one => one.zone === "battlefield" && scope.world.read(one)?.registrations.some(rule => rule.kind === "draw-rule")) || recipients.some(who => {
				const result = orderedDraw(scope.world, { do: "draw", who, count }); return result.applied.length || result.choices.length;
			}))) {
				const seats = table.seats.map(one => one.id), at = seats.indexOf(table.cursor.active), order = [...seats.slice(at), ...seats.slice(0, at)];
				const label = recipients.length > 1 ? `Draw ${count} per player, applying replacements to each batch in turn order` : recipients.map(who => {
					const result = orderedDraw(scope.world, { do: "draw", who, count });
					return `${seat(table, who).name}: draw ${result.count}${result.choices.length ? "; choose replacement order first" : result.applied.length ? " after replacement" : ""}`;
				}).join("; ");
				return one(label, recipients.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b)).map(who => ({ do: "draw", who, count, ...(instruction.as ? { as: instruction.as } : {}) })),
					bind(instruction, { objects: [], players: [] }));
			}
			const changes = recipients.flatMap((who): Change[] => {
				const top = cardsIn(table, "library", who).slice(0, count);
				moved.push(...top.map((object) => ({ id: object.id, incarnation: object.incarnation + 1 })));
				return [...top.map((object) => ({ do: "move" as const, what: object.id, to: (instruction.do === "draw" ? "hand" : "graveyard") as Zone, reason: instruction.do })),
					...(instruction.do === "draw" && top.length < count ? [{ do: "mark-player" as const, who, key: "drew-from-empty", add: 1 }] : [])];
			});
			return one(`${instruction.do === "draw" ? "Draw" : "Mill"} ${count}`, changes, bind(instruction, { objects: moved, players: [] }));
		}
		case "counters": {
			const on = live(table, instruction.on ? objects(scope, instruction.on) : instruction.every ? select(scope, instruction.every) : []);
			const counts = on.map(object => ({ object, count: assignedAmount(scope, instruction.amount, ref(object)) }));
			const count = typeof instruction.amount === "object" && "divided" in instruction.amount ? undefined : amount(scope, instruction.amount);
			const label = count === undefined
				? counts.map(({ object, count }) => `Put ${count} ${instruction.kind} on ${name(object)}`).join("; ") || `Put no ${instruction.kind} counters`
				: `${count < 0 ? "Remove" : "Put"} ${Math.abs(count)} ${instruction.kind} ${count < 0 ? "from" : "on"} ${on.map(name).join(", ") || "nothing"}`;
			return one(label, counts.filter(one => one.count).map(({ object, count }) => ({ do: "counters" as const, what: object.id, kind: instruction.kind, amount: count })));
		}
		case "increase-speed": return one(`Increase speed by ${instruction.amount}`, players(scope, instruction.who).map(who => ({ do: "increase-speed", who, amount: instruction.amount })));
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
			if (instruction.combination) return { actor: controller, question: `${claim}: choose the mana colors.`, choices: colorChoices((instruction.any ?? 1) * times, true).map(colors => ({
				id: colors.join(""), label: `Add ${colors.join("")}${duration}`, changes: who.map(who => ({ do: "add-mana" as const, who, colors, ...manaTerms(instruction, scope) })) })) };
			return { actor: controller, question: `${claim}: choose a color.`, choices: COLORS.map((color) => ({ id: color, label: `Add ${color.repeat(instruction.any ?? 1)}${duration}`, changes: add(Array(instruction.any ?? 1).fill(color)) })) };
		}
		case "tap": case "untap": {
			const which = many(table, scope, instruction).filter((object) => object.zone === "battlefield");
			return one(`${instruction.do === "tap" ? "Tap" : "Untap"} ${which.map(name).join(", ") || "nothing"}`, which.map((object) => ({ do: instruction.do, what: object.id })));
		}
		case "copy-spell": {
			const originals = objects(scope, instruction.what, true);
			if (originals.length > 1) return { actor: controller, question: "Copy the spell.", choices: [], blocked: "A spell copy needs one source; select one before copying." };
			const original = originals[0];
			if (!original) return one("No spell is copied: its source is unavailable.", [], bind(instruction, { objects: [], players: [] }));
			const result = copySpell(table, original);
			if ("blocked" in result) return result.preparation ? { actor: result.preparation.seat, question: result.blocked, choices: [], preparation: result.preparation.needed }
				: { actor: controller, question: "Copy the spell.", choices: [], blocked: result.blocked };
			const id = `spell-copy-${table.cursor.clock + 1}`;
			return one(`Copy ${result.spec.name} onto the stack with its announced choices`, [{ do: "copy-spell", id, of: ref(original), spec: result.spec,
				ability: { ...result.ability!, controller } }], bind(instruction, { objects: [{ id, incarnation: 0 }], players: [] }));
		}
		case "emblem": {
			if (instruction.registers.some(one => !["continuous", "watch"].includes(one.kind)))
				return { actor: controller, question: "Get the emblem.", choices: [], blocked: "Emblems currently carry continuous characteristic effects and triggered abilities only." };
			const recipients = [...new Set(players(scope, instruction.who))];
			const changes: Change[] = recipients.map(who => ({ do: "emblem", id: `emblem-${table.cursor.clock + 1}-${who}`, who, registers: structuredClone(instruction.registers) }));
			return one(`${recipients.map(who => seat(table, who).name).join(", ") || "Nobody"} gets an emblem`, changes,
				bind(instruction, { objects: changes.flatMap(change => change.do === "emblem" ? [{ id: change.id, incarnation: 0 }] : []), players: recipients }));
		}
		case "token": {
			const count = Math.max(0, amount(scope, instruction.count)), creators = [...new Set(players(scope, instruction.controller ?? "you"))];
			const originals = instruction.copy && count && creators.length ? objects(scope, instruction.copy, true) : [];
			if (originals.length > 1) return { actor: controller, question: "Create the requested token copy.", choices: [], blocked: "A token copy needs one source; choose one before copying." };
			const original = originals[0];
			const copied = original && count && creators.length ? tokenCopy(table, original, instruction.except) : undefined;
			if (copied && "blocked" in copied && copied.preparation) return { actor: copied.preparation.seat,
				question: copied.blocked, choices: [], preparation: copied.preparation.needed };
			if (copied && "blocked" in copied) return { actor: controller, question: "Create the requested token copy.", choices: [], blocked: copied.blocked };
			const spec = instruction.spec ?? (copied && "spec" in copied ? copied.spec : undefined);
			if (!spec) return one("No token is created: the copy source is unavailable.", [], bind(instruction, { objects: [], players: [] }));
			const tokens = creators.flatMap((who) => Array.from({ length: count }, () => ({ controller: who })))
				.map((token, at) => ({ ...token, id: `token-${table.cursor.clock + 1}-${at}` }));
			const attacking = instruction.attacking && STEPS[table.cursor.steps[0]!]?.phase === "combat" ? tokens.filter((one) => one.controller === table.cursor.active) : [];
			const options = attacking.length ? defenders(table, table.cursor.active) : [];
			const create = (chosen: Chosen[]): Choice => ({ id: "do", label: tokens.length ? `${creators.map((who) => seat(table, who).name).join(", ")} create ${count} ${spec.name}${instruction.tapped ? " tapped" : ""}${options.length ? "; the active player's tokens enter attacking" : ""}` : "No player creates a token",
				changes: tokens.map((token) => { const pick = chosen[attacking.findIndex((one) => one.id === token.id)];
					const defender = pick && options.find((one) => targetKey(one.chosen) === targetKey(pick));
					return { do: "token", ...token, spec: structuredClone(spec), ...(instruction.tapped ? { tapped: true as const } : {}),
						...(defender ? { attacking: { defending: defender.defending, ...("id" in defender.chosen ? { to: defender.chosen } : {}) } } : {}) }; }),
				...bind(instruction, { objects: tokens.map(({ id }) => ({ id, incarnation: 0 })), players: [] }) });
			if (!options.length) return { actor: controller, question: `Create ${spec.name} tokens.`, choices: [create([])] };
			const previous = pending.picked.map((pick, at) => `token ${at + 1} at ${options.find((one) => targetKey(one.chosen) === targetKey(pick))?.label ?? "the former defender"}`);
			return { actor: table.cursor.active, question: `Choose what ${spec.name} token ${pending.picked.length + 1} of ${attacking.length} enters attacking.${previous.length ? ` Chosen: ${previous.join(", ")}.` : ""}`,
				choices: options.map((defender) => ({ ...(pending.picked.length + 1 === attacking.length ? create([...pending.picked, defender.chosen]) : { changes: [], pick: defender.chosen }),
					id: `attack-${targetKey(defender.chosen)}`, label: `${spec.name} token ${pending.picked.length + 1} attacks ${defender.label}`,
					...("id" in defender.chosen ? { objects: [defender.chosen] } : {}) })) };
		}
		case "modify": {
			const remaining = source && table.things.get(source.id);
			const active = instruction.until !== "while-source" || remaining?.zone === "battlefield" && remaining.incarnation === source!.incarnation;
			const affected = active ? many(table, scope, instruction).filter((object) => object.zone === "battlefield") : [];
			const change = captured(scope, instruction.change);
			const text = instruction.label ?? claim;
			return one(`${text}: ${affected.map(name).join(", ") || "nothing"}`, affected.map((object): Change => ({ do: "note", note: {
				kind: "label", by: controller, until: instruction.until as Until, on: ref(object), text, change, ...(source ? { source } : {}) } })),
				bind(instruction, { objects: affected.map(ref), players: [] }));
		}
		case "permit": {
			const cards = live(table, objects(scope, instruction.what)), who = instruction.who === "owner" ? undefined : players(scope, instruction.who)[0] ?? controller;
			const fromTurn = table.cursor.turn + (instruction.from === "next-turn" ? 1 : 0);
			const until: Until = typeof instruction.until === "string" ? instruction.until as Until : "nextEndStep" in instruction.until
				? { nextEndStep: players(scope, instruction.until.nextEndStep)[0] ?? controller }
				: { endOfNextTurn: players(scope, instruction.until.endOfNextTurn)[0] ?? controller, afterTurn: table.cursor.turn };
			const permission = `may ${instruction.mana ? `cast for ${instruction.mana === "printed" ? "its printed mana cost" : instruction.mana}` : "play"}`;
			const label = who === undefined ? cards.map(object => `${seat(table, object.owner).name} ${permission} ${name(object)}`).join("; ") || "No cards receive a play permission"
				: `${seat(table, who).name} ${permission} ${cards.map(name).join(", ") || "nothing"}`;
			return one(`${label}${instruction.leavesStack ? `; put it into ${instruction.leavesStack} whenever it leaves the stack` : ""}`, cards.map((object): Change => ({ do: "note", note: {
				kind: "permit", by: controller, until, on: ref(object), who: who ?? object.owner, fromTurn, ...(instruction.mana ? { mana: instruction.mana } : {}),
				...(instruction.while ? { while: structuredClone(instruction.while) } : {}),
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
			const counter = (selected: Seen[]): Pick<Choice, "changes" | "bind"> => ({
				changes: selected.map((object): Change => object.card || object.spellCopy ? { do: "move", what: object.id, to: instruction.to === "exile" ? "exile" : "graveyard", reason: "counter" } : { do: "cease", what: object.id }),
				...bind(instruction, { objects: selected.map(ref), players: [], amount: selected.length }),
			});
			const destination = instruction.to === "exile" ? " Countered spells go directly to exile." : "";
			const protectedIds = new Set(stacked.filter((object) => has(characteristics(table, object as never), "can't be countered")).map((one) => one.id));
			const respect: Choice[] = protectedIds.size ? [{ id: "restrictions", label: "Apply can't be countered: leave protected spells on the stack",
				...counter(stacked.filter(object => !protectedIds.has(object.id))) }] : [];
			const warning = protectedIds.size ? " (conflicts with can't be countered)" : "";
			const unless = instruction.unless;
			if (!unless) return { actor: controller, question: `Counter ${stacked.map(name).join(", ") || "nothing"}.`,
				choices: [...respect, { id: "do", label: `Counter ${stacked.map(name).join(", ") || "nothing"}${warning}${destination}`, ...counter(stacked) }] };
			const payer = players(scope, unless.who)[0] ?? controller;
			const pay = paymentChoices(table, scope, unless.pays, payer, pending.object);
			return { actor: payer, question: `${claim}: pay, or apply the counter instruction.`, choices: [...respect,
				...pay.map(choice => ({ ...choice, ...bind(instruction, { objects: [], players: [], amount: 0 }) })),
				{ id: "decline", label: `Do not pay; it is countered${warning}${destination}`, ...counter(stacked) }] };
		}
		case "perform": {
			const actor = players(scope, instruction.who)[0] ?? controller, player = pending.program[0]?.player;
			const label = `Carry out: ${instruction.instructions.map(summary).join(" ")}`;
			return { actor, question: label, choices: [{ id: "do", label, changes: [],
				expand: instruction.instructions.map((inner) => ({ instruction: inner, ...(player !== undefined ? { player } : {}) })),
				...bind(instruction, { objects: [], players: [], amount: 1 }) }] };
		}
		case "each": {
			if (instruction.objects) {
				const privateZone = (selector: Selector): boolean => !!selector.zones?.some(zone => !["battlefield", "exile", "graveyard", "stack", "command"].includes(zone)) || !!selector.any?.some(privateZone) || !!selector.all?.some(privateZone);
				const blocked = privateZone(instruction.objects) ? "Object iteration supports public zones only; it cannot inspect hidden cards." : selectionBlock(table, scope, instruction.objects, controller);
				if (blocked) return { actor: controller, question: blocked, choices: [], blocked };
				const selected = select(scope, instruction.objects);
				return one(`For each of ${selected.length} objects`, [], { expand: selected.flatMap(object => instruction.instructions.map(inner => ({ instruction: inner, object: ref(object) }))) });
			}
			const who = instruction.players === "each-player" ? scope.world.players.map((one) => one.id) : players(scope, "opponent");
			return one(`For each of ${who.length} players`, [], { expand: who.flatMap((player) => instruction.instructions.map((inner) => ({ instruction: inner, player }))) });
		}
	}
}
