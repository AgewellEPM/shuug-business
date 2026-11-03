# Tax Firm client portal and public website updates

Implementation: `de77f8f`, branch `feat/rideshare-tax-firm-pack`.
Public website: https://rideshare-tax-pros.vercel.app
Vercel deployment: `dpl_7MVm3CBP8YaVUmiPzUpedkzUtZ4A` (Ready).
Installed Shuug build: `bGkwUuezdOzgCUFSG7E7S`.

## Client experience

Shuug's existing invited customer accounts now show the Tax Firm pack's shared
engagement stages, document requests, income/mileage/expense record statuses,
quarterly staff reviews and client-facing messages. The private account pages
use the organization's configured brand colors and responsive layouts.

Staff explicitly check **Share safe status with linked client** on each record.
Legacy and unchecked records remain private. Document requests and rideshare
records also require a shared, unarchived engagement for that same client.
Internal notes, staff assignments, vault/advice references and internal agreement,
job and invoice IDs are excluded from the tax projection. Filing handoffs remain
staff-only. Module visibility, service access and account revocation are respected.
See `docs/TAX-FIRM.md` for the full sharing contract and setup instructions.

The installed local Tax Firm workspace has client sign-in enabled at
`http://127.0.0.1:3126/api/website/customer`. Product pricing, ordering, order status
and online booking are off; service access is on. Activation was applied through
the actual authenticated owner API only after verifying there were no existing
customer accounts or customized portal settings. No synthetic client records were
added to the installed workspace. Private activation evidence remains in its
Application Support data directory. New clients need their own account invitation;
owner and client credentials are separate.

## Website improvements

The public client-access page explains the shared Tax Firm experience while its
public destination remains unconfigured. The build and browser now share one
HTTPS-domain validator that rejects local names, IP addresses and embedded URL
credentials. Client configuration must name the full hosted client sign-in
destination, rather than the employee/owner workspace root.

Inner-page and footer logo marks now reference the existing 254-byte SVG instead
of the 1,941,456-byte full artwork. The original art remains on the homepage.
This establishes an asset-dependency reduction, not a measured phone speed score.
The skip link appears above the sticky header, the main target is focusable,
menu closure returns focus to its opener and modal navigation locks background
scrolling. The public site still contains 19 pages.

## Verification and installation

- 25 focused checks passed across Tax Firm behavior, client authorization,
  the shared customer flows and public website journeys.
- The complete production build and TypeScript check passed.
- Eight production HTTP scenarios passed using two disposable synthetic clients:
  actual owner/invitation/customer sign-in, private-by-default records, live
  sharing, account isolation, staff API denial, cross-origin denial, withdrawn
  sharing and revocation. The staff editor exposed the actual sharing control.
  Receipt: `rideshare-client-http-verification-20261103.json`.
- The owned diagnostic server exited and its PID was independently confirmed
  absent; its temporary workspace was removed.
- The real local service was stopped for a private data backup and build update.
  The prior working build was retained outside the source tree. The updated
  installed service passed normal owner sign-in, anonymous denial and the six
  actual workspace routes. The installed launcher independently recognized the
  new build and running sign-in endpoint.
- All 50 live public HTTP checks passed: 31 files match the saved website build,
  18 clean aliases return the correct pages and the branded missing page returns
  HTTP 404. Receipt: `rideshare-client-site-verification-20261103.json`.

Safari was opened on the live website and the real local client sign-in page for
review. No browser test runtime, isolated desktop or VM was used. DOM and HTTP
checks do not establish desktop/phone visual acceptance; Luke's screenshots
remain the visual gate. Human use of the native Keychain copy button is unverified.

## Remaining activation

Public persistent client hosting and the firm's real contact information are
still pending. The public website's `workspaceUrl` remains null; localhost is
never published as a client destination. Tax records here track professional
work; they do not upload tax documents, calculate a return, transmit a filing or
verify an external filing engine. The driver mileage app remains the later phase.
