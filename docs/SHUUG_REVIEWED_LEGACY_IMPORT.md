# Reviewed encrypted legacy import

The independent customer client can import the supported records from a signed
offhost preparation: driver trips/income/expenses, linked receipt files, and
submitted tax documents. File names, document bytes, original identifiers and
record links remain inside recipient encryption. Imports use the ordinary
customer-authorized ciphertext API; no general firm write bypass was added.

On the separate trusted firm computer, run `migrate-legacy-cli.mjs` with its
explicit copied-backup and offhost confirmations, the independently checked
backup-manifest SHA256, existing firm bundle/public pins, signed destination
manifest, expected routing file, passphrase file descriptor and a new output
directory. The command verifies and restores a disposable copy, authenticates
old encrypted documents, seals each supported item to both recipients and opens
it with firm recovery before writing the export. It never uploads or purges.

The expected routing JSON contains `accountId`, `clientId`, `manifestId` and
`minimumEpoch` for the enrolled destination. To migrate an older account into a
different private account, explicitly add **both** `sourceAccountId` and
`sourceClientId` after reviewing that mapping. The source IDs are only retained
inside encrypted provenance. Omitting both keeps the original account binding;
omitting one fails. Legacy names and email are not copied into sign-in tables.

Sign in and unlock that destination in the independent customer client. In
**Import a reviewed legacy backup**, add `export-manifest.json` and
`import-signature.json`, then use the same file control again to add every JSON
file from `objects`. The selections accumulate until review or clearing. The client
checks the firm signature, exact selected file set, hashes, account/key/current
manifest, authenticated envelopes, file bytes and linked objects. It opens all
selected items before permitting import. Review the private preview and its
unsupported counts, then select **Import reviewed records**.

The importer converts supported files into usable downloadable private files and
driver records into the existing record format, preserving encrypted legacy
provenance and receipt links. Deleted source records remain archived and are
excluded from current portal totals. This does not automatically post accounting
journals or certify old document-review status.

Each upload saves its encrypted retry before dispatch. Repeating the same backup
preparation produces stable destination IDs; an interrupted acknowledgement is
reconciled by comparing authenticated content. Identical existing objects are
retained, differing objects are refused, and deleted destinations cannot be
resurrected. A source already imported from a different backup requires separate
revision reconciliation. The importer never overwrites it automatically.

After upload, the client syncs and compares every supported object and downloads a
content-free reconciliation receipt. The receipt states the imported routing IDs,
counts and reopening result. It is not a certificate of complete migration,
backup restoration, agency approval or erasure. Each resulting object retains
firm recovery encryption and can be shared through the existing reviewed staff
workflow.

The browser accepts at most 10,000 selected objects, 96 MiB of selected encrypted
files and 64 MiB of total opened account content. Larger preparation exports need
a paged client or separately reviewed subdivision; they are refused before upload.
Locking clears the private preview. Interrupted encrypted retries remain in the
account-bound browser store until acknowledged or deliberately removed.

Remaining work includes legacy billing/accounting history, SDK tax rows and
reviews, identity/profile migration, provider authorizations and revocation,
coach/device caches, unclassified files, workspace-wide history, old logs and
retained backups. No source removal or physical erasure is performed. Real
custody, independent trust distribution, separately verified backup restoration
and an authorized installed rollout are still required.
