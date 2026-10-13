/**
 * A public address for the watching server: a Cloudflare quick tunnel, the
 * free kind that needs no account. cloudflared prints the address it was
 * given, which changes every time it starts. Anyone with the address sees what
 * the server serves, which is only what an audience may see.
 */
import { spawn } from "node:child_process";

export async function quickTunnel(local: string, command = "cloudflared"): Promise<{ url: string; close(): void }> {
	const child = spawn(command, ["tunnel", "--no-autoupdate", "--url", local], { stdio: ["ignore", "pipe", "pipe"] });
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { child.kill(); reject(new Error("cloudflared gave no public address within 30 seconds.")); }, 30_000);
		const read = (chunk: Buffer) => {
			const found = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk));
			if (found) { clearTimeout(timer); resolve({ url: found[0], close: () => void child.kill() }); }
		};
		child.stdout.on("data", read);
		child.stderr.on("data", read);
		child.on("error", (error: NodeJS.ErrnoException) => {
			clearTimeout(timer);
			reject(error.code === "ENOENT" ? new Error("cloudflared is not installed: brew install cloudflared") : error);
		});
		child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`cloudflared stopped (${code}) before it gave a public address.`)); });
	});
}
