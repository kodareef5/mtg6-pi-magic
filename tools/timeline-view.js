// Canvas rendering and interactions stay together past 150 lines; the export embeds this file without dependencies.
'use strict';
const data = JSON.parse(document.getElementById('game').textContent);
const el = id => document.getElementById(id), canvas = el('chart'), ctx = canvas.getContext('2d');
const colors = { pregame: '#ab95f4', strategy: '#eab86a', decide: '#63ccba', judge: '#f08e94', summary: '#75b7f5' };
const names = { pregame: 'Pregame', strategy: 'Strategy', decide: 'Jev / decide', judge: 'Judge', summary: 'Summary' };
const number = n => n.toLocaleString('en-US'), seconds = ms => ms < 1000 ? `${Math.round(ms)}ms` : ms < 60000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.floor(ms / 60000)}m${(ms % 60000 / 1000).toFixed(1)}s`;
const clock = ms => `${Math.floor(ms / 60000)}:${(ms % 60000 / 1000).toFixed(ms < 10000 ? 2 : 1).padStart(ms < 10000 ? 5 : 4, '0')}`;
const seat = id => data.seats.find(s => s.id === id)?.name ?? `seat ${id}`;
const all = data.groups.flatMap(group => group.calls).sort((a, b) => a.start - b.start || a.id - b.id), hidden = new Set();
let left = 0, right = data.spanMs, width = 0, height = 0, hit = [], selected = null, pinned = false, drag = null, hover = null;
const margin = 145, rowHeight = 19, plotTop = 82;
function text(id, value) { el(id).textContent = value; }
text('name', data.seed);
text('outcome', `${data.outcome ? Object.entries(data.outcome).map(([id, outcome]) => `${seat(Number(id))}: ${outcome}`).join(' · ') : 'Stopped without an outcome'} · replay ${data.replayMatches === undefined ? 'unchecked' : data.replayMatches ? 'matched' : 'MISMATCH'} · ${data.gaps.length} gaps`);
const total = data.llm.total;
for (const [value, label] of [[seconds(data.elapsedMs), 'elapsed'], [number(total.calls), 'requests'], [total.activeMs === null ? 'unknown' : seconds(total.activeMs), 'time with requests active'], [`${data.peak} calls`, 'peak concurrency'], [`$${total.cost.toFixed(4)}`, 'reported cost'], [`${number(total.input)} / ${number(total.output)}`, 'tokens in / out']]) {
    const box = document.createElement('div');
    box.className = 'metric';
    const strong = document.createElement('strong'), span = document.createElement('span');
    strong.textContent = value;
    span.textContent = label;
    box.append(strong, span);
    el('metrics').append(box);
}
for (const role of Object.keys(names)) {
    const count = all.filter(call => call.role === role).length, button = document.createElement('button'), swatch = document.createElement('i');
    swatch.style.background = colors[role];
    button.append(swatch, document.createTextNode(`${names[role]} ${number(count)}`));
    button.setAttribute('aria-pressed', 'true');
    button.onclick = () => { hidden.has(role) ? hidden.delete(role) : hidden.add(role); button.setAttribute('aria-pressed', String(!hidden.has(role))); draw(); };
    el('legend').append(button);
}
data.turns.forEach((turn, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = `${turn.turn} · ${seat(turn.active)}`; el('turn').append(option); });
const inferred = data.turns.some(turn => turn.source === 'first-observed');
text('provenance', `${data.origin === 'first-request' ? 'Timeline zero is the first recorded request. ' : ''}${data.turns.length ? inferred ? 'Older run: turn markers show the first observed Jev request in that turn, not its exact start.' : 'Turn starts were recorded by the game loop.' : 'Turn timestamps are unavailable. Supply a calls trace for an older run.'} ${data.missingTimestamps ? `${data.missingTimestamps} requests lack timestamps and cannot be plotted.` : ''} ${data.fromVersion ? `This continuation starts at decision ${data.fromVersion}; earlier calls are outside this run.` : ''} ${total.missingUsage ? `${total.missingUsage} requests lack measured usage.` : ''}`);
function show(call) {
    selected = call;
    text('detail-title', call ? `Call ${call.id + 1} · ${names[call.role]}` : 'Inspect a call');
    el('detail').replaceChildren();
    text('detail-hint', call ? (pinned ? 'Pinned. Click another bar or use the call buttons.' : 'Click to pin this call.') : 'Hover for details.');
    if (!call)
        return;
    const turn = data.turns.findLast(turn => turn.at <= call.start), u = call.status === 'failed' && !call.usage?.totalTokens ? undefined : call.usage;
    const fields = { Purpose: call.about, Model: call.model + (call.thinking ? `:${call.thinking}` : ''), Seat: call.seat === undefined ? 'Not recorded' : seat(call.seat),
        'Dispatched during': turn ? `Turn ${turn.turn}, ${seat(turn.active)}${turn.source === 'first-observed' ? ' (observed marker)' : ''}` : 'Preparation / opening',
        'Start → end': `${clock(call.start)} → ${clock(call.end)}`, Duration: seconds(call.end - call.start), Status: call.status,
        'Tokens in / out': u ? `${number(u.input + u.cacheRead + u.cacheWrite)} / ${number(u.output)}` : 'Unknown',
        'Cache read / write': u ? `${number(u.cacheRead)} / ${number(u.cacheWrite)}` : 'Unknown', Reasoning: u?.reasoning === undefined ? 'Not reported' : number(u.reasoning), Cost: u?.cost ? `$${u.cost.total.toFixed(6)}` : 'Unknown', ...(call.error ? { Error: call.error } : {}) };
    for (const [key, value] of Object.entries(fields)) {
        const term = document.createElement('dt'), desc = document.createElement('dd');
        term.textContent = key;
        desc.textContent = value;
        el('detail').append(term, desc);
    }
}
function bounds(a, b) { const span = Math.min(data.spanMs, Math.max(50, b - a)); left = Math.max(0, Math.min(data.spanMs - span, a)); right = left + span; const turn = data.turns.findIndex((mark, i) => mark.at === left && (data.turns[i + 1]?.at ?? data.playEnd ?? data.spanMs) === right); el("turn").value = turn < 0 ? "" : String(turn); draw(); }
function zoom(factor, anchor = (left + right) / 2) { bounds(anchor - (anchor - left) * factor, anchor + (right - anchor) * factor); }
function x(at) { return margin + (at - left) / (right - left) * (width - margin - 16); }
function at(pixel) { return left + (pixel - margin) / (width - margin - 16) * (right - left); }
function draw() {
    width = canvas.parentElement.clientWidth;
    let y = plotTop;
    const visible = data.groups.filter(group => !hidden.has(group.role) && group.calls.some(call => call.end >= left && call.start <= right));
    const rows = visible.map(group => { const start = y; y += Math.max(1, group.lanes) * rowHeight + 31; return { group, y: start }; });
    height = y + 100;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#151c26';
    ctx.fillRect(0, 0, width, height);
    hit = [];
    ctx.font = '11px ui-monospace,monospace';
    const raw = (right - left) / Math.max(2, (width - margin) / 110), power = 10 ** Math.floor(Math.log10(raw)), tick = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 1200000, 1800000, 3600000].find(n => n >= raw) ?? 10 * power;
    for (let time = Math.ceil(left / tick) * tick; time <= right; time += tick) {
        const px = x(time);
        ctx.strokeStyle = '#2b3546';
        ctx.beginPath();
        ctx.moveTo(px, 28);
        ctx.lineTo(px, height - 20);
        ctx.stroke();
        ctx.fillStyle = '#9aaac0';
        ctx.fillText(clock(time), px + 3, 18);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin, 28, width - margin - 16, height - 28);
    ctx.clip();
    if (data.playAt !== undefined) {
        ctx.fillStyle = '#ffffff05';
        ctx.fillRect(x(0), 28, x(data.playAt) - x(0), height - 28);
        ctx.fillStyle = '#8999b3';
        if (x(data.playAt) - Math.max(margin, x(0)) > 80)
            ctx.fillText('PREPARATION', Math.max(margin, x(0)) + 8, 45);
    }
    data.turns.forEach((turn, i) => { const end = data.turns[i + 1]?.at ?? data.playEnd ?? data.spanMs; if (end < left || turn.at > right)
        return; const a = x(turn.at), b = x(end); ctx.fillStyle = turn.active % 2 ? '#364158' : '#293650'; ctx.fillRect(a, 31, b - a - 1, 25); ctx.fillStyle = '#d3def0'; if (b - Math.max(a, margin) > 38)
        ctx.fillText(`T${turn.turn} · ${seat(turn.active)}`, Math.max(a, margin) + 6, 48); ctx.strokeStyle = '#63718a66'; ctx.setLineDash(turn.source === 'first-observed' ? [3, 4] : []); ctx.beginPath(); ctx.moveTo(a, 56); ctx.lineTo(a, y - 10); ctx.stroke(); ctx.setLineDash([]); });
    for (const { group, y: base } of rows) {
        for (const call of group.calls) {
            if (call.end < left || call.start > right)
                continue;
            const a = x(call.start), b = x(call.end), cy = base + 17 + call.lane * rowHeight, w = Math.max(1, b - a);
            ctx.globalAlpha = call.status === 'cancelled' ? .45 : call.about === 'review' ? .65 : .95;
            ctx.fillStyle = colors[call.role];
            ctx.fillRect(a, cy, w, 14);
            ctx.globalAlpha = 1;
            if (call.status !== 'complete') {
                ctx.strokeStyle = call.status === 'failed' ? '#ff657d' : '#d7e0f4';
                ctx.setLineDash(call.status === 'pending' ? [3, 2] : []);
                ctx.strokeRect(a, cy, w, 14);
                ctx.setLineDash([]);
            }
            if (selected?.id === call.id) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.strokeRect(a - 1, cy - 1, w + 2, 16);
                ctx.lineWidth = 1;
            }
            if (w > 65) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(a + 2, cy, w - 4, 14);
                ctx.clip();
                ctx.fillStyle = '#101721';
                ctx.fillText(call.about, a + 4, cy + 11);
                ctx.restore();
            }
            hit.push({ call, x: a, y: cy, w, h: 14 });
        }
    }
    const cy = y + 62;
    ctx.fillStyle = '#8dacf435';
    ctx.strokeStyle = '#8dacf4';
    ctx.beginPath();
    ctx.moveTo(x(0), cy);
    let previous = 0;
    for (const point of data.concurrency) {
        ctx.lineTo(x(point.at), cy - previous / Math.max(1, data.peak) * 48);
        ctx.lineTo(x(point.at), cy - point.count / Math.max(1, data.peak) * 48);
        previous = point.count;
    }
    ctx.lineTo(x(data.spanMs), cy);
    ctx.stroke();
    ctx.closePath();
    ctx.fill();
    if (drag?.select) {
        ctx.fillStyle = '#d5e0ff22';
        ctx.fillRect(Math.min(drag.x, drag.current), 28, Math.abs(drag.current - drag.x), height - 28);
    }
    ctx.restore();
    for (const { group, y: base } of rows) {
        ctx.fillStyle = colors[group.role];
        ctx.font = '12px system-ui';
        ctx.fillText(names[group.role], 12, base + 13);
        ctx.fillStyle = '#9aaac0';
        ctx.font = '10px system-ui';
        ctx.fillText(group.seat === undefined ? `${group.calls.length} requests` : seat(group.seat), 12, base + 28);
    }
    ctx.fillStyle = '#9aaac0';
    ctx.font = '11px system-ui';
    ctx.fillText('Concurrent calls', 12, y + 26);
    ctx.fillText(`all roles · peak ${data.peak}`, 12, y + 42);
    const shown = hit.map(item => item.call), work = shown.reduce((sum, call) => sum + Math.max(0, Math.min(right, call.end) - Math.max(left, call.start)), 0);
    text('range', `${clock(left)} — ${clock(right)}`);
    text('selection', `${shown.length} visible requests intersect this ${seconds(right - left)} range · ${seconds(work)} summed request time inside range`);
    el('pan').value = String(left / Math.max(1, data.spanMs - (right - left)) * 1000);
    el('pan').disabled = right - left >= data.spanMs;
}
function local(event) { const box = canvas.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; }
canvas.addEventListener('wheel', event => { event.preventDefault(); const p = local(event); if (event.shiftKey) {
    const d = event.deltaY / Math.max(1, width - margin) * (right - left);
    bounds(left + d, right + d);
}
else
    zoom(Math.exp(Math.sign(event.deltaY) * .22), at(Math.max(margin, p.x))); }, { passive: false });
canvas.addEventListener('pointerdown', event => { const p = local(event); if (p.x < margin)
    return; drag = { x: p.x, current: p.x, left, right, select: event.shiftKey }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', event => { const p = local(event); if (drag) {
    drag.current = p.x;
    if (drag.select)
        draw();
    else {
        const delta = (p.x - drag.x) / (width - margin - 16) * (drag.right - drag.left);
        bounds(drag.left - delta, drag.right - delta);
    }
    return;
} const found = hit.findLast(item => p.x >= Math.max(margin, item.x) && p.x <= item.x + Math.max(3, item.w) && p.y >= item.y && p.y <= item.y + item.h)?.call; if (!pinned && found?.id !== hover) {
    hover = found?.id;
    show(found ?? null);
    draw();
} });
canvas.addEventListener('pointerup', event => { if (!drag)
    return; const p = local(event), was = drag; drag = null; if (Math.abs(p.x - was.x) < 4) {
    const found = hit.findLast(item => p.x >= item.x && p.x <= item.x + Math.max(3, item.w) && p.y >= item.y && p.y <= item.y + item.h)?.call;
    if (found) {
        pinned = true;
        show(found);
    }
}
else if (was.select)
    bounds(at(Math.min(was.x, p.x)), at(Math.max(was.x, p.x))); draw(); });
canvas.addEventListener('pointercancel', () => { drag = null; draw(); });
canvas.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
    event.preventDefault();
    const delta = (right - left) * .2 * (event.key === 'ArrowLeft' ? -1 : 1);
    bounds(left + delta, right + delta);
} if (event.key === 'Escape') {
    pinned = false;
    show(null);
    draw();
} });
el('fit').onclick = () => bounds(0, data.spanMs);
el('play').disabled = data.playAt === undefined;
el('play').onclick = () => bounds(data.playAt ?? 0, data.playEnd ?? data.spanMs);
el('zoom-in').onclick = () => zoom(.5);
el('zoom-out').onclick = () => zoom(2);
el('turn').onchange = event => { if (event.target.value === '')
    return; const i = Number(event.target.value); bounds(data.turns[i].at, data.turns[i + 1]?.at ?? data.playEnd ?? data.spanMs); };
el('pan').oninput = event => { const span = right - left, start = Number(event.target.value) / 1000 * (data.spanMs - span); bounds(start, start + span); };
function next(direction) { const visible = all.filter(call => !hidden.has(call.role)), index = selected ? visible.findIndex(call => call.id === selected.id) : direction > 0 ? visible.findIndex(call => call.end >= left) - 1 : visible.findLastIndex(call => call.start <= right) + 1; const call = visible[Math.max(0, Math.min(visible.length - 1, index + direction))]; if (!call)
    return; pinned = true; show(call); if (call.start < left || call.end > right)
    bounds(Math.max(0, call.start - 1000), Math.max(call.end + 1000, call.start + 5000));
else
    draw(); }
el('previous').onclick = () => next(-1);
el('next').onclick = () => next(1);
el('unpin').onclick = () => { pinned = false; show(null); draw(); };
new ResizeObserver(draw).observe(canvas.parentElement);
draw();
