// Regenerate the local, data-only venue boards from a checkout of TinkySpeak-Web.
// Run with node scripts/sdr-export/import-venue-kiosks.mjs /path/to/TinkySpeak-Web /path/to/tinkytown-demo.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = process.argv[2];
const demoSource = process.argv[3];
if (!source || !demoSource) throw new Error('Supply the TinkySpeak-Web and tinkytown-demo checkouts.');
const output = fileURLToPath(new URL('../../public/rideshare-tax-pros/care-kiosks/', import.meta.url));
mkdirSync(output, { recursive: true });
const root = vm.createContext({ console, URLSearchParams });
root.window = root;
function load(name) {
  const script = readFileSync(join(source, 'js', 'kiosk-' + name + '.js'), 'utf8');
  vm.runInContext('(function(){\n' + script + '\n})();', root, { filename: name, timeout: 5000 });
}
for (const name of ['configs', 'accessibility-tree', 'crisis-support-tree', 'towns', 'survivor-next-steps',
  'airport-stages', 'airport-edges', 'airport', 'grocery-stages', 'grocery-edges', 'grocery',
  'hotel-stages', 'hotel-edges', 'hotel', 'banks', 'pharmacy', 'dmv', 'usps',
  'university-title-ix', 'university-boards', 'university-misconduct-edges', 'university-conduct-defense',
  'university-care-team', 'university-housing-emergency', 'university-identity', 'university-federal-status',
  'university-daily-life', 'university-tier3', 'university']) load(name);

function campusConfig(key) {
  const config = root.KioskUniversity.generateConfig(key);
  const emergency = root._buildEmergencyTreeForVenue(config.name, config.address || '');
  Object.assign(config.boards, emergency, root._buildAccessibilityTreeForVenue(config.name, config.address || ''));
  config.boards.help ||= { title: 'Help on campus', tiles: [
    { label: 'Ask a staff member', emoji: '💬', action: 'focus_input' },
    { label: 'Accessibility help', emoji: '♿', navigateTo: 'mobility_assist' },
    { label: 'Emergency help', emoji: '🚨', navigateTo: 'emergency' }
  ] };
  config.boards.police ||= { title: 'Campus police', tiles: [
    { label: 'Prepare a report', emoji: '📝', action: 'uni_route_to_police_wizard' },
    { label: 'Ask for an escort', emoji: '🚶', spokenText: 'I would like to ask campus police for an escort.' },
    { label: 'Immediate danger', emoji: '🚨', navigateTo: 'emergency' },
    { label: 'Back', emoji: '↩️', action: 'back' }
  ] };
  if (!config.boards.uni_international && config.boards.uni_international_deep) {
    config.boards.uni_international = config.boards.uni_international_deep;
  }
  return config;
}

const branches = (brands, sites = {}) => [...Object.keys(brands), ...Object.keys(sites)];
const families = [
  ['college', Object.keys(root.KioskUniversity.INSTITUTIONS), campusConfig],
  ['airport', branches(root.AIRPORT_CODES), key => root.generateAirportConfig(key)],
  ['bank', branches(root.BANK_BRANDS, root.BANK_BRANCHES), (...args) => root.generateBankConfig(...args)],
  ['grocery', branches(root.GROCERY_CHAINS, root.GROCERY_STORES), (...args) => root.generateGroceryConfig(...args)],
  ['hotel', branches(root.HOTEL_CHAINS, root.HOTEL_PROPERTIES), (...args) => root.generateHotelConfig(...args)],
  ['pharmacy', branches(root.PHARMACY_CHAINS, root.PHARMACY_STORES), (...args) => root.generatePharmacyConfig(...args)],
  ['dmv', branches(root.DMV_STATES, root.DMV_OFFICES), (...args) => root.generateDMVConfig(...args)],
  ['usps', ['generic', ...Object.keys(root.USPS_OFFICES)], key => root.generateUSPSConfig({ office: key })],
];

const legacy = vm.createContext({});
legacy.window = legacy;
vm.runInContext(readFileSync(join(demoSource, 'js', 'locations.js'), 'utf8'), legacy, { timeout: 5000 });
const legacyBoards = legacy.LOCATION_TEMPLATES;
// The transit demo keeps its stage/assistance tables inside its UI closure.
const tripSource = readFileSync(join(demoSource, 'js', 'transit-trip.js'), 'utf8');
function tripTable(name) {
  const literal = tripSource.match(new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\n  \\});'));
  if (!literal) throw new Error('Missing transit table ' + name);
  return vm.runInNewContext('(' + literal[1] + ')', {}, { timeout: 1000 });
}
const steps = tripTable('STEP_TEMPLATES'), assistance = tripTable('HELP_TEMPLATES');
function tripBoard(id) {
  const [,mode,destination] = id.split(':');
  if (!steps[mode]) throw new Error('Unknown trip mode ' + mode);
  return {title: mode[0].toUpperCase() + mode.slice(1) + ' to ' + destination.toLowerCase(),
    tiles: [...steps[mode], ...assistance[mode]].map(t => ({label:t.label, emoji:t.emoji, spokenText:t.sentence})).concat({label:'Back', action:'back', emoji:'↩️'})};
}
const community = { school: ['School office', 'loc_school_arrive'], student: ['Student services', 'loc_student_arrive'],
  library: ['Public library', 'loc_library_arrive'], restaurant: ['Restaurant', 'loc_rest_arrive'],
  transit: ['Public transportation', 'loc_transit_arrive'], shopping: ['Shopping', 'loc_shop_arrive'],
  hospital: ['Hospital admissions', 'loc_hospital_arrive'], senior: ['Senior center', 'loc_senior_arrive'],
  townhall: ['Town hall counters', 'loc_town_hall_arrive'], court: ['Courthouse', 'loc_court_arrive'],
  government: ['Government services', 'loc_gov_arrive'], dss: ['Social services', 'loc_dss_arrive'],
  registrar: ['Registrar of voters', 'loc_registrar_arrive'], utilities: ['Utilities', 'loc_utility_arrive'],
  post: ['Post office counter', 'loc_post_office_arrive'], dmv: ['Motor vehicles counter', 'loc_dmv_arrive'] };
function communityConfig(key) {
  const [name, entrance] = community[key], boards = {}, queue = [entrance];
  for (const id of queue) {
    if (Object.hasOwn(boards, id)) continue;
    if (id.startsWith('trip:')) { boards[id] = tripBoard(id); continue; }
    const tiles = legacyBoards[id].map(tile => {
      if (tile.navigateTo?.startsWith('trip:') && !queue.includes(tile.navigateTo)) queue.push(tile.navigateTo);
      if (tile.navigateTo?.startsWith('911_')) {
        const emergency = root._buildEmergencyTreeForVenue(name, '');
        Object.assign(boards, emergency, root._buildCrisisSupportTreeForVenue(name, ''));
        root.KioskSurvivorNextSteps.attach(boards);
        boards['911_start'] = emergency.emergency;
        boards['911_medical'] = emergency.emergency_medical;
      }
      if (legacyBoards[tile.navigateTo] && !queue.includes(tile.navigateTo)) queue.push(tile.navigateTo);
      return { label: tile.label, emoji: tile.emoji, spokenText: tile.sentence, navigateTo: tile.navigateTo,
        action: tile.label === 'BACK' ? 'back' : undefined, color: tile.type === 'social' ? 'teal' : 'blue' };
    });
    const title = id === entrance ? name : id.replace(/^loc_[a-z]+_/, '').replaceAll('_', ' ');
    boards[id] = { title, tiles };
  }
  if (boards.emergency && !boards.help) boards.help = boards[entrance];
  return { name, boards: { ...boards, main: boards[entrance] } };
}
families.push(['community', Object.keys(community), communityConfig]);

function titleFor(board, id, name) {
  const title = typeof board.title === 'string' && board.title.trim();
  if (title) return title;
  if (id === 'main') return name;
  const words = id.replace(/^uni_/, '').replaceAll('_', ' ');
  return words[0].toUpperCase() + words.slice(1);
}
for (const [family, keys, generate] of families) {
  // Store shared boards once per family. Places retain their individual address, name and board graph.
  const pool = [], known = new Map(), places = [];
  for (const key of new Set(keys)) {
    const config = generate(...key.split('/'));
    if (!config?.boards?.main) throw new Error('Missing main board for ' + family + '/' + key);
    const name = config.name || config.fullName || config.title;
    if (places.some(p => p.name === name && p.address === (config.address || ''))) continue;
    const boards = {};
    for (const [id, board] of Object.entries(config.boards)) {
      const tiles = (board.tiles || []).map(tile => {
        const item = {};
        for (const k of ['emoji','label','subtitle','spokenText','color','navigateTo','action','actionUrl','showForStaffText']) {
          if (typeof tile[k] === 'string' && tile[k]) item[k] = tile[k];
        }
        if (tile.dataset?.reportNext) item.reportNext = tile.dataset.reportNext;
        if (!item.label) item.label = item.spokenText || item.subtitle;
        return item;
      }).filter(tile => tile.label);
      if (!tiles.length) continue;
      const value = { title: titleFor(board, id, name), tiles };
      const hash = JSON.stringify(value);
      if (!known.has(hash)) { known.set(hash, pool.length); pool.push(value); }
      boards[id] = known.get(hash);
    }
    if (boards.main === undefined || !name) throw new Error('Invalid venue ' + key);
    for (const index of Object.values(boards)) {
      for (const tile of pool[index].tiles) {
        if (tile.navigateTo && !Object.hasOwn(boards, tile.navigateTo)) {
          throw new Error('Unknown board ' + family + '/' + key + '/' + tile.navigateTo);
        }
      }
    }
    places.push({ key, name, address: config.address || '', boards });
  }
  writeFileSync(join(output, family + '.json'), JSON.stringify({ places, pool }) + '\n');
  console.log(family, places.length + ' venues,', pool.length + ' distinct boards');
}

// Campus navigation postdates the shared dictionaries. Keep the top-level choices usable offline.
const locales = ['es', 'fr', 'ar', 'pt', 'zh', 'vi'];
const campusLabels = {
  'Academics': ['Estudios','Études','الدراسة','Estudos','学业','Học tập'],
  'Bursar / Financial': ['Tesorería / Finanzas','Frais de scolarité / Finances','الرسوم والشؤون المالية','Tesouraria / Finanças','学费与财务','Học phí / Tài chính'],
  'Health': ['Salud','Santé','الصحة','Saúde','健康','Sức khỏe'],
  'Counseling / CAPS': ['Apoyo psicológico / CAPS','Soutien psychologique / CAPS','الدعم النفسي / CAPS','Apoio psicológico / CAPS','心理咨询 / CAPS','Tư vấn tâm lý / CAPS'],
  'Disability / Access': ['Discapacidad / Accesibilidad','Handicap / Accessibilité','الإعاقة وإمكانية الوصول','Deficiência / Acessibilidade','残障与无障碍服务','Khuyết tật / Tiếp cận'],
  'Title IX / Safety': ['Título IX / Seguridad','Titre IX / Sécurité','الباب التاسع والسلامة','Título IX / Segurança','第九条款与安全','Title IX / An toàn'],
  'Bookstore': ['Librería','Librairie','مكتبة بيع الكتب','Livraria','书店','Hiệu sách'],
  'Campus Police': ['Policía del campus','Police du campus','شرطة الجامعة','Polícia do campus','校园警察','Cảnh sát trường'],
  'I was ACCUSED': ['Me han acusado','On m’accuse','وُجّه إليّ اتهام','Sofri uma acusação','我被指控了','Tôi bị buộc tội'],
  'No safe place tonight': ['No tengo un lugar seguro esta noche','Pas d’endroit sûr pour ce soir','لا مكان آمن لي الليلة','Sem lugar seguro hoje à noite','今晚没有安全的住处','Tối nay tôi không có nơi an toàn'],
  'Identity support': ['Apoyo sobre identidad','Soutien lié à l’identité','دعم متعلق بالهوية','Apoio relacionado à identidade','身份认同支持','Hỗ trợ về bản dạng'],
  'A FRIEND is in crisis': ['Una amistad está en crisis','Un proche est en crise','أحد أصدقائي يمر بأزمة','Uma pessoa amiga está em crise','一位朋友正处于危机之中','Một người bạn đang gặp khủng hoảng'],
  'Day-to-day stuff': ['La vida diaria','Vie quotidienne','الحياة اليومية','Vida cotidiana','日常事务','Sinh hoạt hằng ngày'],
  'Career help': ['Orientación profesional','Aide à la carrière','المساعدة المهنية','Orientação profissional','职业指导','Hỗ trợ nghề nghiệp']
};
for (const language of locales) {
  const dictionary = JSON.parse(readFileSync(join(source, 'translations', language + '.json'), 'utf8'));
  const offset = locales.indexOf(language);
  for (const [en, values] of Object.entries(campusLabels)) dictionary[en] ||= values[offset];
  const entries = Object.entries(dictionary).filter(([, text]) => typeof text === 'string' && text.trim());
  writeFileSync(join(output, 'lang-' + language + '.json'), JSON.stringify(Object.fromEntries(entries)) + '\n');
}
