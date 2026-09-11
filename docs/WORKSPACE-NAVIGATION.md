# Workspace profiles and navigation

Branding & workspace (`/branding`) is the organization-wide configuration surface. Select Sales / products, Service industry, Nonprofit, or any combination. Service templates can be combined: field, professional, appointment and managed services. No template deletes records.

The sidebar profile selector chooses which enabled profile you are currently using. Shared tools remain available. A saved per-tool toggle cannot expose a tool belonging to an unselected profile. Group switches hide an entire group; individual switches hide only that tool. These are navigation preferences, not authentication controls.

The workspace rail places **Mail immediately below Assistant, followed by Notes and My roadmap**. Notes can be created and edited, discussed with AI, and used to build a durable roadmap. Both the saved configuration and per-person navigation preferences remain available.

Sales/product tools sit under Sales, Distribution and Operations. Shared contacts/contracts move into Services or the appropriate nonprofit grouping when product mode is not selected. Nonprofit fundraising and programs have separate groups and permission sections; volunteers are under Team and governance under Setup. Taxes, accounting views, funds and service billing are under Money. Shopify and MCP configuration are under Setup and work without a current Shopify store.

All 40 specialist module links now open forms and validated workflow actions. Read [operational workflow coverage](WORKFLOWS-AND-RELEASE.md) for the exact implementation and the remaining advanced automation requirements. Showing a tool does not make an unconfigured provider connection active.

The profile-specific home view uses the records for the selected service/nonprofit profile, including unassigned work, waiting proposals, accepted work to invoice, reports, volunteer shifts, program costs and enrollment waitlists. Hybrid profiles combine their workspaces.

Branding includes logo, name, tagline, primary/accent/background/sidebar/header colors and the browser icon/title. Saved configuration can be exported as a reusable business template with custom tool definitions; credentials and operational records are excluded. Imported configuration is previewed before application.

Current authentication is single-owner sign-in or an owner gateway. Role selection remains an owner preview. Source-page checks prevent notes/planning and specialist record surfaces from crossing configured section boundaries, but individual staff authentication and full legacy authorization coverage are still release gates.

Automated component tests cover profile selection, saving and visibility. Visual UI interaction verification remains blocked by the unavailable IsolatedTester MCP transport; no alternative browser runtime was used.
