/**
 * DID resolution for Cloudflare Workers
 *
 * We can't use @atproto/identity directly because it uses `redirect: "error"`
 * which Cloudflare Workers doesn't support. This is a simple implementation
 * that's compatible with Workers.
 */

import { check, didDocument, type DidDocument } from "@atproto/common-web";
import type { DidCache } from "@atproto/identity";

const PLC_DIRECTORY = "https://plc.directory";
const TIMEOUT_MS = 3000;

export interface DidResolverOpts {
	plcUrl?: string;
	timeout?: number;
	didCache?: DidCache;
}

export class DidResolver {
	private plcUrl: string;
	private timeout: number;
	private cache?: DidCache;

	constructor(opts: DidResolverOpts = {}) {
		this.plcUrl = opts.plcUrl ?? PLC_DIRECTORY;
		this.timeout = opts.timeout ?? TIMEOUT_MS;
		this.cache = opts.didCache;
	}

	async resolve(did: string): Promise<DidDocument | null> {
		// Check cache first
		if (this.cache) {
			const cached = await this.cache.checkCache(did);
			if (cached && !cached.expired) {
				// Trigger background refresh if stale
				if (cached.stale) {
					this.cache.refreshCache(did, () => this.resolveNoCache(did), cached);
				}
				return cached.doc;
			}
		}

		const doc = await this.resolveNoCache(did);

		// Update cache
		if (doc && this.cache) {
			await this.cache.cacheDid(did, doc);
		} else if (!doc && this.cache) {
			await this.cache.clearEntry(did);
		}

		return doc;
	}

	private async resolveNoCache(did: string): Promise<DidDocument | null> {
		if (did.startsWith("did:web:")) {
			return this.resolveDidWeb(did);
		}
		if (did.startsWith("did:plc:")) {
			return this.resolveDidPlc(did);
		}
		throw new Error(`Unsupported DID method: ${did}`);
	}

	private async resolveDidWeb(did: string): Promise<DidDocument | null> {
		const parts = did.split(":").slice(2);
		if (parts.length === 0) {
			throw new Error(`Invalid did:web format: ${did}`);
		}

		// Only support simple did:web without paths (like @atproto/identity)
		if (parts.length > 1) {
			throw new Error(`Unsupported did:web with path: ${did}`);
		}

		const domain = decodeURIComponent(parts[0]!);
		const url = new URL(`https://${domain}/.well-known/did.json`);

		// Use http for localhost
		if (url.hostname === "localhost") {
			url.protocol = "http:";
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const res = await fetch(url.toString(), {
				signal: controller.signal,
				redirect: "manual", // Workers doesn't support "error"
				headers: { accept: "application/did+ld+json,application/json" },
			});

			// Check for redirect (we don't follow them for security)
			if (res.status >= 300 && res.status < 400) {
				return null;
			}

			if (!res.ok) {
				return null;
			}

			const doc = await res.json();
			return this.validateDidDoc(did, doc);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private async resolveDidPlc(did: string): Promise<DidDocument | null> {
		const url = new URL(`/${encodeURIComponent(did)}`, this.plcUrl);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const res = await fetch(url.toString(), {
				signal: controller.signal,
				redirect: "manual", // Workers doesn't support "error"
				headers: { accept: "application/did+ld+json,application/json" },
			});

			// Check for redirect (we don't follow them for security)
			if (res.status >= 300 && res.status < 400) {
				return null;
			}

			if (res.status === 404) {
				return null;
			}

			if (!res.ok) {
				throw new Error(`PLC directory error: ${res.status} ${res.statusText}`);
			}

			const doc = (await res.json()) as DidDocument;
			return this.validateDidDoc(did, doc);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	private validateDidDoc(did: string, doc: unknown): DidDocument | null {
		if (!check.is(doc, didDocument)) {
			return null;
		}
		if (doc.id !== did) {
			return null;
		}
		return doc;
	}
}
