---
"@ascorbic/pds": minor
---

Add `com.atproto.server.getServiceAuth` endpoint for video upload authentication

This endpoint is required for video uploads. Clients call it to get a service JWT to authenticate with external services like the video service (`did:web:video.bsky.app`).
