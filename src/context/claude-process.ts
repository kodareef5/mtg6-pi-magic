/** One isolated Claude CLI request. Authentication belongs to the installed CLI. */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function claudeProcess(request: {
	command: string; model: string; effort: string; system: string; input: string; schema: object;
	maxTokens?: number; signal?: AbortSignal; env?: Record<string, string>;
}): Promise<unknown> {
	request.signal?.throwIfAborted();
	const dir = await mkdtemp(join(tmpdir(), "pi-magic-claude-"));
	try {
		const prompt = join(dir, "system.txt");
		await writeFile(prompt, request.system, { mode: 0o600 });
		request.signal?.throwIfAborted();
		return await new Promise((resolve, reject) => {
			const args = ["--safe-mode", "--print", "--model", request.model, "--effort", request.effort,
				"--tools", "", "--disallowedTools", "mcp__*", "--strict-mcp-config", "--permission-prompts", "none", "--no-session-persistence", "--max-turns", "3",
				"--output-format", "json", "--json-schema", JSON.stringify(request.schema), "--system-prompt-file", prompt];
			const child = spawn(request.command, args, { cwd: dir, detached: process.platform !== "win32", stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, ...request.env, ...(request.maxTokens ? { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(request.maxTokens) } : {}) } });
			let output = "", errors = "", failure: Error | undefined, killTimer: ReturnType<typeof setTimeout> | undefined;
			const kill = (signal: NodeJS.Signals) => {
				try { if (child.pid && process.platform !== "win32") process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
			};
			const stop = (error: Error) => { failure ??= error; kill("SIGTERM"); killTimer ??= setTimeout(() => kill("SIGKILL"), 1000); };
			const abort = () => stop(new Error("Claude CLI request aborted", { cause: request.signal?.reason }));
			request.signal?.addEventListener("abort", abort, { once: true });
			if (request.signal?.aborted) abort();
			child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				if (failure) return;
				output += chunk;
				if (Buffer.byteLength(output) > 16 * 1024 * 1024) stop(new Error("Claude CLI response exceeds 16 MiB"));
			});
			child.stderr.on("data", (chunk: string) => { errors = (errors + chunk).slice(-8000); });
			child.on("error", (error) => { failure = error; });
			child.stdin.on("error", (error) => { failure ??= error; });
			child.on("close", (code) => {
				clearTimeout(killTimer); request.signal?.removeEventListener("abort", abort);
				if (failure) return reject(failure);
				// CLI failures can still carry measured usage in their result envelope.
				try {
					const result = JSON.parse(output);
					if (code !== 0 && !result?.is_error) throw new Error("No failure envelope");
					resolve(result);
				} catch { reject(new Error(code !== 0 ? `Claude CLI exited ${code}: ${errors || output}` : "Claude CLI returned invalid JSON")); }
			});
			child.stdin.end(request.input);
		});
	} finally { await rm(dir, { recursive: true, force: true }); }
}
