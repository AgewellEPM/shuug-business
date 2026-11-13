import { readFileSync } from "node:fs";
import type { SalesInvoke } from "../../src/lib/backend/sales-mcp";

type Options = { origin: string; codeFile: string; email?: string; fetcher?: typeof fetch };
export function createSalesConnection({ origin, codeFile, email, fetcher = fetch }: Options): SalesInvoke {
  const base = new URL(origin);
  if (base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
    (base.protocol !== "https:" && !(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)))) throw new Error("Use an HTTPS sales origin or explicit loopback HTTP, without credentials or a path.");
  if (!codeFile.startsWith("/")) throw new Error("Select an absolute private sales access-code file.");
  return async (operation, args = {}) => {
    if (operation === "sdr_catalog") return {
      version: 6, storage: "Existing GigTax private sales records", reads: ["workspace", "rolodex", "office", "pipeline", "contracts", "mailboxes", "local_offices", "business", "map_addresses", "contact_research", "state_coverage", "territory_localities"],
      actions: ["save-contact", "set-primary-contact", "archive-contact", "restore-contact"],
      roles: ["unverified", "owner", "partner", "manager", "accountant", "staff", "other"],
      limits: { contactsPerOffice: 50, exactRetryReceiptsPerOffice: 30, totalOfficeMetadataCharacters: 48000 },
      concurrency: "Read office.contacts.revision and send it as expectedRevision. Reuse the same UUID requestId and inputs on an uncertain retry.",
      authority: "Uses the supplied sales identity. Agent assignment, territory and revoked-access rules apply at the backend.",
      territories:"territory_localities accepts state, optional query and offset; it returns up to 100 Census town/city names within the caller's territory. The owner assigns coverage in the Territories view. Town-scoped agents must search a permitted city name; ZIP-only searches do not expand their territory.",
      evidence: "A named owner/partner remains unconfirmed without an explicit source check. Office ownership, email delivery and paid eligibility are separate.",
      localDiscovery: "local_offices accepts city/state and includes chains, public IRS locations and connected official business records. state_coverage distinguishes automatic record connectors from official-search links and lists principal-field limits. business accepts its actor-bound candidateToken and returns sourced records, never a confirmed owner; registered agents are separate. map_addresses accepts up to 10 returned candidateTokens. No prospect is saved by these reads.",
      contactResearch: "contact_research accepts a candidateToken set to a returned office or principal researchToken. With no website it returns published directory details and possible business websites. Supply a checked official website with websiteReviewed:true to read its public contact pages. Business channels are not automatically a person's direct contact. No saves, account lookups, mail, calls or payment.",
      workflowTools: ["sdr_progress", "sdr_contract", "sdr_sender"],
      externalEffects: "sdr_contract send_email explicitly sends the exact reviewed contract email when a provider is configured. Other contract operations prepare links/previews or record evidence. No campaigns, calls or payments.",
    };
    let action: string;
    if (operation === "sdr_read") {
      const actions: Record<string, string> = { workspace: "bootstrap", rolodex: "rolodex", office: "office", pipeline: "pipeline", contracts: "contracts", mailboxes: "mailboxes", local_offices: "search-local", business: "lookup-business", map_addresses: "map-geocode", contact_research: "research-local-contacts", state_coverage: "state-coverage", territory_localities:"territory-localities" };
      action = actions[String(args.resource)];
      if (!action || (action === "office" && !/^\d+$/.test(String(args.id || "")))) throw new Error("Choose a sales resource and supply an office ID for office reads.");
    } else if (operation === "sdr_command" && ["save-contact", "set-primary-contact", "archive-contact", "restore-contact"].includes(String(args.action))) action = String(args.action);
    else if (operation === "sdr_progress") action = "record-progress";
    else if (operation === "sdr_contract") {
      const actions: Record<string, string> = { prepare: "invite", link: "contract-link", receipt: "contract-receipt", preview_email: "preview-contract-email", send_email: "send-contract-email", record_sent: "record-contract-sent", resolve_email: "resolve-contract-email" };
      action = actions[String(args.action)]; if (!action) throw new Error("Unknown contract operation.");
    } else if (operation === "sdr_sender" && ["list", "save"].includes(String(args.action))) action = args.action === "list" ? "mailboxes" : "save-mailbox";
    else throw new Error("Unknown sales MCP operation.");
    let cookie = "";
    const call = async (body: Record<string, unknown>, authenticated = true) => {
      const response = await fetcher(new URL("/api/sales", base), { method: "POST", redirect: "error",
        headers: { Origin: base.origin, "Content-Type": "application/json", ...(authenticated && cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Sales request returned HTTP ${response.status}.`);
      return { response, data };
    };
    try {
      const code = readFileSync(codeFile, "utf8").trim();
      if (!code || code.length > 200) throw new Error("The private sales code file is empty or invalid.");
      const login = await call({ action: "login", code, ...(email ? { email } : {}) }, false);
      cookie = (login.response.headers.get("set-cookie") || "").split(";")[0];
      if (!cookie.startsWith("gigtax_sales=")) throw new Error("Sales sign-in did not return its protected session.");
      return (await call({ ...args, action })).data;
    } finally {
      if (cookie) { try { await call({ action: "logout" }); } catch { /* Sessions are local encrypted cookies; never print credentials on cleanup. */ } }
    }
  };
}
