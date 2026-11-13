# Exact-package authorization evidence

The encrypted case workflow now records a preparer's review of an uploaded signed
authorization PDF. It binds the actual file bytes to the exact case, return,
reviewed sources and linked book version. Client and preparer see the same
current, stale or unavailable status. This is reviewed evidence handling, not a
new electronic signature service or approval to transmit a return.

## Ordinary workflow

After resolving source, shared-book and draft reviews, choose **Record reviewed
authorization evidence** in the staff case editor. Select the opened PDF, record
the reviewed signature method, date and signers' capacities, and confirm review
of the actual signatures and their match to this package. Save the private kit.
The independent firm operator inspects the actual PDF and the reconstructed
package, approves it separately, and the MFA-authenticated owner publishes only
the encrypted approved packet and read capsule.

Both the preparer and firm approval implementations independently recompute the
package digest and signed-PDF digest. Scope includes workspace, account, client
and case. The package retains case facts and business history; recording the
authorization review itself does not change its digest. Authorization cannot
be created by a generic client replacement of the certified case.

Changes to case content, a linked return, required source, or shared ledger make
the reviewed authorization stale. Fee-only updates preserve it. After a changed
package is reviewed, the old authorization cannot be reused: retained history
checks both its document ID and the digest of its actual bytes. Renaming and
reuploading identical bytes under a new ID do not evade that case's history.
New signed evidence must use a new upload. Prior review facts remain retained.
Deleted signature evidence is shown as unavailable, never as current approval.

## Boundaries still outstanding

- A staff confirmation does not authenticate a human signature, prove identity,
  choose the required federal/state form, establish all required signers, or
  meet an external provider's electronic signature requirements. Those remain
  the reviewed signing process and future provider integration.
- Reuse detection is within the certified case history, not a global cross-firm
  signature registry. Current status depends on the currently verified opened
  records; an offline certificate records a historical review, not a guarantee
  that no other dependency has since changed.
- The case retains file references and digests. The signature PDF remains an
  encrypted uploaded object, so deleting it makes the review unavailable. An
  immutable retention archive and a complete withdrawal workflow are still
  needed for the final filing product.
- Current tax output is still a partial 2025 federal draft. Every projection and
  package stays `filingReady:false`. No return was transmitted, e-signature was
  created, external identity service was invoked, or real signature was used.

IRS authorization and identity/retention requirements are separate from a local
checkbox or a package hash. See the [IRS signature authorization FAQ](https://www.irs.gov/e-file-providers/frequently-asked-questions-for-irs-efile-signature-authorization)
and [Form 8879 guidance](https://www.irs.gov/forms-pubs/about-form-8879).

## Execution evidence

[Receipt](verification/authorization-evidence-20261112.json): 168 Node checks
pass, one unchanged full native-journal helper is skipped. Both families run the
ordinary form → encrypted proposal → firm approval → publication → client/staff
projection path. Tampered package context/file bytes, missing signature review,
invalid signer/date facts and old-file reuse are rejected. The standalone kit
approves and inspects authorization evidence; the cloud worker processes it
using a synthetic provider. The packaged client executes 101 ESM modules.

The compiled host fixture passes 377 checks, including both families' signed
evidence, fee-only updates, shared-book invalidation, rejected signature reuse,
new evidence, private-host metadata scanning and backup/restore. All data and
keys are synthetic. The public host protocol and installed service are unchanged.
Safari, real custody/TLS, real signature acceptance and installed office use
remain unverified. The full product remains a prototype.
