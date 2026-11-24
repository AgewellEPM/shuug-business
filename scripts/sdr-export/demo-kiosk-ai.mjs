import { HttpError } from '../../sales/model.mjs';

const prompt = [
  'You are an AI assistant in a TinkyTown communication demo. Answer the question directly in its language.',
  'Use simple words and at most two short sentences. Return plain text.',
  'You cannot contact staff or see facility records. For facility-specific or medical questions, point the visitor to staff.',
].join(' ');

export function demoKioskAI({ model = 'qwen3:4b-instruct-2507-q4_K_M', fetcher = fetch } = {}) {
  const running = new Set();
  return async (user, input) => {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Sign in to use the demo assistant.');
    const question = typeof input.question === 'string' ? input.question.trim() : '';
    if (!question || question.length > 350) throw new HttpError(400, 'Enter a question of 350 characters or fewer.');
    if (running.has(user.id)) throw new HttpError(429, 'An answer is already in progress.');
    running.add(user.id);
    try {
      const response = await fetcher('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model, stream: false, think: false,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: question }],
          options: { num_ctx: 2048, num_predict: 160, temperature: 0.35 },
        }),
      });
      if (!response.ok) throw new Error('Model service failed');
      const answer = (await response.json()).message?.content;
      if (typeof answer !== 'string' || !answer.trim()) throw new Error('Model returned an empty answer');
      return { answer: answer.trim().slice(0, 800) };
    } catch {
      throw new HttpError(503, 'AI is unavailable. Try again in a moment.');
    } finally {
      running.delete(user.id);
    }
  };
}
