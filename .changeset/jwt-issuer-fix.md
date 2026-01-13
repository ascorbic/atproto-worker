---
"@getcirrus/pds": patch
---

Fix authentication loss after 2 hours

Fixes the authentication loss issue where Cirrus-hosted accounts would lose auth after ~2 hours of idle time, requiring users to switch accounts or reload the page to recover.

**Root Cause:**
The Bluesky client (@atproto/api) checks for the `emailConfirmed` field in `refreshSession` responses. When missing, it makes an additional `getSession` call. If `getSession` also omits `emailConfirmed`, the client's session state becomes corrupted.

After the 2-hour access token expires, the refresh flow would:
1. Client calls `refreshSession` → gets incomplete response
2. Client detects missing `emailConfirmed` and calls `getSession`
3. `getSession` also returns incomplete data
4. Client session state corrupts, causing auth failures

**Fixes:**
1. Added `emailConfirmed` field to `createSession`, `refreshSession`, and `getSession` responses
2. Removed JWT `iss` (issuer) claim to match official PDS implementation (reduces unnecessary strictness)

Both changes align Cirrus with the official Bluesky PDS behavior and ensure reliable session refresh.
