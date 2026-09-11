# Account and job security boundaries

## Business invariants

- A Firebase Auth UID has exactly one profile: client, tradesperson, or administrator. An Auth account without a profile is recoverable, not implicitly a client. Conflicting legacy profiles require an explicit owner review.
- Public tradesperson registration starts unavailable with zero tokens. An administrator allocates tokens after the existing manual vetting process. Availability and notification preferences remain owner-editable.
- Matching tradespeople, including those with zero tokens, see the pending job description, address, coordinates and photos. Only the assigned tradesperson receives the structured client phone. Client email never appears in a job or a tradesperson response.
- One acceptance costs one integer token. Competing acceptances have one winner. Retrying by the same winner, including after completion, never debits again.
- Clients cancel pending jobs. Once image publication starts, they first finish/resume that short operation before cancelling. Incomplete requests link back to the original draft.

## Authority and data

Firebase Auth establishes identity. The backend resolves roles from all three profile collections in a transaction. Browsers cannot create/delete role profiles. Registration is idempotent and cannot overwrite tokens, rating aggregates or profile edits.

A job uses two documents:

- `jobs/{requestId}`: matching and lifecycle data, schemaVersion 2 and immutable image paths; no client phone/email.
- `jobs/{requestId}/private/contact`: phone only; readable by owner, assigned tradesperson after acceptance, and admin. Collection listing and browser writes are denied.

The create endpoint validates field allowlists, trade/city, Belgrade bounds, phone, description and photo count. It atomically commits the job, contact and 10-second per-client creation cooldown. A random request ID survives reload in localStorage; contact data is recovered from the authorized document, not persisted there. Reusing an ID with changed data fails instead of creating another job.

Profile updates retain affectedKeys allowlists covering additions, edits and deletions of protected fields. Job creation, assignment and image publication are server-only. Browser cancellation is restricted to status and server timestamp.

## Photo lifecycle

1. A job reserves up to three photo slots and stays outside the feed until ready.
2. Compressed JPEGs go to `job-uploads/{uid}/{requestId}/{slot}.jpg`. Rules enforce owner, size, slot and immutability. Each local file retains its original slot across retries, including a lost successful-upload response.
3. The finalizer validates uploads, transactionally fixes one selection, copies within Storage to server-only `jobs/{requestId}/{slot}.jpg` objects without Firebase download tokens, then marks the job ready. Retries resume the fixed selection.
4. Cleanup is bounded to three staging objects; a failure cannot roll back successful publication. A ready-job retry attempts cleanup again.
5. Published objects deny all direct browser reads, including getDownloadURL. The readJobImage endpoint verifies the current viewer and returns bounded JPEG bytes with no-store and nosniff headers. It runs in us-central1 alongside the existing bucket; other functions stay in europe-west3.
6. Cards load photos near the viewport, retain object URLs while mounted, and revoke them on unload/account change. No persistent browser photo cache or public sharing URL is used.

The pinned Storage emulator regenerates download tokens on authorized Firebase GET requests. Removing a token while retaining that API failed a security test. Denying direct access and serving authenticated bytes avoids depending on token-regeneration behavior.

No scheduler, TTL deletion or automatic historical-job deletion is introduced. Abandoned drafts and failed cleanup can retain at most three staging objects per job. Define retention before sustained growth; do not apply blanket lifecycle deletion to published photos/avatars or delete sources needed by an interrupted finalization.

## Runtime and verification

API functions use minimum instances 0, maximum instances 3, 256 MiB and 60 seconds. Photo downloads use concurrency 20 to bound buffering; other functions retain 80. These settings are not a monetary spending cap. PUBLIC_WRITES_ENABLED defaults false outside explicitly identified demo emulators and is configured during rollout.

See [Blaze model](blaze-model.md) and [release procedure](phase2-release.md). Passing local tests does not establish production IAM, index readiness, real push delivery or billed consumption.
