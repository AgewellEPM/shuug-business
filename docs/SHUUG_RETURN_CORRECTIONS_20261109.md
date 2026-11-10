# Encrypted initial returns and corrections

This extends the draft preparation pack for individual/self-employed and business
returns. An authorized preparer can propose corrections to an existing 2025
return. The firm reviews and approves one exact revision outside the app/data
host. An MFA-authenticated owner publishes the encrypted replacement and its
fresh signed read capsule in one transaction. Original native v2 envelopes and
v1 staff grants remain unchanged; the preparer's grant still says `rights:read`.
This is a bounded return workflow, not general encrypted office editing.

## Preparer-created initial returns

The November 10 extension lets a preparer start a 2025 individual/self-employed
or business return without an existing shared return object. Select a current
signed tax-document scope and choose **New client return**. Use the ordinary
fields and select the appropriate return family; corrections still keep the
original family fixed. **Discard new return** clears this local input. Refresh
pauses until the proposal is saved or discarded.

Saving downloads a private new-return review kit. Its readable draft and salt
remain on trusted devices; the client sends no draft to the app host. A fresh
signed manifest comes from the caller's current scope and is checked against
the independently installed pins and remembered enrollment epochs. No new keys,
enrollment or customer account are silently created.

The creation protocol has separate strict types, canonical purposes and HPKE
info (`shuug/secure-tax-return-create-proposal/v1`). Its private review binds
`before:null`, the exact new draft, a random 32-byte salt, object/client/account,
manifest/grant identities and epochs and the preparer's key. The firm decrypts
the proposal and reconstructs that commitment before signing revision 1 and a
fresh read capsule. Existing correction source checks are unchanged.

On the separate firm computer, use the same explicit review inputs as below:

```sh
node return-create-offline-cli.mjs \
  --confirm-off-host --confirm-fields-reviewed --passphrase-fd 3 \
  --bundle FIRM_BUNDLE.json --public-pins PUBLIC_PINS.json \
  --kit PRIVATE_NEW_RETURN.json --reviewed-sha256 REVIEWED_FILE_SHA256 \
  --review-reference OPAQUE_REVIEW_ID --out NEW_APPROVED_PACKET.json
```

For separate-cloud custody, `prepare-return-create-job.mjs` takes the same
public-pins/private-kit/reviewed-hash/review-reference options plus `--job-id`
and `--out`, with `--confirm-fields-reviewed`. It prepares an opaque
`approve-return-create` job; never upload the readable review kit. The existing
immutable-version/MFA worker returns `approvedReturnCreation` containing only
`{approval,envelope,capsule}`. Publish that packet through the owner's trusted
client after its signature and capsule are verified locally.

The API requires owner MFA and the exact current assignment/enrollment. It
commits only an unused object ID with expected revision 0. Existing live IDs
and deleted IDs cannot become initial returns. A repeated identical approval
returns the original receipt without replacing later client changes or sharing
capsules. Capsule failure cannot leave a partial object/audit write.

This completes initial return origination, not encrypted document review,
office books, package authorization or filing. Exact development evidence is in
`verification/return-origination-20261110.json`. Real custody activation and
installed/visual office acceptance remain unverified.

## Preparer and owner workflow

1. In the independently trusted staff client, unlock the assigned device and
   open a currently shared return. Choose **Propose return correction**. The
   editor fixes the original return family and year. Refresh pauses while the
   proposal is open so it cannot replace unsaved entries. **Discard correction**
   clears the local input and resumes refresh without publishing it.
2. Save the **private correction review kit**. It contains readable before/after
   taxpayer data and a random review salt. Keep it on trusted staff/review
   devices; never upload it to the app/data host or the cloud job bucket. The
   client rechecks the active grant and exact source revision before creating it.
3. A trusted operator reviews the actual fields and independently verifies
   identity, public pins, assignment, scope and source. Record the SHA-256 of
   those exact reviewed file bytes, then use one custody option below.
4. In the trusted staff client, an MFA-authenticated owner selects the resulting
   public encrypted approval packet. The client verifies its exact framing,
   pinned signature and capsule before upload. A private review kit is refused
   before a request is made. Publication rechecks current owner/staff authority,
   signed enrollment, grant, source digest/revision and compare-and-swap state.
5. The client and assigned preparer can refresh the approved revision. The
   matching capsule is committed with the ciphertext, so no second sharing step
   is needed. An exact retry returns its original receipt without replacing a
   newer client revision or capsule. A changed return requires a fresh review.

The ordinary form fields use the same local draft calculator and explicit
coverage diagnostics as customer entry. Saving a proposal does not establish
tax accuracy, complete a review or publish anything. Lock/sign-out removes the
in-memory editor; an explicitly downloaded private file remains on its device.

## Separate firm computer

Use the standalone kit from `build-offline-kit.mjs` on the separately trusted
computer. It contains the fixed CLI/crypto sources and locked dependencies,
excluding app/browser code, account configuration and private keys. No network
is used by this command; outputs are created exclusively with mode 0600.

```sh
node return-edit-offline-cli.mjs \
  --confirm-off-host --confirm-fields-reviewed --passphrase-fd 3 \
  --bundle FIRM_BUNDLE.json --public-pins PUBLIC_PINS.json \
  --kit PRIVATE_REVIEW.json --reviewed-sha256 REVIEWED_FILE_SHA256 \
  --review-reference OPAQUE_REVIEW_ID --out NEW_APPROVED_PACKET.json
```

Supply the bundle passphrase through an already-open private file descriptor,
not command text or an environment variable. The selected bundle and public
pins must belong to the existing firm. The command checks the reviewed file
hash, decrypts the actual original and proposed content, reconstructs the salted
review commitment, then signs the exact replacement. It emits only
`{approval,envelope,capsule}`; the readable review file is not copied into it.

## Separate cloud account

Keep the private review kit on the trusted operator computer. Prepare an opaque
job locally with the same separately reviewed pins and file hash:

```sh
node prepare-return-edit-job.mjs \
  --confirm-fields-reviewed --public-pins PUBLIC_PINS.json \
  --kit PRIVATE_REVIEW.json --reviewed-sha256 REVIEWED_FILE_SHA256 \
  --review-reference OPAQUE_REVIEW_ID --job-id UNIQUE_JOB_ID \
  --out NEW_ENCRYPTED_JOB.json
```

Only the encrypted proposal/source, signed public documents, scope and salted
commitment enter that job. Readable values and the review salt stay out. Follow
the immutable S3-version/MFA review and invocation procedure in
[the AWS key-service guide](SECURE-TAX-AWS-KEY-SERVER.md). The worker requires
`approve-return-edit`, the preparer's independently verified key fingerprint,
and matching job/input review references. It returns `approvedReturnEdit` with
the same three-field public packet. The owner publishes that packet, not the
whole worker receipt. Firm key custody and transient decryption occur only in
the separately controlled worker, never in the app/data host.

No real key-account resources or production firm keys were initialized by this
work. Both custody options remain supported. Switching an existing firm between
them needs an explicit migration/recovery design; a new initialization makes
different public pins and does not recover existing encrypted records.

## Protocol and verification boundaries

`return-edit-contract.mjs` defines strict versioned proposal and approval framing
separately from the frozen native/read contracts. HPKE Auth proposal info is
`shuug/secure-tax-return-proposal/v1`. Its AAD binds workspace, client/account,
object/source revision and digest, manifest/grant identities and epochs, preparer
key, salted review commitment and a lifetime of at most one day.

The private commitment covers canonical before/after values, the full binding and
a random 32-byte salt. The salt is encrypted in the proposal and appears only
in the private review file. A legitimate preparer cannot get a false claimed
original approved: the firm reconstructs the review from the authenticated
original and decrypted proposal. HPKE Auth does not supply nonrepudiation
against a compromised trusted recipient; independent review remains necessary.

The firm encrypts the replacement to the original client and firm recipients
using the existing `firm-recovery` author role at source revision + 1. Its ES256
approval binds both source and replacement digests, assignment and an opaque
review reference. A fresh normal signed capsule binds the new ciphertext to the
same preparer. Server publication is atomic, metadata-only audits identify the
owner, and tombstoned object IDs cannot be reused by a fresh write.

Synthetic verification exercises original-client and firm decryption, a real
Swift/CryptoKit client opening the Node-approved replacement, private-kit CLI and
cloud job preparation, cloud approval, strict owner publication, stale/revoked
denial, idempotence after later client changes, deletion, and backup/restart.
The prepared client also executes in a Node V8/DOM model; that is not Safari or
visual acceptance. Exact evidence is in
`verification/return-corrections-20261109.json`.

The installed service belongs to a separate checkout with newer native and
telemetry work and has not been replaced. Real office/key activation, trusted
enrollment/migration, independent security/tax review, complete return schedules,
states and actual IRS/state filing remain open. Payments stay deferred.
