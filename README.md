# @ascorbic/pds

A single-user AT Protocol Personal Data Server (PDS) running on Cloudflare Workers with Durable Objects.

> **⚠️ Experimental Software**
>
> This is an early-stage project under active development. **You cannot migrate your main Bluesky account to this PDS yet.** Use a test account or create a new identity for experimentation. Data loss, breaking changes, and missing features are expected.

## Overview

This PDS is designed to federate with the Bluesky network - relays can sync from it, and AppViews can read from it.

**Scope:** Single-user only. No account creation, no multi-tenancy. The owner's DID and signing key are configured at deploy time.

## Packages

- [`@ascorbic/pds`](./packages/pds/) - The main PDS library
- [`create-pds`](./packages/create-pds/) - A CLI tool to scaffold a new PDS project
