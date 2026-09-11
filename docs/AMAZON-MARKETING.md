# Amazon Marketing

Open **Marketing → Amazon Ads** (`/amazon-marketing`), beside Google Ads. A product's **Advertise on Amazon** shortcut prefills the local product name; enter its real ASIN and seller SKU. Amazon Ads uses its own connection, separate from Selling Partner API order access.

## Connect and build

In Settings, choose **Amazon Ads**. Supply the approved Ads application's Login with Amazon client ID/secret, select NA/EU/FE, then sign in and authorize advertising access. Register the wizard's exact `/api/amazon-ads/callback` redirect URI in the app first. A refresh token can also be entered directly. Server-side OAuth state expires after ten minutes; encrypted connection storage keeps tokens out of client responses. Loading accounts fetches authorized advertising profiles; select the correct seller/vendor, country and currency.

Amazon requires an [approved Ads API application](https://advertising.amazon.com/about-api/). Credentials alone do not grant account access or product eligibility. OAuth contracts, Sponsored Products resources and report requests follow [Amazon's official API request collection](https://github.com/amzn/ads-advanced-tools-docs/tree/main/postman).

The builder supports **Sponsored Products** with automatic targeting, manual exact/phrase/broad keywords, or ASIN product targets; negative phrases; start/end dates; a default bid; and an average daily budget. Supported builder currencies are USD/CAD/GBP/EUR/AUD. Seller accounts use existing seller SKUs; vendor accounts use ASINs. The product picker reads existing product ads with pagination. It is not a complete seller-catalog/eligibility service and does not create marketplace listings, images, Sponsored Brands or Sponsored Display creatives.

Save and review the exact account, products, targeting and budget. **Create paused campaign in Amazon** creates a paused campaign, an ad group, product ads, targeting and negative keywords, saving every returned resource ID. A separate launch review explicitly enables delivery. The campaign uses down-only bidding and no placement bid increases. Amazon's daily budget is an average, not a guaranteed hard daily spend cap.

## State, recovery and reporting

Each draft and submission persists under `amazon-ads/`, bound to the authorized account and revision. Only one operation can claim a submission. After an ambiguous timeout or partial creation, the interface reports the saved stage and IDs; it does not blindly resubmit or launch incomplete resources. Check Amazon status and inspect the saved IDs in the Amazon console. Any created resources were requested under a paused campaign, but a timeout must not be treated as proof of the remote state.

Before launch, the adapter verifies the live campaign budget, dates, bidding, placements, ad group, product ads, keywords, targets and negative keywords against the saved review. External changes block launch. Pause remains available. No campaign was created or launched against a live account during implementation; first live use needs an authorized approved account.

Performance requests use Amazon reporting v3 for the previous 7 or 30 complete days in the profile timezone. Request the report, then check it when Amazon finishes. Saved results show spend, impressions, clicks, 14-day attributed purchases/sales, ACOS and ROAS and can export CSV. Missing metrics remain unknown. Signed S3 downloads use no Ads credentials, no redirects, bounded download/decompression sizes and validated report rows. Attribution is not profit or bank receipts, and recent conversions can change.

If a process crashes while holding a local lock, first stop that process and inspect saved submission state plus the Amazon account. Only then may an operator remove its stale `.lock` file. Never remove a `.submitted` claim to replay an ambiguous campaign creation. Back up the complete private data directory; deployments require a persistent volume and authenticated owner gateway.
