/**
 * Shared encoding utilities for OAuth provider
 */

import { base64url } from "jose";

/**
 * Generate a cryptographically random string
 *
 * @param byteLength Number of random bytes (default: 32 = 256 bits)
 * @returns Base64URL-encoded random string
 */
export function randomString(byteLength: number = 32): string {
	const buffer = new Uint8Array(byteLength);
	crypto.getRandomValues(buffer);
	return base64url.encode(buffer);
}
