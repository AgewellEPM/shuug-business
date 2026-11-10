# Encrypted tax cases and document review

The independent staff client now connects document requests, exact uploaded-file
reviews and a matching draft return in an encrypted case. It supports the
existing 2025 federal 1040/Schedule C, 1065, 1120-S and 1120 draft families.
The customer and assigned preparer see the same verified case facts within
their current read scope. This is a source and synthetic-execution milestone;
the installed office service has not been upgraded.

## Office path

1. Unlock the separately distributed staff client and select a current signed
   client assignment. Use **Client case work** to create a case or select an
   existing verified case. All case titles, history and notes are client-visible
   inside encryption. Dates are staff targets, not statutory filing deadlines.
2. Add a document request. After the client uploads a supported private file and
   the firm shares its exact revision, select that opened file and record either
   **Reviewed** or **Replacement requested**, with a client-visible note.
3. Link an opened draft with the same year and return family. Initial drafts can
   use the existing [preparer origination path](SHUUG_RETURN_CORRECTIONS_20261109.md).
4. Save the private case review kit. It contains readable before/after case facts,
   the exact command and, where applicable, the selected file or draft. Move it
   through the firm's private review channel to its separate key environment.
5. The firm operator reviews the fields and actual selected evidence, approves the
   exact kit, and returns only the public approval/envelope/capsule packet.
   An owner with MFA publishes that packet. Publication atomically installs the
   encrypted case revision and fresh preparer read capsule.

Each action requires separate firm approval. A preparer read grant does not gain
write rights. Unsaved case input pauses automatic refresh and has a discard
control; locking or changing scope clears private forms. Customer upload/edit
controls do not alter a case or erase its history.

## Exact reviews and retained history

The four commands are `case.create`, `request.add`, `document.review` and
`draft.link`. Private history retains every command's complete input, actor and
timestamp. Replacing a review or draft link retains the prior decision and exact
reference. Replaying history must reproduce the current case body.

A reference binds object ID, revision, domain and SHA-256 envelope digest.
Both readers derive **current**, **stale** or **unavailable** from their currently
opened records. An unreviewed request stays unreviewed. A changed file makes its
review stale; a missing/deleted or unshared source is unavailable. Partial staff
scope cannot establish that an unseen source is current. Changed drafts require
a new approved link. Completion means at least one requested document, every
request reviewed against its current source, and a current matching draft link.
It always has `filingReady:false`.

The operator's approval authenticates the declared draft and case transition;
it does not establish tax calculation accuracy, client signature authorization,
statutory completion or permission to file. Existing draft-engine coverage limits
remain in force. The server cannot inspect encrypted dependency relationships;
it checks case revision consistency while trusted readers compute source freshness.

## Private proof and server boundary

The encrypted payload is `{version:1,type:'tax-case',body,certificate}`. Its
dedicated ES256 firm content certificate signs the complete canonical private
body, actor, issuance time and exact workspace/account/client/object/revision/
domain context. Its purpose is `shuug/private-tax-case-certificate`; it is not an
HPKE author-role assertion or a read capsule. Verified content is snapshotted and
frozen before use. A historical certificate has no expiry; current access still
requires current enrollment, grants and capsules. History length equals revision.

Case IDs use the reserved `shuug-case:` namespace. Certificates, proposals and
approvals enforce it. Both readers refuse ordinary-file substitution at these
IDs. Generic customer writes/retries/deletes and server generic PUT/DELETE refuse
reserved IDs even before case publication. The case registry stores only account
and object IDs. Case archival/removal needs a future explicit firm workflow.

`POST /api/website/customer/secure/staff/cases` accepts exactly
`{approval,envelope,capsule}`. It requires owner MFA before reading the body,
independent public pins, valid firm approval/signature/lease, current staff role,
assignment, enrollment and read grant, and an exact source compare-and-swap.
Creation requires an unused, never-deleted ID. Updates require registered case
ownership. Exact retries preserve later history and capsules. Audit metadata
contains only the public approval and capsule ID; command, notes, dependency IDs,
review decisions and private certificate remain encrypted.

Existing native v2 envelope framing and v1 staff read contracts are unchanged.
Revocation cannot erase already downloaded plaintext. Local monotonic history
detects known rollback; a first-use device still needs an independent current
authority checkpoint to establish freshness against a compromised host. See the
[staff contract](SECURE-TAX-STAFF-CONTRACT.md).

## Separate-computer and separate-cloud review

Both public-code custody packages include the case path. Neither initializes a
real firm or changes an existing firm's pins. Run operator commands only in the
separately controlled environment, with independently delivered public pins.

Inspect a privately transferred kit without unlocking firm keys:

```sh
node inspect-case-review.mjs --public-pins PUBLIC-PINS.json \
  --kit PRIVATE-CASE-KIT.json --out NEW-PRIVATE-REVIEW-DIRECTORY
```

The inspector creates a new mode0700 directory and mode0600 files. Review
`review.json` and the fixed-name `selected-evidence.pdf`, `.jpg`, `.png`, `.csv`,
or `selected-draft.json`, if present. It also writes the exact original bytes as
`private-kit.json` and their SHA-256 in `kit-sha256.txt`. Open extracted evidence
using the firm's trusted document tools. No viewer launches automatically;
embedded filenames cannot select output paths. Existing outputs are refused.
Readable candidate evidence is checked against the decrypted proposal again
during final firm approval. Inspection alone is not approval.

After reviewing the fields and evidence, use the copied `private-kit.json` and
its exact hash. The separate-computer command is:

```sh
node case-offline-cli.mjs --confirm-off-host --confirm-fields-reviewed \
  --passphrase-fd 3 --bundle FIRM-BUNDLE.json --public-pins PUBLIC-PINS.json \
  --kit PRIVATE-REVIEW-DIRECTORY/private-kit.json --reviewed-sha256 REVIEWED_HASH \
  --review-reference OPAQUE_REVIEW_ID --out NEW-PUBLIC-APPROVAL.json
```

Descriptor 3 must already be supplied by the firm's trusted secret-entry method;
never place a passphrase in arguments, environment or shell history. Final
approval decrypts the actual source/proposal/evidence, validates scope and source
capsules, reapplies the command and reconstructs the salted review commitment.
A modified candidate or mismatched selected file cannot obtain approval.

For separate-cloud custody, prepare an opaque reviewed job:

```sh
node prepare-case-job.mjs --confirm-fields-reviewed --public-pins PUBLIC-PINS.json \
  --kit PRIVATE-REVIEW-DIRECTORY/private-kit.json --reviewed-sha256 REVIEWED_HASH \
  --review-reference OPAQUE_REVIEW_ID --job-id OPAQUE_JOB_ID --out NEW-JOB.json
```

The operation is `approve-case-transition`; its result has
`approvedCase:{approval,envelope,capsule}`. Follow the existing independently
reviewed immutable-job/MFA/pin process in the
[cloud guide](SECURE-TAX-AWS-KEY-SERVER.md). The job contains encrypted proposal
evidence and an opaque review commitment, never readable action/evidence links
or the private review kit. Use opaque identifiers without taxpayer information.
Only the public packet belongs in the owner publication control.

## Bounds and acceptance limits

Case bodies are limited to 128 KiB, 100 requests and 256 retained actions,
whichever is reached first. No history is silently truncated. One selected file
can be up to 10 MiB (CSV 2 MiB), private evidence JSON up to 20 MiB, an opaque
cloud job up to 30 MiB and the private review kit up to 64 MiB. Size and format
checks do not constitute malware inspection. The fresh local worker-only fixture
approved a 24,865,900-byte opaque job for a 10-MiB selected file in 5.2 seconds,
with 1,346.2 MiB peak RSS reported by Node's OS resource counter. The prepared
cloud allocation is now 2,048 MiB with a 60-second timeout and concurrency one;
the old 512-MiB allocation was insufficient for this observed workload. Fixture
preparation is excluded from that measurement. AWS SDK/KMS/S3, Lambda overhead,
actual runtime/capacity and cost remain unqualified; no resources were deployed.

Evidence is in [the implementation receipt](verification/encrypted-cases-20261110.json).
It separates client/custody/model tests, actual Swift decryption, compiled HTTP,
packaged V8/DOM execution and local worker resource measurement. These do not
supply Safari/visual acceptance, physical custody, real separate-account AWS
execution, independent security/tax review or IRS/state approval.

Encrypted books, firm receivables/balance projections, exact-package client
authorization, case archive, organizer/reminder delivery and real filing remain
unfinished. Real custody/enrollment/migration and a reconciled installed rollout
remain pending. Payments stay pending. No real taxpayer data or production keys
were used for this checkpoint.
