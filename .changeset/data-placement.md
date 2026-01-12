---
"@getcirrus/pds": minor
---

Add data placement support for Durable Objects

- Added `JURISDICTION` environment variable for hard data residency guarantees (EU, FedRAMP)
- Added `LOCATION_HINT` environment variable for best-effort placement suggestions
- Exported `Jurisdiction` and `LocationHint` types from package

These features use Cloudflare's Durable Object data location capabilities. Jurisdiction provides compliance guarantees that data never leaves a region, while location hints optimize for latency.

Note: These settings only affect newly-created Durable Objects. Existing PDSes require export/re-import to relocate.
