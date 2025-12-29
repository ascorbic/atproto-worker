import { Secp256k1Keypair } from "@atproto/crypto";

/**
 * Shared keypair cache for signing and verification.
 * Both service auth creation and verification use this.
 */
let cachedKeypair: Secp256k1Keypair | null = null;
let cachedSigningKey: string | null = null;

/**
 * Get the signing keypair, with caching.
 * Used for creating service JWTs and verifying them.
 */
export async function getSigningKeypair(
	signingKey: string,
): Promise<Secp256k1Keypair> {
	if (cachedKeypair && cachedSigningKey === signingKey) {
		return cachedKeypair;
	}
	cachedKeypair = await Secp256k1Keypair.import(signingKey);
	cachedSigningKey = signingKey;
	return cachedKeypair;
}
