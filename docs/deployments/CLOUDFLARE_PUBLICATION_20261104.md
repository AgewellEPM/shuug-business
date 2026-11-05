# Cloudflare publication — November 4, 2026

The free public website is live at https://rideshare-tax-pros.pages.dev.
All 50 public HTTP checks passed at 2026-11-05T00:48:21.903Z (November 4 locally).
Desktop and phone visual acceptance still require Luke's screenshots.

## Published result

- Pages project: `rideshare-tax-pros`; production branch: `main`.
- Deployment: `1a5d70c1-2050-47b8-8fdb-ed8a2f5b586a`.
- Deployment URL: https://1a5d70c1.rideshare-tax-pros.pages.dev.
- Published source: `06cb05e380dfa8a98dffae2646a2a389b7a1b01b`.
- The existing 19-page Cloudflare output was published without source changes.
  Its 32 files exactly matched the integrity-checked upload archive, SHA-256
  `601055634b8ea136a897f6f52957761e0ae87f8e67205f7640f0697904b43e95`.
- No Functions or paid storage services are included. Static asset requests use
  [Cloudflare's free static hosting](https://developers.cloudflare.com/pages/functions/pricing/).

The [HTTP receipt](rideshare-cloudflare-site-verification-20261104.json) checks
all 31 public files against the saved output, all 18 clean-route aliases, the
homepage security policy and the branded HTTP 404. Cloudflare deployment metadata
independently confirmed Production and source `06cb05e`.

## Deployment recovery

Pages-scoped OAuth succeeded through normal Safari authorization. Wrangler
4.156.2 first delegated new-project creation to Workers, which failed without
deploying. Its verified direct-Pages `pages project create --force` option was
used for initial creation only. A transient Cloudflare HTTP 500/code `8000000`
was followed by a project-list check confirming nothing was created; one retry
succeeded. Ordinary `pages deploy` then published the existing project without
`--force`. No account plan was upgraded and no other project was changed.

Update using the build/deploy/verify commands in the
[free-host guide](../../deployments/rideshare-tax-pros/free-host/README.md).
Reuse this existing Pages project. Never publish secrets or workspace data as
static assets.

## Remaining workspace activation

Luke approved keeping contact placeholders. `contactPhone`, `contactEmail`,
`workspaceUrl` and `drakePortalUrl` remain null in the public config. The contact
pages show availability text; client sign-in is not represented as connected.

Oracle signup was opened in Safari at Luke's request. No connected OCI account,
cloud server, public workspace hostname or certificate was available this pass.
After account creation, verify the home region and unused Always Free capacity,
deploy the prepared persistent profile, and prove HTTPS owner/client sign-in,
client isolation, restart persistence and recovery. Only then configure the
public site's `workspaceUrl` with the real client sign-in URL and republish.

The installed macOS launcher independently reports build `bGkwUuezdOzgCUFSG7E7S`
ready at the existing local workspace. Its service/data were preserved. The
previous Vercel site still returns HTTP 200. No container, VM or prohibited
browser runtime was launched. Safari was left open for review, with desktop and
phone screenshots requested. The driver mileage app remains the later phase.
