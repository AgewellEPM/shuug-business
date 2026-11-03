# Rideshare inner pages and installed Shuug

Luke's latest order is to finish the website and verify Shuug installation before
starting the included mileage/income/expense/receipt app. That app has not been
built or advertised as available. Its native/background-tracking choice remains
open for the later phase.

Implementation `1e586e3`, branch `feat/rideshare-tax-firm-pack`.
Public site: https://rideshare-tax-pros.vercel.app
Deployment: `dpl_6e5y74C1ssQ1c9KL4W9QvYuPQYjA` Ready.

## Delivered and verified

Nineteen public pages: original home, fifteen service/client-resource pages and
three policy pages. The new pages cover services, preparation, mileage/expenses,
quarterly support, bookkeeping, process, pricing/scope, preparation planner,
printable/downloadable checklist, searchable resources, forms guide, searchable
FAQ, about, contact and client-access gateway. Shared layout/navigation/footer,
mobile actions and published clean routes connect the entire site.

Research and scope decisions are in `docs/RIDESHARE-WEBSITE.md`. Original IRS,
Uber and Lyft links appear with the educational content. No fees, qualifications,
customer counts or tax savings were invented.

Four journey checks passed: all internal destinations, planner-to-checklist
handoff and print/export, FAQ filtering, and safe client-workspace configuration.
The complete Shuug production build and TypeScript pass. The public verification
receipt records49 real requests:30 artifact files matching the build,18 clean
page aliases and the branded404. The first unbounded request batch timed out;
the final bounded verifier passed and names a failed URL if a connection fails.
See `rideshare-inner-pages-verification-20261102.json`.

## Installed private workspace

The actual production Shuug server runs on `http://127.0.0.1:3126`, bound only to
loopback, under the user LaunchAgent `com.shuug.rideshare-tax-pros`. It uses the
Rideshare Tax Pros business template, private persistent Application Support
data, and the existing scrypt-based owner authentication. Its generated owner
credential is stored in macOS Keychain as `com.shuug.rideshare-tax-pros.owner`,
account `owner`; no plaintext password was written to source, arguments or logs.

Installed build `SM8aG-ybAU32XDMQ-b4tE` passed the actual CSRF-protected owner
login, anonymous-page denial, four tax module pages, home and the authenticated
tax-engagement API. Private installation and verification receipts are retained
in the workspace data directory. No synthetic client data was left behind.

Source and runtime are on the existing external checkout, with a home-directory
symlink. The drive must be mounted for this installation. The installer refuses
to overwrite a different service definition or reset an existing password.

## Remaining boundary

Safari was opened on the website and local workspace. No browser runtime,
isolated UI session or VM was used. Luke's desktop/phone screenshots remain the
visual acceptance gate; do not claim the website is visually perfect.

This is a local private Shuug installation plus a public static Vercel website.
Public persistent client hosting is not connected. Real contact details, actual
fees and verified staff information remain to be supplied before activating real
client operations. Do not point the public client portal at a localhost URL.
