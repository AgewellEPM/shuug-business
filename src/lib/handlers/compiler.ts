/**
 * Intent compiler — the heart of the product. Turn the owner's plain-language wish
 * ("I hate chasing invoices", "answer the phone and book appointments") into the
 * right Handler. Deterministic keyword scoring is the always-on baseline; an optional
 * LLM pass writes the friendly "I can set up an X Handler that can…" explanation.
 * Fail-closed: no model → the deterministic match still works.
 */
import { HANDLER_TEMPLATES, templateById } from "./templates";
import type { HandlerTemplate } from "./model";
import { llmChat, llmConfigured } from "../llm";

export interface Match { template: HandlerTemplate; score: number; matched: string[] }

const STOP = new Set(["i", "the", "a", "an", "to", "for", "my", "our", "we", "of", "and", "on", "in", "is", "it", "with", "want", "need", "wish", "would", "like", "someone", "could", "do", "does", "handle", "business", "help"]);

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
}

/** Score every template against the wish. Multi-word intent phrases weigh more. */
export function scoreTemplates(wish: string): Match[] {
  const text = ` ${wish.toLowerCase()} `;
  const words = new Set(tokens(wish));
  const matches: Match[] = [];
  for (const template of HANDLER_TEMPLATES) {
    let score = 0;
    const matched: string[] = [];
    for (const intent of template.intents) {
      if (intent.includes(" ")) {
        if (text.includes(intent)) { score += 3; matched.push(intent); }
      } else if (words.has(intent)) {
        score += 1; matched.push(intent);
      }
    }
    if (score > 0) matches.push({ template, score, matched });
  }
  return matches.sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name));
}

/** The single best Handler for a wish, or null if nothing matched. */
export function bestMatch(wish: string): Match | null {
  return scoreTemplates(wish)[0] ?? null;
}

export interface Proposal {
  templateId: string;
  name: string;
  icon: string;
  intro: string;          // "I can set up an Appointment Handler that can:"
  canDo: string[];
  asksFirst: string[];
  escalates: string[];
  alternativeIds: string[];
  aiRefined: boolean;     // whether the LLM wrote the intro (vs deterministic)
}

function deterministicProposal(wish: string): Proposal | null {
  const ranked = scoreTemplates(wish);
  const top = ranked[0]?.template;
  if (!top) return null;
  return {
    templateId: top.id, name: top.name, icon: top.icon,
    intro: `I can set up ${aOrAn(top.name)} that can:`,
    canDo: top.canDo, asksFirst: top.asksFirst, escalates: top.escalates,
    alternativeIds: ranked.slice(1, 3).map((m) => m.template.id),
    aiRefined: false,
  };
}

/**
 * Compile a wish into a proposal. Tries the LLM only to CHOOSE among templates and
 * confirm — never to invent capabilities (those stay grounded in the template). If
 * the model is absent or unsure, the deterministic match is returned unchanged.
 */
export async function compileIntent(wish: string): Promise<Proposal | null> {
  const deterministic = deterministicProposal(wish);
  if (!llmConfigured()) return deterministic;

  try {
    const menu = HANDLER_TEMPLATES.map((t) => `${t.id}: ${t.outcome}`).join("\n");
    const res = await llmChat({
      system: `You match a small-business owner's wish to ONE handler id from this menu, or "none" if nothing fits.\n${menu}\nReturn ONLY the id, nothing else.`,
      messages: [{ role: "user", content: wish.slice(0, 500) }],
      maxTokens: 20, temperature: 0,
    });
    const id = (res.text ?? "").toLowerCase().trim().replace(/[^a-z-]/g, "");
    const chosen = templateById(id);
    if (!chosen) return deterministic;
    const others = scoreTemplates(wish).map((m) => m.template.id).filter((x) => x !== chosen.id);
    return {
      templateId: chosen.id, name: chosen.name, icon: chosen.icon,
      intro: `I can set up ${aOrAn(chosen.name)} that can:`,
      canDo: chosen.canDo, asksFirst: chosen.asksFirst, escalates: chosen.escalates,
      alternativeIds: [...new Set(others)].slice(0, 2),
      aiRefined: true,
    };
  } catch {
    return deterministic;
  }
}

function aOrAn(name: string): string {
  return /^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`;
}
