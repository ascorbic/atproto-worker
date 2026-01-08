---
"@getcirrus/pds": minor
"@getcirrus/oauth-provider": minor
---

Add passkey (WebAuthn) support for passwordless authentication

**PDS package:**
- New CLI commands: `pds passkey add`, `pds passkey list`, `pds passkey remove`
- QR code display in terminal for easy mobile registration
- Passkey storage and management via Durable Object RPC

**OAuth provider:**
- Passkey login option on authorization page
- Cross-device authentication support (scan QR code from phone)
- Automatic passkey discovery for returning users
