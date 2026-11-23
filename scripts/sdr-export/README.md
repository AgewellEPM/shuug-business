# Universal SDR

This is the full Gig Tax Pros SDR console and sales workflow in a standalone package. Start one copy per project. Each copy has its own access codes, session key and SQLite database.

## Start a project

1. Extract or copy the original package into a fresh folder. Edit `workspace.json` to set the name and optional public website.
2. Run `npm start` with Node.js 22.18 or newer. Open the Sales Workspace URL printed in Terminal.
3. Open `workspace-data/owner-code` locally and paste its value into **Private access code**. The owner leaves the email field blank. Create and revoke agent access in **Sales team**. Agents sign in with their business email and assigned code.
4. Use **Territories** to assign states or towns. Import candidate sources through `business-directory.json`, then use **Find offices** to research and prepare records for the pipeline. You can also add an office directly from that view.

The export starts with an empty directory and an empty workspace. Keep the original ZIP as your starting point for new projects. To run multiple workspaces, set a different `SDR_PORT` for each. Every workspace defaults to the private `workspace-data` in its folder. Use a distinct `SDR_DATA_DIR` if you override the storage path.

## Mac wrapper

With Xcode tools installed on macOS 14 or newer, run `bash scripts/sdr-export/build-mac.sh "$HOME/Applications/Universal SDR.app"` and open the resulting app while the local workspace is running. The window shows the SDR and LinkedIn side by side. Sign into LinkedIn in the right pane. With a profile or company page open, click **Add profile to Prospects** to fill the URL and, when available, the page title for review.

Building with `--gig-tax` opens the hosted Gig Tax Pros workspace on the left. **Prospects** opens the reusable local store in that same pane. Each site uses its usual sign-in inside the wrapper.

## iPad app

Universal SDR runs on iPadOS 17 and later. Use **Workspace** and **Prospects** to work in your existing SDR project. On a wide screen, LinkedIn and other research pages open beside the workspace. On a narrower screen, use the toolbar to switch panes. On a LinkedIn profile or company page, **Add to Prospects** opens a draft for review before you save it.

- Install Xcode and XcodeGen on the build Mac. Run `bash scripts/sdr-export/build-ipad.sh` for the simulator app. For a physical iPad, open the generated `native/ios/UniversalSDR/UniversalSDR.xcodeproj`, select your development team and iPad, and run the app from Xcode.
- In the app, enter the project's HTTPS workspace address and use your existing owner or agent access code. The iPad connects to that workspace's server and records. For a Mac-only workspace, first make it reachable at a trusted HTTPS address. A Debug simulator build also accepts the Mac's loopback workspace URL.
- Choose **LinkedIn**, **Demo**, or **Docs** in the toolbar. Demo opens an HTTPS link. Docs opens a documentation link or a PDF from Files. The app remembers those choices for each workspace on the iPad. Use the right-pane button to give the sales workspace the full width.
- In **Campaigns**, **Demo** and **Sales materials** open the corresponding right pane. **Prospects** uses your live saved-prospect list, search and editor.
- Sign in to LinkedIn in its pane with your LinkedIn account.

## What is included

- Overview, territory maps and US town catalogues, local discovery, approved website research, public registry lookup, ownership evidence and contact Rolodex.
- LinkedIn prospect collection. In **Prospects**, open LinkedIn and sign into your own account to find people or companies. Use **Add prospect** to save the selected profile URL and the details you want to keep. Search, edit, or archive those records inside SDR. **Search the public web** looks up a prospect by their saved professional details and excludes LinkedIn results. The workspace owner can review team prospects, and agents see their own saved records.
- Pipeline list and board, assignments, follow-ups, recorded contact and reply history, suppression preferences, and CSV export.
- Owner and agent access, territory enforcement, and revocation. An optional shared identity portal can also grant scoped staff and location sessions.
- Agreement preview and publication, private invitations, signatures, receipts and delivery history. Email can be recorded from an external mail app or sent through a configured Mailgun account following the existing reviewed preview flow.
- The existing Stripe checkout, webhook, billing reconciliation, revenue and commission projections can be used with the optional membership profile. The default agreement profile completes after signature and offers project-defined agreement text.
- The optional MCP server exposes the same records and role restrictions used by the browser.

## Campaigns

Open **Campaigns** as the workspace owner. Enter your company, offer, desired next step, city, state and prospect keywords. Choose your saved LinkedIn prospects, the project directory, or Connecticut's public business registry. Click **Save campaign** and **Run now**. The runner collects matching companies, checks published roles and business contact channels, and prepares a draft tailored to each company using your offer. Companies with usable business addresses also go to Pipeline. **Repeat every** enables a saved schedule while the server runs, and **Pause schedule** stops future runs.

Campaigns can prepare drafts without a mail provider. For automatic sending, configure Mailgun, approve a shared provider sender in **Senders**, set the campaign to **Research and send automatically**, and enter your business mailing address. Connect Mailgun inbound routes and delivery webhooks to `/api/sales-mail-webhook` on the workspace's HTTPS hostname for live delivery and replies. Messages identify the company and include a reply-to-unsubscribe instruction. Signed events and matched replies are recorded against the original attempt. [Mailgun webhook setup](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/configuring-webhooks) · [FTC commercial email guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

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
