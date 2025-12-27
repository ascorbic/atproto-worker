# Demo PDS Deployment

This is an example deployment of `@ascorbic/pds-worker` - a single-user AT Protocol Personal Data Server on Cloudflare Workers.

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Generate keys and configuration

```bash
pnpm run setup
```

This will:
- Prompt for your hostname and handle
- Generate a secp256k1 keypair
- Create your DID (did:web based on hostname)
- Generate a random auth token
- Write configuration to `.dev.vars`

### 3. Create R2 bucket

```bash
wrangler r2 bucket create demo-pds-blobs
```

### 4. Run locally

```bash
pnpm run dev
```

This starts a local development server using Miniflare with your `.dev.vars` configuration.

### 5. Deploy to production

First, set your secrets:

```bash
wrangler secret put DID
wrangler secret put HANDLE
wrangler secret put AUTH_TOKEN
wrangler secret put SIGNING_KEY
wrangler secret put SIGNING_KEY_PUBLIC
```

Then deploy:

```bash
pnpm run deploy
```

## Configuration

All configuration is via environment variables:

**Required (non-secret):**
- `PDS_HOSTNAME` - Public hostname (set in wrangler.jsonc)

**Required (secrets):**
- `DID` - Your account's DID
- `HANDLE` - Your account's handle
- `AUTH_TOKEN` - Bearer token for write operations
- `SIGNING_KEY` - Private key for signing commits
- `SIGNING_KEY_PUBLIC` - Public key for DID document

## Architecture

This deployment simply re-exports the `@ascorbic/pds-worker` package:

```typescript
// src/index.ts
export { default, AccountDurableObject } from '@ascorbic/pds-worker';
```

No additional code needed!

## Endpoints

Once deployed, your PDS will serve:

- `GET /.well-known/did.json` - DID document
- `GET /health` - Health check
- `GET /xrpc/com.atproto.sync.getRepo` - Export repository as CAR
- `GET /xrpc/com.atproto.sync.subscribeRepos` - WebSocket firehose
- `POST /xrpc/com.atproto.repo.createRecord` - Create a record (authenticated)
- `POST /xrpc/com.atproto.repo.uploadBlob` - Upload a blob (authenticated)
- And more...

## Resources

- [PDS Package](../../packages/pds)
- [AT Protocol Docs](https://atproto.com)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
