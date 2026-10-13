/**
 * The page that flips through a picture series: one picture at a time with
 * what happened, each seat's counts at that moment, life over the game, and
 * the game's own numbers. One file beside the pictures; it loads nothing else.
 */
import type { Table } from "../core/table.ts";
import type { Moment } from "./series.ts";

/** What the game's records count, per seat and for the game, and what its run cost when a result was saved. */
export type Stats = { seats: { name: string; deck: string; result?: string; counts: [string, number][] }[]; game: [string, string][] };

/** The run's own numbers, from its saved result: time, model calls and what they cost. */
export type Run = { elapsedMs: number; calls: number; input: number; output: number; cost: number; roles: { role: string; calls: number; cost: number }[] };

/** Counted from the game's log and ledger after a replay, so any saved game has them. */
export function gameStats(table: Table, played?: string, run?: Run): Stats {
	const tokens = new Map<string, number>();
	const owner = (id: string) => /^(\d+)-/.test(id) ? Number(/^(\d+)-/.exec(id)![1]) : tokens.get(id);
	const counts = table.seats.map(() => new Map<string, number>());
	const add = (seat: number | undefined, what: string, amount = 1) => { if (seat !== undefined && counts[seat]) counts[seat]!.set(what, (counts[seat]!.get(what) ?? 0) + amount); };
	for (const entry of table.log) for (const change of entry.changes as unknown as Record<string, unknown>[]) {
		if (change.do === "token") tokens.set(String(change.id), Number(change.controller));
		if (change.do === "move") {
			const seat = owner(String(change.what)), reason = String(change.reason);
			if (reason === "play-land") add(seat, "Lands played");
			if (reason === "cast") add(seat, "Spells cast");
			if (reason === "draw" && entry.reason !== "game-setup") add(seat, "Cards drawn");
			if (reason === "discard") add(seat, "Cards discarded");
			if (reason === "destroy" || reason === "sacrifice") add(seat, "Permanents destroyed or sacrificed");
		}
		if (change.do === "attack") for (const one of change.attackers as { id: string }[]) add(owner(one.id), "Attackers declared");
		if (change.do === "damage" && (change.target as { player?: number }).player !== undefined)
			add(owner(String(change.source)), change.combat ? "Combat damage to players" : "Other damage to players", Number(change.amount));
	}
	const rows = table.ledger, by = (key: "why" | "by", value: string) => rows.filter((row) => row[key] === value).length;
	const winner = table.outcome && table.seats.filter((seat) => table.outcome!.results[seat.id] === "win").map((seat) => seat.name);
	const minutes = run && `${Math.floor(run.elapsedMs / 60_000)}m ${Math.round(run.elapsedMs / 1000) % 60}s`;
	return {
		seats: table.seats.map((seat, at) => ({ name: seat.name, deck: seat.deck.name, ...(table.outcome ? { result: table.outcome.results[seat.id] } : {}),
			counts: ["Lands played", "Spells cast", "Cards drawn", "Cards discarded", "Attackers declared", "Combat damage to players", "Other damage to players", "Permanents destroyed or sacrificed"]
				.map((what): [string, number] => [what, counts[at]!.get(what) ?? 0]) })),
		game: [
			["Result", !table.outcome ? "Unfinished" : winner?.length ? `${winner.join(" and ")} won on turn ${table.cursor.turn}` : `A draw on turn ${table.cursor.turn}`],
			["On the play", table.seats[0]?.name ?? "?"],
			...(played ? [["Played", new Date(played).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })] as [string, string]] : []),
			["Decisions", `${rows.length}: ${by("why", "chosen")} chosen, ${by("why", "forced")} forced, ${by("why", "fallback")} fallback, ${by("why", "timeout")} timeout`],
			["Chosen by", `models ${by("by", "model")}, people ${by("by", "person")}, the engine ${by("by", "engine")}`],
			...(run ? [
				["Wall time", minutes!],
				["Model calls", `${run.calls}, ${Math.round(run.input / 1000)}k tokens in, ${Math.round(run.output / 1000)}k out`],
				["Cost", `$${run.cost.toFixed(2)}${run.roles.length ? ` (${run.roles.map((one) => `${one.role} $${one.cost.toFixed(2)}`).join(", ")})` : ""}`],
			] as [string, string][] : []),
		],
	};
}

const COLORS = ["#e2b878", "#8fb3d9", "#b9d48a", "#d993b8"];

/** The page itself. `files` names each moment's picture, or null where one was not drawn. */
export function viewerHtml(title: string, subtitle: string, moments: Moment[], files: (string | null)[], stats?: Stats): string {
	const when = (moment: Moment) => moment.snapshot.finished ? "Game over" : moment.snapshot.turn
		? `Turn ${moment.snapshot.turn}, ${moment.snapshot.seats.find((one) => one.id === moment.snapshot.active)?.name ?? "?"}'s ${moment.snapshot.step?.replace(/-/g, " ") ?? "turn"}`
		: "Opening hands";
	const data = {
		title, subtitle, stats: stats ?? null, colors: COLORS,
		seats: moments[0]?.snapshot.seats.map((one) => one.name) ?? [],
		moments: moments.map((moment, at) => ({ file: files[at] ?? null, when: when(moment), turn: moment.snapshot.turn ?? 0, lines: moment.lines,
			seats: moment.snapshot.seats.map((one) => [one.life, one.hand, one.library, one.battlefield.length, one.graveyard.length, one.exile.length]) })),
	};
	const json = JSON.stringify(data).replace(/</g, "\\u003c");
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>
:root { --ink: #f4edda; --muted: #a9b8b0; --gold: #d9bf84; --panel: #0d2a24; --line: #2b4a42; }
* { box-sizing: border-box; }
body { margin: 0; background: #061a16; color: var(--ink); font: 14px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
header { padding: 14px 20px 8px; border-bottom: 1px solid var(--line); }
h1 { margin: 0; font: 600 20px Georgia, serif; letter-spacing: .5px; color: var(--gold); }
h2 { margin: 0 0 8px; font: 600 13px Georgia, serif; letter-spacing: 2px; text-transform: uppercase; color: var(--gold); }
.sub { color: var(--muted); }
main { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 16px; padding: 16px 20px; }
@media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
.stage { background: #000; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; aspect-ratio: 16 / 9; display: flex; align-items: center; justify-content: center; }
.stage img { width: 100%; height: 100%; object-fit: contain; display: block; }
.missing { color: var(--muted); }
.controls { display: flex; align-items: center; gap: 10px; margin: 10px 0; flex-wrap: wrap; }
button, select { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 4px; padding: 6px 12px; font: inherit; cursor: pointer; }
button:hover, select:hover { border-color: var(--gold); }
input[type=range] { flex: 1; min-width: 160px; accent-color: var(--gold); }
.count { color: var(--muted); min-width: 90px; text-align: right; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; }
.when { font: 600 15px Georgia, serif; margin-bottom: 6px; }
ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
table { width: 100%; border-collapse: collapse; } th, td { text-align: right; padding: 3px 6px; border-bottom: 1px solid var(--line); }
th:first-child, td:first-child { text-align: left; } th { color: var(--muted); font-weight: normal; }
table { font-size: 13px; } td:first-child span, th span + * { white-space: nowrap; } #now td:first-child, #perseat th { white-space: nowrap; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
#chart { width: 100%; height: 150px; cursor: pointer; display: block; }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; } dt { color: var(--muted); } dd { margin: 0; }
.keys { color: var(--muted); font-size: 12px; }
</style></head><body>
<header><h1 id="title"></h1><div class="sub" id="subtitle"></div></header>
<main>
<section>
<div class="stage" id="stage"></div>
<div class="controls">
<button id="first" title="First (Home)">⏮</button><button id="prev" title="Previous (←)">◀</button>
<input type="range" id="scrub" min="0" value="0"><button id="next" title="Next (→)">▶</button><button id="last" title="Last (End)">⏭</button>
<button id="play" title="Play (space)">Play</button><select id="turns" title="Jump to a turn"></select><span class="count" id="count"></span>
</div>
<div class="keys">← → step · PageUp/PageDown turn · Home/End · space plays</div>
<div class="panel" style="margin-top:12px"><h2>Life</h2><svg id="chart" preserveAspectRatio="none"></svg></div>
</section>
<aside>
<div class="panel"><div class="when" id="when"></div><ul id="lines"></ul></div>
<div class="panel"><h2>At this moment</h2><table id="now"></table></div>
<div class="panel" id="totals"><h2>Game totals</h2><table id="perseat"></table></div>
<div class="panel" id="facts"><h2>The game</h2><dl id="game"></dl></div>
</aside>
</main>
<script>
const DATA = ${json};
const $ = (id) => document.getElementById(id), el = (tag, text, cls) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
const moments = DATA.moments, total = moments.length;
let at = 0, timer = null;
$("title").textContent = DATA.title; $("subtitle").textContent = DATA.subtitle; $("scrub").max = String(total - 1);
const turnStarts = []; moments.forEach((one, i) => { if (!turnStarts.length || turnStarts.at(-1).turn !== one.turn) turnStarts.push({ turn: one.turn, at: i }); });
for (const one of turnStarts) { const option = el("option", one.turn ? "Turn " + one.turn : "Opening"); option.value = String(one.at); $("turns").append(option); }
const swatch = (i) => { const dot = el("span", undefined, "dot"); dot.style.background = DATA.colors[i % DATA.colors.length]; return dot; };
function table(target, head, rows) {
  target.replaceChildren(); const tr = el("tr"); head.forEach((cell) => tr.append(el("th", cell))); target.append(tr);
  for (const row of rows) { const line = el("tr"); row.forEach((cell) => line.append(cell instanceof Node ? (() => { const td = el("td"); td.append(cell); return td; })() : el("td", String(cell)))); target.append(line); }
}
const named = (i) => { const span = el("span"); span.append(swatch(i), DATA.seats[i]); return span; };
// Life over the game, one line per seat; the marker is this moment.
const lives = moments.map((one) => one.seats.map((seat) => seat[0])), high = Math.max(20, ...lives.flat()), low = Math.min(0, ...lives.flat());
function chart() {
  const svg = $("chart"), w = 1000, h = 150, x = (i) => total > 1 ? i / (total - 1) * w : 0, y = (life) => h - 8 - (life - low) / (high - low || 1) * (h - 16);
  svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  let out = '<line x1="0" x2="' + w + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="#2b4a42"/>';
  for (const t of turnStarts) out += '<line x1="' + x(t.at) + '" x2="' + x(t.at) + '" y1="0" y2="' + h + '" stroke="#163a33"/>';
  DATA.seats.forEach((_, s) => { out += '<polyline fill="none" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke="' + DATA.colors[s % DATA.colors.length] + '" points="' + lives.map((one, i) => x(i) + "," + y(one[s])).join(" ") + '"/>'; });
  out += '<line id="mark" x1="' + x(at) + '" x2="' + x(at) + '" y1="0" y2="' + h + '" stroke="#f4edda" stroke-width="1.5" vector-effect="non-scaling-stroke"/>';
  svg.innerHTML = out;
}
$("chart").addEventListener("click", (event) => { const box = $("chart").getBoundingClientRect(); show(Math.round((event.clientX - box.left) / box.width * (total - 1))); });
function show(next) {
  at = Math.max(0, Math.min(total - 1, next)); const one = moments[at];
  const stage = $("stage"); stage.replaceChildren(one.file ? Object.assign(el("img"), { src: one.file, alt: one.when }) : el("div", "This picture was not drawn.", "missing"));
  $("when").textContent = one.when; $("lines").replaceChildren(...one.lines.map((line) => el("li", line)));
  table($("now"), ["", "Life", "Hand", "Library", "Board", "Grave", "Exile"], one.seats.map((seat, i) => [named(i), ...seat]));
  $("scrub").value = String(at); $("count").textContent = (at + 1) + " / " + total;
  $("turns").value = String(turnStarts[turnOf()].at);
  chart();
  for (const ahead of [moments[at + 1], moments[at - 1]]) if (ahead?.file) new Image().src = ahead.file;
  location.replace("#" + (at + 1));
}
const turnOf = () => turnStarts.findLastIndex((t) => t.at <= at);
// Back goes to the start of this turn first, as a music player's back does.
const turnJump = (step) => { const here = turnOf(), to = step < 0 && turnStarts[here].at < at ? here : here + step; show(turnStarts[Math.max(0, Math.min(turnStarts.length - 1, to))].at); };
function play(on) { clearInterval(timer); timer = on ? setInterval(() => { if (at >= total - 1) play(false); else show(at + 1); }, 1500) : null; $("play").textContent = on ? "Pause" : "Play"; }
$("first").onclick = () => show(0); $("last").onclick = () => show(total - 1); $("prev").onclick = () => show(at - 1); $("next").onclick = () => show(at + 1);
$("play").onclick = () => play(!timer); $("scrub").oninput = (event) => show(Number(event.target.value)); $("turns").onchange = (event) => show(Number(event.target.value));
document.addEventListener("keydown", (event) => {
  if (event.target.tagName === "SELECT" || event.target.tagName === "INPUT" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const keys = { ArrowRight: () => show(at + 1), ArrowLeft: () => show(at - 1), Home: () => show(0), End: () => show(total - 1), PageDown: () => turnJump(1), PageUp: () => turnJump(-1), " ": () => play(!timer) };
  if (keys[event.key]) { event.preventDefault(); keys[event.key](); }
});
if (DATA.stats) {
  const names = DATA.stats.seats[0]?.counts.map((one) => one[0]) ?? [];
  table($("perseat"), ["", ...DATA.stats.seats.map((seat) => seat.name)],
    [["Deck", ...DATA.stats.seats.map((seat) => seat.deck)], ...(DATA.stats.seats.some((seat) => seat.result) ? [["Result", ...DATA.stats.seats.map((seat) => seat.result ?? "")]] : []),
      ...names.map((name, row) => [name, ...DATA.stats.seats.map((seat) => seat.counts[row][1])])]);
  $("perseat").querySelectorAll("tr:first-child th").forEach((th, i) => { if (i) th.prepend(swatch(i - 1)); });
  $("game").replaceChildren(...DATA.stats.game.flatMap(([label, value]) => [el("dt", label), el("dd", value)]));
} else { $("totals").remove(); $("facts").remove(); }
show(Math.max(0, Math.min(total - 1, Number(location.hash.slice(1)) - 1 || 0)));
</script></body></html>
`;
}
