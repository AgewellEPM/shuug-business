# Rideshare Tax Pros on Shuug

The dedicated Vercel public site is built from `public/rideshare-tax-pros` in
this repository. It uses the art director's supplied desktop artwork, replaces
the sample phone and Drake buttons with live controls, and includes a responsive
HTML mobile layout. Navigation and service dialogs work without any backend.

Build and deploy from the repository root:

```sh
node scripts/build-rideshare-site.mjs
vercel link --yes --project rideshare-tax-pros --cwd deployments/rideshare-tax-pros
vercel deploy --prebuilt --prod --cwd deployments/rideshare-tax-pros
```

Only the generated static site is uploaded. The private application, accounts,
vault, records and local databases are not part of this deployment. Generated
Vercel state is ignored by Git.

Edit `public/rideshare-tax-pros/site-config.json` and rebuild to connect the
firm's HTTPS Shuug workspace, optional external Drake portal, real contact phone
and email. Null values show honest opening-soon messages. The supplied 555 number
is covered in the desktop design and is never used as a telephone destination.
The artwork includes director-supplied social proof and illustrative financial
figures; confirm these before treating this initial design as approved marketing.

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
