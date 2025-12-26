# atproto-worker

A single-user AT Protocol Personal Data Server (PDS) running on Cloudflare Workers with Durable Objects.

## Overview

This PDS is designed to federate with the Bluesky network - relays can sync from it, and AppViews can read from it.

**Scope:** Single-user only. No account creation, no multi-tenancy. The owner's DID and signing key are configured at deploy time.

## Packages

- `@ascorbic/pds-worker` - The main PDS library
- `@demo/pds` - A deployable demo instance
