// Reply tiles for the demo kiosks. Tiles are the visitor's or patient's words, never an answer from
// the assistant. Bedside uses TinkyStroke's prompt and every other place uses TinkyTown's own.
// The order is the Android app's: either/or questions, then
// yes/no questions, then the AI, then fixed replies. The model runs on this computer.
import { readFileSync } from 'node:fs';
import { HttpError } from '../../sales/model.mjs';

const app = JSON.parse(readFileSync(new URL('./care-replies.json', import.meta.url), 'utf8'));
const fallbackEmoji = ['🔥', '✨', '💪', '🎯', '🧭', '💡', '⚡', '🛡️'];
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
// Anything about the body, medicine or care is answered only from the app's own tiles. A model must
// never put a symptom in a patient's mouth. Words match whole, since "ct" is also inside "doctor".
const symptom = /\b(wound|bleed\w*|chok\w*|chest|breath\w*|numb\w*|dizz\w*|stab\w*|seizure|stroke|allerg\w*|overdose|unconscious)\b/i;
export function medicalReplies(said) {
  const lower = said.toLowerCase();
  const about = words => words.some(word => new RegExp('\\b' + word.trim().replace(/[^a-z ]/g, '') + (word.trim().length > 3 ? '' : '\\b')).test(lower));
  if (/\bwhere\b/.test(lower) && /\b(hurt|pain|sore|ache)/.test(lower)) return app.body.map(tile => ({ emoji: tile.emoji, label: tile.label, say: tile.say }));
  if (symptom.test(lower) && !/\b(pain|hurt)/.test(lower)) return app.offline.sets.yes_no.map(asTile);
  const rule = app.offline.rules.find(item => ['pain', 'medication', 'food', 'bathroom', 'positioning', 'procedures', 'discharge', 'feelings', 'greeting'].includes(item.set) && about(item.words));
  return rule ? app.offline.sets[rule.set].map(asTile) : null;
}
export function parseTiles(content) {
  return content.replaceAll('\n', '|').split('|').map(tile => tile.replace(/[\u0000-\u001f]/g, '').trim())
    .filter(tile => tile && tile.length <= 60 && !/https?:/i.test(tile))
    .map((tile, i) => {
      const [, emoji, words] = /^((?:\p{Extended_Pictographic}[\uFE0F\u200D\p{Emoji_Modifier}]*)+)\s*(.*)$/u.exec(tile) || [];
      return emoji ? emoji + ' ' + words : fallbackEmoji[i % fallbackEmoji.length] + ' ' + tile;
    })
    .filter(tile => /\p{L}/u.test(tile)).slice(0, 6);
}

export function parseVenueTiles(content) {
  return content.replaceAll('\r', '').split('\n').map(line => line.replace(/[*_`#]/g, '').replace(/^\s*(?:[-•]|\d+[.)])\s*/, '').trim())
    .map(line => /^(.+?)\s*\|\s*(.+?)(?:\s*\|\s*(.+))?$/.exec(line))
    .filter(match => match && /\p{L}/u.test(match[2]) && !/^(label|back)$/i.test(match[2]) && !/https?:/i.test(match[0]))
    .map(([, emoji, label, say]) => ({ emoji: /\p{Extended_Pictographic}/u.test(emoji) ? emoji.trim().slice(0, 12) : '💬', label: label.trim().slice(0, 40), say: (say || label).trim().slice(0, 200) }))
    .slice(0, 9);
}
const asTile = words => { const cut = words.indexOf(' '), label = words.slice(cut + 1).trim(); return { emoji: words.slice(0, cut), label, say: label }; };

const modes = {
  reply: said => ({ situation: 'THE OTHER PERSON JUST SAID: "' + said + '"', ask: 'Generate 6 response options separated by |. Every option MUST start with an emoji.' }),
  more: (said, shown) => ({ temperature: 0.3, ask: 'Generate 6 NEW direct response options separated by |. Every option MUST start with an emoji.',
    situation: 'THE OTHER PERSON SAID: "' + said + `"

Previous options were rejected. Generate MORE LITERAL, DIRECT, FACTUAL answers.
No creativity, no embellishment. What would a real person ACTUALLY say?
Stick to the topic. No tangents, no redirects.

ALREADY SHOWN (do NOT repeat):
` + shown.map(tile => '- ' + tile).join('\n') }),
  continue: said => ({ ask: 'Generate 6 continuation options separated by |. Every option MUST start with an emoji.',
    situation: 'I JUST SAID: "' + said + `"
Now I want to keep talking — generate what I might say NEXT.
Follow-ups to what I just said, adding detail, asking questions, changing topic, making a request.
CRITICAL: These come out of MY mouth. First person only. I/my/me. Never describe me in 3rd person.
CRITICAL: I am the SPEAKER. Do NOT generate things the OTHER person would say to me.
If I introduced myself, do NOT repeat my introduction back to me — generate what I'd say AFTER introducing myself.
Reference exactly what I said and the conversation so far.` }),
};
async function venueReplies({ said, mode, log, shown, place }, { model, fetcher, timeout }) {
  const recent = log.slice(-6).map(turn => (turn.who === 'Staff' ? 'Staff: ' : 'Visitor: ') + turn.text).join('\n');
  const system = [app.venue.opening, 'Likely venue: ' + place.name + '.', place.services.length && app.venue.grounding.replace('{services}', () => place.services.join(', ')),
    app.venue.rules, app.venue.format, recent && 'CONVERSATION SO FAR:\n' + recent].filter(Boolean).join('\n\n');
  const ask = mode === 'more' ? 'Generate different tiles for: ' + said + '\nALREADY SHOWN (do NOT repeat): ' + shown.join(', ') : said;
  const response = await fetcher('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeout),
    body: JSON.stringify({ model, stream: false, think: false, keep_alive: 300, options: { temperature: 0.4, num_ctx: 4096, num_predict: 320 },
      messages: [{ role: 'system', content: system }, { role: 'user', content: ask }] }),
  });
  if (!response.ok) throw new Error('Model unavailable');
  const tiles = parseVenueTiles((await response.json()).message.content);
  if (tiles.length < 3) throw new Error('Too few tiles');
  return { source: 'ai', tiles };
}

export async function careReplies({ said, mode = 'reply', log = [], shown = [], place = null }, { model = 'qwen3:4b-instruct-2507-q4_K_M', fetcher = fetch, timeout = 25_000 } = {}) {
  if (place && !place.bedside) {
    try { return await venueReplies({ said, mode, log, shown, place }, { model, fetcher, timeout }); }
    catch { return { source: 'fixed', tiles: fixedReplies(said, 'venue').map(asTile) }; }
  }
  if (mode === 'reply') {
    const choices = orChoices(said);
    if (choices) return { source: 'question', tiles: choices.map(asTile) };
    const authored = medicalReplies(said);
    if (authored) return { source: 'authored', tiles: authored };
    const answers = yesNo(said);
    if (answers) return { source: 'question', tiles: answers.map(asTile) };
  }
  if (mode === 'more' && medicalReplies(said)) return { source: 'authored', tiles: [...app.offline.sets.universal, ...app.offline.sets.yes_no].filter((tile, i, all) => all.indexOf(tile) === i && !shown.includes(asTile(tile).label)).slice(0, 6).map(asTile) };
  try {
    const { situation, ask, temperature } = modes[mode](said, shown);
    const recent = log.slice(-6).map(turn => (turn.who === 'Staff' ? 'Other person said: ' : 'I said: ') + turn.text).join('\n');
    const system = [app.opening, recent && "\nCONVERSATION SO FAR (I = the person using this device, Other person = whoever I'm talking to):\n" + recent, '\n' + situation, '\n' + app.closing].filter(Boolean).join('\n');
    const response = await fetcher('http://127.0.0.1:11434/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeout),
      body: JSON.stringify({ model, stream: false, think: false, keep_alive: 300, options: { temperature: temperature ?? 0.7, num_predict: 120 },
        messages: [{ role: 'system', content: system }, { role: 'user', content: situation + '\n\n' + ask }] }),
    });
    if (!response.ok) throw new Error('Model unavailable');
    // A patient's tile says exactly what it shows. Longer wording is where a model starts inventing.
    const tiles = parseTiles((await response.json()).message.content).filter(tile => tile.split(' ').length <= 6);
    if (tiles.length >= 3 && !tiles.some(tile => symptom.test(tile))) return { source: 'ai', tiles: tiles.map(asTile) };
  } catch { /* fixed replies below */ }
  return { source: 'fixed', tiles: fixedReplies(said, mode).map(asTile) };
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
      if (!said || !Object.hasOwn(modes, body.mode || 'reply')) throw new HttpError(400, 'Check your request and try again.');
      if (busy.has(user.id)) throw new HttpError(429, 'Wait for the current replies.');
      busy.add(key = user.id);
      const log = (Array.isArray(body.log) ? body.log : []).slice(-6).map(turn => ({ who: turn?.who === 'Staff' ? 'Staff' : 'Visitor', text: clean(turn?.text, 200) })).filter(turn => turn.text);
      const shown = (Array.isArray(body.shown) ? body.shown : []).slice(0, 18).map(value => clean(value, 60)).filter(Boolean);
      const place = body.place && typeof body.place === 'object' ? { name: clean(body.place.name, 120) || 'this place', bedside: body.place.bedside === true,
        services: (Array.isArray(body.place.services) ? body.place.services : []).slice(0, 40).map(value => clean(value, 40)).filter(Boolean) } : null;
      reply(200, await careReplies({ said, mode: body.mode, log, shown, place }, { model, fetcher }));
    } catch (error) {
      const status = error.status || (error instanceof SyntaxError || error instanceof TypeError ? 400 : 502);
      reply(status, { error: error instanceof HttpError ? error.message : 'Check your request and try again.' });
    } finally { busy.delete(key); }
  };
}
