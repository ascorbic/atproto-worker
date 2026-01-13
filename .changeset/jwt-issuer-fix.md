---
"@getcirrus/pds": patch
---

Fix authentication loss after 2 hours by removing JWT issuer claim verification

Removes the `iss` (issuer) claim from JWT creation and verification to match the official Bluesky PDS implementation. The official PDS only uses the `aud` (audience) claim for token verification.

Cirrus was being overly strict by requiring both issuer and audience claims to match during token verification. This could cause session refresh to fail after the 2-hour access token expires, resulting in authentication loss where users need to switch accounts or reload the page to recover.

This fix is backward compatible - existing tokens that contain the issuer claim will still work since we no longer verify it.
