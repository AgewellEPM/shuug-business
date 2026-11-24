// Rebuild the offline sales demo from a working copy of TinkySpeak-Web.
// node scripts/sdr-export/import-care-locations.mjs <TinkySpeak-Web> [output-directory]
// The local qrencode utility creates public-entry QR images.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const sourceArg = process.argv[2];
if (!sourceArg || sourceArg === '--help') {
  console.log('Usage: node import-care-locations.mjs <TinkySpeak-Web> [output-directory]');
  process.exit(sourceArg ? 0 : 2);
}
const source = resolve(sourceArg);
const output = resolve(process.argv[3] || fileURLToPath(new URL('../../public/rideshare-tax-pros/', import.meta.url)));
const revision = execFileSync('git', ['-C',source,'rev-parse','--short=7','HEAD'], {encoding:'utf8'}).trim();
const context = vm.createContext({console});
context.window = context;
const inputs = [];
const boards = {};
const packs = {visit:[], gmb:[]};

function load(filename) {
  inputs.push(filename);
  vm.runInContext(readFileSync(join(source, filename),'utf8'),context,{filename, timeout:5000});
}

// The historical role-play includes filled-in identifiers. Let the visitor
// choose what to share when practicing those same counter interactions.
const examplePhrases = new Map([
  ['My phone number is 555-1234.','I can show you my phone number.'],
  ['555-1234.','I can show you my phone number.'],
  ['My email is john.doe@example.com.','I can show you my email address.'],
  ['My name is John Doe.','I can show you my name.'],
  ['My address is 123 Main St.','I can show you my address.'],
  ['123 Main St.','I can show you my address.'],
  ['123 Main Street.','I can show you my address.'],
  ['The prescription number is 123456.','I can show you the prescription number on the label.'],
  ['Your order number is 123. Enjoy your meal!','Here is your order number. Enjoy your meal!']
]);
const visitorText = text => examplePhrases.get(text) || text;

function addBoard(id,title,original,dialogue = false) {
  const tiles = [];
  let prompt;
  for (const originalTile of original) {
    const t = originalTile;
    if (dialogue && /^(THEY SAY|YOU HEAR|STAFF SAYS)$/i.test(t.label)) {
      prompt = visitorText(t.sentence);
      continue;
    }
    const label = visitorText(dialogue && t.type !== 'nav' ? t.sentence || t.label : t.label);
    const say = visitorText(t.spokenText ?? t.sentence);
    const tile = {
      label, emoji:t.emoji, say:say === label ? undefined : say,
      next:t.navigateTo || undefined, action:t.action,
      color:t.color || undefined, detail:t.subtitle, quiet:t.silent || undefined
    };
    if (t.type === 'nav' && /^back$/i.test(t.label)) tile.action = 'back';
    if (t.action === 'show_for_staff') tile.say = t.showForStaffText || tile.say;
    if (t.action === 'open_url') tile.detail = 'Demonstration only';
    tiles.push(tile);
  }
  boards[id] = {title,prompt,tiles};
}

context.registerLocationChunk = chunk => {
  for (const [id,tiles] of Object.entries(chunk.boards)) {
    const name = id.replace(/^loc_(visit_)?biz_/,'').replace(/_(t\d+|arrive)$/,'').replaceAll('_',' ');
    const title = ['loc_clinic_arrive','loc_visit_healthcare_arrive'].includes(id)
      ? 'Healthcare locations' : name.charAt(0).toUpperCase()+name.slice(1);
    addBoard(id,title,tiles,true);
  }
};
load('js/locations-visit-healthcare.js');
load('js/locations-gmb-healthcare.js');

for (const filename of ['js/kiosk-configs.js','js/kiosk-town-rooms.js','js/kiosk-accessibility-tree.js',
  'js/kiosk-crisis-support-tree.js','js/kiosk-survivor-next-steps.js','js/kiosk-towns.js',
  'js/kiosk-board.js','js/kiosk-languages.js']) load(filename);
const town = context.generateTownConfig('Hartford','CT');
for (const [id,board] of Object.entries(town.boards)) {
  const tiles = context._injectYesNo(board.tiles).map(t=>({...t,navigateTo:t.navigateTo && 'civic_'+t.navigateTo}));
  addBoard('civic_'+id,board.title,tiles);
}

const medicalGenerator = 'worker/src/medical_office_generator.js';
const medicalSeeds = 'worker/scripts/seed-medical-offices.mjs';
inputs.push(medicalGenerator,medicalSeeds);
const {generateMedicalOfficeBoard} = await import(pathToFileURL(join(source,medicalGenerator)));
// The seed lists the network's main address. Use the city for the clinic demo.
const clinic = generateMedicalOfficeBoard({
  name:'Hartford HealthCare Medical Group',townDisplay:'Hartford',state:'CT',
  specialty:'Multi-specialty',parentSystem:'Hartford HealthCare'
});
addBoard(clinic.id,clinic.title,clinic.tiles);
for (const [id,b] of Object.entries(clinic.subBoards)) addBoard(id,b.title,b.tiles);

const coreIds = Object.keys(boards);
const known = new Set(coreIds);
const files = readdirSync(join(source,'js')).sort();
for (const mode of Object.keys(packs)) {
  for (const file of files.filter(name=>name.startsWith('locations-'+mode+'-') && name.endsWith('.js') && !name.endsWith('-healthcare.js'))) {
    load('js/'+file);
  }
  for (const id of Object.keys(boards)) {
    if (known.has(id)) continue;
    known.add(id);
    packs[mode].push(id);
  }
}
boards.loc_visit_arrive.title = 'TinkyTown locations';
boards.loc_gmb_arrive.title = 'Call a location';

function locationName(tile) {
  const name = (tile.say || tile.label)
    .replace(/^I (?:am (?:at |calling |visiting )|want to call )(?:(?:a|an) )?/i,'')
    .replace(/ business$/i,'');
  return name.charAt(0).toUpperCase()+name.slice(1);
}
function entrances(board,except) {
  return board.tiles.filter(t=>t.next && t.action !== 'back' && t.next !== except);
}
const directory = {visit:[],gmb:[]};
for (const [mode,root] of [['visit','loc_visit_arrive'],['gmb','loc_gmb_arrive']]) {
  for (const category of entrances(boards[root])) {
    const group = boards[category.next];
    const name = locationName(category);
    category.label = name;
    group.title = name;
    const venues = [];
    for (const tile of entrances(group,root)) {
      const venue = locationName(tile);
      tile.label = venue;
      boards[tile.next].title = venue;
      venues.push({name:venue,board:tile.next,emoji:tile.emoji});
    }
    directory[mode].push({name,board:category.next,emoji:category.emoji,venues});
  }
}

for (const [id,board] of Object.entries(boards)) {
  for (const t of board.tiles) if(t.next && !boards[t.next]) throw new Error(id+' points to missing board '+t.next);
}
function serializeBoards(ids,perLine = 1) {
  const rows = ids.map(id=>JSON.stringify(id)+':'+JSON.stringify(boards[id]));
  const lines = [];
  for(let i=0;i<rows.length;i+=perLine) lines.push(rows.slice(i,i+perLine).join(','));
  return '{\n'+lines.join(',\n')+'\n}';
}
mkdirSync(output,{recursive:true});
const languages = context.LANGUAGES.map(([code,name,native,flag])=>({code,name,native,flag}));
const metadata = {sources:{repository:'TinkySpeak-Web',revision,input:inputs},directory,languages};
const encodedMeta = JSON.stringify(metadata).slice(0,-1);
writeFileSync(join(output,'care-location-boards.json'),encodedMeta+',\n"boards":'+serializeBoards(coreIds)+'}\n');
for (const [mode,ids] of Object.entries(packs)) {
  writeFileSync(join(output,'care-location-'+mode+'.json'),serializeBoards(ids,4)+'\n');
}
const entries = {
  hospital:'/biz/healthcare/hartford-hospital-hartford',healthcare:'/biz/healthcare',
  townhall:'/ct/hartford/townhall',clinic:'/ct/hartford/doctor/hhc',directory:'/biz',
  police:'/ct/hartford/police',library:'/ct/hartford/library',clerk:'/ct/hartford/clerk',
  tax:'/ct/hartford/tax',probate:'/ct/hartford/probate'
};
for (const [key,path] of Object.entries(entries)) {
  execFileSync('qrencode',['-l','M','-m','4','-s','6','-o',join(output,'care-location-qr-'+key+'.png'),'https://tinkytown.com'+path]);
}
console.log('Imported '+Object.keys(boards).length+' boards from '+revision+'.');
