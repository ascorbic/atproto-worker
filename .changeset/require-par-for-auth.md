---
"@getcirrus/oauth-provider": patch
---

Require Pushed Authorization Requests (PAR) for OAuth authorization

- Set `require_pushed_authorization_requests: true` in server metadata (per ATProto spec)
- Reject direct authorization requests when PAR is enabled – clients must use `/oauth/par` first

Fixes #80 (login with tangled.org)
