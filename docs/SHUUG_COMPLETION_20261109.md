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

## Remaining acceptance gates

Encrypted staff editing/review, shared firm-book/invoice/payment projections,
trusted enrollment/migration and public or office TLS activation remain open.
The return engine and forms/transmission must support both requested families;
do not substitute an external-filing tracker for that requirement. Declared
year/form coverage and unsupported scenarios must remain explicit. IRS/state
production transmission, provider access and actual acknowledgments require
their real external approvals. Tests and sample PDFs cannot supply those.

Continue through the real Shuug MCP workspace builder and existing application
modules. Preserve the live GigTax website and separate native/office/telemetry
work; its verified navigation repair is on the SalesIntegrated branch.
