# OAuth Provider Implementation Plan

**Status:** 📋 Planning
**Priority:** P0 (Critical for ecosystem compatibility)

## Overview

Implement OAuth 2.1 provider with AT Protocol extensions to enable "Login with Bluesky" / "Login with AT Protocol" ecosystem compatibility.

## Why This Matters

**Ecosystem Reality:**
- Third-party Bluesky apps use OAuth with PKCE
- Growing "AT Protocol apps" ecosystem requires OAuth
- Without OAuth support, edge PDS users can't use ecosystem apps
- Makes edge PDS deployments second-class citizens

**Apps Using OAuth:**
- Third-party Bluesky clients (Skeets, Graysky, etc.)
- Analytics tools
- Cross-posting services
- Bot platforms
- Schedule/automation tools

## Approach: Extend Cloudflare's OAuth Provider

**Base Library:** [@cloudflare/workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)

**What it provides:**
- ✅ OAuth 2.1 with PKCE (S256 and plain)
- ✅ Dynamic client registration (RFC 7591)
- ✅ Metadata discovery (RFC 8414)
- ✅ Token refresh
- ✅ KV storage integration
- ✅ Workers-native architecture
- ✅ ~3,500 lines of tested code

**What we need to add:**
- ❌ DPoP (Demonstrating Proof of Possession) - RFC 9449
- ❌ PAR (Pushed Authorization Requests) - RFC 9126
- ❌ DID-based client discovery
- ❌ Durable Object storage adapter
- ❌ AT Protocol scope handling

## Extension Points Needed

### 1. Storage Adapter Interface

**Current:** Hardcoded to KV
**Need:** Pluggable storage backend

```typescript
export interface OAuthStorage {
  // Grants (refresh tokens + metadata)
  saveGrant(grantId: string, data: GrantData, ttl: number): Promise<void>;
  getGrant(grantId: string): Promise<GrantData | null>;
  deleteGrant(grantId: string): Promise<void>;

  // Authorization codes (short-lived)
  saveAuthCode(code: string, data: AuthCodeData, ttl: number): Promise<void>;
  getAuthCode(code: string): Promise<AuthCodeData | null>;
  deleteAuthCode(code: string): Promise<void>;

  // PAR requests
  savePAR(requestUri: string, data: PARData, ttl: number): Promise<void>;
  getPAR(requestUri: string): Promise<PARData | null>;

  // Clients (if dynamic registration)
  saveClient(clientId: string, data: ClientInfo): Promise<void>;
  getClient(clientId: string): Promise<ClientInfo | null>;

  // DPoP nonces (for replay prevention)
  checkAndSetNonce(nonce: string, ttl: number): Promise<boolean>;
}

// KV implementation (current)
export class KVStorage implements OAuthStorage { ... }

// Durable Object implementation (what we need)
export class DurableObjectStorage implements OAuthStorage {
  // Uses DO SQL for transactions and complex queries
}
```

**Why:** AT Protocol needs SQL for complex queries, transactions, and multi-table operations

### 2. Client Discovery Hook

**Current:** Pre-registered clients or dynamic registration endpoint
**Need:** DID-based dynamic discovery

```typescript
export interface ClientResolver {
  resolveClient(
    clientId: string,
    options: { request: Request; env: any }
  ): Promise<OAuthClientMetadata | null>;
}

// Default (current behavior)
export class DefaultClientResolver implements ClientResolver {
  // URL-based or pre-registered
}

// AT Protocol DID-based
export class ATProtoClientResolver implements ClientResolver {
  async resolveClient(clientId: string) {
    // Client ID is a DID
    // Resolve DID document
    // Extract OAuth client metadata from DID document
  }
}
```

**Why:** AT Protocol clients identified by DID, metadata in DID document

### 3. DPoP Support (Standard OAuth 2.1)

**What:** Token binding to prevent theft
**Status:** Not in Cloudflare provider
**Spec:** RFC 9449

```typescript
export interface DpopConfig {
  required?: boolean;
  algorithms?: string[]; // Default: ['ES256', 'RS256']
  nonceExpiration?: number; // Default: 300
}

async function verifyDpopProof(
  request: Request,
  accessToken: string | null,
  config: DpopConfig,
  storage: OAuthStorage
): Promise<{ valid: boolean; jkt: string }> {
  // Parse DPoP header (JWT)
  // Verify signature
  // Check HTM (HTTP method) matches
  // Check HTU (HTTP URI) matches
  // Check ATH (access token hash) if token provided
  // Check JTI unique (prevent replay)
  // Return key thumbprint for binding
}
```

**Implementation:**
- Verify DPoP proof on token exchange
- Bind access token to key thumbprint
- Verify DPoP proof on every API request
- Return `token_type: 'DPoP'` instead of 'Bearer'

### 4. PAR Support (Standard OAuth 2.1)

**What:** More secure authorization (params not in URL)
**Status:** Not in Cloudflare provider
**Spec:** RFC 9126

```typescript
// New endpoint: POST /oauth/par
async handlePARRequest(request: Request, env: any): Promise<Response> {
  // Parse request body (auth params)
  // Authenticate client
  // Generate request_uri
  // Store params for 90 seconds
  // Return { request_uri, expires_in: 90 }
}

// Modified: GET /oauth/authorize
async handleAuthorizeRequest(request: Request) {
  const requestUri = url.searchParams.get('request_uri');

  if (requestUri) {
    // Load params from PAR
    // Verify client_id matches
    // Delete PAR (one-time use)
  } else {
    // Traditional query parameters
  }
}
```

### 5. Token Payload Customization

**Current:** Fixed token structure
**Need:** Custom claims for AT Protocol

```typescript
export interface TokenPayloadBuilder {
  buildAccessToken(
    grant: GrantData,
    options: { clientId: string; scope: string[]; jkt?: string }
  ): Promise<any>;

  validateAccessToken(
    payload: any,
    options: { request: Request; requiredScope?: string[] }
  ): Promise<boolean>;
}

// AT Protocol implementation
export class ATProtoTokenPayloadBuilder implements TokenPayloadBuilder {
  async buildAccessToken(grant, options) {
    return {
      sub: grant.userId, // DID
      client_id: options.clientId, // Client DID
      scope: 'atproto', // Single scope for AT Protocol
      cnf: options.jkt ? { jkt: options.jkt } : undefined, // DPoP binding
      iat: ...,
      exp: ...,
    };
  }
}
```

### 6. Metadata Customization

**Need:** AT Protocol-specific discovery metadata

```typescript
export interface OAuthProviderOptions {
  additionalMetadata?: {
    token_endpoint_auth_methods_supported?: string[];
    dpop_signing_alg_values_supported?: string[];
    [key: string]: any;
  };
}

// Discovery endpoint includes:
{
  "issuer": "https://your-pds.com",
  "authorization_endpoint": "...",
  "token_endpoint": "...",
  "pushed_authorization_request_endpoint": "...", // If PAR enabled
  "dpop_signing_alg_values_supported": ["ES256"], // If DPoP enabled
  ...customMetadata
}
```

## Implementation Phases

### Phase 1: Core OAuth (Week 1)
- Token endpoints (authorization code flow)
- Basic PKCE support
- Simple consent UI
- DO SQL storage adapter

### Phase 2: AT Protocol Extensions (Week 2)
- DPoP verification
- PAR support
- DID-based client discovery
- Proper metadata endpoint

### Phase 3: Polish (Optional)
- Better authorization UI
- Scope management
- Token revocation
- Edge cases

## Migration Path

```typescript
// Old way (still works)
new OAuthProvider({
  kv: env.KV,
  defaultHandler: myHandler,
});

// New way with extensions
new OAuthProvider({
  storage: new DurableObjectStorage(env.OAUTH_DO),
  clientResolver: new ATProtoClientResolver(didResolver),
  dpop: { required: true, algorithms: ['ES256'] },
  tokenPayloadBuilder: new ATProtoTokenPayloadBuilder(),
  enablePAR: true,
  defaultHandler: myHandler,
});
```

## Upstream Contributions

**Value to Cloudflare OAuth Provider:**

1. **DPoP support** - Standard OAuth 2.1 feature, benefits all users
2. **PAR support** - Standard OAuth 2.1 feature, improves security
3. **Storage adapter pattern** - Enables DO + SQL use cases

**Contribution Strategy:**
1. Implement for AT Protocol first
2. Extract into clean, reusable modules
3. Submit PRs to Cloudflare provider
4. Benefit: Code maintained by Cloudflare team

## Authorization UI Design

**Simple but functional:**

```html
<!DOCTYPE html>
<html>
<head>
  <title>Authorize App</title>
  <style>/* Clean, minimal styling */</style>
</head>
<body>
  <div class="container">
    <img src="{client.logo_uri}" class="app-logo">
    <h1>Authorize {client.name}?</h1>

    <div class="permissions">
      <p>This app wants to:</p>
      <ul>
        <li>Read your posts</li>
        <li>Create new posts</li>
      </ul>
    </div>

    <form method="post">
      <button name="action" value="deny">Deny</button>
      <button name="action" value="allow" class="primary">Allow</button>
    </form>

    <p class="info">You can revoke access anytime in settings.</p>
  </div>
</body>
</html>
```

## Storage Schema

```sql
-- OAuth clients (DID-based)
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,  -- DID
  client_name TEXT,
  client_uri TEXT,
  logo_uri TEXT,
  redirect_uris TEXT,  -- JSON array
  last_seen INTEGER
);

-- Authorization codes (short-lived, 5 min)
CREATE TABLE oauth_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT,
  redirect_uri TEXT,
  scope TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at INTEGER,
  used INTEGER DEFAULT 0
);

-- Access tokens (DPoP-bound)
CREATE TABLE oauth_tokens (
  token TEXT PRIMARY KEY,
  refresh_token TEXT,
  client_id TEXT,
  scope TEXT,
  dpop_jkt TEXT,  -- DPoP key thumbprint
  issued_at INTEGER,
  expires_at INTEGER,
  revoked INTEGER DEFAULT 0
);

-- PAR requests (short-lived, 90 sec)
CREATE TABLE oauth_par (
  request_uri TEXT PRIMARY KEY,
  client_id TEXT,
  params TEXT,  -- JSON blob
  expires_at INTEGER
);

-- DPoP nonces (replay prevention)
CREATE TABLE oauth_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER
);
```

## Security Considerations

### DPoP Implementation
- JWT signature verification with JWK from proof
- HTM/HTU matching (prevent cross-site attacks)
- JTI uniqueness (prevent replay)
- ATH verification (token binding)
- Key thumbprint persistence

### PAR Implementation
- Request URI one-time use
- 90-second expiration (RFC recommendation)
- Client authentication required
- Parameters encrypted in storage

### Token Security
- Short-lived access tokens (60 min)
- Long-lived refresh tokens (90 days)
- Refresh token rotation on use
- DPoP binding prevents theft
- Revocation support

## Testing Strategy

### Unit Tests
- DPoP proof verification
- PAR request handling
- Token generation/validation
- Storage adapter operations

### Integration Tests
- Full OAuth flow with PKCE
- DID-based client discovery
- Token refresh
- Revocation

### Ecosystem Tests
- Test with real Bluesky apps
- Verify "Login with Bluesky" works
- Test multi-device scenarios
- Validate spec compliance

## Timeline

**Total Effort:** 2 weeks focused work

- Storage adapter: 2 days
- DPoP implementation: 2-3 days
- PAR implementation: 1-2 days
- Client discovery: 1 day
- Authorization UI: 1 day
- Testing: 2-3 days
- Documentation: 1 day

## Success Criteria

1. ✅ Users can login to third-party apps with "Login with Bluesky"
2. ✅ OAuth flow fully spec-compliant (DPoP, PAR, PKCE)
3. ✅ DID-based client discovery works
4. ✅ Tokens are DPoP-bound and secure
5. ✅ Compatible with Cloudflare provider architecture
6. ✅ Passes ecosystem integration tests

## References

- [AT Protocol OAuth Spec](https://atproto.com/specs/oauth)
- [OAuth 2.1 Draft](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1)
- [RFC 9449: DPoP](https://www.rfc-editor.org/rfc/rfc9449.html)
- [RFC 9126: PAR](https://www.rfc-editor.org/rfc/rfc9126.html)
- [Cloudflare OAuth Provider](https://github.com/cloudflare/workers-oauth-provider)
- [AT Protocol OAuth Issues](https://github.com/bluesky-social/atproto/issues/3292)
