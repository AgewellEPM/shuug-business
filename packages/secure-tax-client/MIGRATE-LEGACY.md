# Offline copied-backup preparation

`migrate-legacy.mjs` and `migrate-legacy-cli.mjs` prepare an encrypted export from
an explicitly selected **copy** of a stopped legacy backup. They do not contact
the API, discover app data, activate enrollment, import records, revoke provider
access, remove source data or declare migration complete. Run them on a separately
trusted firm device, away from the live storage/API host. This code has received
same-team source and synthetic protocol checks, not an independent security review.

The backup must use the repository's `backupWorkspace` version-1
`backup-manifest.json` format. Supply its SHA256 from a separately reviewed record.
The hash manifest itself is not a digital signature or proof that a compromised
legacy host supplied trustworthy data. Do not obtain the hash and archive from
the same unverified host and treat that as independent provenance.

Before reading selected client content, preparation checks the exact file set,
sizes, SHA256 hashes, safe relative paths and absence of symlinks/special files or
live WAL/SHM/lock files. It copies the verified snapshot into a private disposable
directory and runs SQLite `quick_check` on each SQLite/database file. All selected
reads then use that disposable restore. Cleanup removes this temporary directory;
it does not prove physical erasure of its previous filesystem blocks or history.
The original copied archive is retained unchanged.

## Explicit inputs

Use the existing offline firm-key tool to unlock an encrypted firm bundle on the
trusted device. The migration tool verifies a separately approved signed public
recipient manifest against those independent firm public pins. Its expected
identity file must contain the reviewed account, linked client, exact manifest ID
and minimum acceptable key epoch:

```json
{
  "accountId": "<reviewed account UUID>",
  "clientId": "<reviewed service-client UUID>",
  "manifestId": "<reviewed signed-manifest ID>",
  "minimumEpoch": 1
}
```

The signed manifest must currently be valid. Preparation is a new encryption
operation; expired-manifest archive recovery belongs to the separate recovery
tool. The account/client link must also match the copied legacy account table.
Only that exact account's matching client data is exported.

```sh
node packages/secure-tax-client/migrate-legacy-cli.mjs \
  --confirm-off-host --confirm-copied-backup \
  --backup /selected/copied-backup \
  --backup-manifest-sha256 '<independently reviewed SHA256>' \
  --bundle /selected/offhost-firm-bundle.json \
  --public-pins /independently/trusted-public-pins.json \
  --manifest /reviewed/client-recipient-manifest.json \
  --expected /reviewed/migration-identity.json \
  --passphrase-fd 3 --out /new/encrypted-export \
  3</operator-selected/private-passphrase-input
```

Passphrases travel through an explicitly selected descriptor, never a command-line
argument. Do not place a real passphrase in a shell command, example, source file
or log. Select a new output directory outside the copied backup. Existing output
directories are refused. Failed preparation removes only its newly owned output;
preexisting files are never overwritten. The library exports
`prepareLegacyMigration(options)` for callers that already unlocked the firm bundle.

## Supported subset and encrypted links

- Exact account/client-scoped legacy trip, expense and income snapshots, including
  their source revisions and deletion markers.
- Raw JPEG, PNG or PDF receipts referenced by those selected expense snapshots.
  Bytes must match the stored MIME framing, size and SHA256. Unreferenced receipt
  metadata/files are left for separate review.
- Documents submitted under that exact account/client, including original file
  bytes and client-facing submission status. The old `vault.key` is used locally
  only to authenticate/decrypt the legacy AES256-GCM `{iv,tag,data}` file format;
  its decrypted base64 payload must match the document metadata and digest.

Every exported object gets a cryptographically random UUID and a new v2 envelope,
authored through standard HPKE Auth mode by the offhost firm recovery recipient.
The DEK is wrapped independently for the approved client and recovery recipients.
Preparation actually opens each fresh envelope with the firm recovery key before
writing it. Client recovery remains explicitly unverified until the separate
client opens the export with their own key.

The output contains `export-manifest.json` and `objects/<random UUID>.json`.
The manifest contains public recipient routing metadata, static supported domains,
counts, envelope hashes and explicit limitations. Names, tax fields, file bytes,
legacy IDs, timestamps and old-to-new links remain inside ciphertext. Expense
snapshot IDs become their new object UUIDs; linked `receiptId` values become the
new receipt object UUID. The encrypted `legacy` section preserves original IDs,
and encrypted receipt links identify the new expense objects. These are export
snapshots, not automatically posted journal entries or a duplicate-free import.

## Deliberately incomplete coverage

The content-free report counts known selected-client exposure without copying
provider credentials, mutation caches, SDK tax rows or staff-only review evidence
into the client recipient. In particular, SDK internal/private fields must not be
shared merely because their `client_id` matches. Reviewer identities/review audit
rows are also omitted from exported document payloads.

Coach profile preferences and confirmed intake, plaintext conversation bodies,
and coach mutation metadata are counted for the selected account or linked client
and remain unsupported. No coach text or preparation facts are copied into this
export; existing coach reads and retained legacy copies remain exposure.

Audit and command snapshots are reported as unscoped workspace-wide presence;
their client ownership is not inferred by searching free text. Account identity
profiles, service-client profiles, bank transactions/credentials, Uber profiles,
facts/authorization state, other accounts, generic/custom fields, unclassified
files, device caches/exports, prior backups, filesystem history and provider copies
remain outside this supported subset. Counts and absence of known rows cannot
prove that old plaintext has disappeared.

Bounds are 100,000 backup files, 8 GiB total copied backup, 2 GiB per source file,
10,000 exported objects, 384 MiB aggregate serialized plaintext, and the existing
16 MiB ciphertext-per-object envelope bound. Receipt/document source limits remain
5/10 MiB. Exceeding a bound fails the whole preparation; no silent partial export
is marked ready.

Next steps require actual client decryption, explicit coverage review, an
authorized encrypted import with duplicate reconciliation, verified encrypted
backup recovery, and separately consented legacy removal/retention work. Recovery
of an encrypted export does not establish host-compromise protection while the
old readable copies or usable host-side provider authorizations still exist.
