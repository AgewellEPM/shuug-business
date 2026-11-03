# Rideshare Tax Pros on Shuug

The dedicated Vercel public site is built from `public/rideshare-tax-pros` and
`scripts/rideshare-site` in this repository. It uses the supplied desktop artwork, replaces
the sample phone and Drake buttons with live controls, and includes a responsive
HTML mobile layout. Navigation and service dialogs work without any backend.

The site also includes service details, the client process, FAQs, contact
availability, a four-column footer, privacy/terms/accessibility pages, a branded
404 page, canonical/social metadata, robots.txt and a sitemap. Mobile navigation
stays visible, and a safe-area-aware bottom bar keeps the primary actions within
reach. Real-device visual acceptance still belongs to Luke.

The build now publishes 19 pages: home, fifteen service/client-resource pages
and the three policy pages. Shared navigation/footer/layout is in
`scripts/rideshare-site/layout.mjs`; service content and research links are in
`content.mjs`; page composition is in `pages.mjs`. The homepage contains explicit
build markers for shared markup. Always build before serving or testing it.
Planner/checklist preferences remain in the browser; no client documents or
credentials are collected. See `docs/RIDESHARE-WEBSITE.md`.

Build and deploy from the repository root:

```sh
node scripts/build-rideshare-site.mjs
vercel link --yes --project rideshare-tax-pros --cwd deployments/rideshare-tax-pros
vercel deploy --prebuilt --prod --cwd deployments/rideshare-tax-pros
node scripts/verify-rideshare-site.mjs
```

Private local Shuug installation on macOS:

```sh
npm run build
npm run workspace:rideshare:install
```

This creates an authenticated loopback-only workspace at
`http://127.0.0.1:3126`, uses the system Keychain for the generated owner password,
and keeps its data in the user's private Application Support folder. It verifies
sign-in and the Tax Firm screens after starting the LaunchAgent. Repeated
installation preserves an existing owner password and branding; differing
existing service configuration fails for review. The source drive must be mounted.
It does not turn the public Vercel site into a hosted private customer backend.

Install the macOS owner-access launcher after the workspace is installed:

```sh
npm run workspace:rideshare:launcher
```

Open `~/Applications/Rideshare Tax Pros Workspace.app` to check the workspace,
open Shuug in Safari, or explicitly copy its owner password from macOS Keychain.
Leave the sign-in email field blank for owner access. The password copy expires
after 30 seconds while the launcher runs and clears on normal quit, provided
another application has not replaced it. See
`native/macos/WorkspaceLauncher/README.md` for behavior and verification limits.
This helper is separate from the planned driver mileage app.

Only the generated static site is uploaded. The private application, accounts,
vault, records and local databases are not part of this deployment. Generated
Vercel state is ignored by Git.

Edit `public/rideshare-tax-pros/site-config.json` and rebuild to connect the
firm's HTTPS Shuug workspace, optional external Drake portal, real contact phone
and email. Null values show honest opening-soon messages. The supplied 555 number
is covered in the desktop design and is never used as a telephone destination.
The artwork's unverified client counts and satisfaction statistics are covered
by live HTML service commitments. The refund illustration is labeled as an
example and the FAQ explains that outcomes are not guaranteed. Do not add
credentials, pricing, testimonials, locations or success claims without evidence.

The reusable workspace template is exported by
`src/lib/industry/rideshare-tax-pros.ts`. Tax & accounting firm is selectable in
the existing Shuug industry setup; the Rideshare Tax Pros template enables the
rideshare and quarterly review modules alongside Shuug CRM, service work,
appointments, staff time, client portal and accounting. See
`docs/TAX-FIRM.md` for setup and exact capability boundaries.

Run `npm run tax:template` to regenerate `workspace-template.json`, then use
Branding's template preview/import flow on the private backend to apply it.

This public static deployment does not host the SQLite workspace. A `.vercel.app`
address needs no custom domain. A working private client backend still requires
a separate Shuug installation with persistent storage; Postgres support for the
deal store alone does not migrate the remaining workspace, accounts or vault.
