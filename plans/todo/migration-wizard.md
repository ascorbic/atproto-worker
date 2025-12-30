# Migration Wizard - Gold Standard UX

**Status:** 📋 Planning
**Priority:** P0 (Critical feature for user adoption)

## Overview

A one-command migration experience that enables users to migrate their Bluesky accounts to a self-hosted edge PDS with zero downtime, full data preservation, and the ability to test before committing.

## Unique Advantages of Serverless

**Traditional PDS Migration:**
- Downtime while switching servers
- Can't test before switching
- Expensive to run two servers in parallel
- Scary "point of no return"

**Edge PDS Migration:**
- ✅ Deploy new PDS in seconds (just a Worker)
- ✅ Run old + new simultaneously (pennies in cost)
- ✅ Test thoroughly before switching
- ✅ Instant rollback if issues
- ✅ Zero downtime cutover (just update PLC)

## User Experience Goal

```bash
npx @ascorbic/pds migrate
```

One command. Everything automatic. Test mode before cutover. Zero risk.

## Migration Flow Overview

### Stage 1: Account Detection & Setup
- Auto-detect Bluesky account from local app data (macOS/Windows/Linux)
- Connect Cloudflare account (OAuth)
- Choose domain (owned domain or workers.dev)
- Show cost estimate (~$0.01/month)

### Stage 2: Infrastructure Provisioning
- Create Worker + R2 bucket automatically
- Set up DNS records (if domain on Cloudflare)
- Generate signing keys and secrets
- Deploy to `-staging` subdomain

### Stage 3: Data Migration
- Export CAR file from old PDS
- Download blobs (with progress bars, resumable)
- Import to staging PDS
- Validate all data present

### Stage 4: Test Mode
- Staging PDS fully operational
- User can test extensively
- NO PLC update yet (safe to abandon)
- Automated validation suite
- Manual testing guide

### Stage 5: Cutover
- Update PLC directory atomically
- Switch staging → production
- Update handle (if desired)
- Keep 24h rollback window

## Detailed User Journeys

### Journey A: Fresh Migration from Bluesky

**User:** Alice (@alice.bsky.social) wants her own PDS

```
$ npx create-pds alice-pds
$ cd alice-pds
$ pnpm pds migrate

🔍 Detecting your Bluesky account...

  Auto-detected: alice.bsky.social
  DID: did:plc:abc123xyz
  Current PDS: bsky.social

  📊 Your account:
     142 posts • 23 images (2.4 MB) • 89 followers

☁️  Connect Cloudflare account
  → Opening browser for authentication...
  ✓ Connected: alice@example.com

🌐 Choose your PDS domain
  → alice.com (recommended) ⭐
     Can use as your handle: @alice.com

💰 Cost estimate: ~$0.01/month

🔐 Setting up infrastructure...
  ✓ Worker: alice-pds-staging
  ✓ R2 bucket: alice-pds-blobs
  ✓ DNS: alice.com → Worker
  ✓ Signing keys generated

📦 Exporting from bsky.social...
  Repository (1.2 MB)     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100%
  Media (23 files, 2.4 MB) ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 100%

📥 Importing to staging PDS...
  ✓ All records imported
  ✓ All media accessible

🧪 TEST MODE: Your PDS is ready to test!

  Staging URL: https://alice-pds-staging.workers.dev

  Try it:
  1. API test: curl https://alice-pds-staging.workers.dev/xrpc/...
  2. Run tests: pnpm pds test
  3. Test with Bluesky app (debug mode)

  When ready: pnpm pds cutover

---

$ pnpm pds cutover

🚀 Ready to go live?

  This will:
  ✓ Update PLC directory
  ✓ Point did:plc:abc123 → alice.com
  ✓ Update handle: @alice.bsky.social → @alice.com

  Continue? (y/N) y

🔄 Updating identity...
  ✓ PLC operation submitted
  ✓ Verified propagation
  ✓ Activated alice.com

🎉 Migration complete!
  Your PDS: https://alice.com
  Your handle: @alice.com
```

### Journey B: Interrupted Migration

**User:** Charlie's network died during blob download

```
$ pnpm pds migrate

🔄 Found incomplete migration

  Progress:
    ✓ Cloudflare setup
    ✓ Repository export (1.2 MB)
    ⏸ Media: 14/23 files downloaded

  Resume? (Y/n) y

📦 Resuming download...
  Media files  ▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░  61% (14/23)

  [Continues normally from where it left off]
```

### Journey C: Rollback After Issues

**User:** Diana found an issue after going live

```
$ pnpm pds rollback

⚡ Rolling back to bsky.social

  ✓ Reverted PLC directory (1.2s)
  ✓ Verified: you're back on bsky.social

  Your alice.com PDS still exists for debugging.
```

## Implementation Components

### CLI Commands

```
pds migrate              # Main migration wizard (interactive)
pds migrate status       # Show current progress
pds migrate resume       # Resume from checkpoint
pds cutover              # Go live after testing
pds rollback             # Emergency rollback (24h window)
pds test                 # Run validation suite
pds cleanup              # Remove old PDS data
```

### State Management

**Location:** `.pds/migration-state.json`

```json
{
  "version": "1.0.0",
  "migrationId": "mig_2024-01-15_abc123",
  "currentStep": "import",
  "status": "in_progress",

  "account": {
    "did": "did:plc:abc123",
    "handle": "alice.bsky.social",
    "oldPdsUrl": "https://bsky.social"
  },

  "cloudflare": {
    "accountId": "cf-account-123",
    "domain": "alice.com",
    "zoneId": "zone-456"
  },

  "resources": {
    "stagingWorker": {
      "name": "alice-pds-staging",
      "url": "https://alice-pds-staging.workers.dev",
      "created": true
    }
  },

  "export": {
    "completed": true,
    "repo": {
      "file": "repo.car",
      "size": 1234567,
      "downloaded": true
    },
    "blobs": {
      "total": 23,
      "downloaded": 14,
      "manifest": [...]
    }
  },

  "cutover": {
    "completed": false,
    "rollbackWindowUntil": null
  }
}
```

**Features:**
- Atomic writes (write to temp, rename)
- Encrypted auth tokens
- Checkpoint after each major step
- Enables resume from any point

### Account Detection

**Auto-detection strategy:**

1. Check for Bluesky app session files:
   - macOS: `~/Library/Application Support/xyz.blueskyweb.app/`
   - Linux: `~/.config/xyz.blueskyweb.app/`
   - Windows: `%APPDATA%\xyz.blueskyweb.app\`

2. Parse session JSON for DID and tokens

3. Fallback to manual entry if not found

4. Validate by fetching account info from current PDS

### Cloudflare Authentication

**OAuth flow:**

1. Check for existing credentials (env, wrangler config, project)
2. If none, initiate OAuth:
   - Generate PKCE challenge
   - Open browser to Cloudflare OAuth endpoint
   - Start local HTTP server for callback
   - Exchange code for token
3. Verify permissions (Workers, R2, DNS)

### Domain Selection

**Detection:**

```
GET /zones → List domains in account
```

**Presentation:**

```
Choose your PDS domain:

→ alice.com (recommended) ⭐
  • Active on Cloudflare
  • Can use as your handle: @alice.com

→ example.com
  • Alternative option

→ Use Workers.dev subdomain
  • Free: alice-pds.alice.workers.dev
  • Cannot use as handle

Which domain? (1)
```

**DNS automation:**
- If domain on Cloudflare: Create DNS records via API
- If external DNS: Provide instructions

### Resource Provisioning

**Worker:**
```
POST /accounts/{account_id}/workers/scripts/{script_name}
```

**Naming:**
- Staging: `{project-name}-staging`
- Production: `{project-name}`

**R2 Bucket:**
```
POST /accounts/{account_id}/r2/buckets
{ "name": "{project-name}-blobs" }
```

**DNS (if Cloudflare domain):**
```
POST /zones/{zone_id}/dns_records
[
  { type: "CNAME", name: domain, content: worker-url },
  { type: "TXT", name: "_atproto", content: "did=..." }
]
```

**Cost Estimation:**

Before creating, show:

```
Monthly cost estimate:

Workers (unlimited requests)     Free
R2 Storage (2.4 MB)           $0.00
R2 Operations (~10k/mo)       $0.01
────────────────────────────────────
Total                    ~$0.01/month

99% of users stay on free tier! 🎉
```

### Data Export

**Repository:**
```
GET /xrpc/com.atproto.sync.getRepo?did={did}
→ Save to .pds/cache/{did}/repo.car
```

**Blobs:**
```
GET /xrpc/com.atproto.sync.listBlobs?did={did}
→ Get CID list

For each CID:
  GET /xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}
  → Save to .pds/cache/{did}/blobs/{cid}
```

**Parallel download:**
- Up to 5 blobs concurrently
- Resume support (track completed CIDs)
- Progress bars with speed and ETA

**Cache manifest:**
```json
{
  "did": "did:plc:abc123",
  "exportedAt": "2024-01-15T10:30:00Z",
  "repo": {
    "file": "repo.car",
    "size": 1234567,
    "sha256": "..."
  },
  "blobs": [
    {
      "cid": "bafyxxx",
      "file": "blobs/bafyxxx",
      "size": 124567,
      "mimeType": "image/jpeg"
    }
  ]
}
```

### Data Import

**Repository:**
```
POST /xrpc/com.atproto.repo.importRepo
Content-Type: application/vnd.ipld.car
Authorization: Bearer {token}

{CAR file bytes}
```

**Blobs:**
```
POST /xrpc/com.atproto.repo.uploadBlob
Content-Type: {mime-type}
Authorization: Bearer {token}

{blob bytes}
```

**Parallel upload:**
- Up to 3 blobs concurrently
- Track uploaded CIDs in state

**Post-import validation:**
```
1. describeRepo - verify collections
2. listRecords - count records per collection
3. getRecord - sample records
4. getBlob - sample blobs
5. Check firehose operational
```

### PLC Directory Operations

**Current limitation:** Requires rotation keys

**Email challenge flow (official):**
```
1. GET /xrpc/com.atproto.identity.getRecommendedDidCredentials
2. POST /xrpc/com.atproto.identity.requestPlcOperationSignature
   → Email sent with token
3. POST /xrpc/com.atproto.identity.signPlcOperation
   → Sign with email token
4. POST /xrpc/com.atproto.identity.submitPlcOperation
   → Submit to plc.directory
```

**Implementation:**
- Prompt user to check email for token
- Sign operation with token
- Submit to PLC directory
- Poll for propagation (up to 60s)

### Automated Validation Suite

**`pds test` command:**

```
Running PDS Tests
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Identity
  ✓ DID document served
  ✓ Handle resolves correctly
  ✓ Keys match expected values

Repository
  ✓ describeRepo returns correct collections
  ✓ Sample records accessible (5/5)
  ✓ Record count matches export (142)

Blobs
  ✓ Blob storage configured
  ✓ Sample blobs accessible (5/5)
  ✓ All blob CIDs present (23/23)

Federation
  ✓ Firehose subscription works
  ✓ Can receive commit events

All tests passed! ✓
```

### Manual Testing Guide

**Provided after staging deployment:**

```
TEST MODE ACTIVE

Your staging PDS: https://alice-pds-staging.workers.dev

Try it:

1. API test:
   curl https://alice-pds-staging.workers.dev/xrpc/com.atproto.repo.describeRepo?repo=did:plc:abc123

2. Test with Bluesky app (safe - won't affect main account):
   • Open Bluesky settings
   • Advanced → Custom PDS (debug mode)
   • Enter: https://alice-pds-staging.workers.dev
   • Browse posts, test posting
   • Switch back when done

3. Run automated tests:
   pnpm pds test

Take your time. When ready: pnpm pds cutover
```

## Code Changes Needed

### 1. Add Force Flag to importRepo

**Location:** `packages/pds/src/account-do.ts`

```typescript
async rpcImportRepo(
  carBytes: Uint8Array,
  force = false
): Promise<{ did: string; rev: string }> {
  const existingRoot = await this.storage!.getRoot();

  if (existingRoot && !force) {
    throw new Error("Repository exists. Use force=true to overwrite.");
  }

  if (force && existingRoot) {
    // Wipe and reimport
    await this.storage!.destroy();
    await this.ensureStorageInitialized();
  }

  // ... rest of import logic
}
```

### 2. Add Blob Migration Helper

**Location:** `packages/pds/src/account-do.ts`

```typescript
async rpcImportBlobs(
  oldPdsUrl: string,
  did: string
): Promise<{ imported: number; failed: string[] }> {
  // List blobs from old PDS
  const listUrl = `${oldPdsUrl}/xrpc/com.atproto.sync.listBlobs?did=${did}`;
  const listRes = await fetch(listUrl);
  const { cids } = await listRes.json();

  const failed: string[] = [];
  for (const cid of cids) {
    try {
      const blobUrl = `${oldPdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
      const blobRes = await fetch(blobUrl);
      const bytes = new Uint8Array(await blobRes.arrayBuffer());
      const mimeType = blobRes.headers.get('content-type') || 'application/octet-stream';

      await this.rpcUploadBlob(bytes, mimeType);
    } catch (err) {
      failed.push(cid);
    }
  }

  return { imported: cids.length - failed.length, failed };
}
```

### 3. Add PLC Management Endpoints

**New file:** `packages/pds/src/xrpc/identity.ts`

Implement:
- `getRecommendedDidCredentials`
- `requestPlcOperationSignature`
- `signPlcOperation`
- `submitPlcOperation`

Using `@atproto/identity` package

### 4. Add Account Lifecycle Endpoints

**Location:** `packages/pds/src/xrpc/server.ts`

Implement:
- `createAccount` (deactivated state)
- `activateAccount`
- `deactivateAccount`
- `checkAccountStatus` (enhanced)

### 5. Add listMissingBlobs Endpoint

**Location:** `packages/pds/src/xrpc/repo.ts`

```typescript
export async function listMissingBlobs(c: Context<AuthedAppEnv>) {
  const repo = c.req.query('repo');
  // Get all blob CIDs from records
  // Check which ones are missing from R2
  // Return missing list
}
```

## Package Structure

```
packages/pds-migrate/
├── src/
│   ├── cli.ts                    # Main CLI entry
│   ├── commands/
│   │   ├── migrate.ts            # Main migration flow
│   │   ├── cutover.ts            # Go live
│   │   ├── rollback.ts           # Undo cutover
│   │   ├── test.ts               # Validation suite
│   │   └── status.ts             # Show progress
│   ├── steps/
│   │   ├── detect-account.ts     # Auto-detect Bluesky
│   │   ├── connect-cloudflare.ts # OAuth
│   │   ├── provision.ts          # Create resources
│   │   ├── export.ts             # Download from old PDS
│   │   ├── import.ts             # Upload to new PDS
│   │   ├── validate.ts           # Test everything
│   │   └── update-identity.ts    # PLC operations
│   ├── lib/
│   │   ├── cloudflare.ts         # CF API wrapper
│   │   ├── atproto.ts            # AT Protocol helpers
│   │   ├── plc.ts                # PLC directory ops
│   │   ├── state.ts              # Migration state
│   │   └── keys.ts               # Crypto generation
│   └── ui/
│       ├── prompts.ts            # Interactive prompts
│       ├── progress.ts           # Progress bars
│       └── errors.ts             # Error formatting
└── package.json
```

## Non-Interactive Mode

**For scripting:**

```bash
pnpm pds migrate \
  --yes \
  --from alice.bsky.social \
  --to alice.com \
  --cf-account-id xxx \
  --cf-api-token yyy \
  --staging-only
```

**Exit codes:**
- 0 = Success
- 1 = User cancelled
- 2 = Validation failed
- 3 = Network error (retryable)
- 4 = Configuration error

## Success Criteria

1. ✅ One command migration (`pnpm pds migrate`)
2. ✅ Auto-detects Bluesky account
3. ✅ Provisions all infrastructure automatically
4. ✅ Exports and imports all data
5. ✅ Test mode before committing
6. ✅ Automated validation
7. ✅ Zero downtime cutover
8. ✅ 24-hour rollback window
9. ✅ Clear progress indicators
10. ✅ Resumable from any point

## Timeline

**Minimal (Fix Current Issues):** 1 day
- Force flag, blob migration, validation

**Good (Smooth but Manual):** 3-4 days
- + PLC endpoints, detailed guide

**Great (Turnkey Solution):** 2 weeks
- + CLI wizard, automation

**Amazing (Best Migration UX):** 3-4 weeks
- + Everything above + polish

## References

- [Account Migration - AT Protocol](https://atproto.com/guides/account-migration)
- [Account Migration Details](https://github.com/bluesky-social/atproto/discussions/3176)
- [Bluesky PDS Migration Docs](https://github.com/bluesky-social/pds/blob/main/ACCOUNT_MIGRATION.md)
- [Enabling Migration Back to Bluesky](https://docs.bsky.app/blog/incoming-migration)
