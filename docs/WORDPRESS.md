# WordPress plugin

The uploadable plugin is built with `npm run wordpress:package` and written to `dist/shuug-business-wordpress-0.1.0.zip`. Its source is in `integrations/wordpress/shuug-business`. The complete source archive also includes the backend and plugin together.

**This version connects WordPress to the existing backend. It requires a separately running Node.js backend; it is not a standalone PHP port.** WordPress can be the public website and employee entry point while the backend keeps the business data shared with the existing application and optional Shopify/MCP connections.

## Install and connect

1. Install the backend from the main README, configure its owner password, and deploy it behind HTTPS. Set `APP_BASE_URL` to its exact public origin.
2. Upload the plugin ZIP in WordPress under **Plugins → Add New → Upload Plugin**, then activate it. Requirements: WordPress 6.6+, PHP 8.2+, and PHP OpenSSL. This release was exercised on WordPress 7.1 / PHP 8.5 with the official SQLite integration used only for the disposable test database.
3. Set the backend origin under **Business → Connection**. Do not append `/api` or a page path. No shared owner token or password is stored in this setting.
4. Open **Business**, enter your backend account credentials, and connect. Only WordPress administrators can choose the backend owner connection. Other users must connect their individual employee accounts.
5. Add `[shuug_workspace]` to a WordPress page. Visitors first sign in to WordPress, then connect their own business account. `[shuug_login]` is an alias for this protected workspace surface.
6. Create or activate backend employees through **Employee accounts**. Give those employees WordPress user accounts with `read` capability, such as Subscribers. Share backend activation links directly; the plugin sends no invitation email.


For public website capabilities, configure [customer accounts, booking, pricing and ordering](CUSTOMER-WEBSITE.md) in Shuug, then reload **Business → Connection** in WordPress and select the available capabilities. Public quote/contact/volunteer forms use selected form shortcodes; account links open the private backend. Customer login is separate from employee and WordPress login.

Exclude the shortcode page and `/wp-json/shuug-business/v1/*` from any page/CDN cache. WordPress cookies and REST nonces identify the current WordPress login. Backend session tokens stay on the WordPress server in authenticated encryption, keyed to that specific WordPress login and configured backend origin.

For restaurant table bookings, configure **Operations → Restaurant booking hours**, select **Reserve a restaurant table** in the WordPress connection screen, and add `[shuug_restaurant_booking]`. It opens guest availability, confirmation and private rescheduling/cancellation against the shared floor.

For restaurant pickup, enable ordering and publish pickup times in **Operations → Online food ordering**, select **Order food for pickup** in the WordPress connection screen, and add `[shuug_restaurant_ordering]`. It opens the backend menu and private order-status flow; payment is collected at pickup. To attach a specific published offer, use `[shuug_restaurant_ordering special="YOURCODE"]`; the plugin validates and forwards the code to the backend review form. Staff scheduling and clock-in/out are available in the full application, including each employee’s My work area. See [restaurant operations](RESTAURANT.md).

## Included interfaces

| WordPress area | Working behavior |
| --- | --- |
| My work | Personal assignments, task creation, priorities, goals, deadlines and status updates. |
| Notes | Create/edit private notes, source-page access checks, and discussing selected notes with AI. |
| My roadmap | Personal conversations, AI drafts, manual plans, editable milestones, due dates and saved progress. |
| Business records | All 40 service/nonprofit modules follow enabled profiles and permissions. Native forms use the backend's record contracts; references, revision checks, transitions, financial safeguards and history use the shared backend. |
| Team tasks | Authorized roles create/reassign tasks and update the shared board. |
| Employee accounts | Owners create/link employees, change roles, generate setup/reset links and disable accounts. |
| Branding & profiles | Name, colors, logo text, mixed organization profiles, service templates, and group/tool toggles. |
| My account | Identity, password changes and connection logout. |
| Open full application | A short-lived ticket opens the complete application's remaining interfaces after confirming the displayed identity. This includes product sales, mail, accounting, provider configuration, imports/exports and advanced administration. |

The WordPress UI reads current backend data when opening or refreshing a view. It does not maintain a second business database or run a scheduled synchronization copy. Shopify, MCP and WordPress operate on the same backend where their applicable workflows use those records; Shopify's own native commerce snapshots retain the boundaries described in the Shopify guide.

AI requires the backend's configured provider. Manual notes, records and roadmaps work without AI. Allow long-running requests through your WordPress/PHP proxy for AI responses; the plugin's HTTP timeout for planning is 130 seconds.

## Permissions and sessions

Backend credentials are checked by `/api/wordpress`. Its allowlisted operations use the same authorization guards and record services as the application. No caller-supplied user ID or role establishes an identity. Request-scoped server contexts keep concurrent users separate.

Employees retain private tasks, notes and roadmaps. Broader section roles intentionally grant access to shared records in those sections. Backend owner authority requires the actual owner password; a WordPress Administrator does not automatically become the backend owner. Downgrading a WordPress administrator invalidates their local owner connection.

Changing the configured backend address changes the local session-storage key, so an existing credential is never forwarded to the newly configured origin. Remote requests validate HTTPS/public URLs, disable redirects, verify TLS, and bound request/response sizes. Loopback development requires both `WP_ENVIRONMENT_TYPE=local` and the explicit `SHUUG_ALLOW_LOCAL_BACKEND=true` constant.

Back up WordPress's database and salts with the normal site backup. Back up the complete backend data directory separately. Uninstalling the plugin removes only local plugin configuration/session transients, never backend records. This is account connection, not SSO/MFA or a WooCommerce synchronization plugin.

## Verification

```sh
npm run test:wordpress
npm run build
npm run wordpress:package
```

For the full WordPress runtime check, prepare a disposable WordPress source tree from the official release ZIP and install the official SQLite Database Integration source under `wp-content/plugins/sqlite-database-integration`; copy its `db.copy` to `wp-content/db.php`. Do not use an existing site's database. Then run:

```sh
npm run wordpress:smoke -- /absolute/path/to/wordpress-source
```

The script copies that source into a new temporary fixture, starts a private production backend with synthetic accounts, activates the plugin in WordPress, exercises real WordPress authentication/capability/nonce APIs and backend requests, tests isolation and persistence across PHP processes, and stops/removes the fixture. It blocks outbound WordPress mail and automatic update/cron traffic. No browser runtime is used.

The verification scripts cover unit/domain checks, TypeScript, the production build, and installed HTTP workflows. Current industry and customer capability evidence is tracked in [the acceptance audit](INDUSTRY-AND-WEBSITE-ACCEPTANCE.md). The WordPress runtime check also verified the confirmation form, rejected invalid confirmation tokens and reused launch links, and opened the employee's full application with administrator access still blocked. Lint reported no errors and three existing image warnings.

UI logic is also covered by DOM component tests. Visual inspection remains blocked until the configured IsolatedTester MCP transport is restored; runtime and HTTP tests do not establish visual usability or compatibility with every WordPress theme/cache/security plugin. A production MySQL/MariaDB deployment, load profile, SSO/MFA and independent security review remain separate deployment checks.

Implementation references: [WordPress plugin headers](https://developer.wordpress.org/plugins/plugin-basics/header-requirements/), [REST permission callbacks](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-custom-endpoints/), [cookie authentication and nonces](https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/), and [safe remote requests](https://developer.wordpress.org/reference/functions/wp_safe_remote_request/).
