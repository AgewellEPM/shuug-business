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

## What is included

- Overview, territory maps and US town catalogues, local discovery, approved website research, public registry lookup, ownership evidence and contact Rolodex.
- LinkedIn prospect collection. In **Prospects**, open LinkedIn and sign into your own account to find people or companies. Use **Add prospect** to save the selected profile URL and the details you want to keep. Search, edit, or archive those records inside SDR. **Search the public web** looks up a prospect by their saved professional details and excludes LinkedIn results. The workspace owner can review team prospects, and agents see their own saved records.
- Pipeline list and board, assignments, follow-ups, recorded contact and reply history, suppression preferences, and CSV export.
- Owner and agent access, territory enforcement, and revocation. An optional shared identity portal can also grant scoped staff and location sessions.
- Agreement preview and publication, private invitations, signatures, receipts and delivery history. Email can be recorded from an external mail app or sent through a configured Mailgun account following the existing reviewed preview flow.
- The existing Stripe checkout, webhook, billing reconciliation, revenue and commission projections can be used with the optional membership profile. The default agreement profile completes after signature and offers project-defined agreement text.
- The optional MCP server exposes the same records and role restrictions used by the browser.

## Overview

From **Overview → Research a business type**, enter a category and select a city or ZIP and state. The search covers all 50 states and D.C. through [OpenStreetMap via Photon](https://github.com/komoot/photon/blob/master/docs/api-v1.md), with [CMS Care Compare](https://data.cms.gov/provider-data/dataset/4pq5-n9py) added for nursing homes and matching records from the project directory. Results link to the public listing and show contact and registry evidence where published. The latest search is saved for that account. Use **Save to Pipeline** to choose the businesses you want to work with. Public source coverage varies by area and category.

The Overview header awards 10 XP per saved business, 20 for its first recorded contact, 30 for its first reply, and 40 for its signed agreement. Every 100 XP advances one level. In an agreement workspace, the owner uses **Earned to date** to record money already received in USD. Membership workspaces show the existing commission totals based on verified collections.

## Senior Care CRM

Add `"focus": "senior-care"` to the existing `workspace.json` and restart the workspace to enable a second sales view at `/sales/senior-care`. Switch between **Universal CRM** and **Senior Care CRM** in the sidebar. Both views use the same sign-in, account records, team assignments, and follow-ups. In Senior Care, choose a state and a facility type to browse the directory. Save a facility to Pipeline to track your contact, stage, and next follow-up. The facility type filter also lets you find and classify existing CRM records.

## Territory maps and assignments

Open **Territories** and choose a state or D.C. from the **State** dropdown or the national map. Use the same dropdown to switch directly between states. Use **Check territory availability** to look up a town, county, or saved facility by name or street address. Town results show the lead for each county they overlap. Facility results show the rep assigned to the saved account and its market segment. The map and Sales team derive market counts from assigned accounts using saved facility types and recognizable facility names. The county view counts accounts whose recorded town maps to a single county. Select a county, town, or point on the street map to see the region and its sales rep beneath the map. Choose a town or county search result to move the map. Click a county or zoom in to reveal more town names and boundaries. Click a town or choose one by name to zoom to it. At closer zoom the county fills give way to municipal limits and local subdivisions. Continue zooming for named OpenStreetMap streets, or choose **Show streets**. Street tiles require an internet connection. Select a county on the map or in **County leads**, then choose **Assign county** or **Change rep** below the map. Select a sales rep and save the assignment. Their headshot comes from **Sales team → My profile** and updates when they edit their profile. A manually entered lead can have a separate photo. The workspace owner can select a team member or enter a name. Team leads can assign available counties in their territory to active members of their own reporting team and update their team’s county assignments. County lead records are independent of sign-in permissions. Clear **Map colors** for grayscale. The browser remembers your choice across states and reloads. **Fit state** shows the full state again, and **All states** returns to the U.S. map. The map uses Census cartographic boundaries with TIGER/Line supplements for newer localities. Connecticut shows its 169 municipal towns. Other states show the places and local subdivisions in their territory catalogs.

In **Senior Care CRM → Facility directory**, switch between **Nursing homes** and **Senior community centers**. Search by facility, city, or ZIP, or browse by state. Nursing home records come from the [CMS Care Compare certified provider directory](https://data.cms.gov/provider-data/dataset/4pq5-n9py). Senior community center records come from [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) via [QLever](https://qlever.dev/osm-planet). Mapped coverage varies by state, and published contact details vary by facility. Salespeople see facilities within their assigned territory. The owner manages sign-in territory permissions under **Sales team → Workspace settings → Town access**.

In Prospects, choosing a nursing-home or senior-center office type and a state
loads directory matches automatically. Each result can be saved to Pipeline.
Administrator profiles appear where an employer page was checked against the
exact CMS facility. The profile labels the main facility phone and includes a
published business email and portrait when available. Google and LinkedIn
research links are provided for incomplete profiles.

Click a facility name or administrator photo to see published facility facts
and leadership. **Quick Email** prepares one editable TinkyTown introduction
per eligible contact with a published work email. Open each draft in **Email**
or in your own email app for review. Quick Email itself submits no messages. It uses
the local Ollama service with `qwen3:4b-instruct-2507-q4_K_M` by default.
`SDR_OUTREACH_MODEL` selects another local model. When the model is unavailable,
the drafts use role-specific templates.

### Google reviews

Open **Google reviews** inside a facility profile to look up that location’s
Google rating, total rating count, and review summary when available. Up to five
reviews appear in equal-width positive and negative columns. Three-star reviews
appear below as mixed. The column counts describe Google’s relevance-ordered
sample. Each review links to its original on Google Maps.

Use **Communication opportunities** to choose a focus such as language access,
visitor directions, or admissions. The workspace shows a concrete example and a
conversation starter. **Draft outreach with this focus** prepares reviewable
email drafts for eligible contacts using the selected focus.

Connect a server-side Places API (New) key with `SDR_GOOGLE_PLACES_API_KEY` or a
private `workspace-data/google-places-key` file with permissions `0600`. The
key stays on the server. Google lookups run when a user opens a profile’s
reviews, and review text stays in the current display. Without the connection,
use the profile’s **Open Google Maps** link. See Google’s
[Place Details documentation](https://developers.google.com/maps/documentation/places/web-service/place-details)
and [Places API usage policies](https://developers.google.com/maps/documentation/places/web-service/policies).

The nursing-home directory reads administrator listings from matched CMS
enrollments and state licensure rosters. Each name links to its publisher.
Directory results show administrator coverage for the current filters.
The index contains public professional contacts and can be regenerated with
`scripts/sales/build-facility-leadership.py`. California licensure data are
published by the California Department of Public Health under [CC BY](https://publish.data.ca.gov/dataset/licensed-and-certified-healthcare-facility-listing).

## Sales teams

Use **Add sales rep** on the Sales team page to invite a member and share their access code privately. The owner can place a new member anywhere in the active reporting tree. Each member can invite their own direct reports and see everyone who reports through them. New reports inherit the manager’s territory by default. A narrower state selection keeps any town restrictions from the manager’s territory, and later changes to the manager’s territory also apply to their branch.

The owner can revoke any member. Each member can revoke a direct report, which ends that report’s access and blocks sign-in for their branch. The workspace retains their assignments and reporting history. The owner can reassign saved prospects through the existing pipeline controls.

Members on other devices use the workspace’s hosted HTTPS address. An address beginning with `127.0.0.1` opens the workspace on the Mac running it.

Open **Team chat** in the sidebar or on the Sales team page. The owner and active sales reps share the same channels in Universal CRM and Senior Care CRM. Start in **#general**, **#field-notes**, or **#wins**. The owner can use **+** beside Channels to create a channel and give it a topic. All channels are visible to the sales team.

Press **Enter** to send, use **Shift + Enter** for a new line, or choose **Reply** on a message to quote it. Unread counts are personal. Each channel keeps its history in this workspace’s SQLite database.

## Booking calendar

Open **Overview → Open calendar** or **Calendar** in the sidebar. Clients use `/book` to choose a rep, meeting type and available time in their own time zone. **Copy booking link** gives a rep-specific address. A confirmation includes a private link to reschedule or cancel, and a calendar download. Client intake and changes appear in the rep’s schedule. The hosted app directory uses the built-in booking page when the owner has left the alternative appointment link blank and a rep is accepting bookings.

The owner calendar starts with 30-minute sales appointments and 45-minute demos, Monday–Friday, 9 a.m.–5 p.m. Eastern, with two hours’ notice and a 60-day window. `SDR_BOOKING_TIME_ZONE` sets the initial IANA time zone for new calendars. In **Availability**, reps or the owner can publish a rep, adjust hours, disable a meeting type, set durations, time off, buffers, notice, a client question, a notification email and meeting instructions or a video link. Individual rep calendars begin unpublished. Calendar edits take effect on the next availability check.

**Connections** supports the following integrations.

- **Google Calendar and Microsoft Outlook.** Register a web OAuth app and its exact redirect URI, `<SDR_ORIGIN>/book/connect`. Enable the Google Calendar API with the Calendar events scope, or Microsoft Graph delegated `Calendars.ReadWrite` with offline access. Configure `SDR_GOOGLE_CALENDAR_CLIENT_ID` and `SDR_GOOGLE_CALENDAR_CLIENT_SECRET`, or `SDR_MICROSOFT_CALENDAR_CLIENT_ID` and `SDR_MICROSOFT_CALENDAR_CLIENT_SECRET`, on the server. Each rep signs into their own provider from Connections. One primary calendar per rep supplies busy times and receives appointment changes and client invitations. Connecting also queues future bookings already on the schedule. When the provider cannot confirm availability, the connected rep’s booking page asks the client to retry. [Google Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) · [Microsoft calendar view](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0) · [Microsoft events](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
- **Apple Calendar and other subscriptions.** Create a private iCalendar feed in Connections. The subscriber controls its refresh frequency. Turning off the feed invalidates the link.
- **Email.** Configure Mailgun as described below and approve a provider sender in **Senders**. The rep’s sender takes priority over a shared sender. Clients and reps receive confirmation, reschedule and cancellation messages. Without a connected calendar provider, booking email includes an ICS attachment. Signed Mailgun delivery events update the email status. A test acceptance is displayed separately from a delivered message.
- **Other APIs.** In **Connections → Add an API connection**, enter an HTTPS webhook and an optional bearer token. Copy the signing secret into the receiving service. A rep can subscribe to their own bookings and the owner can subscribe the whole workspace. Open `/book/api` for public availability, booking operations, webhook payloads, signature verification, retries and server-managed endpoints. Each appointment shows its current delivery status.

Use the workspace’s hosted HTTPS origin for clients on other devices. Keep the workspace database and its session key together during backup and restore. The key protects private links, saved webhook credentials and calendar refresh tokens.

## Business email

**Email** opens the signed-in rep’s assigned Zoho Mail account. Inbox, Sent, Trash and Zoho drafts come from Zoho. The workspace also keeps private, editable drafts across CRM and desktop-client sessions. **Owners & Rolodex** and facility **Quick Email** open the same composer. It supports replies, forwarding, Cc, Bcc, attachments up to 4 MB combined, and downloads up to 5 MB each. Accepted submissions to linked contacts appear in office history.

The workspace operator supplies the company’s existing Zoho OAuth client and an authorized offline grant on the server. Use the grant’s region and scopes `ZohoMail.accounts.READ`, `ZohoMail.folders.READ`, and `ZohoMail.messages.ALL`. An organization account lookup also needs `ZohoMail.organization.accounts.READ`. Zoho must permit the grant to access the particular mailbox and send as that address. Use an authorized mailbox-specific grant when the company grant has insufficient access. [Zoho Mail OAuth](https://www.zoho.com/mail/help/api/using-oauth-2.html) · [Zoho Mail delegation](https://www.zoho.com/mail/help/adminconsole/mailbox-delegation-admin-settings.html)

Place the configuration in `workspace-data/zoho-mail.json` with mode `0600`, or set `SDR_ZOHO_CONFIG_FILE` to its private location. The server reads it on demand. The following example uses placeholders.

```json
{
  "region": "us",
  "clientId": "<Zoho OAuth client ID>",
  "clientSecret": "<Zoho OAuth client secret>",
  "refreshToken": "<company-authorized refresh token>",
  "ownerAddress": "office@example.com"
}
```

The server also accepts `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `SDR_ZOHO_REGION`, `SDR_ZOHO_OWNER_ADDRESS` and optional `SDR_ZOHO_ORG_ID`. Owner-issued rep accounts automatically use their business sign-in email. For a different assigned address, a team-lead invitation, or a mailbox-specific grant, add an entry under `mailboxes` keyed by the immutable CRM member ID, for example `"42": {"address":"rep@example.com","refreshToken":"<authorized grant>"}`. An optional `accountId` selects a specific Zoho account. The server verifies the primary address before accessing any mail. Reps only sign into the CRM.

### Mailbox API

A native client can reuse its existing CRM session with `POST /api/sales/mail/v1`. Send the workspace Origin, its private sales session cookie and an `application/json` body. Account selection is server-side. The browser uses this same endpoint.

| Action | Request fields | Result |
| --- | --- | --- |
| `rep-email-settings` | — | Assigned address, configured state, API version |
| `rep-email-list` | `folder` (inbox, sent, drafts, trash), optional `query`, `contact`, `cursor` | Messages and next cursor |
| `rep-email-read` | `folder`, `id` | Message, attachment metadata, optional reply fields |
| `rep-email-download` | `folder`, `id`, zero-based `index` | Filename and Base64 content |
| `rep-email-change` | `folder`, `id`, `operation` (read, unread, trash, restore) | Confirmed change |
| `rep-email-drafts` | — | Private workspace drafts |
| `rep-email-save` | UUID `id`, `revision` (0 for new), `to`, `subject`, `body`, optional `cc`, `bcc`, `files`, `link`, `replyToken` | Saved draft and next revision |
| `rep-email-discard` | Workspace draft `id`, `revision` | Discard confirmation |
| `rep-email-send` | Workspace draft `id`, `revision` | Accepted by Zoho, rejected, or unconfirmed |

Send new files as `{ "name": "notes.txt", "base64": "SGVsbG8=" }`. Reuse the returned file IDs on subsequent saves. A linked Rolodex contact uses `{ "officeId": "...", "contactId": "..." }`. To reply, pass the recipient, subject and reply token returned by reading that message. After an unconfirmed submission, review Sent before attempting another send. [Zoho Mail message APIs](https://www.zoho.com/mail/help/api/email-api.html)

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
