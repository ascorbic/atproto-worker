/**
 * Utilities for resolving AT Protocol handles to DIDs
 */
import { AtprotoDohHandleResolver } from "@atproto-labs/handle-resolver";

// Use Cloudflare DNS-over-HTTPS for reliable resolution
const resolver = new AtprotoDohHandleResolver({
	dohEndpoint: "https://cloudflare-dns.com/dns-query",
});

/**
 * Resolve a handle to a DID using the AT Protocol handle resolution methods.
 * Uses DNS-over-HTTPS via Cloudflare for DNS resolution.
 */
export async function resolveHandleToDid(
	handle: string,
): Promise<string | null> {
	try {
		const did = await resolver.resolve(handle, {
			signal: AbortSignal.timeout(10000),
		});
		return did;
	} catch (err) {
		// Resolution failed
		return null;
	}
}
