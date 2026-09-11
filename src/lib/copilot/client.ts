/**
 * Copilot LLM call — answers business questions grounded in the computed
 * analytics. Provider (Ollama default / Anthropic) lives in ../llm.
 */
import type { Analytics } from "../analytics/metrics";
import { COPILOT_SYSTEM, groundingFacts } from "./ground";
import { llmChat, llmConfigured, llmLabel, type ChatMessage } from "../llm";

export type ChatRole = "user" | "assistant";
export type ChatTurn = ChatMessage;

export interface CopilotResult {
  ok: boolean;
  answer?: string;
  error?: string;
}

export function copilotConfigured(): boolean {
  return llmConfigured();
}
export function copilotLabel(): string {
  return llmLabel();
}

export async function askCopilot(
  question: string,
  analytics: Analytics,
  history: ChatTurn[] = [],
): Promise<CopilotResult> {
  const system = `${COPILOT_SYSTEM}\n\n${groundingFacts(analytics)}`;
  const messages: ChatMessage[] = [
    ...history.slice(-8),
    { role: "user", content: question },
  ];
  const res = await llmChat({ system, messages });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, answer: res.text || "(no answer)" };
}
