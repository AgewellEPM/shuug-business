/**
 * AI booking assist — turn a plain-language request ("table for 4 this Friday around
 * 7, window if possible") into a structured reservation the host can confirm. Uses
 * the shared LLM path (local Ollama by default). Fail-closed: without a model, or on
 * any parse failure, it returns not-available — it never invents a booking silently.
 */
import { llmChat, llmConfigured } from "../llm";

export interface ParsedBooking {
  name: string | null;
  partySize: number | null;
  dateISO: string | null;
  time: string | null;
  phone: string | null;
  notes: string;
}

export interface ParseResult { ok: boolean; booking?: ParsedBooking; error?: string; model?: boolean }

const SYSTEM = `You are a restaurant host assistant. Extract a reservation from the guest's message.
Return ONLY compact JSON: {"name":string|null,"partySize":number|null,"dateISO":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"phone":string|null,"notes":string}.
Use 24-hour time. If a detail is missing, use null. "notes" holds seating/dietary/other requests. No prose.`;

/** Parse a natural-language booking request. `todayISO` anchors relative dates. */
export async function parseBookingRequest(message: string, todayISO: string): Promise<ParseResult> {
  if (!llmConfigured()) return { ok: false, model: false, error: "Connect an AI model (Ollama or Anthropic) to use AI booking. You can still book manually." };
  try {
    const res = await llmChat({
      system: SYSTEM,
      messages: [{ role: "user", content: `Today is ${todayISO}. Guest says: "${message.slice(0, 800)}"` }],
      maxTokens: 400, temperature: 0,
    });
    if (!res.ok || !res.text) return { ok: false, model: true, error: "The assistant did not respond. Book manually." };
    const json = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
    const raw = JSON.parse(json) as Partial<ParsedBooking>;
    const booking: ParsedBooking = {
      name: typeof raw.name === "string" ? raw.name.slice(0, 120) : null,
      partySize: Number.isFinite(raw.partySize) ? Math.max(1, Math.min(50, Math.round(raw.partySize as number))) : null,
      dateISO: typeof raw.dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.dateISO) ? raw.dateISO : null,
      time: typeof raw.time === "string" && /^\d{2}:\d{2}$/.test(raw.time) ? raw.time : null,
      phone: typeof raw.phone === "string" ? raw.phone.slice(0, 40) : null,
      notes: typeof raw.notes === "string" ? raw.notes.slice(0, 300) : "",
    };
    return { ok: true, model: true, booking };
  } catch (e) {
    return { ok: false, model: true, error: e instanceof Error ? `Could not read that request (${e.message}). Book manually.` : "Could not read that request." };
  }
}
