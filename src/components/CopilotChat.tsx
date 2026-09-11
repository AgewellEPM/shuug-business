"use client";

/**
 * CopilotChat — chat UI for the business copilot. Sends the question + recent
 * history to the server action (which grounds Claude in the real analytics) and
 * renders the conversation. Suggested prompts seed common analyst questions.
 */
import { useState, useTransition } from "react";
import type { ChatTurn, CopilotResult } from "@/lib/copilot/client";

const SUGGESTIONS = [
  "How are sales trending month over month?",
  "Which products and regions should we push next?",
  "What days sell best, and what should we do about it?",
  "Which grocery accounts should we prioritize for outreach?",
];

export function CopilotChat({
  ask,
  configured,
}: {
  ask: (question: string, history: ChatTurn[]) => Promise<CopilotResult>;
  configured: boolean;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    setError(null);
    const history = turns;
    setTurns((prev) => [...prev, { role: "user", content: q }]);
    setInput("");
    startTransition(async () => {
      const res = await ask(q, history);
      if (res.ok && res.answer) {
        setTurns((prev) => [...prev, { role: "assistant", content: res.answer! }]);
      } else {
        setError(res.error ?? "Copilot failed");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {!configured && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          Copilot is not connected yet. Set <code>ANTHROPIC_API_KEY</code> to enable live answers.
          You can still see the suggested questions below.
        </div>
      )}

      <div className="max-h-[460px] space-y-4 overflow-y-auto p-5">
        {turns.length === 0 && (
          <div>
            <p className="mb-3 text-sm text-slate-500">Ask about your sales. Try:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  disabled={!configured || pending}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                t.role === "user"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-800"
              }`}
            >
              {t.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-400">Thinking…</div>
          </div>
        )}
        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      </div>

      <form
        className="flex gap-2 border-t border-slate-200 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={configured ? "Ask about sales, regions, forecasting…" : "Set ANTHROPIC_API_KEY to chat"}
          disabled={!configured || pending}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="submit"
          disabled={!configured || pending || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
