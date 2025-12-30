/**
 * OAuth 2.1 integration for the PDS
 *
 * Connects the @ascorbic/atproto-oauth-provider package with the PDS
 * by providing storage through Durable Objects and user authentication
 * through the existing session system.
 */

import { Hono } from "hono";
import { ATProtoOAuthProvider } from "@ascorbic/atproto-oauth-provider";
import type { OAuthStorage } from "@ascorbic/atproto-oauth-provider";
import { compare } from "bcryptjs";
import type { PDSEnv } from "./types";
import type { AccountDurableObject } from "./account-do";

/**
 * Create OAuth routes for the PDS
 *
 * This creates a Hono sub-app with all OAuth endpoints:
 * - GET /.well-known/oauth-authorization-server - Server metadata
 * - GET /oauth/authorize - Authorization endpoint
 * - POST /oauth/authorize - Handle authorization consent
 * - POST /oauth/token - Token endpoint
 * - POST /oauth/par - Pushed Authorization Request
 *
 * @param getOAuthStorage Function to get OAuth storage from the account DO
 */
export function createOAuthApp(
	getOAuthStorage: (env: PDSEnv) => Promise<OAuthStorage>,
) {
	const oauth = new Hono<{ Bindings: PDSEnv }>();

	// Create provider lazily per request (storage is per-DO)
	async function getProvider(env: PDSEnv): Promise<ATProtoOAuthProvider> {
		const storage = await getOAuthStorage(env);
		const issuer = `https://${env.PDS_HOSTNAME}`;

		return new ATProtoOAuthProvider({
			storage,
			issuer,
			dpopRequired: true,
			enablePAR: true,
			// Password verification for authorization
			verifyUser: async (password: string) => {
				const valid = await compare(password, env.PASSWORD_HASH);
				if (!valid) return null;
				return {
					sub: env.DID,
					handle: env.HANDLE,
				};
			},
		});
	}

	// OAuth server metadata
	oauth.get("/.well-known/oauth-authorization-server", async (c) => {
		const provider = await getProvider(c.env);
		return provider.handleMetadata();
	});

	// Protected resource metadata (for token introspection discovery)
	oauth.get("/.well-known/oauth-protected-resource", (c) => {
		const issuer = `https://${c.env.PDS_HOSTNAME}`;
		return c.json({
			resource: issuer,
			authorization_servers: [issuer],
			scopes_supported: ["atproto", "transition:generic", "transition:chat.bsky"],
		});
	});

	// Authorization endpoint
	oauth.get("/oauth/authorize", async (c) => {
		const provider = await getProvider(c.env);
		return provider.handleAuthorize(c.req.raw);
	});

	oauth.post("/oauth/authorize", async (c) => {
		const provider = await getProvider(c.env);
		return provider.handleAuthorize(c.req.raw);
	});

	// Token endpoint
	oauth.post("/oauth/token", async (c) => {
		const provider = await getProvider(c.env);
		return provider.handleToken(c.req.raw);
	});

	// Pushed Authorization Request endpoint
	oauth.post("/oauth/par", async (c) => {
		const provider = await getProvider(c.env);
		return provider.handlePAR(c.req.raw);
	});

	// Token revocation endpoint
	oauth.post("/oauth/revoke", async (c) => {
		// Parse the token from the request
		const contentType = c.req.header("Content-Type");
		if (!contentType?.includes("application/x-www-form-urlencoded")) {
			return c.json(
				{ error: "invalid_request", error_description: "Invalid content type" },
				400,
			);
		}

		const body = await c.req.text();
		const params = Object.fromEntries(new URLSearchParams(body).entries());
		const token = params.token;

		if (!token) {
			// Per RFC 7009, return 200 even if no token provided
			return c.json({});
		}

		// Try to revoke the token
		const storage = await getOAuthStorage(c.env);
		await storage.revokeToken(token);

		// Always return success (per RFC 7009)
		return c.json({});
	});

	return oauth;
}

/**
 * Create a function to verify OAuth access tokens
 *
 * This can be used as middleware for protected endpoints.
 *
 * @param getOAuthStorage Function to get OAuth storage from the account DO
 */
export function createOAuthVerifier(
	getOAuthStorage: (env: PDSEnv) => Promise<OAuthStorage>,
) {
	return async function verifyOAuthToken(
		request: Request,
		env: PDSEnv,
	): Promise<{ sub: string; scope: string } | null> {
		const provider = new ATProtoOAuthProvider({
			storage: await getOAuthStorage(env),
			issuer: `https://${env.PDS_HOSTNAME}`,
			dpopRequired: true,
		});

		const tokenData = await provider.verifyAccessToken(request);
		if (!tokenData) return null;

		return {
			sub: tokenData.sub,
			scope: tokenData.scope,
		};
	};
}

/**
 * Helper to get OAuth storage from an account DO instance
 */
export async function getOAuthStorageFromDO(
	accountDO: DurableObjectStub<AccountDurableObject>,
): Promise<OAuthStorage> {
	return accountDO.getOAuthStorage();
}
