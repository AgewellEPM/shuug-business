# Recover a lost client encryption key

The independent client, owner workflow, separate firm tools and opaque API now
support replacement of a lost **client encryption key**, including accounts with
existing encrypted objects. This is different from restoring the same key from an
encrypted backup, changing an account password, or replacing an authenticator.

The implemented recovery requires the client's existing private account code,
password and authenticator (or an unused account recovery code). It also requires
the verified owner's MFA session and the separately held firm signing and recovery
keys. The original client encryption key is not required. Names, email, tax
content and keys do not appear in the recovery routing metadata or audit records.

## Operator workflow

1. The client signs in, creates a replacement client key, saves its encrypted
   backup and separate passphrase, and selects **Save lost-key recovery request**.
   The account's current signed enrollment must still be valid. For an expired
   enrollment, the owner can first use the existing same-key renewal workflow.
2. The verified owner enters the request ID under **Client encryption-key
   recovery** and saves the complete encrypted snapshot. The operator independently
   checks the client identity and replacement-key fingerprint on the separate firm
   device. Keep this encrypted snapshot and its routing metadata private.
3. On that separate device, run the offline kit command below. Stage its resulting
   encrypted packet through **Stage replacement ciphertext and save client
   approval** in the owner client. This produces the public signed approval for
   the customer; staging alone does not change the enrolled key or current data.
4. The customer loads that approval and chooses **Complete encryption-key
   recovery** with the replacement key selected. A short-lived cryptographic proof
   verifies possession of that key. The server atomically changes the enrollment
   and all live encrypted objects, then revokes customer sessions. Sign in again
   with the unchanged password and authenticator and unlock the replacement key.

```sh
node offline-cli.mjs recover-client-key \
  --confirm-off-host --confirm-identity-and-fingerprint \
  --passphrase-fd 3 --bundle /private/firm.encrypted.json \
  --public-pins /private/public-pins.json \
  --request /private/encrypted-client-key-recovery-snapshot.json \
  --out /private/approved-client-key-recovery.json \
  3</private/temporary-passphrase-input
```

Supply the passphrase through a securely managed file descriptor. Do not put it
in a command argument, source file, public folder or application-host environment.
The CLI has no network access, accepts explicitly selected bounded regular files,
and exclusively creates outputs without overwriting an existing packet.

`prepare-client-key-recovery-job.mjs` prepares the equivalent reviewed immutable
cloud job for the existing separate-account worker. It creates no cloud resources.
The cloud worker retains its 30 MiB total job limit; larger snapshots use the
offline workflow. The complete offline JSON snapshot/packet is bounded to 768 MiB,
covering the API's 512 MiB ciphertext allowance plus encoding and metadata.

## Security and consistency

The request captures the exact prior signed enrollment, replacement public key,
account change cursor and complete ordered live-object inventory. Each inventory
entry binds the opaque object ID, revision, domain, ciphertext size and envelope
digest. Requests last at most 24 hours and cannot outlive the prior enrollment.

The separate firm tool authenticates and decrypts every original through its
firm-recovery slot, re-encrypts the **exact same bytes**, and signs both inventories
and a manifest at the next epoch. It retains each object's ID, domain and revision.
The replacement envelopes use firm-authenticated HPKE and preserve the distinct
firm recovery recipient. A failed original authentication stops the whole job.
The signed approval lasts at most four hours.

The server stages individually bounded ciphertext objects. Finalization checks
the exact signed approval, current complete inventory and change cursor in one
SQLite write transaction. A concurrent create, update, delete, renewal, password
change, authenticator replacement, superseding request, suspension or explicit
revocation prevents completion of the stale request. No partial replacement is
committed. A failed key proof is consumed; pending proofs are bounded and expire.
Expiry cleanup commits even when the subsequent expired request is rejected.

The browser rejects a previously observed higher epoch or a different manifest
at the same epoch, and rechecks that trust state in an atomic local-storage
transaction. Old customer sessions, outstanding login proofs, object mutation
retry caches and old staff capsules are removed at successful completion. Account
disable/enable revokes the pending request and clears its staged data and proofs.
Opaque tombstones remain intact, and all rewrapped live objects receive new sync
sequence numbers. Fresh staff sharing is required for the new enrollment.

Signed private case and client-office certificates are preserved byte for byte.
Their historical actions are not rewritten. Existing links to evidence, drafts,
book sources and authorization packages contain the old envelope digests, so
their freshness checks correctly require new review against the replacement
ciphertext. Recovery never marks a return ready to file.

## Verification and limits

The focused server tests exercise the real route handlers and client controller,
including lost-key recovery, stale snapshots, authentication, staging failures,
rollback, expiration cleanup, suspension and browser trust equivocation. Node
tests cover exact private certificate preservation, stale evidence after rewrap,
the actual offline CLI, browser controls and the reviewed cloud-worker contract.

`node --import tsx scripts/secure-key-recovery-http-check.mjs` runs a compiled
loopback host with a new synthetic workspace, both actual client controllers,
owner/customer MFA, removed original client key, exact plaintext comparison,
old-session/key rejection, and backup/restore into another new synthetic host.
It stops its owned hosts and deletes its temporary workspace afterward.

These proofs do not establish physical separation of key custody, deployed TLS,
installed Safari/iOS behavior, human visual acceptance, IRS approval or live
filing. No real firm custody environment or taxpayer data was used. Simultaneous
loss of the encryption key and all account authentication still needs a separately
defined identity recovery process. The supported workflow must not bypass those
missing identity proofs. Old ciphertext in existing backups and copies remains
subject to the firm's retention review; rewrap does not physically erase it.
