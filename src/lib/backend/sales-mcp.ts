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
  const register = (name: string, description: string, schema: z.ZodRawShape, readOnly: boolean) => {
    server.registerTool(name, { description, inputSchema: schema,
      annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: true, openWorldHint: false } }, async args => {
      try { return { content: [{ type: "text" as const, text: JSON.stringify(await invoke(name, args)) }] }; }
      catch (error) { return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : "The sales operation was not confirmed." }] }; }
    });
  };
  register("sdr_catalog", "Read the GigTax office-owner, contact and Rolodex contracts. These tools use the same assigned-office records as the private sales UI. No provider sending or payment operation is exposed.", {}, true);
  register("sdr_read", "Read the authenticated sales workspace, assigned-office Rolodex or one office including its current contact revision. Source-checked names/roles do not establish email deliverability or independent office ownership. Archived contacts remain in history.", {
    resource: z.enum(["workspace", "rolodex", "office"]), id: z.string().regex(/^\d+$/).optional(),
  }, true);
  register("sdr_command", "Save an office contact, choose its primary contact, archive or restore it. Read sdr_catalog and that office first. Reuse requestId and exact inputs on retry; expectedRevision must be the current office contact revision. Use a UUID contactId for a new person, or the returned existing ID. A reviewed source is required to confirm a name and role. Contact changes never send a message, confirm independent ownership, activate membership or take payment.", {
    action: z.enum(["save-contact", "set-primary-contact", "archive-contact", "restore-contact"]),
    id: z.string().regex(/^\d+$/), contactId: z.union([z.uuid(), z.literal("office-contact")]),
    expectedRevision: z.string().max(100), requestId: z.uuid(), contact: contact.optional(),
  }, false);
}
