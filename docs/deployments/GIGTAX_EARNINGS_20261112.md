# GigTax agent earnings — November 12

Luke approved the current console screenshot and requested revenue/earnings in
its top corner to help agents see progress. He confirmed this commission plan:
$100 per paid office signup; $50 per collected monthly renewal starting in month
two; a $2,000 bonus once at each agent's first 10 paid offices. It does not repeat
at 20 offices. The existing office offer remains $500 initially, then $300/month
for eleven more months. Payments remain deferred; no payment or payout is initiated.

Source checkout: `/Users/lukekist/Worktrees/GigTaxProsSalesIntegrated-20261107`,
branch `feat/gig-tax-pros-sales-integrated`. Live deployment is
`dpl_Ao5ZuiPMG2opPtr3yjqGJwJLDG2u` at https://gigtax.pro/sales, source
`5d9ddc7` (GitHub SHA verified). It replaces the exact verified baseline
`dpl_98Q6B9mVuKY1JQp2x19Q7C3Q6irU`. Tested release: `~/BuildCache/GigTaxEarnings-20261112/release-verified`.

The persistent green card in the top bar displays **Your earnings** for agents
and **Team earnings** for the owner. It shows estimated earned commission and
active monthly residual. Expand it for signup/monthly/bonus amounts, signed but
unpaid commission, first-ten progress and potential future monthly residual.
A Find your next office action opens existing discovery. It stays visible across
tabs and adapts to narrow windows. No fake sales, animation of invented income,
real prospect population, payment connection or external outreach is added.

`commission.earnedCents` counts verified initial live receipts and canonical
paid monthly invoice receipts, with per-agent bonus thresholds. Initial payments
never earn the month-two residual. Signed agreements with no payment earn zero.
Test-mode payments, refunds/review holds, duplicate initial/renewal invoices and
unrelated agents cannot inflate totals. The card is an estimate, separate from
actual payout records. Historical credit remains with the contract's original
agent after reassignment; only aggregate amounts are returned for former offices.
If the owner prepares an invitation for an assigned agent, that agent receives
credit and the preparer is recorded separately.

The existing read-only billing reconciliation now retains a bounded list of
already-verified invoice facts for commission calculations. It makes no new
provider requests; existing payment/cancellation/refund commands and guards are
unchanged. Older canonical snapshots without invoice history need billing review
before missing monthly commissions can be counted. Nothing was inferred from
elapsed time. Actual Stripe acceptance and actual agent payouts remain unverified.

Verification: all 166 final focused checks pass, including the shipped earnings
DOM, real synthetic stdio MCP, financial calculations and billing regressions.
The release guard verified all 176 baseline artifacts, preserves 88 static files
exactly, retains routes/CSP/headers and checkout/provider code exactly, and limits
changes to three private UI files plus service/billing/revenue modules. Candidate
has 180 artifacts. Public content, contact tools, contracts and signup map are
preserved. Human visual acceptance of the new card is pending.

Illustrative economics for 10 offices paying all scheduled charges:

| Period | Office payments | Agent commission | GigTax before other costs |
| --- | ---: | ---: | ---: |
| First month | $5,000 | $3,000 ($1,000 signup + $2,000 bonus) | $2,000 |
| Each of months 2–12 | $3,000 | $500 | $2,500 |
| Full initial 12 months | $38,000 | $8,500 | $29,500 |

Those remaining amounts must cover actual payment fees, onboarding, support,
advertising, app infrastructure, overhead and other costs. They are not net
profit. Cash receipts, retention and those costs determine break-even; no profit
or distribution outcome is guaranteed. The one-time bonus is counted per agent,
never by pooling different agents' six and four sales into one threshold.

The unrelated untracked How It Works HTTP receipt remains untouched.

Live receipt `gigtax-earnings-live-20261112.json` verifies all 180 artifacts,
all 91 static HTTP responses and 88 protected static files/headers. Installed
Shuug MCP reads the deployed commission plan and zero real earned amounts,
consistent with zero offices/agents/contracts and deferred payments. Anonymous
and foreign-origin guards pass. No real message, payment or payout was created.
The existing Safari sales tab was refreshed for Luke; new-card visual acceptance
remains pending.
