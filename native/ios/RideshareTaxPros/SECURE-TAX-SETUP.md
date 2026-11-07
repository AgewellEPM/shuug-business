# Native protected-data key setup

This is a key-custody, enrollment-verification and encrypted-Journal archive
foundation. It does not activate backend enrollment, migrate existing data or
establish that the current application is protected from host compromise.

`SecureTaxConnectionView` is linked from Account. Its steps are explicit device
key creation, sharing a public request, and importing/verifying a signed public
manifest. It does not generate, import, or store firm signing/recovery private keys.
The API client only fetches bounded public setup status; there is no enroll POST.

## Independent public trust configuration

The signed app must bundle `Resources/SecureTaxTrustedPins.json`, containing
exactly these fields:

| Field | Value |
| --- | --- |
| `version` | Integer `1` |
| `workspaceOrigin` | Exact public HTTPS API origin, without trailing slash/path/port |
| `workspaceId` | Independently approved workspace routing ID |
| `signerPublicKey` | Canonical base64url uncompressed 65-byte P-256 signing public key |
| `firmRecoveryPublicKey` | Distinct P-256 recovery public key in the same encoding |

No live resource is supplied. Setup fails closed when it is absent or invalid;
neither API discovery nor user-imported JSON can replace these pins. Public pins
must be distributed from an independently trusted firm source in the signed app.
Adding a bundled file requires a new signed app build, not a downloaded API config.

## Custody and verification

The client P-256 private key is generated only from the explicit setup button and
saved in the app's own Keychain service with `WhenUnlockedThisDeviceOnly` and
synchronization disabled. It uses no shared extension access group. The namespace
binds origin, workspace, account and linked client. Repeating setup preserves the
existing key. Device loss requires a separate authorized recovery/enrollment
workflow; this module does not implement key export, transfer, deletion or recovery.

The exported request has only `{version,workspaceId,accountId,clientId,client}`,
where `client` contains its public key and SHA-256 fingerprint. It matches the
offline firm signer's input. Status identity is checked against the signed-in
account; imported approval must also match the linked client, workspace, device
public key and independently bundled signing/recovery pins. ES256-P1363 signatures
cover the canonical manifest array defined in `src/lib/secure-tax/envelope.ts`.
Expiry and issuance checks run before use. The highest verified manifest epoch is
persisted with the device key; lower epochs and changed same-epoch manifests fail.
This local epoch floor is not a global object-history rollback defense.

The focused proof is `scripts/native-secure-tax-enrollment-proof.swift`. It uses
synthetic in-memory keys and an injected memory store. It verifies signatures,
identity isolation, public-only requests, expiry, epoch handling and missing pins.
It never exercises or writes the real Keychain, contacts a server, or launches the
app. Full signed-device custody, UI, hosted activation, recovery and migration
remain separate acceptance gates.

## Journal archives and the transport boundary

`SecureTaxSnapshotView` is a separate Account screen. With independently bundled
pins, locally verified approval and matching active server enrollment, it offers
explicit encrypted Journal upload, metadata listing, authenticated preview,
import-review preparation and confirmed deletion of this device's remote archive.
No operation replaces/merges the live Journal, clears legacy pending record/file
queues, resumes a drive, applies settings or restores device actions. A corrupt
local journal blocks this UI rather than uploading an empty replacement.

The inner payload is `{version:1,type:'driver-journal',binding,capturedAt,journal}`.
`binding` contains workspace/account/client/object IDs. Dates use the native
milliseconds-since-1970 representation. All 23 current Journal Codable fields are
included: records and pending/conflict state, receipt metadata, active/tracker
state, goals, bank review state, prompts, assistance, mission/waits/reserves,
offers, decisions, commitments and alert/ingestion history. Unknown Journal fields
and unsupported schema/type are rejected before a potentially lossy import.
Historical routes are independent JSONL files and LocalEntry excludes its
in-memory locations. Receipt contents are also separate. Neither attachment type,
nor server-only tax/profile/referral/provider data, is uploaded by this adapter.

The outer domain is `driver-state`; each device/account archive has a random UUID.
Upload uses revision CAS and a random mutation UUID. A protected local ciphertext
cache saves the exact pending envelope before sending, preserving idempotency on
an ambiguous response. Its size is bounded and it contains routing/hash metadata
and ciphertext only; private keys remain in Keychain. Server acknowledgment
advances the archive cursor and stores the captured Journal hash. If the live
Journal changed during upload, its newer generation remains pending. A known
local revision floor rejects older returned objects; it cannot establish global
anti-rollback history on a new device. Remote deletion keeps the local Journal
and attachments and does not claim erasure of retained backups. An explicit new
archive after deletion uses a fresh UUID.

`SecureTaxTransportPolicy` treats the presence of an independently bundled pin for
the exact workspace origin as requiring protected writes, even before enrollment.
`WorkspaceClient` checks it before either URLSession request path. Legacy record,
receipt, profile, tax multipart, referral and bank link/exchange/sync mutations
are blocked; unrecognized future legacy mutations also fail closed. Authentication,
logout, strict bank disconnect/cancel and existing plaintext downloads for review
and migration remain available. Their old plaintext is not retroactively protected.
`BankClient` also avoids starting provider sync for a pinned workspace. No API
status response can turn this local policy off. A missing public pin resource
keeps the existing non-secure workspace behavior; invalid present configuration
blocks legacy transfers. External browser pages are a separate trust boundary.

`scripts/native-secure-tax-snapshot-proof.swift` compiles against the actual
current DriverCore Journal and CryptoKit. Its in-memory fixture covers every
current Journal field, both recipient decryptors, account/type/schema rejection,
idempotent retry, later local edits, revision floors, preview/import preparation
and remote deletion. `fixture` emits synthetic payload/keys for interoperability
only. `native-secure-tax-transport-policy-proof.swift` exercises the local policy
without real pins, network or user data. Neither proves live hosted/UI behavior.
