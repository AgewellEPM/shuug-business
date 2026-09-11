import type { SectionKey } from "../permissions/model";
import type { ToolLink } from "../features/model";
import { appModules, appModuleSectionForPath } from "../sdk/registry";
import type { IndustrySetup as IndustryConfiguration } from "../industry/model";
import { packDefaultVisible } from "../industry/catalog";
import { restaurantWorkspaceLink } from "../restaurant/navigation";

export { appModuleSectionForPath };

export const organizationTypes = ["product", "service", "nonprofit"] as const;
export type OrganizationType = typeof organizationTypes[number];
export const serviceTypes = ["field", "professional", "appointment", "managed"] as const;
export type ServiceType = typeof serviceTypes[number];
export const organizationOptions = [
  { id: "product" as const, label: "Sales / products", description: "Buy or make, sell, fulfill and collect." },
  { id: "service" as const, label: "Service industry", description: "Agree the work, schedule, deliver and bill." },
  { id: "nonprofit" as const, label: "Nonprofit", description: "Raise funds, deliver programs and report results." },
];
export const serviceOptions = [
  { id: "field" as const, label: "Field services" }, { id: "professional" as const, label: "Professional services" },
  { id: "appointment" as const, label: "Appointments" }, { id: "managed" as const, label: "Managed services" },
];
export const navigationGroups = [
  { label: "Sales", icon: "orders" }, { label: "Services", icon: "orders" },
  { label: "Fundraising", icon: "money" }, { label: "Programs", icon: "calendar" },
  { label: "Distribution", icon: "map" }, { label: "Marketing", icon: "marketing" },
  { label: "Operations", icon: "products" }, { label: "Money", icon: "money" },
  { label: "Team", icon: "customers" }, { label: "Setup", icon: "settings" },
] as const;
export type NavigationGroup = typeof navigationGroups[number]["label"];
export interface WorkspaceItem {
  id: string; label: string; href: string; group: NavigationGroup | "Workspace";
  section: SectionKey; icon?: string; organizations?: OrganizationType[];
  services?: ServiceType[]; status?: "planned" | "workflow"; description?: string; related?: string[];
  capabilityPacks?: string[];
}
export interface WorkspaceVisibility {
  organizationTypes?: OrganizationType[]; serviceTypes?: ServiceType[];
  hiddenSections: string[]; featureVisibility?: Record<string, boolean>;
  industrySetup?: IndustryConfiguration | null;
}
const item = (id: string, label: string, href: string, group: WorkspaceItem["group"], section: SectionKey, organizations?: OrganizationType[]): WorkspaceItem => ({ id, label, href, group, section, organizations });
const workflow = (id: string, label: string, group: NavigationGroup, section: SectionKey, organization: OrganizationType, description: string, related: string[] = [], services?: ServiceType[]): WorkspaceItem => ({ id, label, href: `/modules/${id}`, group, section, organizations: [organization], status: "workflow", description, related, services });

export const specialistModules: WorkspaceItem[] = [
  workflow("nonprofit-donors", "Donors & supporters", "Fundraising", "fundraising", "nonprofit", "Individuals, households, foundations, relationships, giving history and contact preferences."),
  workflow("nonprofit-donations", "Donations & recurring gifts", "Fundraising", "fundraising", "nonprofit", "Contributions, recurring schedules, failed payments, refunds and deposit matching."),
  workflow("nonprofit-pledges", "Pledges & commitments", "Fundraising", "fundraising", "nonprofit", "Promised amounts, installments, deadlines and balances, separate from money received."),
  workflow("nonprofit-acknowledgments", "Donation acknowledgments", "Fundraising", "fundraising", "nonprofit", "Reviewed acknowledgment templates, annual summaries, delivery history and corrections."),
  workflow("nonprofit-restrictions", "Funding restrictions", "Money", "money", "nonprofit", "Purpose and time restrictions, award conditions, approved allocations and remaining balances."),
  workflow("nonprofit-grants", "Incoming grants", "Fundraising", "fundraising", "nonprofit", "Opportunities, applications, documents, decisions, awards, payments and reporting obligations."),
  workflow("nonprofit-reimbursements", "Grant reimbursements", "Money", "money", "nonprofit", "Approved expenses, supporting service records, reimbursement claims and payment matching.", ["expenses", "reconciliation"]),
  workflow("nonprofit-budgets", "Program budgets & costs", "Programs", "programs", "nonprofit", "Program budgets versus actuals, staff time, shared costs and documented allocation methods.", ["expenses"]),
  workflow("nonprofit-funding", "Funding & cash visibility", "Money", "money", "nonprofit", "Awards, receivables, cash received, spending commitments and permitted funds remain distinct.", ["cashflow"]),
  workflow("nonprofit-campaigns", "Fundraising campaigns", "Fundraising", "fundraising", "nonprofit", "Appeals, sponsorship outreach, goals, expenses and results tied to recorded contributions."),
  workflow("nonprofit-volunteers", "Volunteer onboarding", "Team", "volunteers", "nonprofit", "Skills, availability, training, document status and appropriate access to volunteer information."),
  workflow("nonprofit-shifts", "Volunteer shifts & hours", "Team", "volunteers", "nonprofit", "Shift sign-ups, assignment approval, reminders, substitutions, check-in and verified hours."),
  workflow("nonprofit-enrollment", "Program enrollment", "Programs", "programs", "nonprofit", "Applications, eligibility review, required documents, waitlists, enrollment and referrals."),
  workflow("nonprofit-participants", "Participants & service records", "Programs", "programs", "nonprofit", "Assigned staff, service history and authorized notes with access separate from fundraising."),
  workflow("nonprofit-sessions", "Program sessions & attendance", "Programs", "programs", "nonprofit", "Rooms, locations, staff, capacity, recurring sessions, attendance and cancellations."),
  workflow("nonprofit-outcomes", "Outcomes & evidence", "Programs", "programs", "nonprofit", "Measures, baseline and follow-up results, reporting periods and missing evidence."),
  workflow("nonprofit-reporting", "Funder & board reports", "Programs", "programs", "nonprofit", "Reporting deadlines, reviewed financials, program evidence, templates and submissions."),
  workflow("nonprofit-events", "Events & sponsorships", "Fundraising", "fundraising", "nonprofit", "Registration, tickets, attendance, sponsors and event costs, with purchases separate from gifts."),
  workflow("nonprofit-memberships", "Memberships & renewals", "Fundraising", "fundraising", "nonprofit", "Membership types, dues, benefits, renewals, grace periods and communications."),
  workflow("nonprofit-governance", "Board & governance", "Setup", "governance", "nonprofit", "Meeting materials, minutes, policies, approval records and filing or renewal reminders."),
  workflow("service-clients", "Clients & service locations", "Services", "services", "service", "Client contacts, billing details, properties, access instructions, agreements and work history."),
  workflow("service-intake", "Inquiries & intake", "Services", "services", "service", "Requests, required questions, attachments, assignment, response deadlines and follow-up."),
  workflow("service-catalog", "Service catalog & rates", "Services", "services", "service", "Fixed and hourly prices, packages, minimums, travel charges and effective-dated client rates."),
  workflow("service-proposals", "Estimates & proposals", "Services", "services", "service", "Scope, exclusions, deliverables, labor and materials, revisions and customer acceptance."),
  workflow("service-agreements", "Agreements & deposits", "Services", "services", "service", "Signed terms, payment schedules, deposits, cancellation terms and start-work conditions.", ["contracts"]),
  workflow("service-booking", "Booking & scheduling", "Services", "services", "service", "Availability, duration, buffers, reminders, rescheduling and conflict prevention.", ["calendar"]),
  workflow("service-work", "Work orders & projects", "Services", "services", "service", "Tasks, milestones, dependencies, instructions, deadlines and responsible people.", ["tasks"]),
  workflow("service-resources", "Staff & resource allocation", "Team", "services", "service", "Skills, worker availability, equipment, rooms, workload and assignment conflicts."),
  workflow("service-time", "Time & job expenses", "Services", "services", "service", "Billable time, travel, materials, subcontractor costs, receipts and approvals.", ["expenses", "worktrack"]),
  workflow("service-mobile", "Mobile work execution", "Services", "services", "service", "Job instructions, checklists, photos, documents, sign-off and offline capture.", [], ["field"]),
  workflow("service-changes", "Scope changes & extra work", "Services", "services", "service", "Written change requests, price and schedule impact, approval and original agreement history."),
  workflow("service-portal", "Service client portal", "Services", "services", "service", "Proposal approval, appointments, milestones, documents, information requests and payments."),
  workflow("service-completion", "Completion & acceptance", "Services", "services", "service", "Checks, submitted deliverables, acceptance, unresolved issues and billing evidence."),
  workflow("service-billing", "Service billing", "Money", "money", "service", "Fixed-fee, hourly, materials, milestones, deposits and recurring billing without duplicate charges."),
  workflow("service-recurring", "Recurring service agreements", "Services", "services", "service", "Visits, included services or hours, usage, overages, renewals and cancellation dates."),
  workflow("service-collections", "Service payments & collections", "Money", "money", "service", "Service invoice payments, reminders, disputes, credits, refunds and accounting reconciliation.", ["collections", "payments", "reconciliation"]),
  workflow("service-profitability", "Job & project profitability", "Money", "money", "service", "Estimated versus actual labor, materials, subcontractors and expenses, with missing costs flagged."),
  workflow("service-capacity", "Capacity & backlog", "Services", "services", "service", "Committed work, deadlines, available capacity, overloaded teams and forecast workload."),
  workflow("service-rework", "Complaints, callbacks & rework", "Services", "services", "service", "Customer issues, original jobs, corrective visits, resolution and billable or included work."),
  workflow("service-renewals", "Renewals & repeat business", "Services", "services", "service", "Expiring agreements, maintenance due, customer follow-up and outstanding proposals."),
];

export const workspaceItems: WorkspaceItem[] = [
  { ...item("my-work", "My work", "/me", "Workspace", "home"), icon: "home" },
  { ...item("home", "Home", "/", "Workspace", "home"), icon: "home" },
  { ...item("today", "Today", "/today", "Workspace", "home"), icon: "today" },
  { ...item("calendar", "Calendar", "/calendar", "Workspace", "home"), icon: "calendar" },
  { ...item("assistant", "Assistant", "/copilot", "Workspace", "home"), icon: "assistant" },
  { ...item("blueprint", "My workspace", "/blueprint", "Workspace", "admin"), icon: "home" },
  { ...item("handlers", "AI Handlers", "/handlers", "Workspace", "admin"), icon: "assistant" },
  { ...item("inbox", "Mail", "/inbox", "Workspace", "team"), icon: "mail" },
  { ...item("notes", "Notes", "/notes", "Workspace", "home"), icon: "notes" },
  { ...item("roadmap", "My roadmap", "/copilot?tab=roadmap", "Workspace", "home"), icon: "map" },
  item("pipeline", "Sales pipeline (CRM)", "/pipeline", "Sales", "sales", ["product", "service"]),
  item("orders", "Orders", "/orders", "Sales", "sales", ["product"]),
  item("customers", "Contacts & customers", "/customers", "Sales", "sales"),
  item("customer-imports", "Import contacts", "/customers/import", "Sales", "sales"),
  item("products", "Products & pricing", "/products", "Sales", "sales", ["product"]),
  item("contracts", "Contracts", "/contracts", "Sales", "sales"),
  item("samples", "Samples", "/samples", "Sales", "sales", ["product"]),
  item("distribution", "Distribution overview", "/distribution", "Distribution", "distribution", ["product"]),
  item("visits", "Store finder", "/visits", "Distribution", "distribution", ["product"]),
  item("territories", "Territories", "/distribution?tab=territories", "Distribution", "distribution", ["product"]),
  item("delivery-routes", "Delivery routes", "/distribution?tab=routes", "Distribution", "distribution", ["product"]),
  item("marketing", "Marketing overview", "/marketing", "Marketing", "marketing"),
  item("google-ads", "Google Ads", "/ads", "Marketing", "marketing"),
  item("amazon-marketing", "Amazon Ads", "/amazon-marketing", "Marketing", "marketing", ["product"]),
  item("social", "Social marketing", "/social", "Marketing", "marketing"),
  item("amazon", "Shipping pipeline", "/amazon", "Operations", "operations", ["product"]),
  item("operations", "Inventory & shipping", "/operations", "Operations", "operations", ["product"]),
  item("production", "Production", "/production", "Operations", "operations", ["product"]),
  item("costs", "Costs & volume", "/costs", "Operations", "operations", ["product"]),
  item("traceability", "Traceability & recall", "/traceability", "Operations", "operations", ["product"]),
  item("restaurant", "Restaurant (kitchen & reservations)", "/restaurant", "Operations", "operations"),
  { ...item("restaurant-booking-rules", "Restaurant booking hours", "/restaurant/reservations", "Operations", "operations"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-online", "Online food ordering", "/restaurant/manage?tab=website", "Operations", "operations"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-orders", "Restaurant orders", "/restaurant/manage?tab=orders", "Operations", "operations"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-specials", "Restaurant specials", "/restaurant/specials", "Marketing", "marketing"), capabilityPacks: ["restaurant", "marketing"] },
  { ...item("restaurant-prep", "Prep batches & yields", "/restaurant/manage?tab=prep", "Operations", "operations"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-stocktakes", "Physical inventory counts", "/restaurant/manage?tab=stocktakes", "Operations", "operations"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-stocktake-review", "Inventory count review", "/restaurant/finance?tab=stocktakes", "Money", "money"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-credits", "Guest credits & refunds", "/restaurant/finance?tab=credits", "Money", "money"), capabilityPacks: ["restaurant"] },
  { ...item("restaurant-analysis", "Restaurant sales patterns", "/restaurant/finance?tab=reports", "Money", "money"), capabilityPacks: ["restaurant"] },
  item("assessments", "Assessments & inspections", "/assessments", "Operations", "operations"),
  item("childcare", "Childcare & classes", "/childcare", "Operations", "operations"),
  item("workorders", "Work orders (guarded)", "/workorders", "Operations", "operations"),
  item("finance", "Money overview", "/finance", "Money", "money"),
  item("accounting", "Accounting / Profit & Loss", "/books", "Money", "money"),
  item("chart-of-accounts", "Chart of accounts", "/ledger/accounts", "Money", "money"),
  item("ledger", "General ledger (double-entry)", "/ledger", "Money", "money"),
  item("balance-sheet", "Balance sheet", "/books?view=balance-sheet", "Money", "money"),
  item("sales-tax", "Sales tax", "/books?view=sales-tax", "Money", "money"),
  item("cashflow", "Cash flow", "/cashflow", "Money", "money"),
  item("collections", "Collections & receivables", "/collections", "Money", "money"),
  item("reconciliation", "Reconciliation", "/reconcile", "Money", "money"),
  item("website-payments", "Website payments", "/setup/payments", "Money", "money"),
  item("payments", "Card payments", "/billing", "Money", "money"),
  item("expenses", "Expenses & receipts", "/expenses", "Money", "money"),
  item("invoice-audit", "Supplier invoice audit", "/invoices", "Money", "money"),
  item("reports", "Reports & analytics", "/analytics", "Money", "money"),
  item("people", "People & payroll", "/team", "Team", "team"),
  item("timeclock", "Time clock & timesheets", "/timeclock", "Team", "team"),
  item("performance", "Performance & ROI", "/performance", "Team", "team"),
  item("benchmark", "Automation audit", "/benchmark", "Team", "team"),
  item("worktrack", "Work & goals", "/worktrack", "Team", "team"),
  item("tasks", "Tasks & goals", "/tasks", "Team", "team"),
  item("tools", "Tools & custom trackers", "/features", "Setup", "admin"),
  item("documents", "Documents & legal", "/documents", "Setup", "admin"),
  item("automation", "Automation rules", "/automation", "Setup", "admin"),
  item("website-setup", "Connect, configure & launch", "/setup", "Setup", "admin"),
  item("roles", "Roles & access", "/admin", "Setup", "admin"),
  item("connections", "Connections & integrations", "/settings", "Setup", "admin"),
  item("integrations", "Integrations hub", "/integrations", "Setup", "admin"),
  item("backend", "Backend & MCP", "/settings/backend", "Setup", "admin"),
  item("shopify", "Shopify connection", "/settings/backend?tab=shopify", "Setup", "admin"),
  item("branding", "Branding & workspace", "/branding", "Setup", "admin"),
  item("developer", "Developer & modules", "/developer", "Setup", "admin"),
  item("platform", "Business state layer", "/platform", "Setup", "admin"),
  ...specialistModules,
  // Developer/SDK modules — each derives its nav item straight from its manifest.
  ...appModules().map((m): WorkspaceItem => ({
    id: `module:${m.id}`, label: m.label, href: `/m/${m.id}`,
    group: (m.group as WorkspaceItem["group"]) ?? "Setup", section: m.section, icon: m.icon,
    organizations: m.organizations as OrganizationType[] | undefined, description: m.description, capabilityPacks: m.capabilityPacks,
  })),
];

export function catalogWithTools(tools: ToolLink[] = [], config?: WorkspaceVisibility): WorkspaceItem[] {
  // Built-in tools already have a category. Only custom trackers need a new entry.
  const items = [...workspaceItems, ...tools.filter(t => !workspaceItems.some(i => i.href === t.href)).map(t => ({ ...item(`tracker:${t.id}`, t.label, t.href, "Setup", "admin") }))];
  return organizeItems(items, config);
}
export function organizeItems(items: WorkspaceItem[], config?: WorkspaceVisibility): WorkspaceItem[] {
  const profiles = config?.organizationTypes ?? ["product"];
  return items.map(entry => {
    if ((entry.id === "module:staff-shifts" || config?.industrySetup?.packs.includes("restaurant")) && entry.id.startsWith("module:")) {
      const destination = restaurantWorkspaceLink(entry.id.slice(7));
      if (destination) return { ...entry, href: destination, ...(entry.id === "module:restaurant-reservations" ? { section: "operations" as const, group: "Operations" as const } : {}) };
    }
    return !profiles.includes("product") && ["customers", "customer-imports", "contracts"].includes(entry.id) ? { ...entry, group: profiles.includes("service") ? "Services" as const : entry.id === "contracts" ? "Money" as const : "Fundraising" as const } : entry;
  });
}
export type WorkspaceProfile = "all" | OrganizationType;
export function profileConfig(config: WorkspaceVisibility, profile: WorkspaceProfile): WorkspaceVisibility {
  return profile !== "all" && config.organizationTypes?.includes(profile) ? { ...config, organizationTypes: [profile] } : config;
}
export function recommended(item: WorkspaceItem, config: WorkspaceVisibility): boolean {
  if (item.organizations && !item.organizations.some(type => (config.organizationTypes ?? ["product"]).includes(type))) return false;
  return !item.services || !config.serviceTypes?.length || item.services.some(type => config.serviceTypes!.includes(type));
}
export function featureShown(item: WorkspaceItem, config: WorkspaceVisibility): boolean {
  // Saved switches never reveal tools from a profile that is not selected.
  return recommended(item, config) && (config.featureVisibility?.[item.id] ?? packDefaultVisible(item, config.industrySetup?.packs));
}
export function visibleItems(config: WorkspaceVisibility, items = workspaceItems, allowed?: SectionKey[]): WorkspaceItem[] {
  return items.filter(item => featureShown(item, config) && !config.hiddenSections.includes(item.group) && (!allowed || allowed.includes(item.section)));
}
export function activeItem(items: WorkspaceItem[], pathname: string, query: string): string | null {
  const params = new URLSearchParams(query);
  const matches = items.filter(item => {
    const url = new URL(item.href, "http://workspace.local");
    return (pathname === url.pathname || (url.pathname !== "/" && pathname.startsWith(`${url.pathname}/`))) && [...url.searchParams].every(([key, value]) => params.get(key) === value);
  });
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.id ?? null;
}
