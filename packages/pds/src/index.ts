export { SqliteRepoStorage } from "./storage"
export { AccountDurableObject } from "./account-do"
export type { Env } from "./env"

// Default export for Cloudflare Workers
export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url)

		// Route to Account DO for XRPC endpoints
		if (url.pathname.startsWith("/xrpc/")) {
			const id = env.ACCOUNT.idFromName("account")
			const stub = env.ACCOUNT.get(id)
			return stub.fetch(request)
		}

		// Health check
		if (url.pathname === "/health") {
			return new Response("ok")
		}

		return new Response("Not found", { status: 404 })
	},
}

// Re-export Env type for external use
import type { Env } from "./env"
export type { Env as WorkerEnv }
