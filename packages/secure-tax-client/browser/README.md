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

Seven coarse domains have grouped readable views. Native encrypted Journal
snapshots have dedicated summaries/detail lists for the actual saved modules;
receipt metadata and route references do not imply their file bytes were saved.
Local/client-specific permissions and actions are never replayed. Files are
fully encrypted, including filename/MIME. Readable file/JSON downloads require
an explicit click and leave a separate readable copy in the user's Downloads.
Unknown payloads remain explicit rather than being treated as a tax result.

Normal forms create/edit tax identity, private document, income, expense, trip,
goal and planning-reserve objects. SSNs are masked by default. The explicit SSN
remove action deletes the entire live tax-identity object via the API and clears
its retry metadata; it does not erase backups or recipient copies. These typed
objects remain separate from read-only native Journal snapshots: no automatic
snapshot merge, restore, tax-request completion or provider reconciliation is
claimed. Advanced JSON tools remain in a separate disclosure.

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
