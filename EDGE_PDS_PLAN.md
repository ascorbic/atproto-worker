# Edge PDS Implementation Plan

## Goal

Build a single-user AT Protocol Personal Data Server (PDS) on Cloudflare Workers with Durable Objects. The PDS will federate with the Bluesky network – the relay can sync from it, and AppViews can read from it.

**Scope:** Single-user only. No account creation, no multi-tenancy. The owner's DID and signing key are configured at deploy time.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Cloudflare Edge                              │
│                                                                  │
│  ┌──────────────┐         ┌─────────────────────────────────┐   │
│  │    Worker    │────────▶│      Account Durable Object     │   │
│  │  (stateless) │         │        (single instance)        │   │
│  │              │         │                                 │   │
│  │ • Routing    │         │ • Repository (via @atproto/repo)│   │
│  │ • Auth       │         │ • SQLite storage                │   │
│  │ • DID doc    │         │ • Firehose (WebSocket)          │   │
│  └──────────────┘         └─────────────────────────────────┘   │
│         │                              │                         │
│         ▼                              ▼                         │
│  ┌──────────────┐         ┌─────────────────────────────────┐   │
│  │      R2      │         │         DO SQLite               │   │
│  │   (blobs)    │         │  (blocks, records, commits)     │   │
│  └──────────────┘         └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Dependencies

All of these work on Cloudflare Workers with `nodejs_compat`:

| Package | Purpose |
|---------|---------|
| `@atproto/repo` | MST, commits, record operations |
| `@atproto/crypto` | Signing, verification, did:key |
| `@atproto/syntax` | TID generation, AT-URI parsing |
| `@atproto/lexicon` | Schema validation (optional initially) |
| `@ipld/car` | CAR file encoding/decoding |
| `cborg` | CBOR encoding for firehose frames |
| `multiformats` | CID utilities |

---

## Repo Structure

Use the existing monorepo structure:

- `packages/pds` – the main PDS library/worker
- `demos/pds` – a deployable demo instance with example config

---

## Implementation Phases

### Phase 1: Storage Layer

**Goal:** Implement the storage interfaces that `@atproto/repo` needs.

`@atproto/repo` expects a storage backend implementing specific interfaces. The primary ones are:

1. **Block storage** – get/put/delete content-addressed blocks (keyed by CID)
2. **Repo state** – track current root CID, revision

Implement these against Durable Object SQLite:

**Tables needed:**
- `blocks` – CID → bytes (the MST nodes and record blocks)
- `repo_state` – single row tracking root CID, current rev, sequence number

**Key interface to implement:** Look at `@atproto/repo`'s `RepoStorage` or `BlockStore` interface. The implementation should:
- Store blocks as BLOB in SQLite
- Use CID string as primary key
- Handle the repo root/rev state

**Verification:** Write a test that creates a `Repo` instance using your storage adapter and performs a basic write operation.

---

### Phase 2: Durable Object Skeleton

**Goal:** Set up the Account DO with SQLite and basic lifecycle.

The Account DO should:
- Initialize SQLite schema on first access
- Load repo state on wake
- Hold a `Repo` instance from `@atproto/repo`
- Expose methods for repo operations

**Wrangler config requirements:**
- `nodejs_compat` compatibility flag
- DO binding with SQLite enabled (`new_sqlite_classes`)
- R2 bucket binding for blobs

**Key design decision:** Single DO instance for the entire PDS (single user). Use a fixed ID like `"account"` to always route to the same instance.

---

### Phase 3: Core XRPC Endpoints

**Goal:** Implement the minimum endpoints for federation.

XRPC is just HTTP with a naming convention. Endpoints are at `/xrpc/{method}`.

#### Tier 1 – Required for relay sync:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `com.atproto.sync.getRepo` | GET | Export full repo as CAR |
| `com.atproto.sync.getRepoStatus` | GET | Current rev and commit info |
| `com.atproto.sync.subscribeRepos` | WS | Firehose – live commit stream |

#### Tier 2 – Required for basic operation:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `com.atproto.repo.describeRepo` | GET | Repo metadata |
| `com.atproto.repo.getRecord` | GET | Fetch single record |
| `com.atproto.repo.listRecords` | GET | List records in collection |
| `com.atproto.repo.createRecord` | POST | Create new record |
| `com.atproto.repo.putRecord` | POST | Update/create at specific rkey |
| `com.atproto.repo.deleteRecord` | POST | Delete record |

#### Tier 3 – Server identity:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `com.atproto.server.describeServer` | GET | Server metadata |
| `com.atproto.identity.resolveHandle` | GET | Handle → DID |

**Implementation approach:**
- Worker handles routing: parse path, check auth, dispatch to DO
- DO handles actual repo operations
- Return XRPC error format for failures: `{ "error": "...", "message": "..." }`

---

### Phase 4: Firehose (subscribeRepos)

**Goal:** Implement the WebSocket event stream that relays subscribe to.

This is critical for federation – without it, relays can't get updates.

**How it works:**
1. Client connects via WebSocket to `/xrpc/com.atproto.sync.subscribeRepos`
2. Optionally passes `?cursor=N` to replay from sequence N
3. Server sends CBOR-encoded frames for each event

**Frame format:**
Each frame is a CBOR-encoded message with:
- Header: `{ op: 1, t: "#commit" }` (or other event type)
- Body: event-specific data, including embedded CAR for commits

**Event types to implement:**
- `#commit` – repo commit with embedded CAR of new blocks
- `#identity` – handle/DID changes (can defer)
- `#account` – account status changes (can defer)

**DO considerations:**
- Use WebSocket hibernation to avoid holding connections in memory
- Store recent events in SQLite for cursor-based replay
- Sequence numbers must be monotonically increasing and never reused

**Buffer table:**
- `firehose_events` – seq (INTEGER PRIMARY KEY), event_type, payload (BLOB)
- Keep last N events (e.g. 10,000) for replay, prune older ones

---

### Phase 5: Blob Storage

**Goal:** Support blob upload and retrieval for images/media.

**Endpoints:**
- `com.atproto.repo.uploadBlob` – POST binary, returns blob ref
- `com.atproto.sync.getBlob` – GET blob by CID

**Storage:** Use R2 for blob storage. Key by CID.

**Blob refs:** When uploading, compute CID of the blob, store in R2, return a blob ref object that can be embedded in records.

**Important:** Blobs must be referenced by a record to be "live". Consider implementing ref counting or garbage collection later, but not in MVP.

---

### Phase 6: Identity & DID Document

**Goal:** Serve the DID document so the network can discover this PDS.

**For did:web:**
Serve `/.well-known/did.json` with:
- The account's DID
- The signing key (public)
- The PDS service endpoint
- The handle (if using did:web)

**For did:plc:**
The DID document lives on plc.directory. The PDS just needs to know the DID and serve content for it. Handle verification via DNS or well-known.

**Handle verification:**
- DNS TXT record: `_atproto.{handle}` → `did={did}`
- Or `/.well-known/atproto-did` returning the DID

Worker should serve the well-known endpoints directly (no need to hit DO).

---

### Phase 7: Authentication

**Goal:** Secure write endpoints.

**For MVP (single user):**
- Accept a pre-shared bearer token configured at deploy time
- Or implement basic JWT verification using `@atproto/crypto`

**Token format (if using JWT):**
- Signed by the account's key
- Contains `iss` (DID), `aud` (PDS URL), `exp` (expiry)
- Verify signature and claims on each request

**What needs auth:**
- All `com.atproto.repo.*` write operations (create, put, delete, uploadBlob)
- Read operations can be public

**Later:** Implement proper OAuth if you want third-party apps to work. This is complex – defer it.

---

## Data Flow Examples

### Creating a post

1. Client POSTs to `/xrpc/com.atproto.repo.createRecord` with auth token
2. Worker validates auth, routes to Account DO
3. DO calls `Repo.applyWrites()` with the new record
4. `@atproto/repo` updates MST, creates commit, signs it
5. New blocks written to SQLite via storage adapter
6. DO increments sequence, emits firehose event to all connected clients
7. Returns `{ uri, cid }` to client

### Relay syncing

1. Relay calls `/xrpc/com.atproto.sync.getRepo?did=...`
2. Worker routes to Account DO
3. DO uses `@atproto/repo` to export as CAR
4. Streams CAR bytes back (or returns complete CAR)

### Firehose subscription

1. Relay opens WebSocket to `/xrpc/com.atproto.sync.subscribeRepos?cursor=123`
2. Worker upgrades connection, passes to Account DO
3. DO replays any events since cursor 123 from buffer
4. DO enters hibernation, holding WebSocket reference
5. On new commit: DO wakes, encodes frame, sends to all clients, hibernates again

---

## Configuration

The PDS needs configuration at deploy time:

| Config | Purpose |
|--------|---------|
| `DID` | The account's DID (did:web:... or did:plc:...) |
| `SIGNING_KEY` | Private key for signing commits (hex or base64) |
| `HANDLE` | The account's handle |
| `AUTH_TOKEN` | Bearer token for write auth (MVP) |

Store these as Wrangler secrets or environment variables.

---

## Testing Strategy

1. **Unit tests:** Storage adapter, CBOR encoding, CAR generation
2. **Integration tests:** Spin up miniflare, test XRPC endpoints
3. **Federation tests:** Point a local relay at the PDS, verify it can sync

Use vitest with miniflare for Workers-specific testing.

---

## Out of Scope (for MVP)

- Account creation / multi-user
- OAuth / third-party app auth  
- Account migration
- Labelling
- Email verification
- Rate limiting
- Admin endpoints

These can all be added later.

---

## Suggested Order of Work

1. **Storage adapter** – get `@atproto/repo` working with DO SQLite
2. **DO skeleton** – basic structure, initialization, repo instance
3. **describeRepo / getRecord** – prove reads work
4. **createRecord** – prove writes work
5. **getRepo (CAR export)** – sync endpoint
6. **subscribeRepos** – firehose (this is the complex one)
7. **Blob upload/get** – R2 integration
8. **DID document** – identity endpoints
9. **Auth** – lock down write endpoints
10. **Polish** – error handling, logging, tests

---

## Reference Material

- AT Protocol specs: https://atproto.com/specs
- `@atproto/repo` source: https://github.com/bluesky-social/atproto/tree/main/packages/repo
- `@atproto/pds` source (reference implementation): https://github.com/bluesky-social/atproto/tree/main/packages/pds
- XRPC spec: https://atproto.com/specs/xrpc
- Sync spec (firehose): https://atproto.com/specs/sync
- Repo spec: https://atproto.com/specs/repository
