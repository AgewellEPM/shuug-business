// Regenerate the TinkyStroke boards from the Android source. Every label and phrase is read
// from the Kotlin. Run with node scripts/sdr-export/import-tinkystroke.mjs /path/to/tinkystroke.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Supply the tinkystroke checkout.');
const read = name => readFileSync(join(source, 'app/src/main/java/com/example/AI_AAC', name + '.kt'), 'utf8');
const quick = read('TinkyAskQuickTiles'), boardsSource = read('TinkyAskBoards'), flow = read('TinkyAskConversationFlow');
const str = '"((?:[^"\\\\]|\\\\.)*)"';
const text = raw => JSON.parse('"' + raw + '"').replace(/\s*\n\s*/g, ' ').trim();
function body(name) {
  const start = quick.indexOf('internal fun TinkyAskActivity.' + name + '(');
  if (start < 0) throw new Error('Missing ' + name);
  const end = quick.indexOf('\ninternal fun ', start + 10);
  return quick.slice(start, end < 0 ? undefined : end);
}
function rows(code, kind, columns) {
  const found = [...code.matchAll(new RegExp(kind + '\\(\\s*' + Array(columns).fill(str).join('\\s*,\\s*'), 'g'))].map(m => m.slice(1).map(text));
  if (!found.length) throw new Error('No ' + kind);
  return found;
}
const heading = code => text(new RegExp('text = "  ((?:[^"\\\\]|\\\\.)*)"').exec(code)[1]).replace(/^\P{L}+/u, '');

const opens = {};
const boards = {};
for (const [token, name, kind] of [['FOOD','showFoodTiles','FoodTile'],['DRINKS','showDrinksTiles','DrinkTile'],['NURSE','showNurseTiles','NurseTile'],
  ['QUESTIONS','showQuestionsTiles','QuestionTile'],['FEELINGS','showFeelingsTiles','FeelingTile'],['I_WANT','showIWantTiles','WantTile'],
  ['PEOPLE','showPeopleTiles','PersonTile'],['MOBILITY','showMobilityTiles','MoveTile'],['COMFORT','showComfortTiles','ComfortTile'],
  ['SWALLOWING','showSwallowingTiles','SwallowTile'],['WORDS','showWordFindingTiles','WordTile'],['COMMUNICATION','showCommunicationTiles','CommTile'],
  ['BODY_PART_PICKER','showBodyPartPicker','BodyPart']]) {
  const code = body(name), id = token.toLowerCase();
  opens['__' + token + '__'] = id;
  boards[id] = { title: heading(code), tiles: rows(code, kind, 3).map(([emoji, label, say]) => ({ emoji, label, say })) };
  // The full-width speak button above the menu, where the app has one.
  const lead = /speak\("((?:[^"\\]|\\.)*)"\)\s*\n\s*lastUtterance = "/.exec(code);
  const shown = /text = "(?:\\uD83D\\uDD0A)  ((?:[^"\\]|\\.)*)"/.exec(code);
  if (lead && shown) boards[id].tiles.unshift({ emoji: '🔊', label: text(shown[1]), say: text(lead[1]) });
}
const home = body('buildQuickTiles');
const strip = rows(home, 'EmergencyItem', 3).map(([emoji, label, say]) => ({ emoji, label, say }));
const tier = name => {
  const start = home.indexOf('val ' + name), list = home.slice(start, home.indexOf('\n    )', start));
  return rows(list, 'CustomTile', 3).map(([emoji, label, phrase]) => opens[phrase] ? { emoji, label, open: opens[phrase] }
    : phrase.startsWith('__') ? { emoji, label, tool: phrase.replaceAll('_', ' ').trim().replaceAll(' ', '_').toLowerCase() }
    : new RegExp(label.split(' ')[0] + '.*isTopicStarter').test(list) ? { emoji, label, topic: phrase } : { emoji, label, say: phrase });
};
const acute = tier('acuteTiles'), hospital = [...acute, ...tier('hospitalTiles')], full = [...hospital, ...tier('fullTiles')];
const levels = [...body('showPainScale').matchAll(new RegExp('PainLevel\\((\\d+), ' + [str, str, str].join(', '), 'g'))]
  .map(m => ({ level: Number(m[1]), emoji: text(m[2]), label: text(m[3]), color: m[4] }));
const kinds = rows(body('showPainType'), 'PainType', 3).map(([emoji, label, descriptor]) => ({ emoji, label, descriptor }));
const places = rows(body('showPainBodyLocation'), 'BodyPart', 3).map(([emoji, label, location]) => ({ emoji, label, location }));
const after = [...flow.slice(flow.indexOf('showAfterResponseActions('), flow.indexOf('showWaitingState(childJustSaid: String)')).matchAll(/text = "((?:[^"\\]|\\.)*)"/g)]
  .map(m => text(m[1])).filter(label => /Say Again|Wrong One|Their Turn|Keep Talking|Show Something|I'm Done/.test(label));
const saved = [...boardsSource.slice(boardsSource.indexOf('createDefaultStrokeBoards')).matchAll(new RegExp('Board\\(\\s*id = ' + str + ',\\s*name = ' + str + ',\\s*emoji = ' + str + ',\\s*tiles = mutableListOf\\(([\\s\\S]*?)\\n        \\)', 'g'))]
  .map(m => ({ id: m[1], title: text(m[2]), emoji: text(m[3]), tiles: rows(m[4], 'BoardTile', 3).map(([emoji, label, say]) => ({ emoji, label, say })) }));
const alert = /speak\("([^"]+)"\)/.exec(body('triggerNurseAlert'))[1];
const label = (code, pattern) => text(new RegExp('text = "((?:[^"\\\\]|\\\\.)*' + pattern + '[^"]*)"').exec(code)[1]);
const nurse = { alert, urgent: label(body('showNurseTiles'), 'URGENT'), tools: label(body('showNurseTiles'), 'Nurse Tools'),
  sounded: label(body('triggerNurseAlert'), 'ALERT SOUNDED'), show: label(body('triggerNurseAlert'), 'Show this screen'),
  followUps: [...body('showNurseFollowUp').matchAll(new RegExp([str, str, str].join(' to '), 'g'))].map(m => m.slice(1).map(text)).map(([emoji, name, say]) => ({ emoji, label: name, say })) };
const care = read('TinkyAskNurseTools'), limits = care.slice(care.indexOf('checkDietRestriction'));
const diet = { npo: { message: ['This patient is NPO', 'Do NOT give food', 'If this status is wrong'].map(start => text(new RegExp('"(' + start + '(?:[^"\\\\]|\\\\.)*)"').exec(limits)[1])).join(' '), say: text(/speak\("([^"]+)"\)/.exec(limits)[1]) },
  warnings: [...limits.matchAll(/status == "(\w+)" && is(Food|Drink)Request -> "([^"]+)"/g)].map(m => ({ status: m[1], kind: m[2].toLowerCase(), message: m[3] })) };
if (nurse.followUps.length !== 6 || diet.warnings.length < 5) throw new Error('The Android nurse tools changed shape.');
if (strip.length !== 4 || acute.length !== 8 || hospital.length !== 15 || full.length !== 23 || levels.length !== 11 || kinds.length !== 10 || places.length !== 13 || after.length !== 6 || saved.length !== 5) {
  throw new Error('The Android source changed shape: ' + [strip, acute, hospital, full, levels, kinds, places, after, saved].map(x => x.length));
}
// The app's AI prompt and its fixed replies, for the local model behind Listen for Staff.
const ai = read('TinkyAskAI'), offline = read('TinkyAskOffline');
const kotlin = raw => JSON.parse('"' + raw.replaceAll('\\$', '$') + '"');
const builder = ai.slice(ai.indexOf('buildBaseSystemPrompt('), ai.indexOf('private fun parseTileResponse'));
const opening = [...builder.slice(0, builder.indexOf('// Dual-language')).matchAll(/appendLine\("((?:[^"\\]|\\.)*)"\)/g)].map(m => kotlin(m[1])).join('\n');
const closing = /appendLine\("{3}([\s\S]*?)"{3}\)/.exec(builder)[1].trim();
const sets = Object.fromEntries([...offline.matchAll(/val OFFLINE_(\w+)_RESPONSES = listOf\(([\s\S]*?)\n\)/g)].map(m => [m[1].toLowerCase(), [...m[2].matchAll(new RegExp(str, 'g'))].map(x => text(x[1]))]));
const matching = offline.slice(offline.indexOf('getOfflineResponses('), offline.indexOf('getOfflineStarters('));
const rules = [...matching.matchAll(/containsAny\(([^)]*)\) ->\s*OFFLINE_(\w+)_RESPONSES/g)].map(m => ({ words: [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]), set: m[2].toLowerCase() }));
const more = offline.slice(offline.indexOf('getOfflineContinuations('), offline.indexOf('// ==================== FIXED RESPONSE SETS'));
const continuations = [...more.matchAll(/(?:containsAny\(([^)]*)\)|else) -> listOf\(([\s\S]*?)\n        \)/g)].map(m => ({ words: [...(m[1] || '').matchAll(/"([^"]*)"/g)].map(x => x[1]), tiles: [...m[2].matchAll(new RegExp(str, 'g'))].map(x => text(x[1])) }));
if (opening.split('\n').length < 17 || !/EXACTLY 6 options/.test(closing) || Object.keys(sets).length !== 12 || rules.length !== 11 || continuations.length !== 3) {
  throw new Error('The Android AI source changed shape: ' + [opening.split('\n').length, Object.keys(sets).length, rules.length, continuations.length]);
}
writeFileSync(fileURLToPath(new URL('./care-replies.json', import.meta.url)), JSON.stringify({ opening, closing, offline: { sets, rules, continuations } }, null, 1) + '\n');
writeFileSync(fileURLToPath(new URL('../../public/rideshare-tax-pros/care-tinkystroke.json', import.meta.url)),
  JSON.stringify({ strip, tiers: { acute, hospital, full }, boards, pain: { levels, kinds, places }, after, saved, nurse, diet }, null, 1) + '\n');
console.log(Object.entries(boards).map(([id, b]) => id + ' ' + b.title + ' ' + b.tiles.length).join('\n'));
