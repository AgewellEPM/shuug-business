# Social marketing

Open **Marketing → Social marketing** (`/social`). Paste or drag your website URL, a social profile URL, or up to ten links. Choose **My brand** or **Competitor**, then **Track links**. Website discovery reads public page metadata, linked profiles and product structured data. Social URLs are recognized directly; sign-in pages, sharing URLs, individual posts and lookalike domains are rejected.

The workspace supports Instagram, Facebook, TikTok, YouTube, LinkedIn, Pinterest, X, Threads and Bluesky profile links. Adding a brand link creates a two-week draft plan. Repeated links preserve existing profiles and campaign edits. Products found on the site are suggestions for marketing; they do not silently create inventory SKUs. Brand direction remains editable.

## What a URL can and cannot provide

A URL identifies a profile. It does not grant access to private analytics. Bluesky public metrics are pulled on initial discovery without an account token. Other profiles show **Found** until you connect them or import an actual report. No scraped or inferred numbers are displayed as platform analytics. Refreshing is explicit in the workspace; no unattended polling or social publishing daemon is installed.

Open a profile for its connection settings, source links, latest observation, follower change, measured posts and report import. Missing metrics stay blank. Comparisons use the same platform and state their sample sizes. Post counters are lifetime observations on recent posts, not period reach. Imported historical observations are ordered by observation time rather than upload time. Private competitor reach, conversions and advertising spend cannot be inferred from these public counters.

| Platform | Connection and available data |
| --- | --- |
| Instagram | Professional-account business ID and authorized Meta token; followers, recent media, likes and comments. Business Discovery supports eligible public competitor professional accounts through your authorized account. |
| Facebook | Page ID and Page token; followers, recent published posts, reactions, comments and shares. Reactions are labeled in the report notes. |
| TikTok | Approved Login Kit / Display API app, OAuth, `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`; followers and recent video counters. Username must match the pasted profile. |
| YouTube | Google OAuth and enabled Data API v3 for your channel, or a Data API key for public competitor lookup; subscriber count and recent video counters. OAuth channel identity is checked against the URL. |
| LinkedIn | Authorized organization ID and Community Management token with `rw_organization_admin`; organization share totals. Personal profiles and individual post reporting require an import. |
| Pinterest | Approved app and OAuth with `user_accounts:read`, `boards:read`, `pins:read`; account analytics for the displayed period. |
| X | Developer bearer token with user lookup/timeline access; public profile and recent post metrics. Reads may consume paid API credits under your X plan. |
| Threads | Authorized user token with `threads_basic` and `threads_manage_insights`; recent posts and available follower insights. Import for post-level interactions. |
| Bluesky | Public AppView API, no token; public followers and author-post likes, replies and reposts. Views are unavailable. |

Credentials are encrypted in the existing server vault. OAuth support is implemented for Google, TikTok and Pinterest. App approval, scopes, a configured client ID/secret and the exact callback displayed in the UI are prerequisites. OAuth state is short-lived, single-use, cookie-bound and bound to the saved connection. Refresh-token rotation preserves the profile revision; user connection changes invalidate an in-flight observation.

These provider adapters have contract tests with synthetic responses. They have not been exercised against Luke's live social accounts. API permissions, plan access and platform approval must be verified by connecting and refreshing each real account. Recent feeds are deliberately bounded; incomplete coverage is labeled and can be supplemented by report imports.

## Traffic and planning

Connect Google Analytics 4 under **Brand & connections**. Enable the Analytics Data and Admin APIs, enter the property ID and Google OAuth app details, then sign in. The property must already collect traffic and ecommerce events. Refresh reads 56 complete days in the property's timezone: daily sessions, engaged sessions, purchases, revenue, source/medium, landing pages and campaign names. Landing-page query strings are removed from stored reporting. Thresholding and sampling notices are retained. Stale reports that do not cover the full comparison window do not show fabricated zero-session totals.

The deterministic planner uses the last 28 complete days of workspace orders, their product costs, the preceding 28-day sales total, available GA4 reports and measured social formats. With at least ten orders, it offers an order-weekday posting test. A format with at least three measured recent posts can inform the next format test. High traffic with no recorded purchases prompts a product-clarity and measurement test, without claiming a cause. Local demo history and estimated historical costs are labeled. GA4 revenue is not added to the order ledger.

Plans use the saved cadence, selected platforms, timezone, brand voice and product names. Each draft includes its evidence, hypothesis, measurement suggestion, creative brief and a unique UTM destination. Noon is a starting test time, not an inferred optimal hour. Existing plan slots are preserved when rebuilding the same range.

Edit a draft, attach reviewed artwork, save, and mark ready after reviewing the caption, product claims, link and artwork. Image posts require an attachment. Published status records a live URL supplied after manual platform publication. It does **not** publish the post or verify that the external post exists. Changes to a ready post return it to draft; published and archived records are immutable and can be duplicated. Campaign activity appears in the business calendar. CSV and ICS exports support offline planning; JSON includes saved observation and revision history but excludes provider credentials and image bytes.

## Creative studio

Upload PNG/JPEG/WebP product photos and logos, then choose up to four references in Brand direction. Originals are private, checksum-verified and downloadable. Prepare an image request for a selected campaign, review the exact prompt/reference count/provider/model, then select **Generate 1 image · uses paid API**. Planning itself does not call an AI provider.

The app calls OpenAI Images (`gpt-image-2.5-sunburst`) or Gemini Generate Content (`gemini-3.1-flash-image`). Keys are saved encrypted, with `OPENAI_API_KEY` and `GEMINI_API_KEY` environment fallback. Without product references the prompt requests a background concept without invented branded packaging. Video formats receive a still storyboard image. Inspect the output manually before attaching it to a post; API success is not brand approval.

Each prepared request is claimed before the network call. Duplicate submissions are rejected. Ambiguous failures remain in request history and never retry automatically; check provider usage before deliberately creating another request. A brand or campaign edit invalidates an unsubmitted prompt. No billed generation was made during development; tests use synthetic image responses.

Current implementation references: [OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation), [OpenAI deprecations](https://developers.openai.com/api/docs/deprecations), [Gemini Generate Content image generation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation), [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1/basics), [TikTok user fields/scopes](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/), [LinkedIn organization statistics](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics?view=li-lms-2026-07), [Bluesky author feed](https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed). DALL-E's retired endpoints are not used.

## Storage, imports and automation

Data lives under `DEALDESK_DATA_DIR/social` (default `.data/social`). Back up this directory with the encrypted connections vault and its key. Writes use an atomic replacement and a cross-process lock. A corrupt store fails closed; it is not replaced with an empty workspace. If a killed process leaves `write.lock`, confirm no marketing write is running before removing that stale lock.

The CSV/Excel import previews canonical columns from the downloadable template (`post_id`, `post_url`, `published_at`, `text`, `format`, and metric columns). Use ISO timestamps with offsets, blank unavailable values, and up to 500 posts / 700 KB. Enter the actual metric observation date and optional follower count. Deduplication hashes the validated report; the original spreadsheet itself is not retained.

Owner-authenticated integrations can POST `/api/social/track` with `{ "links": "https://instagram.com/yourbrand", "role": "brand" }`, or POST `/api/social/import` with `{ "accountId": "saved-profile-uuid", "observedAt": "2026-09-01T12:00:00Z", "followers": 123, "sourceUrl": "https://instagram.com/yourbrand", "posts": [] }`. Full post objects follow `src/lib/social/model.ts`, with all metric fields present and unknown values `null`. Use the existing authenticated workspace gateway for production/Zapier; never expose the owner token in browser code or a URL. Marketing role permissions also apply. The workspace UI exposes the profile UUID for automation.

Validation: social backend tests cover platform recognition, public redirect validation, source parsing, deduplication, stale edits, unknown metrics, OAuth rotation/state, identity mismatch, private assets and one-submission generation. Component tests cover pasted and dragged links, competitor roles, failed-link correction and unavailable providers. `scripts/smoke-workspace.py` checks the production HTTP routes with temporary data and no live provider credentials. Native visual testing remains subject to the configured IsolatedTester/TinkyVision tools.
