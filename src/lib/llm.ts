/**
 * Shared LLM access — one provider path for the copilot and the PPC ad
 * generator. Default provider is **Ollama** (local, no key); set
 * COPILOT_PROVIDER=anthropic to use Claude. Fail-closed with a clear message.
 *
 *   Ollama:    OLLAMA_HOST (default http://localhost:11434), OLLAMA_MODEL
 *              (default gemma3:4b)
 *   Anthropic: ANTHROPIC_API_KEY, COPILOT_MODEL (default claude-opus-4-8)
 */
import Anthropic from "@anthropic-ai/sdk";

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface LlmResult {
  ok: boolean;
  text?: string;
  error?: string;
}
export interface LlmOptions {
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  format?: Record<string, unknown> | "json";
}

export type LlmProvider = "ollama" | "anthropic";

export function llmProvider(): LlmProvider {
  const explicit = process.env.COPILOT_PROVIDER?.trim().toLowerCase();
  if (explicit === "anthropic") return "anthropic";
  if (explicit === "ollama") return "ollama";
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

/** Local runtime is always "configured"; Anthropic needs a key. */
export function llmConfigured(): boolean {
  return llmProvider() === "ollama" ? true : Boolean(process.env.ANTHROPIC_API_KEY);
}

export function ollamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || "gemma3:4b";
}
function ollamaHost(): string {
  return process.env.OLLAMA_HOST?.trim().replace(/\/$/, "") || "http://localhost:11434";
}
function anthropicModel(): string {
  return process.env.COPILOT_MODEL?.trim() || "claude-opus-4-8";
}

export function llmLabel(): string {
  return llmProvider() === "ollama" ? `Ollama · ${ollamaModel()}` : `Claude · ${anthropicModel()}`;
}

export async function llmChat(opts: LlmOptions): Promise<LlmResult> {
  return llmProvider() === "anthropic" ? viaAnthropic(opts) : viaOllama(opts);
}

async function viaOllama({ system, messages, temperature = 0.3, maxTokens = 1600, format }: LlmOptions): Promise<LlmResult> {
  const body = {
    model: ollamaModel(),
    stream: false,
    keep_alive: "30m", // hold the model so only the first call pays cold-load
    options: { temperature, num_predict: maxTokens },
    ...(format ? { format } : {}),
    messages: [
      ...(system ? [{ role: "system", content: system }] : []),
      ...messages,
    ],
  };
  try {
    const res = await fetch(`${ollamaHost()}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Ollama error ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { message?: { content?: string } };
    return { ok: true, text: (data.message?.content ?? "").trim() };
  } catch (err) {
    const m = err instanceof Error ? err.message : "request failed";
    return { ok: false, error: `Ollama not reachable at ${ollamaHost()} (${m}). Is \`ollama serve\` running?` };
  }
}

async function viaAnthropic({ system, messages, maxTokens = 1600 }: LlmOptions): Promise<LlmResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "Set ANTHROPIC_API_KEY, or use the Ollama provider." };
  }
  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: anthropicModel(),
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, text };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `Claude API error ${err.status}: ${err.message}` };
    }
    return { ok: false, error: err instanceof Error ? err.message : "LLM call failed" };
  }
}
