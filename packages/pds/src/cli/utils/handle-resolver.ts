/**
 * Utilities for resolving AT Protocol handles to DIDs
 */

/**
 * Resolve a handle to a DID using the AT Protocol handle resolution methods.
 * Tries both DNS TXT record and HTTPS well-known methods.
 */
export async function resolveHandleToDid(handle: string): Promise<string | null> {
	// Try HTTPS well-known first (more common for hosted services)
	try {
		const httpsUrl = `https://${handle}/.well-known/atproto-did`;
		const response = await fetch(httpsUrl, {
			headers: { Accept: "text/plain" },
			signal: AbortSignal.timeout(5000),
		});

		if (response.ok) {
			const did = (await response.text()).trim();
			if (did.startsWith("did:")) {
				return did;
			}
		}
	} catch (err) {
		// HTTPS failed, will try DNS
	}

	// Try DNS TXT record
	try {
		const dnsUrl = `https://dns.google/resolve?name=_atproto.${handle}&type=TXT`;
		const response = await fetch(dnsUrl, {
			headers: { Accept: "application/json" },
			signal: AbortSignal.timeout(5000),
		});

		if (response.ok) {
			const data = (await response.json()) as {
				Answer?: Array<{ data: string }>;
			};
			if (data.Answer && data.Answer.length > 0) {
				// TXT records come quoted, remove quotes and did= prefix
				const txtData = data.Answer[0]?.data.replace(/"/g, "");
				if (txtData?.startsWith("did=")) {
					return txtData.substring(4);
				}
			}
		}
	} catch (err) {
		// DNS failed
	}

	return null;
}
