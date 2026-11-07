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
real off-host backup drills are not supplied by these commands.

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
- Actual off-host master-key setup/custody, client recovery activation,
  authorized staff sharing, rotation and trusted public-key distribution remain.
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
