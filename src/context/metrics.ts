/** Usage arithmetic and the common bill. Pi's input excludes cache; output includes reasoning. */
import type { Role } from "./roles.ts";
const roles: Role[] = ["decide", "pregame", "strategy", "judge", "summary"];
import type { Spend } from "./spend.ts";

export function totals(calls: readonly Spend[], now?: number) {
	const count = (pick: (call: Spend) => unknown) => calls.filter(pick).length;
	const sum = (pick: (call: Spend) => number | undefined) => calls.reduce((n, call) => n + (pick(call) ?? 0), 0);
	const duration = (call: Spend) => call.pending && call.at !== undefined && now !== undefined ? Math.max(0, now - call.at) : call.ms;
	const durations = calls.filter((call) => !call.pending).map(duration).sort((a, b) => a - b);
	const quantile = (q: number) => durations.length ? durations[Math.ceil(durations.length * q) - 1]! : null;
	// Union of request intervals: gaps and concurrent requests are each counted once.
	let activeMs = 0, end = -Infinity;
	for (const call of [...calls].filter((call) => call.at !== undefined).sort((a, b) => a.at! - b.at!)) {
		const until = call.at! + duration(call);
		activeMs += Math.max(0, until - Math.max(end, call.at!));
		end = Math.max(end, until);
	}
	const uncachedInput = sum((call) => call.usage?.input);
	const cacheRead = sum((call) => call.usage?.cacheRead), cacheWrite = sum((call) => call.usage?.cacheWrite);
	// Providers can attach an empty usage object to an error without measuring it.
	const measured = (call: Spend) => !!call.usage && (!call.failed || call.usage.totalTokens > 0);
	return {
		calls: calls.length, pending: count((call) => call.pending), failed: count((call) => call.failed),
		cancelled: count((call) => call.cancelled), truncated: count((call) => call.truncated),
		usageCalls: count(measured), missingUsage: count((call) => !measured(call)),
		input: uncachedInput + cacheRead + cacheWrite, uncachedInput, output: sum((call) => call.usage?.output),
		cacheRead, cacheWrite, reasoning: sum((call) => call.usage?.reasoning),
		reasoningCalls: count((call) => measured(call) && call.usage?.reasoning !== undefined),
		cost: sum((call) => call.usage?.cost?.total),
		missingCost: count((call) => !measured(call) || call.usage?.cost?.total === undefined),
		callMs: sum(duration), activeMs: calls.every((call) => call.at !== undefined) ? activeMs : null,
		medianMs: quantile(0.5), p95Ms: quantile(0.95),
	};
}

export type Totals = ReturnType<typeof totals>;
const identity = (call: Spend) => JSON.stringify([call.model, call.thinking ?? null]);
const callType = (call: Spend) => call.type ?? (call.role === "decide" ? "classifier" : "chat");

export function usageReport(calls: readonly Spend[], now?: number) {
	const models = [...new Set(calls.map(identity))].sort().map((key) => {
		const group = calls.filter((call) => identity(call) === key), first = group[0]!;
		return { model: first.model, thinking: first.thinking ?? null, ...totals(group, now) };
	});
	return {
		total: totals(calls, now), models,
		types: (["classifier", "chat"] as const).map((type) => ({ type, ...totals(calls.filter((call) => callType(call) === type), now) })),
		roles: roles.map((role) => {
			const group = calls.filter((call) => call.role === role), types = new Set(group.map(callType));
			return { role, type: types.size > 1 ? "mixed" : types.values().next().value ?? (role === "decide" ? "classifier" : "chat"), ...totals(group, now) };
		}),
		roleModels: roles.flatMap((role) => models.flatMap(({ model, thinking }) => {
			const group = calls.filter((call) => call.role === role && call.model === model && (call.thinking ?? null) === thinking);
			return group.length ? [{ role, model, thinking, ...totals(group, now) }] : [];
		})),
		purposes: [...new Set(calls.map((call) => JSON.stringify([call.role, call.about])))].sort().map((key) => {
			const [role, about] = JSON.parse(key) as [Spend["role"], string];
			return { role, about, ...totals(calls.filter((call) => call.role === role && call.about === about), now) };
		}),
	};
}

export const duration = (ms: number | null | undefined): string => {
	if (ms === null || ms === undefined) return "?";
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const seconds = Math.round(ms / 1000);
	return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, "0")}s`;
};

/** Compact rows retain exact token counts. Models get local labels, never shortened identifiers. */
export function bill(calls: readonly Spend[], now?: number): string[] {
	const usage = usageReport(calls, now);
	const modelId = (model: string, thinking: string | null) => `M${usage.models.findIndex((one) => one.model === model && one.thinking === thinking) + 1}`;
	const row = (label: string, one: Totals) => [label, one.calls, one.input, one.output,
		one.cacheRead + one.cacheWrite, !one.calls || one.reasoningCalls ? one.reasoning : "?", duration(one.callMs), duration(one.activeMs), `$${one.cost.toFixed(4)}`];
	const rows = [
		["role/model", "calls", "in", "out", "cache", "think", "call time", "active", "cost"],
		...usage.roles.flatMap((one) => {
			const models = usage.roleModels.filter((group) => group.role === one.role);
			return models.length ? [...models.map((group) => row(`${one.role}/${modelId(group.model, group.thinking)}`, group)),
				...(models.length > 1 ? [row(`${one.role}/all`, one)] : [])] : [row(`${one.role}/none`, one)];
		}),
		row("total", usage.total),
	];
	const widths = rows[0]!.map((_, i) => Math.max(...rows.map((cells) => String(cells[i]).length)));
	const total = usage.total;
	return [
		...rows.map((cells) => cells.map((cell, i) => i ? String(cell).padStart(widths[i]!) : String(cell).padEnd(widths[i]!)).join("  ")),
		...usage.models.map((one, i) => `M${i + 1} ${one.model}${one.thinking ? `:${one.thinking}` : ""} | ${one.calls} calls, ${one.input} in, ${one.output} out, ${duration(one.callMs)}, $${one.cost.toFixed(4)}`),
		`calls     ${total.failed} failed  ${total.cancelled} cancelled  ${total.pending} pending  ${total.truncated} truncated; usage ${total.usageCalls}/${total.calls}`,
		"tokens    in includes cache; think is reported output detail. Call time sums requests; active counts overlaps once.",
		...(total.missingUsage || total.missingCost ? [`unmetered ${total.missingUsage} calls lack usage; ${total.missingCost} lack cost. Token and cost totals cover reported usage only.`] : []),
	];
}
