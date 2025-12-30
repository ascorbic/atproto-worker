/**
 * OAuth 2.1 integration for the PDS
 *
 * Connects the @ascorbic/atproto-oauth-provider package with the PDS
 * by providing storage through Durable Objects and user authentication
 * through the existing session system.
 */

import { Hono } from "hono";
import { ATProtoOAuthProvider } from "@ascorbic/atproto-oauth-provider";
import type {
	OAuthStorage,
	AuthCodeData,
	TokenData,
	ClientMetadata,
	PARData,
} from "@ascorbic/atproto-oauth-provider";
import { compare } from "bcryptjs";
import type { PDSEnv } from "./types";
import type { AccountDurableObject } from "./account-do";

/**
 * Proxy storage class that delegates to DO RPC methods
 *
 * This is needed because the SqliteOAuthStorage object contains a SQL connection
 * that can't be serialized across the DO RPC boundary. Instead, we delegate each
 * storage operation to individual RPC methods that pass serializable data.
 */
class DOProxyOAuthStorage implements OAuthStorage {
	constructor(
		private accountDO: DurableObjectStub<AccountDurableObject>,
	) {}

	async saveAuthCode(code: string, data: AuthCodeData): Promise<void> {
		await this.accountDO.rpcSaveAuthCode(code, data);
	}

	async getAuthCode(code: string): Promise<AuthCodeData | null> {
		return this.accountDO.rpcGetAuthCode(code);
	}

	async deleteAuthCode(code: string): Promise<void> {
		await this.accountDO.rpcDeleteAuthCode(code);
	}

	async saveTokens(data: TokenData): Promise<void> {
		await this.accountDO.rpcSaveTokens(data);
	}

	async getTokenByAccess(accessToken: string): Promise<TokenData | null> {
		return this.accountDO.rpcGetTokenByAccess(accessToken);
	}

	async getTokenByRefresh(refreshToken: string): Promise<TokenData | null> {
		return this.accountDO.rpcGetTokenByRefresh(refreshToken);
	}

	async revokeToken(accessToken: string): Promise<void> {
		await this.accountDO.rpcRevokeToken(accessToken);
	}

	async revokeAllTokens(sub: string): Promise<void> {
		await this.accountDO.rpcRevokeAllTokens(sub);
	}

	async saveClient(clientId: string, metadata: ClientMetadata): Promise<void> {
		await this.accountDO.rpcSaveClient(clientId, metadata);
	}

	async getClient(clientId: string): Promise<ClientMetadata | null> {
		return this.accountDO.rpcGetClient(clientId);
	}

	async savePAR(requestUri: string, data: PARData): Promise<void> {
		await this.accountDO.rpcSavePAR(requestUri, data);
	}

	async getPAR(requestUri: string): Promise<PARData | null> {
		return this.accountDO.rpcGetPAR(requestUri);
	}

	async deletePAR(requestUri: string): Promise<void> {
		await this.accountDO.rpcDeletePAR(requestUri);
	}

	async checkAndSaveNonce(nonce: string): Promise<boolean> {
		return this.accountDO.rpcCheckAndSaveNonce(nonce);
	}
}

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
 * @param getAccountDO Function to get the account DO stub
 */
export function createOAuthApp(
	getAccountDO: (env: PDSEnv) => DurableObjectStub<AccountDurableObject>,
) {
	const oauth = new Hono<{ Bindings: PDSEnv }>();

	// Create provider lazily per request (storage is per-DO)
	function getProvider(env: PDSEnv): ATProtoOAuthProvider {
		const accountDO = getAccountDO(env);
		const storage = new DOProxyOAuthStorage(accountDO);
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
	oauth.get("/.well-known/oauth-authorization-server", (c) => {
		const provider = getProvider(c.env);
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
		const provider = getProvider(c.env);
		return provider.handleAuthorize(c.req.raw);
	});

	oauth.post("/oauth/authorize", async (c) => {
		const provider = getProvider(c.env);
		return provider.handleAuthorize(c.req.raw);
	});

	// Token endpoint
	oauth.post("/oauth/token", async (c) => {
		const provider = getProvider(c.env);
		return provider.handleToken(c.req.raw);
	});

	// Pushed Authorization Request endpoint
	oauth.post("/oauth/par", async (c) => {
		const provider = getProvider(c.env);
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
		const accountDO = getAccountDO(c.env);
		await accountDO.rpcRevokeToken(token);

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
 * @param getAccountDO Function to get the account DO stub
 */
export function createOAuthVerifier(
	getAccountDO: (env: PDSEnv) => DurableObjectStub<AccountDurableObject>,
) {
	return async function verifyOAuthToken(
		request: Request,
		env: PDSEnv,
	): Promise<{ sub: string; scope: string } | null> {
		const accountDO = getAccountDO(env);
		const storage = new DOProxyOAuthStorage(accountDO);

		const provider = new ATProtoOAuthProvider({
			storage,
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
