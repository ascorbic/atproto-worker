---
"@getcirrus/pds": minor
---

feat: implement com.atproto.sync.getRecord endpoint

Add support for the `com.atproto.sync.getRecord` endpoint, which returns a CAR file containing the commit block and all MST blocks needed to prove the existence (or non-existence) of a record. This enables tools like pdsls to verify record signatures.
