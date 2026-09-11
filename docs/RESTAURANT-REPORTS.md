# Restaurant sales patterns and reviewed opening time

Open **Money → Restaurant sales patterns**, or **Restaurant → Sales patterns** (`/restaurant/finance?tab=reports`). This is a Money permission: an employee who can work a shift or operate the kitchen does not automatically receive restaurant financial reports or downloads.

## Record actual opening time

When reviewing a daily close, enter **Hours open** and **Additional minutes** with the cash count and review evidence. Count the actual elapsed time the restaurant accepted orders across its channels. Add split lunch/dinner services, exclude closed breaks, and count overlapping services only once. This is restaurant opening time, not staff labor hours or the sum of table occupancy. Assign overnight service to the configured business day.

The close and opening-time evidence commit together. A fully closed day has no opening time and stays excluded from service averages. The duration cannot exceed the actual elapsed length of the configured business day; spring and autumn clock changes are accounted for. Restaurant timezone and business-day boundaries cannot change after a close has been recorded.

Older integrations can still close a day without opening time. Such a day remains **unknown for hourly comparison**; Shuug does not infer its hours from today's reservation schedule. On Sales patterns, expand **Review or correct opening time**, choose a reviewed open day, record the actual duration and supporting evidence, then save. Corrections append the reviewer, timestamp and previous versions. They preserve the original close, cash variance and journal entries. Competing reviews use the observed revision, so only one can succeed; exact retries return the original result.

## Compare dates and weekdays

Choose inclusive first/last business dates, **Last 28 days**, or **All recorded dates**. An explicit range supports up to 366 days and also shows the immediately preceding period of equal length. Dates use the restaurant timezone and business-day boundary; a current unfinished day is listed as lacking a reviewed close. Future business dates are rejected.

The default comparison is **per reviewed open hour**. Each weekday's rate is its recorded sales or covers divided by its total reviewed opening hours. This weights the denominator by actual exposure instead of averaging daily rates. For example, 20 recorded covers in two hours is 10 per hour; 30 covers in ten hours is three per hour. The shorter service has fewer covers per day but a higher hourly rate.

The report retains ordinary **per reviewed open day** averages as a selectable comparison. Zero-sales open days count as observations. Fully closed days are separate, and unreviewed dates remain unknown. A weekday needs at least three reviewed open dates, and an hourly ranking also requires hours for every observed open date of that weekday. At least two qualifying weekdays are needed to identify busy/quiet days. Ties are shown explicitly. Partial hourly rates can still be inspected with their missing-hour counts; they do not qualify that weekday for a ranking.

Period percentage comparisons require complete close coverage, at least three open dates in each period and complete opening-time evidence when using hourly rates. A zero prior rate has no percentage baseline. The sample threshold is a product guard against extremely sparse comparisons, not statistical significance. Periods can still differ in weekday mix, holidays, weather, prices, staffing or seasonality. These descriptive results do not forecast demand or prove that a special caused additional business.

## Understand the totals

- Weekday demand uses sales after accepted discounts, before credits, tax and tips. It preserves the demand recorded on the service day.
- Period net sales and food credits use the dates on reviewed financial closes, including a later credit posted on a non-service day.
- Menu, channel and clock-hour totals follow the **original service date**, with credits recorded through the chosen end date. They can differ from posting-date net sales. Portions remain quantities actually served.
- Dine-in covers deduplicate multiple checks linked to the same party. Takeaway and online covers use the counts recorded on checks. These are not unique customer counts or measures of customer retention.
- Menu/channel/hour totals also include served checks on dates that do not yet have a reviewed close. The report shows how many such service dates remain unclosed; weekday rankings use only reviewed closes.
- The clock-hour panel shows sales attributed to serving time, without within-hour opening-time normalization. Reviewing total opening duration does not establish which individual clock hours were open.
- Special candidates use **current** stock and ingredient costs even when historical report dates are selected. Food contribution excludes labor, overhead, discounts and advertising; it is not net profit. Continue through Marketing → Restaurant specials to review a limited offer.

Choose **Download service-day CSV** to export the selected reviewed dates, service status, opening minutes, covers, checks and financial totals. Amount columns explicitly use USD cents. Unknown opening time stays blank; a closed day has zero minutes. The export excludes guest identities, payment references and private review evidence. The financial close and detailed opening-time history remain available to authorized Money users in the application.

## Backend and MCP

`GET /api/restaurant/reports` returns the aggregate report with signed-in Money view access. Optional query parameters are `from`, `to` and `basis` (`open_hour` or `open_day`). Add `format=csv` for a private attachment. The finance/operations read APIs accept the same report filters, and the Finance/Manage pages accept them with `tab=reports`. Dates must be paired and repeated filter parameters are rejected.

MCP tool and backend operation `restaurant_report` accept the same fields as JSON. The existing `business_read` resource `restaurant-accounting` includes the default report. `restaurant_catalog` publishes `hours.review` and the optional `openMinutes` field on `close`:

```json
{
  "action": "hours.review",
  "requestId": "<new UUID; reuse exactly on retry>",
  "input": {
    "closeId": "<reviewed open close UUID>",
    "revision": 0,
    "openMinutes": 480,
    "evidence": "Verified door log: 10:00–14:00 and 17:00–21:00",
    "reviewed": true
  }
}
```

Use revision `0` only when no opening-time review exists. Later edits use the last observed opening-time revision. Web mutations require Money edit and the configured application origin; backend/MCP credentials authorize the deployment. Nothing in reporting buys advertising, sends messages, changes customer charges or rewrites closed books.

Domain and component tests cover duration weighting, missing/closed/zero days, ties, credits across dates, party deduplication, range validation, daylight-saving boundaries, correction history, authority and real form controls. The installed HTTP check covers a synthetic completed restaurant day, filters/coverage, channel totals, concurrent corrections, private CSV, rendered controls and cross-process persistence. Visual acceptance remains dependent on the configured UI tools. Seasonal adjustment, customer retention, integrated labor/overhead profitability, forecasting and causal campaign measurement remain unfinished.
