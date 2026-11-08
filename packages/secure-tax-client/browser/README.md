# Independent browser vault foundation

This is a static client artifact, separate from the Next.js ciphertext API. It
does not enable encryption for existing users or migrate plaintext records. New
enrollment is deliberately unavailable in this UI. A verified signed manifest
can be staged locally. Object sync is available only for an already enrolled
account with the matching client key.

## Build without a browser runtime or bundler

From `packages/secure-tax-client`, use the existing locked dependencies:

```sh
node prepare-browser.mjs --output /private/tmp/gig-tax-browser-disabled
node prepare-browser.mjs --config /path/to/independent-public-pins.json --output /path/to/new-static-artifact
node --test test/browser.test.mjs
```

The first command produces a disabled artifact. A configured build needs exactly
the public fields in `trusted-config.example.json`: explicit, different HTTPS
client/API origins, workspace ID, signing public key, and firm recovery public
key. The static client origin must match the browser's actual origin. Neither
public pin may come from the API, an API response, URL parameter, or runtime
download. Signing, recovery, and client keys must differ. Provision and verify
pins out of band before publishing any client.

The script copies local lock-pinned HPKE ESM dependencies and their licenses. It
downloads nothing and uses no CDN, bundler, service worker or analytics. It emits
CSP/referrer/permissions headers in `_headers` and `vercel.json`; the selected
static host must actually serve them, including `frame-ancestors`. The meta CSP
is only a partial fallback. No
hosting or deployment is performed by this build.

The client/API must have separately controlled delivery and credentials. Merely
using two names owned by the same compromised delivery plane is insufficient.
Trusted client-script compromise can use a nonextractable key; nonextractable
does not mean an untrusted browser or malicious delivered script is safe.

## Key custody and sign-in

1. Sign in with the existing invited account. Only email/account password go to
   the API's rate-limited secure session endpoint; the returned session token is
   held in memory and revoked on explicit sign-out. No token is persisted. API
   calls use exact-origin CORS and reject redirects. They never send a backup
   passphrase or private key. An existing portal-cookie connection is also
   available; unrelated-site third-party cookies may be blocked. Deployed
   authentication/CORS still need real browser verification.
2. Create a key with a separate backup passphrase, or import an existing encrypted
   client backup. One transient extractable WebCrypto handle is wrapped directly
   into an AES-256-GCM encrypted PKCS8 backup, then unwrapped nonextractable. The
   long-lived private CryptoKey is saved in IndexedDB. No plaintext private-key
   export or firm private-key generation/import exists in this client. Backup
   derivation uses PBKDF2 SHA-256, 600,000 iterations, random salt and nonce.
3. Download a public enrollment request with exact shape
   `{version:1,workspaceId,accountId,clientId,client:{keyId,publicKey}}`. Obtain a
   signed manifest using the offline firm process. Staging checks the independent
   signer/recovery pins, signature, account/client/key bindings, time and locally
   remembered epoch. It never POSTs enrollment.

The backup passphrase protects the exported backup, not IndexedDB. The browser
key is usable by scripts trusted at that origin and by someone controlling the
browser profile. Lock clears opened data/key references from this page and
zeros available plaintext buffers on a best-effort basis. It does not erase the
persistent key, Downloads, browser/OS snapshots, garbage-collected strings or
other copies. Tab hiding locks the view; cryptographic memory erasure in JS is
not claimed. Keep backup/passphrase outside this device for device-loss recovery.

## Encrypted workspace and limits

Seven coarse domains have grouped readable views. The committed native Journal
currently has 30 Codable fields. Its encrypted snapshots have 24 readable groups,
including Tax & Goals messages, queued questions, confirmed intake, preparation
milestones, recorded engine metadata, and delivery/shopping work preferences;
receipt metadata and route references do not imply their file bytes were saved.
Local/client-specific permissions and actions are never replayed. Files are
fully encrypted, including filename/MIME. Readable file/JSON downloads require
an explicit click and leave a separate readable copy in the user's Downloads.
Unknown payloads remain explicit rather than being treated as a tax result.

Normal forms create/edit tax identity, tax-prep intake, private document, income,
expense, trip/completed shopping work, goals, planning reserves, and
delivery/shopping work preferences. SSNs are masked by default. The explicit SSN
remove action deletes the entire live tax-identity object via the API and clears
its retry metadata; it does not erase backups or recipient copies. These typed
objects remain separate from read-only native Journal snapshots: no automatic
snapshot merge, restore, tax-request completion or provider reconciliation is
claimed. Advanced JSON tools remain in a separate disclosure.

Confirmed intake uses the native tax-year/jurisdiction/business-arrangement
fields. Work-profile links use the native public HTTPS restrictions and never
launch automatically. Saving either form creates a separate encrypted
`driver-state` object; it does not modify a native snapshot, send a queued coach
question, run coach inference, establish provider authority or confirm a filing.
Preparation milestones and saved engine availability are historical data, not
current tax or service assurances. Reputation data is outside this version of
the snapshot.

The controller authenticates v2 HPKE Auth envelopes, both complete recovery
slots, context and revisions. It remembers public revision/tombstone metadata
locally to detect observed rollback/resurrection. This is not a globally trusted
log: a new device, erased browser storage, or unobserved host equivocation still
needs independent recovery/history proof. The API can withhold service/data.

Opened content is memory-only, limited to 10,000 items/64 MiB in this preview.
Each file is limited to 10 MiB; envelope/request responses are bounded. Concurrent
operations are serialized; account/key changes discard stale async results.
Deletion purges live ciphertext and object retry metadata on the API but retains
content-free tombstones. Older ciphertext can remain in backups or history.

Existing plaintext, provider tokens, tax staff recovery/authorization, complete
native/web editing parity, encrypted receipt/route migration, trusted deployment,
real IndexedDB/browser compatibility and visual acceptance remain open. Node
tests exercise the actual crypto and protocol controller; they do not establish
browser persistence, deployed CORS/cookies, a production security review or an
end-to-end migration.

## Customer portal files and business view

The customer artifact includes a routine multi-file inbox; raw JSON is not
required. PDFs/JPEGs/PNGs are bounded at 10 MiB each; UTF-8 bank CSV at 2 MiB.
The queue accepts 20 files/25 MiB of raw selections. Select a purpose and business
category for the batch or individual unencrypted rows. Filename, MIME, exact file
bytes, purpose, category, notes and capture time are all inside the encrypted
payload. CSV is archived unchanged, not evaluated, imported or posted to books.
Other business information can be entered through the ordinary business-note
form, retaining unknown fields when an existing typed note is edited.

Before each first PUT, `VaultClient.prepareSave` creates one encrypted envelope
and mutation ID. `keepPendingUpload` saves that exact ciphertext in the existing
browser binding store; `savePrepared` authenticates it locally before sending it.
Ambiguous failures, manual retries and fresh-controller recovery reuse the same
envelope/mutation ID rather than reencrypting or creating another object. The
pending cache is limited to 20 entries/48 MiB of encoded ciphertext and has its
own workspace/account/client/key binding. No raw file name, note, purpose,
passphrase or session token is persisted beside its ciphertext. Keep original
files until acknowledgment and independent recovery have been checked; browser
profile/storage loss can remove pending work. Storage failures send nothing and
leave an explicit unsent row. Individual failures do not discard other files.
Queue changes use one IndexedDB readwrite transaction, so another tab cannot
overwrite an unrelated pending entry with a stale read/modify/write. Injected
storage adapters must provide the same atomic synchronous-updater contract.

Lock, account/key change, sign-out and tab/page hiding stop refresh timers and
clear file inputs, transient selections, opened records and dashboard references.
Encrypted pending work remains in that account/key's browser storage and can be
recovered after unlocking. Unencrypted selections must be selected again; the UI
reports that boundary and warns before navigating away with such selections.
This remains best-effort JS cleanup rather than guaranteed memory erasure.

The local dashboard derives counts and details only from this account's opened
objects. Uploaded invoice/receipt/statement documents remain distinct from
entered income, expense, trip and business-note records. Native snapshots are
kept separate rather than double-counted. Exact integer-cent totals stay separate
by recorded currency; unsafe aggregate sums are marked unavailable. These are
recorded facts, not reconciled balances, business-use deductions or tax results.

An eligible unlocked/signed/visible view checks the current ciphertext feed every
15 seconds, with no overlapping requests. Unsaved normal/advanced form edits
pause refresh so a stale form cannot silently overwrite a newly refreshed object.
The view shows last successful check and updates pending; network failures never
become a fresh-success timestamp. It does not claim instant push delivery or
accountant review. Actual enrollment, independently trusted delivery, Safari
IndexedDB/CORS compatibility, full office-book/invoice integration and encrypted
staff review/write synchronization remain acceptance gates. Activation is still
disabled for new accounts, and staff grants remain read-only.

## Encrypted staff reader and device recovery

The same independently distributed artifact now includes `/staff.html`.
`StaffVaultClient` uses its own staff MFA/session endpoints and never substitutes
a staff identity for the customer identity in `VaultClient`. Its device keys use
the existing nonextractable ECDH custody and passphrase-encrypted backup, with a separate IndexedDB namespace from customer keys. The
public key fingerprint is the cryptographic device identity; importing its backup
retains that identity and does not bypass revoked or withdrawn server approval.
No staff password, API token or opened record is stored in localStorage.

Sign in with a password and mandatory authenticator verification, create or
recover a local staff device key, then save its public request. A separately
trusted firm operator independently verifies the staff identity and fingerprint,
selects the client scope/domains, and signs a read grant in a separately controlled key environment. The owner can
verify and publish those signed public grants/capsules in the trusted staff UI.
Publication is explicit encrypted read assignment; withdrawal denies new API
reads and same-epoch reactivation. Account recovery codes recover sign-in only.

The reader verifies the independent firm signature, grant/client/device bindings,
expiry and locally observed epochs before opening items. Signed per-object
capsules delegate only the data key for an exact original v2 envelope/revision;
customer envelopes and native interoperability remain unchanged. A current
revision without a matching capsule is pending sharing, never a fallback to old
content. Views are read-only: private files, masked JSON and native Journal
groups can be opened or explicitly downloaded; object edits and filing are absent.

Switching clients/keys, sign-out, tab hiding, revoked access or sync failure clears
opened memory and DOM references on a best-effort basis. A final grant check
before committing a sync detects a grant changed during download. Local history
retains observed object revisions and tombstones across signed grant renewals or
domain narrowing. Only a separately verified changed grant resets the objects
required to appear in the next complete authorized view; an unchanged grant
still rejects missing previously observed objects. Every sync scans source
sequence zero again, including empty pages filtered by domain, so newly published
capsules are retried even when the original encrypted object has not changed.
Signed revoked notices returned by the API or independently imported are retained
as epoch checkpoints, including after their original expiry, before active grants
are considered. Owner withdrawal alone is an API denial, not a signed checkpoint.
A fresh device still cannot establish current authority
against a host withholding new revocation information without an independently
provided authority checkpoint. Already downloaded ciphertext/keys or readable
copies cannot be recalled.

After device loss, restore the encrypted device-key backup and separately held
passphrase, or create a distinct replacement key and public request. The firm
operator withdraws the old device and uses the separately controlled recovery/signing workflow
to verify source ciphertext and issue fresh grants/capsules to the replacement.
Neither the recovery nor signing private key is imported into this browser. Real
offhost key custody, trusted deployment, migration and office-user acceptance
remain operational gates; development tests use only disposable synthetic keys.
