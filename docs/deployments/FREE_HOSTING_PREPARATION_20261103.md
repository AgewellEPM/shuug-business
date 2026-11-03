# Free-hosting preparation

Luke explicitly selected free hosting, a Cloudflare `.pages.dev` public site,
and Oracle Always Free for a persistent Shuug backend. He still needs to create
his Oracle account. The existing Vercel website remains the last published site;
no Cloudflare publication or cloud-server deployment is claimed here.

## Prepared

`npm run site:rideshare:cloudflare` creates a separate 19-page static build in
`deployments/rideshare-tax-pros/.cloudflare/output`. It uses the new public origin
for canonical/social metadata, robots.txt, sitemap and downloaded checklist links.
Cloudflare security headers and its native clean-route/custom-404 behavior are
supported. The existing Vercel output is built separately.

A verified upload archive is at
`deployments/rideshare-tax-pros/.cloudflare/rideshare-tax-pros-pages-20261103.zip`.
It contains 32 public files, including the reserved `_headers` control file,
with `index.html` at its root. Size: 1,898,871 bytes. SHA-256:
`601055634b8ea136a897f6f52957761e0ae87f8e67205f7640f0697904b43e95`.
The generated archive is ignored by Git and can be regenerated from source.

`deployments/rideshare-tax-pros/free-host` contains the persistent-volume Compose
profile, Caddy HTTPS configuration, hostname example and operating instructions.
`npm run workspace:rideshare:server-setup` initializes an empty private volume
using hidden password input, the Tax Firm template and invited-client access.
It preserves existing passwords and owner changes, resumes its own interrupted
setup, and refuses unrelated data or a changed public origin. No Mac vault,
password or client records are copied to a cloud server.

## Evidence and limits

- The Cloudflare build passed six website journey checks.
- Both static hosting targets build; all 28 final focused tests passed.
- The complete application type check passed after the hosting changes.
- The Compose profile passes offline configuration validation. The existing Docker
  daemon was unavailable; no Docker VM was started, and a Linux image/container
  run is not established by this pass.
- Server-initialization checks execute the real CLI against disposable data,
  including owner sign-in, retries, password/settings preservation, interrupted
  setup recovery and refusal of an unrelated volume or invalid origin.
- The ZIP passed archive integrity and byte comparisons against every build file.

Wrangler 4.156.2 found an expired saved Cloudflare login that could not refresh.
A Pages-scoped official OAuth flow was opened explicitly in Safari, but expired
without completing authorization. Its temporary localhost callback listener was
confirmed absent afterward. There is no successful Pages deployment receipt.

The installed local Shuug build `bGkwUuezdOzgCUFSG7E7S` and its client sign-in
remain running. Earlier live evidence is retained in
`RIDESHARE_CLIENT_PORTAL_20261103.md` and its two adjacent verification receipts.
Desktop/phone visual acceptance remains pending Luke's screenshots.

## Next steps

Complete a fresh Cloudflare authorization, verify/select the actual account and
Pages project, rebuild if the claimed hostname differs, publish the output and
run `node scripts/verify-rideshare-site.mjs --cloudflare` against the returned
public origin. Keep the previous website available until the new one verifies.

After Oracle account creation, verify available Always Free capacity before
provisioning. Deploy the prepared private-server profile, then verify HTTPS,
owner/client sign-in, client isolation, restart persistence and recovery before
connecting its full client sign-in URL to the public site. No paid resources,
plan upgrades or cloud virtual machines were provisioned during this preparation.
