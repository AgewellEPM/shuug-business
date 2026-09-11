=== Shuug Business ===
Contributors: lukekist
Tags: business, employee, nonprofit, service, workflow
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.2
Stable tag: 0.1.0
License: MIT
License URI: https://opensource.org/license/mit

Employee work, private notes, AI roadmaps and business workflows connected to your self-hosted Shuug Business backend.

== Description ==

This is a connected WordPress plugin. It requires the matching self-hosted Shuug Business Node.js backend. The backend is not converted to PHP and does not run inside a standard WordPress hosting account. The complete backend source is distributed with the parent Shuug Business project, without a feature paywall.

The plugin includes:

* Website capability discovery and selection under Business > Connection.
* Customer login, agreed-work booking, customer-specific prices, wholesale ordering and order-status links.
* Published quote/contact forms and volunteer signup into backend business records.

* A Business workspace in WordPress admin and the [shuug_workspace] page shortcode.
* Individual employee account connections and server-side encrypted session storage.
* Personal tasks, deadlines, status updates and task creation.
* Shared team assignments for authorized roles.
* Private notes and AI conversations with selected notes; editable/manual roadmaps and progress.
* Native forms, record history and validated transitions for the 40 service/nonprofit modules.
* Owner employee-account creation, role updates, setup/reset links and disabling.
* Branding, mixed organization profiles, service templates, and group/tool visibility.
* A short-lived, one-use launch flow into the full application for its remaining interfaces, including product sales, accounting, integrations, imports/exports and advanced setup.

WordPress users connect their existing business accounts. WordPress roles do not automatically grant backend roles. Only a WordPress administrator can connect a backend owner account, and the actual backend owner password is still required. Employee permissions and private data are checked again by the backend on every request.

== Installation ==

1. Install and run the matching Shuug Business backend. Configure its owner password and APP_BASE_URL with its public HTTPS origin.
2. In WordPress, use Plugins > Add New > Upload Plugin and select shuug-business-wordpress-0.1.0.zip. Activate it.
3. Open Business > Connection and save the backend HTTPS address without a path, for example https://business.example.org.
4. Open Business and connect your business account. WordPress administrators may check "Connect as the workspace owner" and enter the backend owner password.
5. Add [shuug_workspace] to a WordPress page for employees. [shuug_login] is an alias for the same protected workspace/login surface.
6. Employees need a WordPress account with read access and an active backend employee account. Backend setup links are created in Employee accounts and shared manually. No invitation email is automatically sent.
7. For public website capabilities, enable customer access and publish forms in Shuug Setup > Attach, then reload Business > Connection, select capabilities and add their shortcodes. Use [shuug_customer_login], [shuug_book_service], [shuug_pricing], [shuug_wholesale], [shuug_order_status], [shuug_quote], [shuug_volunteer] or [shuug_contact]. Customers do not need WordPress accounts.
8. Exclude the workspace page and /wp-json/shuug-business/v1/* from page/CDN caches.

PHP OpenSSL is required for encrypted session storage. The PHP server must be able to reach the backend over HTTPS. AI requests can take up to 130 seconds; the backend AI provider must be configured separately. No AI model is downloaded by this plugin.

Invoice payments and one-time donations use Stripe Checkout through the backend. Enable them under Money → Website payments; configure the signing secret and payment worker. Add [shuug_pay_invoice] or [shuug_donations]. Test payments do not post financial records. Confirmed booking requires published availability for agreed service work; the separate appointment request form does not confirm a booking. Volunteer signups require staff onboarding review.

== External service and privacy ==

The external service is the backend address configured by this site's administrator. This plugin does not contact a project-operated SaaS service and has no telemetry.

When a signed-in user connects an account, their entered business email/password is sent through this WordPress server to that configured backend. Passwords are not saved by the plugin. Backend session credentials are encrypted with keys derived from this WordPress site's salts and stored in expiring WordPress transients. They are not returned to page JavaScript. User-initiated work requests send the relevant form values, selected notes, or requested record identifiers to the same backend.

Business records, permissions, private notes, roadmaps, employee identities and workflow history remain in the backend. Data is loaded when a user opens or refreshes a workspace view; writes update the same records used by the full application, Shopify integration and MCP. No parallel WordPress copy of the business database is created.

AI conversations use the provider configured on the backend. Review that deployment's provider, privacy terms and data handling before using AI with sensitive information. The plugin itself provides no third-party terms of service; the site operator is responsible for its self-hosted backend and configured services.

Deactivating the plugin retains its local connection setting. Uninstalling deletes that site's local connection setting and transient sessions. Backend business data is never deleted. A backend token can remain valid until expiry if WordPress cannot reach the backend to revoke it; owners can revoke sessions by disabling/resetting the backend account.

== Frequently Asked Questions ==

= Does this run entirely in WordPress/PHP? =
No. WordPress provides native workspace interfaces and connects to the separately hosted backend. Use the full source distribution to host the backend yourself.

= Does it require Shopify or WooCommerce? =
No. Shopify remains an optional backend connection. This plugin does not add WooCommerce order synchronization.

= Where are the other application screens? =
Choose "Open full application". A one-use launch ticket opens the same account and permissions in the complete application after you confirm the displayed identity. The app is not embedded in a cross-origin iframe.

= Is this single sign-on? =
No. Users sign into WordPress and connect their own business account for that WordPress login session. WordPress authentication and backend authorization remain distinct. Changing a backend password or disabling an employee invalidates its WordPress business connection.

= Can I test locally? =
Only an explicitly local WordPress installation can use a loopback backend. Set WP_ENVIRONMENT_TYPE to local and SHUUG_ALLOW_LOCAL_BACKEND to true in wp-config.php, then use http://127.0.0.1:3000. Production connections require HTTPS. Never enable this local exception on a public site.

== Changelog ==

= 0.1.0 =
* Initial connected WordPress release with private employee work, specialist workflows, account administration, branding, and full-application launch.

Restaurant pickup: enable restaurant ordering and pickup times in Shuug, select Order food for pickup under Business → Connection, and add [shuug_restaurant_ordering]. Orders use payment at pickup and the shared restaurant inventory/kitchen backend.

Restaurant reservations: configure opening hours and bookable tables in Shuug, select Reserve a restaurant table under Business → Connection, and add [shuug_restaurant_booking]. Guests can search, confirm and privately reschedule/cancel through the shared restaurant backend.

Restaurant specials: after publishing an offer in Shuug, use [shuug_restaurant_ordering special="YOURCODE"] to prefill its code. Eligibility, prices, discount limits and recorded results are handled by the backend. This does not purchase or send advertising.
