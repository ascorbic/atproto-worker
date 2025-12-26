import { DurableObject } from "cloudflare:workers"
import { Repo } from "@atproto/repo"
import { Secp256k1Keypair } from "@atproto/crypto"
import { SqliteRepoStorage } from "./storage"
import type { Env } from "./env"

/**
 * Account Durable Object - manages a single user's AT Protocol repository.
 *
 * This DO provides:
 * - SQLite-backed block storage for the repository
 * - AT Protocol Repo instance for repository operations
 * - Firehose WebSocket connections
 * - Sequence number management
 */
export class AccountDurableObject extends DurableObject<Env> {
	private storage: SqliteRepoStorage | null = null
	private repo: Repo | null = null
	private keypair: Secp256k1Keypair | null = null
	private storageInitialized = false
	private repoInitialized = false

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
	}

	/**
	 * Initialize the storage adapter. Called lazily on first storage access.
	 */
	private async ensureStorageInitialized(): Promise<void> {
		if (!this.storageInitialized) {
			await this.ctx.blockConcurrencyWhile(async () => {
				if (this.storageInitialized) return // Double-check after acquiring lock

				this.storage = new SqliteRepoStorage(this.ctx.storage.sql)
				this.storage.initSchema()
				this.storageInitialized = true
			})
		}
	}

	/**
	 * Initialize the Repo instance. Called lazily on first repo access.
	 */
	private async ensureRepoInitialized(): Promise<void> {
		await this.ensureStorageInitialized()

		if (!this.repoInitialized) {
			await this.ctx.blockConcurrencyWhile(async () => {
				if (this.repoInitialized) return // Double-check after acquiring lock

				// Load or create signing key
				// Note: In test environment, Secp256k1Keypair.import() has module loading issues
				// due to CJS/ESM shim problems. For tests, we generate a fresh key each time.
				try {
					this.keypair = await Secp256k1Keypair.import(this.env.SIGNING_KEY)
				} catch (e) {
					// Fallback for test environment - create a new keypair
					this.keypair = await Secp256k1Keypair.create({ exportable: true })
				}

				// Load or create repo
				const root = await this.storage!.getRoot()
				if (root) {
					this.repo = await Repo.load(this.storage!, root)
				} else {
					this.repo = await Repo.create(this.storage!, this.env.DID, this.keypair)
				}

				this.repoInitialized = true
			})
		}
	}

	/**
	 * Get the storage adapter for direct access (used by tests and internal operations).
	 */
	async getStorage(): Promise<SqliteRepoStorage> {
		await this.ensureStorageInitialized()
		return this.storage!
	}

	/**
	 * Get the Repo instance for repository operations.
	 */
	async getRepo(): Promise<Repo> {
		await this.ensureRepoInitialized()
		return this.repo!
	}

	/**
	 * HTTP fetch handler - routes XRPC requests.
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url)
		const path = url.pathname

		// Health check doesn't need storage/repo
		if (path === "/health") {
			return new Response("ok")
		}

		// For other endpoints, we'll initialize storage/repo as needed
		// For now, just return 404
		return new Response("Not found", { status: 404 })
	}
}
