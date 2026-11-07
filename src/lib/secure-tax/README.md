# Opaque encrypted-object API foundation

This module stores versioned ciphertext and verifies signed **public** recipient
manifests. It does not hold client/recovery/signing private keys, decrypt object
content, migrate legacy data, or establish that all existing application data is
protected. Existing plaintext migration and full client/staff view integration
remain separate work.

## Trust and enrollment

The server requires three public configuration pins:

- `SHUUG_SECURE_TAX_WORKSPACE_ID`
- `SHUUG_SECURE_TAX_SIGNER_PUBLIC_KEY`
- `SHUUG_SECURE_TAX_RECOVERY_PUBLIC_KEY`

Public keys are canonical base64url, uncompressed 65-byte P-256 points. Signing,
client and recovery keys must be distinct. Clients must independently trust the
same public pins from their separately controlled application/build; obtaining
them from this API does not create an independent trust boundary.

An authenticated client explicitly submits a version-1 recipient manifest signed
offhost using ES256/P1363. The signature covers the canonical array defined in
`envelope.ts`. Its account/client/workspace, key fingerprints, validity times and
signature must match the authenticated identity and public pins. Enrollment epochs
cannot decrease, and changed manifests need a higher epoch. Renewal with the same
keys remains available; changing either recipient key is refused while live
encrypted objects remain. A separately verified rewrap/migration workflow is
required before supporting that rotation. No automatic key
generation, account enrollment or plaintext import occurs.

The active enrollment is also a fail-closed boundary for legacy writers through
`policy.ts`, including other accounts linked to the same service client. Expiry,
missing pins and key rotation must never silently restore plaintext access.

## HTTP contract

All routes are below `/api/website/customer/secure`. Native requests use the
existing invited-client Bearer credential. Browser cookies can read metadata and
ciphertext; browser writes require an explicitly configured independent trusted
origin in `SHUUG_SECURE_TAX_TRUSTED_ORIGIN`. Credentialed CORS is restricted to that
one exact origin. Production same-API-origin browser provisioning is rejected;
loopback fixtures are permitted for verification.

| Route | Contract |
| --- | --- |
| `GET /status` | Enrollment/key-provisioning state and content-free known legacy counts; no plaintext payloads. |
| `POST /enroll` | Body is the signed public recipient manifest only, up to 16 KiB. |
| `GET /objects?after=0&limit=100` | Account-local sequence cursor and metadata only; maximum 200 changes per page. Fetch each active object separately. |
| `GET /objects/{id}` | Current encrypted envelope and revision, or a content-free tombstone. |
| `PUT /objects/{id}` | `{mutationId, expectedRevision, envelope}`. Envelope context ID must match the path and revision must be `expectedRevision + 1`. |
| `DELETE /objects/{id}` | `{expectedRevision}`. Purges live ciphertext and all object-scoped mutation caches; returns the next tombstone revision. |

Every operation rechecks the real account/client link and active trusted key
enrollment. There is no cross-client staff endpoint in this foundation; a
cryptographic `firm-recovery` recipient does not itself grant server-side staff
authentication or key distribution.

Version-2 envelopes require HPKE Auth mode, an author role/key ID matching one of
the two enrolled recipients, exact ordered client/recovery slots, canonical key
fingerprints and valid public-point framing. The server can verify framing and
pins, **not** the HPKE-authenticated sender or content integrity: authorized
native/browser decryptors must verify those cryptographically. Base/v1 envelopes
are rejected. No filename, MIME, aliases, tax fields or arbitrary extra properties
are accepted outside ciphertext. Writer-generated object IDs must be random
opaque values; never derive them from taxpayer IDs, filenames or client names.

The seven outer domains are `tax-document`, `tax-identity`, `driver-record`,
`driver-receipt`, `driver-state`, `driver-route` and `provider-record`. Detailed
feature subtypes, dates, amounts, locations and user-facing labels stay inside
the encrypted payload. Account/workspace/object IDs, mutation IDs, domain,
revision, sequence, deletion state and recipient public keys are routing metadata
visible to the host; the API does not promise to hide their meaning. The generic
ID schema accepts existing stable routing identifiers and cannot establish that
an identifier contains no private information. Actual client writers must generate
object and mutation IDs with a cryptographic random UUID generator, never use a
taxpayer ID, document name or other sensitive value as an ID, and keep labels
inside ciphertext. Ciphertext is bounded to 16 MiB per object, 512 MiB per
account and 2 GiB per workspace. Per-account active-object, total-ID and mutation
metadata limits prevent unbounded history growth.

## Migration and deletion limits

Enrollment responses explicitly say `plaintextMigrationPerformed: false`.
`legacyMigrationRequired` and `legacyProviderAuthorizationPresent` inspect known
live driver records/mutation caches/receipts, tax documents, provider credentials
and facts, SDK tax rows and private identity profiles for the account and linked
client. They never silently revoke credentials, migrate or purge old records.
`hostCompromiseProtectionVerified` stays false and backup/history review stays
required. Zero known row counts cannot prove that filesystem history, orphan
files, WAL, logs, old exports or backups are clean.

DELETE clears the current ciphertext row and every mutation cache for that object;
old create retries cannot resurrect a deleted revision. The retained tombstone
contains opaque object/owner routing IDs, revision, sequence and deletion state.
The highest valid encrypted revision can still be deleted; its content-free
tombstone uses one additional bounded revision, which encrypted writes cannot use.
SQLite secure-delete is enabled for these writes, but this API does not claim
physical erasure of previous filesystem pages or backups. Existing backups may
retain earlier ciphertext and need a separately verified retention/migration
process. There is no private-key deletion claim because no private key belongs
on this server in the first place.
