import { z } from "zod";
import { formInput, workflowInput } from "../getting-started/model";
import { setupState, saveForm, testWorkflow, enableWorkflow, pauseWorkflow, reviewSubmission } from "../getting-started/store";
import { shopSettingsInput, saveShopSettings } from "../shop-automation/settings";
import { shopAutomationState, processShopAutomation } from "../shop-automation/service";
import { shopInvoiceSettingsInput, saveShopInvoiceSettings, issueShopInvoiceInput, issueAcceptedShopInvoice } from "../shop-invoicing/service";
import { queueMessageInput, smsConsentInput } from "../communications/model";
import { queueMessage, recordSmsConsent, dispatchQueuedMessages, resolveUncertainMessage, communicationConnectionStatus } from "../communications/service";
import { communicationSnapshot, cancelQueuedMessage } from "../communications/store";
import { ownerIdentity } from "../auth/identity";

export const websiteCommandInput = z.object({ action: z.enum(["form.save", "workflow.test", "workflow.enable", "workflow.pause", "request.review"]),
  input: z.record(z.string(), z.unknown()) }).strict();
export const shopCommandInput = z.object({ action: z.enum(["automation.configure", "invoicing.configure", "invoice.issue"]), input: z.record(z.string(), z.unknown()) }).strict();
export const communicationsCommandInput = z.object({ action: z.enum(["message.queue", "consent.record", "message.cancel", "message.resolve", "dispatch"]), input: z.record(z.string(), z.unknown()) }).strict();
export const tickInput = z.object({ limit: z.number().int().min(1).max(100).default(20) }).strict();

export function shopCatalog() {
  return { version: 1, persistence: "Private per-business SQLite volume and encrypted vault", websiteForm: z.toJSONSchema(formInput),
    websiteWorkflow: z.toJSONSchema(workflowInput), automationSettings: z.toJSONSchema(shopSettingsInput),
    invoicingSettings: z.toJSONSchema(shopInvoiceSettingsInput), issueInvoice: z.toJSONSchema(issueShopInvoiceInput),
    queueMessage: z.toJSONSchema(queueMessageInput), smsConsent: z.toJSONSchema(smsConsentInput),
    boundaries: ["Website requests are unverified intake, not repair authorization or a confirmed appointment.",
      "Automated invoicing requires accepted work and reviewed repair pricing; invoices post once to the existing service ledger.",
      "SMS needs separate affirmative consent. STOP suppresses queued SMS. Ambiguous provider sends require review, not automatic resend.",
      "TateWay's own Mailgun, Twilio and Stripe accounts must be connected. Configured and provider-accepted are not proof of delivered or paid.",
      "Public intake requires a persistent HTTPS Shuug host; never expose a demo owner gateway."] };
}
export async function shopOperation(operation: string, raw: Record<string, unknown>) {
  const actor = ownerIdentity();
  if (operation === "shop_catalog") { z.object({}).strict().parse(raw); return shopCatalog(); }
  if (operation === "shop_read") { z.object({}).strict().parse(raw); return shopAutomationState(); }
  if (operation === "website_read") { z.object({}).strict().parse(raw); return setupState(); }
  if (operation === "communications_read") { z.object({}).strict().parse(raw); return { ...communicationSnapshot(), connections: communicationConnectionStatus() }; }
  if (operation === "shop_tick") return processShopAutomation(tickInput.parse(raw).limit);
  if (operation === "website_command") {
    const { action, input } = websiteCommandInput.parse(raw);
    if (action === "form.save") return saveForm(input);
    if (action === "workflow.test") return testWorkflow(input);
    if (action === "workflow.enable") {
      const value = z.object({ workflow: workflowInput, testId: z.uuid() }).strict().parse(input);
      return enableWorkflow(value.workflow, value.testId, actor.id);
    }
    const { id } = z.object({ id: z.uuid() }).strict().parse(input);
    if (action === "workflow.pause") pauseWorkflow(id); else reviewSubmission(id);
    return { ok: true };
  }
  if (operation === "shop_command") {
    const { action, input } = shopCommandInput.parse(raw);
    if (action === "automation.configure") return saveShopSettings(input, actor.id);
    if (action === "invoicing.configure") return saveShopInvoiceSettings(input, actor);
    return issueAcceptedShopInvoice(input, actor.id);
  }
  if (operation === "communications_command") {
    const { action, input } = communicationsCommandInput.parse(raw);
    if (action === "message.queue") return queueMessage(queueMessageInput.parse(input));
    if (action === "consent.record") return recordSmsConsent({ ...smsConsentInput.parse(input), actor: actor.id });
    if (action === "dispatch") return dispatchQueuedMessages(tickInput.parse(input).limit);
    if (action === "message.cancel") { cancelQueuedMessage(z.object({ id: z.uuid() }).strict().parse(input).id); return { ok: true }; }
    const value = z.object({ id: z.uuid(), outcome: z.enum(["accepted", "not_sent"]), evidence: z.string().min(10).max(2000), providerId: z.string().max(200).optional() }).strict().parse(input);
    return resolveUncertainMessage(value.id, value.outcome, value.evidence, value.providerId);
  }
  throw new Error("Unknown shop operation.");
}

type Register = (name: string, description: string, shape: z.ZodRawShape, readOnly: boolean) => void;
export function registerShopTools(tool: Register) {
  tool("shop_catalog", "Read native website intake, shop automation, reviewed repair invoicing and consent-aware messaging schemas before configuring the shop.", {}, true);
  tool("shop_read", "Read shop automation settings, provider readiness, native record counts, intake and last worker outcome. Does not expose credentials.", {}, true);
  tool("website_read", "Read the authenticated business's durable website forms, unverified submissions and tested workflows.", {}, true);
  tool("website_command", "Configure native website forms; test then enable the exact staff follow-up workflow. Review or pause requests/workflows. Public intake never authorizes a repair or signs a customer agreement.", websiteCommandInput.shape, false);
  tool("shop_command", "Configure explicitly reviewed clerical automation or issue one eligible accepted repair invoice using the existing service accounting path. Does not approve repairs, connect providers or charge customers.", shopCommandInput.shape, false);
  tool("shop_tick", "Run one supervised shop workflow, invoice, reminder and payment-reconciliation pass. Configured enabled communications may contact customers; queue/acceptance is not delivery proof.", tickInput.shape, false);
  tool("communications_read", "Read durable message history, current consent, failures and provider readiness for this business only.", {}, true);
  tool("communications_command", "Queue service messages, record real consent evidence, cancel queued work, resolve verified uncertain sends or explicitly dispatch eligible messages. Requires the business's own enabled provider connections. Never invent consent or retry an ambiguous send.", communicationsCommandInput.shape, false);
}
