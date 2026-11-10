# Isolated AWS key custody for encrypted staff access

This package prepares a separate AWS key account for firm enrollment, staff grants,
read capsules and lost-device recovery. It uses the existing signed native v2
envelopes unchanged. Deployment and production key initialization have **not**
occurred. The account discovery attempt on 2026-11-07 returned
`InvalidClientTokenId`; no authenticated account or live AWS behavior was verified.

Source: `packages/secure-tax-client/cloud/aws/`. The existing crypto contract is in
[SECURE-TAX-STAFF-CONTRACT.md](SECURE-TAX-STAFF-CONTRACT.md).

## Account and trust boundary

```text
Separately distributed trusted client           Dedicated AWS key account
  creates its own client/staff key                  MFA human operator role
  exports public enrollment request                   | reviewed job + version + SHA256
  decrypts original v2 + staff capsule                 v
                                              private versioned jobs S3
Application/data host                                 |
  account identity, MFA, assignments             IAM-only approved Lambda alias
  original v2 ciphertext                              | KMS unwrap in memory
  signed public manifests/grants/capsules        private versioned custody S3
  no key-account credentials                     KMS-wrapped firm bundle
```

The CloudFormation rule rejects a deployment whose actual AWS account equals
`DataHostAccountId`. The worker independently checks those account IDs and the
invoked function account. Custody/jobs buckets and the KMS key explicitly deny
principals from the entire data-host AWS account. There is no Lambda URL, API
Gateway, public HTTP recovery service or cross-account Lambda resource grant.
Data-host IAM permissions alone cannot invoke this different account's function,
assume its operator role or decrypt/read its custody. The data-host credentials
currently on the developer machine are not used as key credentials.

The only normal entry is a same-key-account IAM user's `TrustedOperatorPrincipalArn` assuming
the generated operator role with `aws:MultiFactorAuthPresent=true`. That role can
upload selected jobs, invoke the `approved` alias and retrieve public results. It
cannot read custody objects or call KMS Decrypt directly. Its KMS permissions are
restricted to S3 encryption for the job bucket. The worker can unwrap the custody
bundle with an exact workspace/service encryption context and process approved
jobs, but cannot administer IAM, change its code, delete custody or delete results.

The trusted principal and deployment administrator must be independently reviewed.
Do not select a principal that the data-host account, data-host role, its credential
holder or an application CI job can assume or administer. Account separation does
not protect against a key-account administrator changing these controls. Keep the
key-account sign-in, MFA, role sessions and deployment authority off the data host.
The parameter accepts an IAM user ARN, not a role/federated session. Use that user's
MFA-authenticated STS AssumeRole flow, including the MFA device serial and token
where the selected sign-in method requires them. The strict MFA condition
intentionally fails closed for identity federation that does not provide that AWS
context key. Supporting Identity Center requires an
explicitly reviewed trust policy with equivalent assurance; removing the condition
is not an automatic workaround. AWS documents these context-key limitations in
[IAM global condition keys](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_condition-keys.html#condition-keys-multifactorauthpresent).

## Private material and recovery

An explicit `initialize` job generates a new firm signer and recovery pair **inside
the key function**. A random unlock passphrase and the existing passphrase-encrypted
firm bundle are encrypted together by KMS. Only that KMS ciphertext is saved at
`custody/firm.json`; the outer S3 object also uses SSE-KMS. The small bundle is
bounded to the KMS Encrypt 4,096-byte limit. Decryption requires the exact
`{workspaceId, service: "shuug-key-custody-v1"}` context. Encryption context is public
metadata, so use an opaque workspace ID. See [KMS Encrypt](https://docs.aws.amazon.com/kms/latest/APIReference/API_Encrypt.html).

The unlock string, private keys, DEKs and authenticated plaintext exist transiently
only in the trusted function's memory. The worker never returns them, writes them
to disk, sends them to the application host or logs inputs/errors. Mutable bundle
bytes are zeroed after each job. JavaScript and Lambda memory management do not
provide a guarantee that every string or internal crypto allocation is erased.
The key-service runtime, dependencies and administrators remain trusted and can
access keys/plaintext if compromised. This is software key custody with a KMS
wrapping key; the firm HPKE/signing keys are not nonexportable HSM keys.

Initialization uses an exclusive object write. Retries return the original public
pins and never replace existing firm keys. Existing offline firm bundles cannot be
silently imported through jobs. A preexisting deployment needs a separately
reviewed migration; generating unrelated replacement pins would strand its data.

Recovery creates a grant for the replacement device key, a fresh capsule for the
selected original envelope and a signed revocation for the old grant. Publish the
revocation and replacement grant/capsule through the application's owner-MFA
controls. Each additional object/revision needs its own `share` job/capsule. The
job never changes the original client envelope or gives staff the client/recovery
private key. Expired prior grants need a reviewed `archiveValidAt` for offline
historical verification; new manifests, grants and capsules must be current.

Revocation cannot retract plaintext or a DEK already copied by a previous reader.
The storage host can still withhold data. First-use protection from a malicious
host replaying an old but signed active grant requires an independently current
checkpoint; this package does not claim to supply one.

## Build a reviewable artifact locally

Use the already installed, lock-matched secure-client dependencies. These commands
do not contact AWS, download packages, generate production keys or create resources:

```sh
node packages/secure-tax-client/cloud/aws/validate.mjs
node --test packages/secure-tax-client/cloud/aws/cloud.test.mjs
node packages/secure-tax-client/cloud/aws/build-artifact.mjs --output /private/tmp/shuug-key-server-review-NEW
```

The output directory must be new. It contains `lambda.zip`, `cloudformation.json`,
`bootstrap.json` and `artifact-manifest.json`. The deterministic ZIP fixes ordering
and ZIP timestamps, excludes credentials/configuration, and records every file's
SHA256. It includes the reviewed existing crypto files plus `@hpke/core` 1.10.0 and
`@hpke/common` 1.11.0. It refuses installed versions that differ from the lock.

Node.js 24 and AWS SDK v3 are supplied by the AWS runtime, outside the ZIP hash.
The template defaults both reviewed SDK versions to `REVIEW_REQUIRED`; key jobs
fail until actual deployed versions are recorded and approved. `runtime-info`
is the only supported preapproval operation and returns Node/S3 SDK/KMS SDK versions
without unwrapping custody. Runtime updates use `FunctionUpdate`, and code is
published as an immutable Lambda version with an expected ZIP `CodeSha256`.
`ConfigurationRevision` changes the function environment and is included, along
with the reviewed SDK versions, in the version description. This ensures an actual
configuration update before republishing and moving `approved`; a description-only
version change would not be sufficient for Lambda's publish-version behavior.
Record the platform's actual `RuntimeVersionArn` as well as these versions in the
deployment evidence. An update can change that platform and needs renewed review.
AWS describes runtime-included SDK versions and update modes in
[Node.js runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
and [runtime updates](https://docs.aws.amazon.com/lambda/latest/dg/runtimes-update.html).

The source validator checks explicit policy properties and JSON structure. Tests
run real local cryptography with synthetic keys and an injected provider; they
cover enrollment, staff decryption, lost-device recovery, rejected recipient keys,
immutable job selection, idempotency and a standard ZIP reader/import. Neither
is AWS service-side CloudFormation validation or a live IAM/KMS/S3/Lambda test.

## Deployment after account authorization

No commands in this section have been executed as part of this preparation.
Use a trusted operator workstation or dedicated deployment environment, not the
application/data host. An AWS CLI or equivalent signed tooling is required there;
none was installed for this package.

1. Sign in with an authorized key-account deployment principal. Use
   `aws sts get-caller-identity --profile KEY_ADMIN` and independently record its
   account, the actual data-host AWS account and region. The accounts must differ.
   Review the trusted principal's identity/trust and all ways it can be assumed.
   Confirm there is no data-host trust chain through any custody-account role,
   shared administrator credential,
   key-account role credential on the data host or app CI deployment permission.
2. Obtain the applicable current AWS SOC 2 report from AWS Artifact. Confirm the
   chosen region and all services used are within the required scope. Review
   organizational logging, KMS deletion controls, break-glass access, retention,
   billing alerts and tested restore procedures with the responsible owner. Check
   Lambda `GetAccountSettings` in the chosen region: reserving one concurrent
   execution needs capacity above the 100 executions AWS keeps unreserved. Fresh
   accounts with a lower quota need an approved quota increase before deployment;
   keep the one-worker serialization invariant. See
   [PutFunctionConcurrency](https://docs.aws.amazon.com/lambda/latest/api/API_PutFunctionConcurrency.html).
3. Run AWS `cloudformation validate-template` on both generated templates, review
   a change set and the policies. Deploy `bootstrap.json` to create only a private,
   retained, versioned artifact bucket. Upload `lambda.zip` and record its immutable
   object VersionId and the manifest's `artifactSha256Base64`. This first stack has
   no firm keys. Its staging bucket uses SSE-S3; the ZIP contains only public code.
4. Prepare a CloudFormation parameter JSON file using the table below. Create and
   review the main stack change set with `CAPABILITY_IAM`. It creates billable
   resources, IAM roles and the KMS wrapping key but does not initialize firm keys.
   Execute it only with authorized deployment approval. Keep all stack outputs:
   they contain public IDs/ARNs, never private keys or unlock values.
5. Assume `OperatorRoleArn` with the trusted principal's MFA session. Invoke
   `ApprovedFunctionArn` synchronously with `{"version":1,"operation":"runtime-info"}`.
   Check the response, and independently record Lambda configuration,
   `CodeSha256`, runtime version ARN, region, SDK versions, alias/version and IAM
   policies. Review those SDK/runtime versions. Update the stack's reviewed SDK
   versions and increment `ConfigurationRevision`; verify the alias points to the
   newly published reviewed version. An SDK mismatch keeps all key work disabled.
6. Prepare and independently review the explicit `initialize` job below. Process
   it using the normal immutable-job procedure. Distribute its public signer and
   recovery pins through the separately trusted client release channel; never
   download an unsigned replacement trust config from the application host.
7. Run a synthetic live enrollment/share/recovery using no taxpayer data. Verify
   KMS/S3/function access from the real data-host principal is denied; verify owner
   publication, replacement staff decryption, retained signed revocation and the
   unchanged native v2 client path. Review CloudTrail events and restore from the
   retained KMS-wrapped custody version before accepting production custody.

| Main parameter | Reviewed value |
| --- | --- |
| `ServiceName` | Unique lowercase function name, default `shuug-key-custody` |
| `WorkspaceId` | Existing opaque workspace ID |
| `DataHostAccountId` | Actual AWS account whose credentials serve the data host |
| `TrustedOperatorPrincipalArn` | Reviewed existing IAM user ARN with MFA in the key account |
| `ArtifactBucket`, `ArtifactKey`, `ArtifactObjectVersion` | Exact uploaded code object/version in the same region |
| `ArtifactSha256` | Base64 SHA256 from `artifact-manifest.json`, not hexadecimal |
| `ReviewedS3SdkVersion`, `ReviewedKmsSdkVersion` | Initially `REVIEW_REQUIRED`, then exact reviewed runtime versions |
| `ConfigurationRevision` | Incremented whenever approved runtime/environment settings change |

The account guard is validated by both CloudFormation and the worker; see
[CloudFormation Rules](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/rules-section-structure.html).
Do not bypass it by inventing a different data-host account value.

## Reviewed job and result protocol

Jobs may contain public requests and already encrypted client objects only. Never
put passphrases, private JWKs, plaintext tax data or AWS credentials in job files,
review references, IDs or environment variables. All inputs remain subject to the
existing strict crypto validation. A job is bounded to 30 MiB.

```json
{
  "version": 1,
  "jobId": "new-opaque-unique-job-id",
  "workspaceId": "opaque-workspace-id",
  "operation": "initialize",
  "approval": {
    "reviewed": true,
    "reviewReference": "independent-approval-reference",
    "recipientKeyId": null
  },
  "input": {}
}
```

For other operations `recipientKeyId` must equal the independently verified target
public-key fingerprint. It is the new key for `recover-device`. An operator must
verify the real staff/client identity, workspace/account/client scope, key
fingerprint, requested read domains, epoch and current manifest independently of
the storage host. `reviewed: true` and the confirmation flag record this human
attestation; they do not perform identity verification or two-person approval.

| Operation | Exact `input` fields | Result |
| --- | --- | --- |
| `initialize` | `{}` | `publicPins`, `existingCustodyPreserved` |
| `enroll` | `expectedPins`, `request`, `epoch` | Signed client `manifest` |
| `grant` | `expectedPins`, `request`, `options: {epoch, domains}` | Signed active staff `grant` |
| `share` | `expectedPins`, `envelope`, `manifest`, `grant`, `expected` | Signed read-only `capsule` |
| `approve-return-edit` | `expectedPins`, `proposal`, `sourceEnvelope`, `manifest`, `grant`, `expected`, `reviewedCommitment`, `reviewReference` | `approvedReturnEdit: {approval,envelope,capsule}` |
| `approve-return-create` | `expectedPins`, `proposal`, `manifest`, `grant`, `expected`, `reviewedCommitment`, `reviewReference` | `approvedReturnCreation: {approval,envelope,capsule}` |
| `revoke` | `expectedPins`, `grant`, `epoch`, `archiveValidAt` | Signed `revoked` grant at the selected greater epoch |
| `recover-device` | `expectedPins`, prior `grant`, new `request`, `epoch`, `envelope`, `manifest`, `expected`, `archiveValidAt` | New `grant`, new `capsule`, old `revoked` at prior epoch + 1 |

`expectedPins`, request and expected context shapes are the same as the offline
crypto API in the staff contract. `archiveValidAt` is `null` for a current prior
grant, or a reviewed archived UTC valid time when the prior grant has expired.
The new request remains for the same account/client/staff and must use a different
device key. A new grant ID gets its own monotonically managed epoch. The offline
signing APIs supply current validity dates; the worker cannot accept a caller's
clock override or arbitrary signing operation.

For `approve-return-edit`, `recipientKeyId` identifies the assigned preparer's
grant key, and the input review reference must match the job's approval review
reference. Review the private before/after file on the trusted operator device;
use `prepare-return-edit-job.mjs` to select only the opaque proposal/source and
public metadata. Never upload that private review file or its readable values.
The worker reconstructs the review commitment from authenticated encrypted
content. See the [correction workflow](SHUUG_RETURN_CORRECTIONS_20261109.md).

`approve-return-create` uses the same reviewed preparer fingerprint/reference
and opaque-job rules, with no source envelope. Use `prepare-return-create-job.mjs`
on the operator computer after reviewing the exact private new-return kit. The
worker decrypts that proposal and verifies the salted reviewed draft commitment;
the owner API independently checks that its target object ID is unused.

For each job, while using the operator role:

1. Write/review a local JSON file. Upload those exact bytes to
   `s3://JOB_BUCKET/jobs/JOB_ID/request.json` using `aws s3api put-object` with
   `--server-side-encryption aws:kms --ssekms-key-id CUSTODY_KMS_KEY_ARN` and record
   the returned VersionId. Bucket policies reject missing/wrong encryption headers.
2. Retrieve the selected version with `aws s3api get-object --version-id VERSION_ID`
   into a new local file. Compare/review those exact bytes, fingerprints and scope.
   Build the approval event from that reviewed copy:

   ```sh
   node packages/secure-tax-client/cloud/aws/review-job.mjs --job REVIEWED_JOB.json --version-id IMMUTABLE_VERSION_ID --out NEW_EVENT.json --confirm-identity-and-fingerprint
   ```

   It writes an event containing only
   `{version, jobId, jobVersionId, approvedSha256}`. Never choose an unversioned
   object or accept a checksum supplied only by the data host.
3. Invoke the `approved` alias synchronously with that event, for example
   `aws lambda invoke --function-name APPROVED_FUNCTION_ARN --payload fileb://NEW_EVENT.json NEW_RESPONSE.json`.
   Inspect the response **body**: a transport exit code alone is insufficient.
   `{ok:false,error:"KEY_JOB_FAILED"}` means no success is established; original
   exception details are intentionally not returned/logged. Diagnose public
   configuration and input validation without adding raw-input/key/error logging.
4. On `{ok:true}`, retrieve exactly the returned `resultVersionId` from
   `results/JOB_ID.json`. Check its `jobId`, `jobVersionId`, `approvedSha256`,
   operation and review reference against the approval. Verify the result
   signatures and pinned public keys with the trusted client before owner
   publication. Keep the receipt in independently controlled audit evidence.

Unique job IDs and exclusive writes prevent accidental result/custody replacement.
An identical event can return its existing result; a different version/hash for a
used job ID fails. This is a single-workspace service. Explicit human review, the
application's current authorization and the signed grant epochs remain necessary;
the key worker does not consult the storage host's account/employee database.

## Operations, cost and compliance limits

There is no EC2 instance, public recovery listener or NAT gateway in this template.
Cost comes from [Lambda requests and execution](https://aws.amazon.com/lambda/pricing/),
the [KMS key and API operations](https://aws.amazon.com/kms/pricing/),
[S3 storage/requests/version history](https://aws.amazon.com/s3/pricing/) and
[CloudWatch ingestion/retention](https://aws.amazon.com/cloudwatch/pricing/).
Additional organization audit services and transfer may add charges. Reserved
concurrency limits simultaneous workers, not total invocation/storage cost. Select
region/volume and review a current estimate before provisioning; no fixed monthly
price or free operation is promised.

The template retains the wrapping key, custody/jobs buckets and published versions
on stack deletion/replacement. This protects against an ordinary stack deletion,
not a privileged administrator or KMS key deletion. There is no automatic lifecycle
purge, cross-region copy, independent backup, alarm or organization CloudTrail setup.
Version history grows. Before production, configure and test retention/restore,
key-deletion protection/approval, account recovery, CloudTrail management plus
relevant Lambda/S3 data events, monitoring of failed responses, role/code changes,
cost alerts and operator incident procedures. Logging must not capture payloads,
taxpayer information, secrets or recovered content. A single retained KMS key is
still an availability dependency; losing its decrypt authority loses custody.

AWS lists Lambda, KMS, S3, IAM and CloudWatch in its
[SOC services scope](https://aws.amazon.com/compliance/services-in-scope/SOC/).
The actual current report and chosen region/service configuration must be reviewed
in AWS Artifact. AWS's [Lambda compliance guidance](https://docs.aws.amazon.com/lambda/latest/dg/security-compliance.html)
also assigns customers responsibility for their application controls. This package
does **not** make Shuug, the tax service or its operating processes SOC 2 certified.
No AWS service-side template validation, deployed runtime attestation, access-denial
probe or live key recovery has passed yet. Authorized AWS sign-in is the next
external prerequisite.
