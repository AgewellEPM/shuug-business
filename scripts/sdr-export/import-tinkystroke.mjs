// Regenerate the TinkyStroke boards from the Android source. Every label and phrase is read
// from the Kotlin. Run with node scripts/sdr-export/import-tinkystroke.mjs /path/to/tinkystroke /path/to/TinkySpeak-Web /path/to/tinkytown-demo.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2], town = process.argv[3], demo = process.argv[4];
if (!source || !town || !demo) throw new Error('Supply the tinkystroke, TinkySpeak-Web and tinkytown-demo checkouts.');
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
// The app's fixed replies, for when the model does not answer.
const offline = read('TinkyAskOffline');
const sets = Object.fromEntries([...offline.matchAll(/val OFFLINE_(\w+)_RESPONSES = listOf\(([\s\S]*?)\n\)/g)].map(m => [m[1].toLowerCase(), [...m[2].matchAll(new RegExp(str, 'g'))].map(x => text(x[1]))]));
const matching = offline.slice(offline.indexOf('getOfflineResponses('), offline.indexOf('getOfflineStarters('));
const rules = [...matching.matchAll(/containsAny\(([^)]*)\) ->\s*OFFLINE_(\w+)_RESPONSES/g)].map(m => ({ words: [...m[1].matchAll(/"([^"]*)"/g)].map(x => x[1]), set: m[2].toLowerCase() }));
const more = offline.slice(offline.indexOf('getOfflineContinuations('), offline.indexOf('// ==================== FIXED RESPONSE SETS'));
const continuations = [...more.matchAll(/(?:containsAny\(([^)]*)\)|else) -> listOf\(([\s\S]*?)\n        \)/g)].map(m => ({ words: [...(m[1] || '').matchAll(/"([^"]*)"/g)].map(x => x[1]), tiles: [...m[2].matchAll(new RegExp(str, 'g'))].map(x => text(x[1])) }));
if (Object.keys(sets).length !== 12 || rules.length !== 11 || continuations.length !== 3) {
  throw new Error('The Android AI source changed shape: ' + [Object.keys(sets).length, rules.length, continuations.length]);
}
// The two AIs behind demo.tinkytown.com, and the words its router uses to choose between them.
const prompts = readFileSync(join(town, 'worker/src/two_ai_prompts.js'), 'utf8');
const prompt = name => new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;').exec(prompts)[1].trim();
const job = prompt('JOB_AI_PROMPT'), helper = prompt('HELPER_AI_PROMPT');
const router = readFileSync(join(demo, 'js/ai-conversation.js'), 'utf8');
const feelings = [...router.slice(router.indexOf('en: ['), router.indexOf('],', router.indexOf('en: ['))).matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replaceAll("\\'", "'"));
const speech = readFileSync(join(demo, 'js/speech.js'), 'utf8');
const controls = [...speech.slice(speech.indexOf('function showConversationControls'), speech.indexOf('updateTiles(controlTiles')).matchAll(/emoji: '([^']+)', label: (?:'([^']*)'|"([^"]*)"), type: '\w+', sentence: (?:'([^']*)'|"([^"]*)"|justSaid), _action: '(\w+)'/g)]
  .map(m => ({ emoji: m[1].replace(/\\u\{([0-9A-Fa-f]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16))), label: m[2] ?? m[3], say: m[4] ?? m[5] ?? '', action: m[6] }));
if (!/NO HALLUCINATION/.test(job) || !/9 tile/.test(helper) || /\$\{/.test(job + helper) || feelings.length < 25 || controls.length !== 7) throw new Error('The demo AI changed shape: ' + [feelings.length, controls.length]);
writeFileSync(fileURLToPath(new URL('./care-replies.json', import.meta.url)), JSON.stringify({ job, helper, feelings, body: JSON.parse(readFileSync(join(source, 'app/src/main/assets/boards/pain_body_board.json'), 'utf8')).tiles
  .filter(tile => !/^(GO BACK|ADD NEW)$/.test(tile.label)).map(tile => ({ emoji: tile.emoji, label: tile.label, say: tile.spokenText })), offline: { sets, rules, continuations } }, null, 1) + '\n');
writeFileSync(fileURLToPath(new URL('../../public/rideshare-tax-pros/care-tinkystroke.json', import.meta.url)),
  JSON.stringify({ strip, tiers: { acute, hospital, full }, boards, pain: { levels, kinds, places }, after, saved, nurse, diet, controls }, null, 1) + '\n');
console.log(Object.entries(boards).map(([id, b]) => id + ' ' + b.title + ' ' + b.tiles.length).join('\n'));
