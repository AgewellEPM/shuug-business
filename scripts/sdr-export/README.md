# Universal SDR

This is the full Gig Tax Pros SDR console and sales workflow in a standalone package. Start one copy per project. Each copy has its own access codes, session key and SQLite database.

## Start a project

1. Extract or copy the original package into a fresh folder. Edit `workspace.json` to set the name and optional public website.
2. Run `npm start` with Node.js 22.18 or newer. Open the Sales Workspace URL printed in Terminal.
3. Open `workspace-data/owner-code` locally and paste its value into **Private access code**. The owner leaves the email field blank. Create and revoke agent access in **Sales team**. Agents sign in with their business email and assigned code.
4. Use **Territories** to assign states or towns. Import candidate sources through `business-directory.json`, then use **Find offices** to research and prepare records for the pipeline. You can also add an office directly from that view.

The export starts with an empty directory and an empty workspace. Keep the original ZIP as your starting point for new projects. To run multiple workspaces, set a different `SDR_PORT` for each. Every workspace defaults to the private `workspace-data` in its folder. Use a distinct `SDR_DATA_DIR` if you override the storage path.

## What is included

- Overview, territory maps and US town catalogues, local discovery, approved website research, public registry lookup, ownership evidence and contact Rolodex.
- Pipeline list and board, assignments, follow-ups, recorded contact and reply history, suppression preferences, and CSV export.
- Owner and agent access, territory enforcement, and revocation. An optional shared identity portal can also grant scoped staff and location sessions.
- Agreement preview and publication, private invitations, signatures, receipts and delivery history. Email can be recorded from an external mail app or sent through a configured Mailgun account following the existing reviewed preview flow.
- The existing Stripe checkout, webhook, billing reconciliation, revenue and commission projections can be used with the optional membership profile. The default agreement profile completes after signature and offers project-defined agreement text.
- The optional MCP server exposes the same records and role restrictions used by the browser.

## Project directory and contracts

For the default `"directory": "project"`, place your approved business-source records in `business-directory.json`. Restart after editing it. A record has `name`, `address`, `city`, two-letter US `state`, `postalCode` and public `source` URL. Optional fields are `contact`, `email`, `phone` and `website`. This sample uses a Hartford business.

```json
[
  {
    "name": "Sample Partner",
    "address": "10 Example Street",
    "city": "Hartford",
    "state": "CT",
    "postalCode": "06103",
    "source": "https://example.com/business-directory"
  }
]
```

Use `"directory": "tax"` to switch to the bundled IRS and tax/accounting directory connectors and public contact-place data. Registry coverage varies by state. The territory dataset covers the US and DC. The default profile looks up the businesses you supply, with official business registry and reviewed website tools available for qualifying records.

With `"contracts": "agreement"`, enter the agreement title, contracting business and your reviewed agreement text in **Sales team**. Publishing creates a version bound to future invitations. With `"contracts": "membership"`, the included legacy USD schedule is $300 monthly for 12 months plus a $200 enrollment fee. That preset includes the existing commission plan. Paid operations require fresh, project-specific Stripe configuration. Use the agreement profile for projects with their own terms and no SDR-managed checkout.

## Hosting and integrations

The included HTTP process binds to loopback. For hosted use, set `SDR_ORIGIN` to the project’s HTTPS origin and forward that hostname to the local port through your HTTPS reverse proxy. Keep `workspace-data` on a private persistent volume. Stop the server before taking a raw backup of that directory. Restore the database and credential files together. Configure reverse-proxy sign-in rate limits suited to the expected team size. Existing projects can link to the SDR service at `/sales` on their project’s SDR hostname.

- **Mailgun.** Set `GIGTAX_MAILGUN_API_KEY`, `GIGTAX_MAILGUN_DOMAIN`, `GIGTAX_MAILGUN_REGION`, `GIGTAX_MAILGUN_MODE` and `GIGTAX_MAILGUN_WEBHOOK_KEY` for this workspace. Post signed delivery events to `/api/sales-mail-webhook`. Set up shared and agent senders in **Senders**.
- **Stripe.** The membership profile accepts `GIGTAX_STRIPE_SECRET_KEY` and `GIGTAX_STRIPE_WEBHOOK_SECRET`. Its event endpoint is `/api/sales-webhook`. Keep test and live credentials in separate workspace copies. Test payments cannot activate a live membership.
- **Search.** Optionally set `SDR_SEARCH_ENDPOINT` to an HTTPS adapter accepting `POST { "query": "…" }` and returning `{ "results": [{"title":"…","url":"…","snippet":"…"}] }`. `SDR_SEARCH_KEY` supplies an optional bearer credential.
- **Shared identity.** Configure `SDR_IDENTITY_PORTAL` and `SDR_IDENTITY_SESSION_ENDPOINT` together on HTTPS. Use a portal and SDR under the same site so the browser accepts the protected sales cookie. The portal hands a one-use ticket to `POST /api/sales` with `action: "workspace-entry"`. The session endpoint implements the existing `redeem`, `read` and `revoke` contract in `sales/workspace-session.mjs`. The shared location surface is `/location`.
- **MCP.** Run `npm install` for the optional SDK dependencies. Configure your MCP client to run `node scripts/sdr-export/mcp.mjs` from this folder with the same `SDR_ORIGIN` or `SDR_PORT` as the server. Set `SDR_AGENT_EMAIL` and an absolute `SDR_ACCESS_CODE_FILE` to use scoped agent access. The owner profile defaults to the private owner-code file.

The server exposes the public directory API at `GET /api/offices`. An office only becomes eligible for that directory after the existing listing, ownership review and paid membership checks pass. Your project can consume that API for its public directory.
