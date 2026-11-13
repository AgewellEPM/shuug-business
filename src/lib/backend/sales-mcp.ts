import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type SalesInvoke = (operation: string, args?: Record<string, unknown>) => Promise<unknown>;
const contact = z.object({
  name: z.string().max(140), role: z.enum(["unverified", "owner", "partner", "manager", "accountant", "staff", "other"]),
  title: z.string().max(140).default(""), email: z.string().max(240).default(""), phone: z.string().max(60).default(""),
  mobile: z.string().max(60).default(""), extension: z.string().max(12).default(""),
  preference: z.enum(["unspecified", "email", "phone", "do_not_contact"]), notes: z.string().max(1500).default(""),
  sourceURL: z.string().max(1200).default(""), sourceNote: z.string().max(900).default(""), reviewed: z.boolean().default(false),
});

export function registerSalesMcp(server: McpServer, invoke: SalesInvoke) {
  const register = (name: string, description: string, schema: z.ZodRawShape, readOnly: boolean, external = false) => {
    server.registerTool(name, { description, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: name !== "sdr_contract" && name !== "sdr_sender", openWorldHint: external } }, async args => {
      try { return { content: [{ type: "text" as const, text: JSON.stringify(await invoke(name, args)) }] }; }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "The sales operation was not confirmed." }] }; }
    });
  };
  register("sdr_catalog", "Read GigTax contact, pipeline, contract and sender contracts and provider limits. These tools share the private sales UI records. Contract email sending is an explicit external action; payments remain separate.", {}, true);
  register("sdr_read", "Read the authenticated sales workspace, assigned-office Rolodex or one office including its current contact revision. Source-checked names/roles do not establish email deliverability or independent office ownership. Archived contacts remain in history.", {
    resource: z.enum(["workspace", "rolodex", "office", "pipeline", "contracts", "mailboxes", "local_offices", "business", "map_addresses", "contact_research", "state_coverage", "territory_localities"]), id: z.string().regex(/^\d+$/).optional(),
    query:z.string().max(100).optional(),offset:z.number().int().min(0).optional(),
    city: z.string().min(1).max(100).optional(), state: z.string().regex(/^[A-Z]{2}$/).optional(), candidateToken: z.string().max(12000).optional(), candidateTokens: z.array(z.string().max(12000)).min(1).max(10).optional(),
    website: z.string().max(700).optional(), websiteReviewed: z.boolean().optional(),
  }, true);
  register("sdr_command", "Save an office contact, choose its primary contact, archive or restore it. Read sdr_catalog and that office first. Reuse requestId and exact inputs on retry; expectedRevision must be the current office contact revision. Use a UUID contactId for a new person, or the returned existing ID. A reviewed source is required to confirm a name and role. Contact changes never send a message, confirm independent ownership, activate membership or take payment.", {
    action: z.enum(["save-contact", "set-primary-contact", "archive-contact", "restore-contact"]),
    id: z.string().regex(/^\d+$/), contactId: z.union([z.uuid(), z.literal("office-contact")]),
    expectedRevision: z.string().max(100), requestId: z.uuid(), contact: contact.optional(),
  }, false);
  register("sdr_progress", "Record a contact that actually occurred, an office reply, waiting state, next action or note. Read the office first and send its pipeline revision. Reuse requestId and exact inputs on retry. This records staff evidence; it never contacts someone or claims a conversion or payment.", {
    id: z.string().regex(/^\d+$/), expectedRevision: z.string().max(100), requestId: z.uuid(),
    kind: z.enum(["contacted", "replied", "waiting", "next_step", "note"]), channel: z.enum(["call", "email", "meeting", "other"]).default("other"),
    note: z.string().min(1).max(2000), occurredAt: z.string().max(60).optional(), outcome: z.enum(["interested", "questions", "not_now", "declined", "opt_out", "other"]).default("other"),
    waitingOn: z.enum(["us", "office", "delivery", "signature", "payment", "none", "other"]), nextAction: z.string().max(300).default(""), nextDue: z.string().max(10).optional(),
  }, false);
  register("sdr_contract", "Prepare or read an office contract; preview and explicitly send its email using an approved shared/agent sender; record an actual manual send; or review an uncertain provider outcome. Read catalog, office, contracts and sender status first. send_email transmits a real email only with reviewed:true and the exact short-lived preview digest. Never treat a preview, app-open, test request or provider acceptance as recipient delivery. A retry of an existing send reads its receipt and cannot resend. resolve_email requires owner review. No payment operation is exposed.", {
    action: z.enum(["prepare", "link", "receipt", "preview_email", "send_email", "record_sent", "resolve_email"]), id: z.string().regex(/^\d+$/),
    enrollmentId: z.string().regex(/^\d+$/).optional(), ownerName: z.string().max(140).optional(), email: z.string().max(240).optional(), senderId: z.string().regex(/^\d+$/).optional(),
    subject: z.string().max(180).optional(), intro: z.string().max(2000).optional(), deliveryId: z.string().regex(/^\d+$/).optional(), previewDigest: z.string().max(100).optional(), reviewed: z.boolean().default(false),
    evidence: z.string().max(1200).optional(), sentAt: z.string().max(60).optional(), outcome: z.enum(["accepted", "not_sent"]).optional(), providerId: z.string().max(300).optional(),
  }, false, true);
  register("sdr_sender", "Read shared and agent senders or save approved sender details. Agents can save their own email identity; shared senders and other-agent identities require the owner. Saving details does not connect a provider account or establish domain authorization. Existing edits require the profile revision. No email is sent.", {
    action: z.enum(["list", "save"]), profileId: z.string().regex(/^\d+$/).optional(), expectedRevision: z.string().max(100).optional(),
    kind: z.enum(["shared", "agent"]).optional(), ownerId: z.string().regex(/^\d+$/).optional(), name: z.string().max(140).optional(), email: z.string().max(240).optional(),
    replyTo: z.string().max(240).optional(), mode: z.enum(["provider", "email_app"]).optional(), approved: z.boolean().default(false),
  }, false);
}
