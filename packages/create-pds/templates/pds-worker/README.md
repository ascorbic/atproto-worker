# Personal PDS on Cloudflare Workers

A single-user AT Protocol Personal Data Server running on Cloudflare Workers.

> **⚠️ Experimental Software**
>
> This is an early-stage project under active development. **Do not migrate your main Bluesky account to this PDS yet.** Use a test account or create a new identity for experimentation.

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment

If you haven't already, run the setup wizard:

```bash
pnpm pds init
# or
npm run pds init
yarn pds init
```

This prompts for your hostname, handle, and password, then writes configuration to `.dev.vars`.

### 3. Run locally

```bash
pnpm dev
```

This starts a local development server at http://localhost:5173.

### 4. Deploy to production

First configure for production:

```bash
pnpm pds init --production

# or
npm run pds init --production
yarn pds init --production
```

This sets vars in `wrangler.jsonc` and secrets via `wrangler secret put`.

Then deploy:

```bash
pnpm run deploy
```

## Configuration

Configuration uses environment variables: vars in `wrangler.jsonc` and secrets.

**Vars (in wrangler.jsonc):**

- `PDS_HOSTNAME` - Public hostname of the PDS
- `DID` - Account DID (e.g., did:web:pds.example.com)
- `HANDLE` - Account handle (e.g., alice.example.com)
- `SIGNING_KEY_PUBLIC` - Public key for DID document (multibase)

**Secrets (via wrangler):**

- `AUTH_TOKEN` - Bearer token for API write operations
- `SIGNING_KEY` - Private signing key (secp256k1 JWK)
- `JWT_SECRET` - Secret for signing session JWTs
- `PASSWORD_HASH` - Bcrypt hash of account password (for Bluesky app login)

## Endpoints

Once deployed, your PDS serves:

- `GET /.well-known/did.json` - DID document
- `GET /health` - Health check
- `GET /xrpc/com.atproto.sync.getRepo` - Export repository as CAR
- `GET /xrpc/com.atproto.sync.subscribeRepos` - WebSocket firehose
- `POST /xrpc/com.atproto.repo.createRecord` - Create a record (authenticated)
- `POST /xrpc/com.atproto.repo.uploadBlob` - Upload a blob (authenticated)
- And more...

## Resources

- [AT Protocol Docs](https://atproto.com)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [@ascorbic/pds on GitHub](https://github.com/ascorbic/atproto-worker)
