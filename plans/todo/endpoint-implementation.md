# AT Protocol PDS - Endpoint Implementation Status

**Status:** 📋 Planning Document

This document tracks the implementation status of all AT Protocol XRPC endpoints and prioritizes future work.

## Implementation Summary

**Total Core PDS Endpoints: 70**
- ✅ **Implemented: 26** (37%)
- ⚠️ **Partial/Stub: 3** (4%)
- ❌ **Not Implemented: 41** (59%)

**For Single-User PDS:**
- **Necessary endpoints implemented: 26/~30** (87%)
- Most missing endpoints are multi-user, admin, or moderation features

## Currently Supported Endpoints

### com.atproto.repo (9/11 - 82%)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `applyWrites` | ✅ Complete | Batch operations, validates all records |
| `createRecord` | ✅ Complete | Validates against lexicon schemas |
| `deleteRecord` | ✅ Complete | Updates firehose |
| `describeRepo` | ✅ Complete | Returns collections and DID document |
| `getRecord` | ✅ Complete | With CID and value |
| `importRepo` | ✅ Complete | CAR file import with validation |
| `listRecords` | ✅ Complete | Pagination, cursor, reverse |
| `putRecord` | ✅ Complete | Create or update with validation |
| `uploadBlob` | ✅ Complete | 5MB limit, R2 storage |

### com.atproto.sync (6/11 - 55%)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `getBlob` | ✅ Complete | Direct R2 access |
| `getRepo` | ✅ Complete | CAR file export |
| `getRepoStatus` | ✅ Complete | Active status, rev, head |
| `listBlobs` | ✅ Complete | Paginated blob listing |
| `listRepos` | ✅ Complete | Returns single repo (single-user) |
| `subscribeRepos` | ✅ Complete | WebSocket firehose with CBOR frames |

### com.atproto.server (7/26 - 27%)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `createSession` | ✅ Complete | JWT + static token auth |
| `deleteSession` | ✅ Complete | Stateless (client-side) |
| `describeServer` | ✅ Complete | Server capabilities |
| `getAccountStatus` | ✅ Complete | Migration support |
| `getServiceAuth` | ✅ Complete | Service JWTs for AppView/external services |
| `getSession` | ✅ Complete | Current session info |
| `refreshSession` | ✅ Complete | Token refresh with validation |

### com.atproto.identity (1/6 - 17%)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `resolveHandle` | ⚠️ Partial | Complete implementation (DNS + HTTPS for any handle) |

### app.bsky.* (3 endpoints)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `actor.getPreferences` | ✅ Complete | Persists to SQLite |
| `actor.putPreferences` | ✅ Complete | Persists to SQLite |
| `ageassurance.getState` | ✅ Stub | Returns "assured" (self-hosted = pre-verified) |

## TODO Endpoints (Grouped by Priority)

### Migration Support (P1 - Critical)

**Account Lifecycle:**
- `com.atproto.server.createAccount` - Create deactivated account for migration
- `com.atproto.server.activateAccount` - Activate account after migration
- `com.atproto.server.deactivateAccount` - Deactivate old account post-migration
- `com.atproto.server.checkAccountStatus` - Verify migration progress

**Identity Management (PLC Operations):**
- `com.atproto.identity.getRecommendedDidCredentials` - Get DID credentials from new PDS
- `com.atproto.identity.requestPlcOperationSignature` - Request email challenge
- `com.atproto.identity.signPlcOperation` - Sign PLC operation with email token
- `com.atproto.identity.submitPlcOperation` - Submit to PLC directory

**Data Migration:**
- `com.atproto.repo.listMissingBlobs` - Identify failed blob imports

**Total: 9 endpoints**

### App Passwords (P2 - Important)

- `com.atproto.server.createAppPassword` - Create app-specific revocable passwords
- `com.atproto.server.listAppPasswords` - List all app passwords
- `com.atproto.server.revokeAppPassword` - Revoke specific app password

**Total: 3 endpoints**

### Advanced Sync (P3 - Nice to Have)

- `com.atproto.sync.getBlocks` - Get specific blocks by CID
- `com.atproto.sync.getLatestCommit` - Get latest commit without full repo
- `com.atproto.sync.getRecord` - Get record with merkle proof

**Total: 3 endpoints**

## Will NOT Support

### Multi-User Administration (14 endpoints)
**Reason:** Single-user PDS has no admin/user separation

All `com.atproto.admin.*` endpoints

### Moderation (1 endpoint)
**Reason:** Single-user PDS doesn't need moderation infrastructure

- `com.atproto.moderation.createReport`

### Account Creation & Invites (5 endpoints)
**Reason:** Single-user PDS is pre-configured

- `com.atproto.server.createInviteCode`
- `com.atproto.server.createInviteCodes`
- `com.atproto.server.getAccountInviteCodes`
- `com.atproto.temp.checkSignupQueue`

*Exception:* `createAccount` will be implemented for migration only

### Email Verification & Recovery (6 endpoints)
**Reason:** Single-user PDS has no email system

- `com.atproto.server.confirmEmail`
- `com.atproto.server.requestEmailConfirmation`
- `com.atproto.server.requestEmailUpdate`
- `com.atproto.server.updateEmail`
- `com.atproto.server.requestPasswordReset`
- `com.atproto.server.resetPassword`

### Deprecated (2 endpoints)

- `com.atproto.sync.deprecated.getCheckout`
- `com.atproto.sync.deprecated.getHead`

**Will Not Support Total: 28 endpoints**

## Proxy Strategy

All unimplemented `app.bsky.*` endpoints are proxied to `api.bsky.app` with service auth. This includes:
- Feeds (`app.bsky.feed.*`)
- Graphs (`app.bsky.graph.*`)
- Notifications (`app.bsky.notification.*`)
- Labels (`app.bsky.labeler.*`)
- Chat (`chat.bsky.*`)

This is intentional - the edge PDS focuses on repository operations and federates view/aggregation to AppView.

## Implementation Phases

### Phase 1: Migration Support (13 endpoints)
Enable full account migration to/from this PDS
- See `migration-wizard.md` for detailed specification

### Phase 2: OAuth Provider
Enable ecosystem compatibility with "Login with Bluesky" apps
- See `oauth-provider.md` for detailed specification

### Phase 3: Enhanced Features (3 endpoints)
Multi-device auth with app passwords

### Phase 4: Advanced Sync (3 endpoints)
Efficient partial sync and merkle proofs

## Endpoint Coverage by Namespace

| Namespace | Supported | Total | Coverage |
|-----------|-----------|-------|----------|
| `com.atproto.repo` | 9 | 11 | 82% |
| `com.atproto.sync` | 6 | 11 | 55% |
| `com.atproto.server` | 7 | 26 | 27% |
| `com.atproto.identity` | 1 | 6 | 17% |
| `com.atproto.admin` | 0 | 14 | 0% (intentional) |
| `app.bsky.*` | 3 | - | Proxy model |

## References

- [AT Protocol Specs](https://atproto.com/specs)
- [Official PDS Implementation](https://github.com/bluesky-social/atproto/tree/main/packages/pds)
- [Account Migration Guide](https://atproto.com/guides/account-migration)
