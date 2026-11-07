# Shuug client-encrypted tax envelopes — foundation

This package is a client-only primitive layer. It is not an activated secure
workspace, key manager, recovery UI, data migration or complete web application.
The existing portal and driver upload paths do not become protected merely by
adding this package.

Each object uses a fresh AES-256-GCM data key and a fresh HPKE sender per
recipient. The data key is separately wrapped for the client's public key and
the firm's recovery public key. The envelope contains no private keys.
Workspace, account, object, revision, domain and recipient fingerprints are
authenticated. The seven domains include encrypted full-driver-state and route
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

## Remaining security gates

- Base-mode HPKE does not authenticate the author of a newly created envelope.
  Signed mutations/history and rollback detection must be added before claiming
  end-to-end record authenticity against a malicious host.
- Actual off-host master-key generation/custody, client recovery, authorized
  staff sharing, rotation and trusted public-key distribution remain to build.
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
