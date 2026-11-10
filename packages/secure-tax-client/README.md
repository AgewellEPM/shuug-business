# Shuug client-encrypted tax envelopes — foundation

This package contains client encryption primitives and off-host firm recovery
tools. It is not an activated secure workspace or completed data migration.
The existing portal and driver upload paths do not become protected merely by
adding this package. Browser setup and view code must be distributed separately
from the ciphertext API and supplied independent public trust pins.

Each object uses a fresh AES-256-GCM data key and a fresh HPKE sender per
recipient. The data key is separately wrapped for the client's public key and
the firm's recovery public key. The envelope contains no private keys.
Workspace, account, object, revision, domain and recipient fingerprints are
authenticated. HPKE Auth mode authenticates the trusted author to decryptors.
The content authentication tag also binds both complete ordered wrapped-key
slots, so corrupting a recovery wrap cannot go unnoticed by the client.
The seven domains include encrypted full-driver-state and route
objects so future sync can cover all app features without sending their
contents or per-feature labels to the storage host.

`openEnvelope` requires exact expected context and independently trusted client
and recovery public keys. `verifyEnrollmentManifest` validates a firm's signed
public manifest against independently supplied signer/recovery pins and the
expected account, client and minimum epoch. Pins supplied by the ciphertext API
alone are insufficient. The signer and recovery keys must be distinct.

`generateRecipientKeyPair` produces a nonextractable WebCrypto private key for
use in the trusted client. This module never saves it. A separately controlled
static frontend or signed native client must implement custody, protected
backup/recovery and explicit unlock. Never import a recovery key into HTML or
JavaScript served by the storage backend. A compromised script distributor can
steal plaintext or keys at unlock, even when encrypted database files are safe.

## Verification

Run `npm ci --ignore-scripts` in this directory, then `npm test`.
For the actual CryptoKit interoperability proof, compile the repository's
synthetic native helper and run:

```sh
node packages/secure-tax-client/interop-proof.mjs /private/tmp/native-secure-tax-envelope-proof
```

It verifies both directions and both client/recovery recipients using generated
synthetic keys. It never uses real private keys or contacts a service.

The dependency is exactly pinned to `@hpke/core`1.10.0 with its lockfile. The
[published nonce-reuse advisory](https://github.com/dajiaji/hpke-js/security/advisories/GHSA-73g8-5h73-26h4)
affects versions through1.7.4; this code additionally uses a fresh HPKE context
for each single key wrap. The implementation uses the
[RFC9180 HPKE construction](https://www.rfc-editor.org/rfc/rfc9180), matching
CryptoKit's P256/SHA256/AES256GCM suite. This application's envelope protocol
and key workflows have not received an independent security review, and the
[HPKE library does not claim a formal audit](https://github.com/dajiaji/hpke-js#readme).

## Off-host firm key and recovery commands

`firm-recovery.mjs` and `offline-cli.mjs` belong on a separately trusted firm
device. **Never bundle them into the website or run production key creation on
the API host.** They have no network operations. No real firm key was generated
by this development work; tests use disposable synthetic keys only.

The `init` command creates distinct P256 signing and recovery keys and seals
their private parts in one passphrase-protected AES256-GCM bundle. PBKDF2-SHA256
uses a fresh 32-byte salt and 600,000 iterations; public pins and KDF framing
are authenticated. Use a strong unique passphrase of at least 20 characters,
kept separately from the encrypted bundle. JavaScript cannot guarantee erasure
of every temporary runtime copy; hardware/offline custody remains a separate
operational requirement. The parameters follow the published
[OWASP PBKDF2 guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

Run `node packages/secure-tax-client/offline-cli.mjs` for its argument summary.
Every operation requires `--confirm-off-host`, `--passphrase-fd N`,
`--bundle PATH` and `--public-pins PATH`. The passphrase is read from that
already-open descriptor, never a command argument or environment variable.
Provide the descriptor from a trusted local secret-entry workflow; do not
place the passphrase alongside the bundle or in shell history.

- `init` additionally takes `--workspace-id ID`. Both output files are created
  exclusively with mode0600. Existing outputs are never overwritten, and a
  failed second output removes only the new files owned by that invocation.
- `sign` takes `--request PATH --epoch N --out PATH`. Independently verify the
  client's identity and public-key fingerprint **before signing**. The request
  shape is `{version:1,workspaceId,accountId,clientId,client:{keyId,publicKey}}`.
  Output is a signed public manifest valid for one year, not a private key.
- `recover` takes `--manifest PATH --envelope PATH --expected PATH --out PATH`.
  The expected JSON must identify `accountId`, `clientId`, `minimumEpoch`,
  `objectId`, `revision` and `domain` from separately reviewed records.
  `manifestId` can additionally pin the exact public manifest. For an expired
  backup, explicit `archiveValidAt` may supply an independently reviewed past
  ISO UTC time inside its signed validity interval; normal enrollment still
  rejects expired manifests. The output contains plaintext and must remain on
  the trusted recovery device. Files are mode0600 and created exclusively.

Unlock imports nonextractable private CryptoKeys. The signed public pins must
be installed independently in native builds, static frontend configuration and
API public configuration. Key rotation/rewrapping, staff access grants and
real off-host backup drills are not supplied by these original commands.

`firm-staff.mjs` and `staff-offline-cli.mjs` add signed, read-only staff grants,
per-object capsules, signed revocation and replacement-device recovery without
changing original v2 envelopes. The separately distributed browser artifact
includes `staff.html`, ordinary staff MFA and a separate local key namespace;
it excludes firm private-key tooling. See the
[staff contract](../../docs/SECURE-TAX-STAFF-CONTRACT.md) for exact CLI/API shapes
and revocation limits. The [AWS package](../../docs/SECURE-TAX-AWS-KEY-SERVER.md)
prepares isolated cloud custody but has not been deployed or initialized.

Both custody deployment options are retained. `node build-offline-kit.mjs
--output /new/absolute/directory` prepares a separate-computer kit with only the
firm CLIs, crypto modules, locked local dependencies and a SHA-256 inventory.
It excludes the tax engine, app/browser, account configuration and private keys.
It needs no npm download at runtime. Use the generated instructions on the
separately trusted device; original outputs remain exclusive and are never
overwritten. The standalone kit's actual CLI signing/recovery path is tested
outside the source checkout. This is synthetic execution, not physical custody.
The cloud package remains a distinct deployment option, with its existing
separate-account/MFA/runtime guards. Existing firms need an explicit migration
design before switching custody; unrelated initialization creates different pins.

`firm-return-edits.mjs` and the operator-only return-correction CLIs extend both
custody paths. Preparers create an encrypted proposal and explicitly downloaded
private before/after review kit; only the firm can approve the exact replacement.
Owner MFA publication stores its ciphertext and fresh signed capsule atomically.
The browser validates the public packet before upload and refuses private kits.
Read grants remain read-only. See the
[correction workflow](../../docs/SHUUG_RETURN_CORRECTIONS_20261109.md).

`firm-return-creations.mjs` and the separate creation CLIs add preparer-originated
initial returns without weakening correction source checks. A signed assignment
can produce a private new-return review kit even when no client object exists.
The separately reviewed firm approval creates revision 1 and its read capsule;
owner MFA publication refuses an existing or deleted ID and exact retries
preserve later client changes. The browser never uploads the private kit.
The cloud operation is `approve-return-create`; both custody packages include it.

## Private case workflow and operator review

Encrypted cases now support `case.create`, `request.add`, `document.review` and
`draft.link` for the declared 2025 individual/self-employed and business return
families. Request titles, dates, notes, decisions, exact evidence references and
retained command history stay inside the encrypted case. A preparer proposes a
transition; separate firm approval and owner MFA publish its exact new ciphertext
and fresh read capsule atomically. The staff grant remains read-only. See the
[encrypted case workflow](../../docs/SHUUG_ENCRYPTED_CASES_20261110.md).

The private review kit contains readable before/command/after state and selected
evidence. Keep it on trusted preparer/operator devices; never send it to the
app/data host or cloud job bucket. Prepare ordinary files for human review with:

```sh
node inspect-case-review.mjs --public-pins PUBLIC_PINS.json --kit PRIVATE_KIT.json --out NEW_PRIVATE_REVIEW_DIRECTORY
```

This inspector uses no firm key, network, approval or automatic file opening. It
exclusively creates a mode0700 directory with mode0600 `private-kit.json` (exact
original bytes), `review.json`, `kit-sha256.txt`, and, when selected,
`selected-evidence.pdf`, `.jpg`, `.png`, `.csv`, or `selected-draft.json`. Output
names are fixed; embedded client filenames never choose a filesystem path.
Review the actual extracted file and case fields. These are candidate private
copies: public framing/commitment checks cannot establish that readable evidence
matches the encrypted proposal. Final firm approval reconstructs that match.

After review, use the **copied** `private-kit.json` and its exact hash from
`kit-sha256.txt` for either custody path:

```sh
node case-offline-cli.mjs --confirm-off-host --confirm-fields-reviewed --passphrase-fd 3 --bundle FIRM_BUNDLE.json --public-pins PUBLIC_PINS.json --kit NEW_PRIVATE_REVIEW_DIRECTORY/private-kit.json --reviewed-sha256 REVIEWED_KIT_SHA256 --review-reference OPAQUE_REVIEW_ID --out NEW_APPROVED_CASE.json
node prepare-case-job.mjs --confirm-fields-reviewed --public-pins PUBLIC_PINS.json --kit NEW_PRIVATE_REVIEW_DIRECTORY/private-kit.json --reviewed-sha256 REVIEWED_KIT_SHA256 --review-reference OPAQUE_REVIEW_ID --job-id UNIQUE_JOB_ID --out NEW_OPAQUE_JOB.json
```

The offline approver takes the existing bundle passphrase only through the chosen
private descriptor. Cloud preparation uses no private key and performs no upload.
The `approve-case-transition` worker accepts exactly `expectedPins`, `proposal`,
`sourceEnvelope`, `manifest`, `grant`, `expected`, `reviewedCommitment` and
`reviewReference`. The command and selected evidence envelope/capsule are inside
the encrypted proposal, never clear job fields. Its result is
`approvedCase: {approval,envelope,capsule}`. Publish that three-field packet through
the owner's trusted client, rather than uploading the private kit or worker receipt.

The firm reopens the actual source and selected evidence, verifies current signed
assignment/sharing, reapplies the command and reconstructs the salted commitment.
Its private `shuug-private-tax-case-certificate` uses the signing purpose
`shuug/private-tax-case-certificate` to bind the whole body and retained command
history to workspace, account, client, case object, revision, domain, actor and
issue time. This historical certificate has no expiry and grants no API access;
current enrollment, grant and capsule leases remain separate requirements.

Case IDs use the reserved `shuug-case:` prefix and nonempty valid suffix. The
server's firm-managed registry and reserved-ID checks refuse generic client
writes/deletion and return-creation/correction publication into that namespace,
including before the first case publication. Case certificates reject relocation
to a different context. Source compare-and-swap checks and exact retries preserve
later firm revisions and read capsules. Ordinary native v2/read v1 contracts stay
unchanged.

Case readiness is source-review freshness, not client filing authorization or tax
accuracy. Changed/unavailable evidence is shown as stale/unavailable after refresh;
the ciphertext host cannot inspect private dependency links to lock those files
during publication. Final review, authorization/signatures, filing, broader books
and billing workflows, trusted activation/migration and independent review remain
unfinished. No case transition establishes an IRS/state acknowledgment.

`public-config.mjs --pins PUBLIC-ONLY.json --api-origin https://api.example
--ui-origin https://client.example --output NEW-DIRECTORY` prepares consistent
public-only files for the API environment, signed native resource and independent
static frontend. It rejects private bundle fields, does not overwrite an existing
directory, and performs no installation or activation. Distribute each through
its separately controlled channel after independently verifying fingerprints.

## Remaining security gates

- V2 uses HPKE Auth; v1/base envelopes are rejected. It does not provide public
  nonrepudiation, rollback/history anchoring or protection after recipient-key
  compromise (see RFC9180 section9.1.1). Host-driven deletion is still possible.
- Actual off-host master-key setup/custody, client/staff recovery activation,
  broader encrypted office editing, rotation and trusted public-key distribution remain.
- Native/browser sync must select the secure path before sending plaintext;
  a server rejection after receiving plaintext does not meet host blindness.
- Plaintext provider credentials or tokens on the API host can fetch fresh tax
  information. Protected ingestion needs a separately trusted broker/client.
- Old database rows, snapshots, mutation caches, files, exports and backups must
  be migrated or removed deliberately. Encrypting new copies cannot protect old
  copies that were already retained with the old server-held vault key.
- Purging current ciphertext does not erase recipients' downloaded copies or
  retained backups. Recovery keys can still unlock retained encrypted backups;
  deletion and backup retention must be explicit in the product.

No real master recovery key has been created or uploaded by this work.
