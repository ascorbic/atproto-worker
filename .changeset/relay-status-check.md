---
"@getcirrus/pds": patch
---

Add relay status check to `pds status` command

- Added `getRelayHostStatus` method to PDSClient that calls `com.atproto.sync.getHostStatus` on the relay
- Status command now shows relay status (active/idle/offline/throttled/banned) and account count
- Shows relay seq number when available
- Suggests running `emit-identity` or requesting crawl when relay shows idle/offline
