# Shuug tax software completion work

Luke directed finishing the remaining Gig Tax Pro work and completing Shuug as
the tax preparation software offered to businesses. He explicitly selected
individual/self-employed **and** business-entity returns from the start. Payment
activation remains deferred under his November 9 instruction.

The acceptance path is client intake/upload → authorized staff correction and
review → client-visible updates and accurate books/balances → return preparation
and calculations → reviewed forms/authorization → attributable transmission and
acknowledgment → restart/recovery. Installed functionality, synthetic execution,
external approvals and visual acceptance remain distinct.

## Recovery/distribution checkpoint

- Native encrypted snapshots now accept the actual `reputationState` and
  `reputationOutbox` fields. Browser readers have a separate personal-ratings
  group; queued history never dispatches provider/device actions. The existing
  authenticated v2 envelope and unknown-future-field rejection are retained.
- Staff grant history supports authenticated pages of at most 25 records, with
  a consistent roster digest and advancing cursor. A concurrent change refuses
  the continuation; the reader never treats partial pages as complete access.
  Signed denials are retained before a later page can fail. Existing small
  unpaginated servers remain readable. Each response keeps the 64-KiB bound.
- Source distributions include `packages`, `native` and deployment sources,
  including the independent client/offhost tooling and native build manifests.
  Known caches and machine-local configuration are excluded; unexpected links,
  signing credentials, private databases and generated archives fail packaging.

Verification: 11 focused API/distribution tests; 40 browser/crypto checks with no
skipped native fixture; 20 actual Swift/CryptoKit memory checks; TypeScript and
the complete Next build pass. The actual compiled backend
`5mCMLS_8NnoUCNTqaIWna` passes 64 synthetic checks, including 131 active signed
grants read over six pages, client uploads/shared revisions, revocation and
backup/fresh-process restore. The source archive inventory matched its manifest
and included all selected client, key-worker, iPhone, Android and hosting inputs;
no cache paths were present. Evidence:
`verification/recovery-distribution-20261109.json` and generated
`dist/source-manifest.json`/source archive. The native proof executable is
`/private/tmp/native-secure-tax-snapshot-proof`; source is committed in `scripts`.
No Simulator, Keychain, real client or installed service was changed. The normal
service still belongs to the separate Telemetry checkout; do not overwrite it
with this older source without preserving and reconciling its newer features.

## Both-family return preparation checkpoint

`packages/tax-engine` now supplies pure local 2025 federal draft calculations for
1040/Schedule C, 1065, 1120-S and 1120. The independent customer client has ordinary
return-entry forms, explicit coverage/review diagnostics, encrypted save/reopen
and durable encrypted retries. The authorized staff reader calculates the shared
input and offers explicit readable draft PDF download. Existing read grants do
not confer staff write authority.

The pack uses exact integer cents and single-step dollar rounding, the complete
official 2025 Tax Table, per-person SE wage caps and limited simplified QBI.
Business allocations conserve the rounded total. Missing additional taxes,
complex QBI and loss limitations suppress complete total/balance figures.
Unknown years/fields fail rather than inherit rates or discard the original
input. Form 1040 name parts are explicit; names are never split by guesswork.

Eleven pinned original IRS templates are checked by hash/structure before filling.
Packets contain calculation/diagnostic workpapers and flattened partial official
forms, with every page visibly marked DRAFT / DO NOT FILE. Interactive actions and
annotations are removed. Text overflow/unsupported glyphs refuse export. Real
PDF text/amount positions are checked. Every result remains `filingReady:false`.
See `packages/tax-engine/README.md` for precise coverage and remaining schedules.

The normal service still belongs to the separate Telemetry checkout. These
changes have not been installed over its newer native/telemetry work. The
independent artifact stays unconfigured and cannot activate a new account.
This is a development milestone, not production tax software or an IRS/state
approval. Payment activation stays deferred.

## Both custody deployment options

Luke selected the separate cloud key service for setup and then required both
options. `packages/secure-tax-client/build-offline-kit.mjs` now prepares a minimal
separate-firm-computer kit with fixed crypto/CLI sources, locked local dependencies
and a SHA-256 inventory. It contains no app/browser, tax engine, credentials,
private keys or customer data, and needs no npm download on the key computer.
Actual packaged CLI initialization with synthetic keys, signing and v2 recovery
pass outside the source tree; existing outputs refuse replacement. This does not
verify physical separation or initialize real firm custody.

The existing isolated AWS artifact and synthetic KMS/job/recovery checks also
pass with the updated package. No cloud resources or production firm keys were
created. No separately authenticated/selected key-account session is available;
the current shell has no AWS CLI, and the available AWS analytics integration
does not administer IAM/KMS/Lambda/CloudFormation. The earlier November 7 STS
`InvalidClientTokenId` remains historical evidence, not a fresh sign-in check.
Use a trusted operator/deployment environment for account authorization, actual
service validation and deployment review. Do not install key-account credentials
on the app/data host or substitute the data-host default profile.

These are two custody options, not a silent key migration or two interchangeable
initializations. Existing firm's public trust pins and recoverability must survive
any explicit migration design.

Verification: 79 calculation/PDF/browser checks, one standalone packaged key-kit
sign/recover test, seven existing custody checks and nine MCP/source-packaging
checks pass. Next build `QFI2btOq40m6havJzidbX` passes 81 synthetic compiled-HTTP
checks, including all four encrypted return families, actual draft PDF output,
shared client corrections, restart/restore and genuine stdio MCP preview/apply.
The independent `tax-client-v2` artifact executes 70 shipped ESM modules and all
four PDF exports in a V8/DOM model. This is not Safari or visual acceptance.
Exact evidence, package locations and source hashes:
`verification/tax-preparation-20261109.json`. All diagnostic servers were stopped
and synthetic private data removed; uninitialized public-code artifacts remain.

## Firm-approved return correction checkpoint

The staff client now edits an existing return into a private before/after review
kit, with its original year/family fixed and refresh paused until save/discard.
The firm key environment checks the exact reviewed-file hash, decrypts the
authenticated original and proposal, reconstructs the salted review commitment,
and signs one exact replacement plus a fresh read capsule. Owner MFA publishes
both atomically. Existing native v2 framing and staff v1 read grants are retained;
staff cannot directly write client ciphertext. Private review kits are refused
before upload. Both the separate-computer CLI and separate-cloud job support
this path. See [the workflow](SHUUG_RETURN_CORRECTIONS_20261109.md).

The API rejects stale sources, altered approvals, revoked assignments and
deleted objects. Exact retries retain the original receipt without replacing a
later client revision or its capsule. The shared client write boundary also
refuses a fresh authenticated write aimed at a tombstoned ID; this fixes an
observed resurrection bug, rather than relying on the browser's local history.

The updated compiled backend passes 91 synthetic HTTP checks, including actual
proposal/firm approval/owner publication, both readers opening the approved
revision without another sharing step, terminal deletion and backup/restart.
The actual Swift/CryptoKit client opens a Node-approved replacement. Focused
API, standalone key-kit, cloud, calculator/PDF and DOM checks pass; the shipped
independent client executes 79 modules and all four PDF exports in a Node
V8/DOM model. Exact build ID, source hashes, package locations and evidence:
`verification/return-corrections-20261109.json`. The installed service and real
key accounts remain unchanged; no production firm keys were initialized.

## Encrypted case checkpoint — November 10

Preparers can now originate a draft for both return families, then prepare
encrypted cases with document requests, exact-source reviews/replacement
decisions and matching draft links. Private command history is retained and
replayed; a purpose-specific firm ES256 certificate binds the complete body to
its exact client/object/version. Owner MFA publication atomically installs the
approved case and read capsule. Reserved case IDs cannot be claimed or replaced
through generic client uploads, including before publication.

Both readers show changed files/drafts as stale and missing/deleted sources as
unavailable. Replacement decisions retain prior facts. A case completion display
is not filing authorization. Ordinary case forms label every note client-visible,
pause refresh for unsaved work and clear it on scope change/lock. The separate
operator inspector extracts exact evidence into private files for actual review;
both custody options approve only the hash of the exact reviewed kit.

The final client/custody/model/tax suite passes 148 checks with no skips,
including actual Swift/CryptoKit case decryption and a 10-MiB selected file.
The compiled service passes 171 synthetic HTTP checks on build
`5MU8AwN75LCZWR1MP9AUk`, including 11 approved case transitions, changed/deleted
sources, both-family readers and restore. The full operator path and current
package/resource evidence are recorded in
[the case workflow](SHUUG_ENCRYPTED_CASES_20261110.md) and
[receipt](verification/encrypted-cases-20261110.json). This is not an installed
upgrade, actual cloud execution, visual acceptance or independent certification.

## Remaining acceptance gates

Broader encrypted staff editing/review, shared firm-book/invoice/payment projections,
trusted enrollment/migration and public or office TLS activation remain open.
Complete the remaining individual/entity schedules, additional-year and state
coverage and filing work for both requested families; do not substitute an
external-filing tracker for that requirement. Declared year/form coverage and
unsupported scenarios must remain explicit. IRS/state
production transmission, provider access and actual acknowledgments require
their real external approvals. Tests and sample PDFs cannot supply those.

Continue through the real Shuug MCP workspace builder and existing application
modules. Preserve the live GigTax website and separate native/office/telemetry
work; its verified navigation repair is on the SalesIntegrated branch.
