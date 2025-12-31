---
"@ascorbic/pds": minor
---

Implement deactivated account pattern for seamless account migration

**Account State Management:**
- Add account activation state tracking to support migration workflows
- New `INITIAL_ACTIVE` environment variable controls whether accounts start active or deactivated
- Accounts can transition between active and deactivated states

**Migration Endpoints:**
- `POST /xrpc/com.atproto.server.activateAccount` - Enable writes and firehose events
- `POST /xrpc/com.atproto.server.deactivateAccount` - Disable writes while keeping reads available
- Enhanced `getAccountStatus` to return actual activation state and migration metrics

**Write Protection:**
- Write operations (`createRecord`, `putRecord`, `deleteRecord`, `applyWrites`) are blocked when account is deactivated
- Returns clear "AccountDeactivated" error with helpful instructions
- Read operations, `importRepo`, `uploadBlob`, and `activateAccount` remain available

**Improved Setup Flow:**
- `pds init` now asks if you're migrating an existing account
- For migrations: auto-resolves handle to DID, deploys account as deactivated
- For new accounts: generates identity, deploys as active
- Worker name automatically generated from handle using smart slugification

**Migration UX:**
- Handle resolution using DNS-over-HTTPS via `@atproto-labs/handle-resolver`
- Retry logic with helpful error messages for failed handle lookups
- Step-by-step guidance for export, import, PLC update, and activation
- Custom domain validation to prevent using hosted handles (*.bsky.social)

This enables users to safely migrate their Bluesky accounts to self-hosted infrastructure with a clean, resumable workflow.
