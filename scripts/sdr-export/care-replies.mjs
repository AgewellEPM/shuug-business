// Reply tiles for the demo kiosks, made the way demo.tinkytown.com makes them: a router picks the Job
// or Helper AI, which writes nine things the visitor could say. Tiles are the visitor's own words,
// never an answer from an assistant. The model runs on this computer.
import { readFileSync } from 'node:fs';
import { HttpError } from '../../sales/model.mjs';

const app = JSON.parse(readFileSync(new URL('./care-replies.json', import.meta.url), 'utf8'));
const tidy = value => value.trim().toLowerCase().replace(/\?$/, '').replace(/\.$/, '').replace(/!$/, '').trim();

export function orChoices(input) {
  const cleaned = tidy(input);
  if (!cleaned.includes(' or ')) return null;
  let part = cleaned;
  for (const prefix of ['do you want', 'do you prefer', 'would you like', 'would you prefer', 'would you rather', 'you want',
    'should we get', 'should we have', 'should we do', 'should i get', 'should i have', 'should i do', 'how about', 'what about', 'you like',
    'do you like', 'are you in the mood for', 'do we want', 'shall we get', 'shall we have', 'can i get you', 'can i get', 'want']) {
    if (part.startsWith(prefix)) { part = part.slice(prefix.length).trim(); break; }
  }
  const choices = part.replace(/,\s*or\s+/g, '|').replace(/\s+or\s+/g, '|').split('|')
    .map(choice => choice.trim().replace(/,$/, '').trim()).filter(choice => choice && choice.length < 40);
  if (choices.length < 2) return null;
  const marks = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  return [...choices.map((choice, i) => (marks[i] || '🔹') + ' ' + choice[0].toUpperCase() + choice.slice(1)), '🤷 Something else', '🚫 Neither'];
}

const verbs = 'do|does|did|are|is|was|were|can|could|will|would|should|shall|may|might|have|has|had';
const flip = phrase => phrase.replace(/\byour\b/g, 'my').replace(/\byou're\b/g, "I'm").replace(/\byou\b/g, 'me').replace(/\bwant me to\b/g, 'want to');
const cap = (phrase, most) => phrase.split(' ').slice(0, most).join(' ');
export function yesNo(input) {
  const cleaned = input.trim().toLowerCase();
  const subjects = "you|we|they|he|she|i|it|that|this|there|the|your|my|our|those|these|ya|u|we're|you're";
  const tag = /,?\s*(right|yeah|yea|ya|ok|okay|no|correct|huh|eh|innit)\s*[?.]?$/;
  const bare = value => value.replace(/\?$/, '').replace(/\.$/, '').trim();
  const plain = new RegExp('^(' + verbs + ')\\s+(' + subjects + ')\\b\\s*(.*)').exec(cleaned);
  let topic;
  if (plain) topic = tidy(plain[3]) || cleaned;
  else if (/^(isn't|aren't|wasn't|weren't|can't|couldn't|won't|wouldn't|shouldn't|doesn't|didn't|haven't|hasn't)\s+/.test(cleaned)) topic = bare(cleaned);
  else if (tag.test(cleaned) && cleaned.length > 8) topic = cleaned.replace(tag, '').trim();
  else if (/^(hungry|ready|tired|cold|thirsty|done|okay|alright|good|sure|fine|happy|sad|sick|bored|scared|sleepy|hurt|full|hot|warm|upset|mad|angry|excited|nervous|worried|comfortable|finished|satisfied)\s*[?]?$/.test(cleaned)) topic = bare(cleaned);
  else if (/^(wanna|want to|wana|need to|needa|gonna|going to|gotta|got to)\s+/.test(cleaned)) topic = bare(cleaned);
  else return null;
  const match = new RegExp('^(' + verbs + ')\\s+(you|we|they|he|she|i|it|that|this|there)\\s+(.*)').exec(tidy(input));
  if (match) {
    const verb = match[1], said = flip(bare(match[3]));
    const yes = { do: 'I', does: 'I', did: 'I', are: "I'm", is: "I'm", was: 'I was', were: 'I was', can: 'I can', could: 'I could', will: 'I will',
      would: 'I would', should: 'I should', shall: "let's", may: 'I might', might: 'I might', have: 'I have', has: 'I have', had: 'I had' }[verb];
    const no = { do: "I don't", does: "I don't", did: "I didn't", are: "I'm not", is: "I'm not", was: "I wasn't", were: "I wasn't", can: "I can't",
      could: "I couldn't", will: "I won't", would: "I wouldn't", should: "I shouldn't", shall: "let's not", have: "I haven't", has: "I haven't", had: "I hadn't" }[verb];
    return ['👍 ' + cap('Yes, ' + yes + ' ' + said, 10), '👎 ' + cap(no ? 'No, ' + no + ' ' + said : "No, I don't think so", 10),
      '🤔 Maybe later', '🙏 Yes please!', '🚫 No thanks', "🤷 I'm not sure"];
  }
  const short = topic.slice(0, 30).trim();
  if (/^[a-z]+$/.test(short)) return ["👍 Yes, I'm " + short, "👎 No, I'm not " + short, '🤔 Maybe a little', '🔥 Very ' + short, '🚫 Not at all', "🤷 I'm not sure"];
  return ['👍 Yes', '👎 No', '🤔 Maybe', '🙏 Yes, definitely', '🚫 No, not really', "🤷 I don't know"];
}

const has = (said, words) => words.some(word => said.includes(word));
export function fixedReplies(said, mode) {
  const lower = said.toLowerCase();
  if (mode === 'continue') return app.offline.continuations.find(item => !item.words.length || has(lower, item.words)).tiles;
  if (mode === 'venue') return app.offline.sets.universal;
  return app.offline.sets[app.offline.rules.find(rule => has(lower, rule.words))?.set || 'universal'];
}
// Care questions are grounded in the app's own replies, which the model is told to prefer. Words
// match whole, since "ct" is also inside "doctor".
export function careOptions(said) {
  const lower = said.toLowerCase();
  const about = words => words.some(word => new RegExp('\\b' + word.trim().replace(/[^a-z ]/g, '') + (word.trim().length > 3 ? '' : '\\b')).test(lower));
  if (/\bwhere\b/.test(lower) && /\b(hurt|pain|sore|ache)/.test(lower)) return app.body.map(tile => ({ ...tile }));
  const rule = app.offline.rules.find(item => item.set !== 'yes_no' && about(item.words));
  return rule ? app.offline.sets[rule.set].map(asTile) : [];
}
const asTile = words => { const cut = words.indexOf(' '), label = words.slice(cut + 1).trim(); return { emoji: words.slice(0, cut), label, say: label }; };

// A patient cannot correct a symptom the model made up. Clinical words are allowed only when staff
// raised them or the app's own replies contain them.
const clinical = /\b(wound|bleed|blood|chok|chest|breath|numb|dizz|stab|seizure|stroke|allerg|overdose|unconscious|heart|faint|fell|fall|fever|vomit|infect|poison|suicid|die|dying|broken|fracture|burn|swollen|rash|lump|left|right)\w*/gi;
export function grounded(tile, allowed) {
  const known = allowed.toLowerCase();
  return [...(tile.label + ' ' + tile.say).matchAll(clinical)].every(match => known.includes(match[1].toLowerCase()));
}
const emojiOf = value => /\p{Extended_Pictographic}(?:[️‍]|\p{Emoji_Modifier}|\p{Extended_Pictographic})*/u.exec(value || '')?.[0] || '💬';
function usable(raw, { bedside, allowed, options }) {
  if (!raw || typeof raw.label !== 'string' || typeof raw.sentence !== 'string') return null;
  const say = raw.sentence.replace(/[\u0000-\u001f*_`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200), label = raw.label.replace(/[\u0000-\u001f*_`]/g, ' ').trim().slice(0, 40);
  // Words that belong to the person across the counter are never offered to the visitor.
  if (/\b(how (can|may) i help|help you|assist you|welcome to|i can help with)\b/i.test(say)) return null;
  if (!/\p{L}/u.test(say) || !/\p{L}/u.test(label) || /https?:|@/i.test(say)) return null;
  const authored = options.find(option => option.say.toLowerCase().replace(/[.!?]+$/, '') === say.toLowerCase().replace(/[.!?]+$/, ''));
  if (authored) return { ...authored };
  const tile = { emoji: emojiOf(raw.emoji), label, say };
  return bedside && (say.split(' ').length > 14 || !grounded(tile, allowed)) ? null : tile;
}
// Tiles are read out of the stream as each one closes, so the first is on screen in a second or two.
export function tilesIn(text, from) {
  const found = [];
  const pattern = /\{[^{}]*"label"[^{}]*\}/g;
  pattern.lastIndex = from;
  for (let match; (match = pattern.exec(text));) { try { found.push(JSON.parse(match[0])); } catch { /* incomplete */ } from = pattern.lastIndex; }
  return { found, from };
}
const asks = {
  reply: said => said,
  more: (said, shown) => 'The person asked: "' + said + '".\n\nGenerate 9 DIFFERENT response tiles than any previous set — fresh angles, alternate phrasings, variations in tone. Avoid repeating labels or sentences from prior turns.\nPrior labels: ' + shown.join(', '),
  continue: said => 'I just said: "' + said + '".\n\nGenerate 9 more things I might want to add or say next, before the other person responds. I want to keep talking.',
};
const easy = 'The visitor is an adult patient whose speech is affected, talking with a nurse, carer or family member. Use short, simple, everyday words: at most 8 words a sentence. Never state a symptom, diagnosis, body side, medicine name or past event the staff did not mention. Offer choices and feelings instead. Every tile must be a direct, natural reply to what was just said. There is no venue goal to return to.';
const tileShape = { type: 'object', properties: { emoji: { type: 'string' }, label: { type: 'string' }, sentence: { type: 'string' } }, required: ['emoji', 'label', 'sentence'] };

function message(said, mode, shown, place, options) {
  const authored = options.slice(0, 12).map(option => option.say);
  return ['VENUE: ' + place.name + (authored.length ? '\nAUTHORED OPTIONS ON BOARD (prefer these — they are hand-vetted for this venue):\n  - ' + authored.join('\n  - ') : ''),
    'LANGUAGE: en/en', 'LAST STAFF QUESTION: ' + (mode === 'reply' ? said : 'none'), '', "VISITOR'S CURRENT MESSAGE: " + asks[mode](said, shown)].join('\n');
}
export async function* careReplies({ said, mode = 'reply', log = [], shown = [], place = { name: 'this place', bedside: false, options: [] } }, { model = 'qwen3:4b-instruct-2507-q4_K_M', fetcher = fetch, timeout = 40_000, signal } = {}) {
  if (mode === 'reply') {
    const choices = orChoices(said);
    if (choices) { for (const words of choices) yield { tile: asTile(words) }; return yield { done: true, source: 'question' }; }
  }
  const care = place.bedside ? careOptions(said) : [];
  // Authored words are offered only when they fit what was said, or when staff ask an open question.
  const spoken = new Set(said.toLowerCase().match(/[a-z]{4,}/g) || []), open = /\b(help you|looking for|need today|do for you|bring you|what would you like)\b/i.test(said);
  const fitting = place.bedside ? [] : place.options.filter(say => open || (say.toLowerCase().match(/[a-z]{4,}/g) || []).some(word => spoken.has(word) && !/^(have|need|want|your|with|that|this|like|what)$/.test(word)));
  const options = [...care, ...fitting.map(say => ({ emoji: '💬', label: say, say }))].slice(0, 18);
  const allowed = [said, ...log.map(turn => turn.text), ...care.flatMap(option => [option.say, option.label])].join(' ');
  const lower = said.toLowerCase(), kind = place.bedside || app.feelings.some(word => lower.includes(word)) ? 'helper' : 'job';
  const seen = new Set(shown.map(label => label.toLowerCase()));
  let count = 0, made = 0;
  // The app's own answers to a care question are on screen at once. The AI adds to them.
  if (mode === 'reply') for (const tile of care.slice(0, 6)) { seen.add(tile.label.toLowerCase()); count++; yield { tile }; }
  try {
    const limit = AbortSignal.timeout(timeout);
    const response = await fetcher('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: signal ? AbortSignal.any([signal, limit]) : limit,
      body: JSON.stringify({ model, stream: true, think: false, keep_alive: 300, options: { temperature: 0.5, num_ctx: 4096, num_predict: 560 },
        format: { type: 'object', properties: { tiles: { type: 'array', minItems: 9, maxItems: 9, items: tileShape } }, required: ['tiles'] },
        messages: [{ role: 'system', content: app[kind] + (place.bedside ? '\n\n' + easy : '') },
          ...log.slice(-6).map(turn => ({ role: turn.who === 'Staff' ? 'user' : 'assistant', content: (turn.who === 'Staff' ? 'Staff said: ' : 'I said: ') + turn.text })),
          { role: 'user', content: message(said, mode, shown, place, options) }] }),
    });
    if (!response.ok) throw new Error('Model unavailable');
    const decoder = new TextDecoder();
    let line = '', text = '', at = 0;
    for await (const chunk of response.body) {
      line += decoder.decode(chunk, { stream: true });
      const lines = line.split('\n');
      line = lines.pop();
      for (const row of lines) if (row.trim()) text += JSON.parse(row).message?.content || '';
      const { found, from } = tilesIn(text, at);
      at = from;
      for (const raw of found) {
        const tile = usable(raw, { bedside: place.bedside, allowed, options });
        if (!tile || seen.has(tile.label.toLowerCase()) || count >= 9) continue;
        seen.add(tile.label.toLowerCase());
        count++; made++;
        yield { tile };
      }
    }
  } catch { /* saved replies below */ }
  if (made >= 2 || count >= 6) {
    // Care answers the model left out are still offered.
    for (const tile of care) if (count < 9 && !seen.has(tile.label.toLowerCase())) { count++; yield { tile }; }
    return yield { done: true, source: made ? 'ai' : 'app' };
  }
  const saved = care.length ? care : (place.bedside && mode === 'reply' && yesNo(said)?.map(asTile)) || fixedReplies(said, place.bedside ? mode : 'venue').map(asTile);
  for (const tile of saved) if (!seen.has(tile.label.toLowerCase())) yield { tile };
  yield { done: true, source: 'fixed' };
}

const clean = (value, most) => typeof value === 'string' ? value.replace(/[\u0000-\u001f"]/g, ' ').trim().slice(0, most) : '';
export function careRepliesRoute({ identity, cookieName, origin, model, fetcher }) {
  const busy = new Set();
  return async (request, response) => {
    const reply = (status, body) => { response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.end(JSON.stringify(body)); };
    let key;
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'Use the sales workspace to make this request.');
      if (request.headers.origin !== origin) throw new HttpError(403, 'Open the sales workspace on its configured website.');
      if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Use a JSON request.');
      const cookie = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
      const user = await identity(cookie);
      if (!['agent', 'owner'].includes(user?.role)) throw new HttpError(403, 'A sales workspace account is required.');
      let raw = '';
      for await (const chunk of request) { raw += chunk; if (raw.length > 6000) throw new HttpError(413, 'This request is too large.'); }
      const body = JSON.parse(raw), said = clean(body.said, 350);
      if (!said || !Object.hasOwn(asks, body.mode || 'reply')) throw new HttpError(400, 'Check your request and try again.');
      if (busy.has(user.id)) throw new HttpError(429, 'Wait for the current replies.');
      busy.add(key = user.id);
      const log = (Array.isArray(body.log) ? body.log : []).slice(-6).map(turn => ({ who: turn?.who === 'Staff' ? 'Staff' : 'Visitor', text: clean(turn?.text, 200) })).filter(turn => turn.text);
      const shown = (Array.isArray(body.shown) ? body.shown : []).slice(0, 18).map(value => clean(value, 60)).filter(Boolean);
      const place = { name: clean(body.place?.name, 160) || 'this place', bedside: body.place?.bedside === true,
        options: (Array.isArray(body.place?.options) ? body.place.options : []).slice(0, 12).map(value => clean(value, 120)).filter(Boolean) };
      const left = new AbortController();
      response.once('close', () => left.abort());
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      for await (const part of careReplies({ said, mode: body.mode, log, shown, place }, { model, fetcher, signal: left.signal })) {
        if (response.destroyed) break;
        response.write(JSON.stringify(part) + '\n');
      }
      response.end();
    } catch (error) {
      if (response.headersSent) return response.end();
      const status = error.status || (error instanceof SyntaxError || error instanceof TypeError ? 400 : 502);
      reply(status, { error: error instanceof HttpError ? error.message : 'Check your request and try again.' });
    } finally { busy.delete(key); }
  };
}
