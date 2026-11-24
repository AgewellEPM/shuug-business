// Regenerate the nursing home boards from a checkout of TinkySpeak-Web.
// Run with node scripts/sdr-export/import-senior-kiosk.mjs /path/to/TinkySpeak-Web.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const source = process.argv[2];
if (!source) throw new Error('Supply the TinkySpeak-Web checkout.');
const root = vm.createContext({ console, URLSearchParams });
root.window = root;
root.loadBoard = () => {};
for (const name of ['configs', 'accessibility-tree', 'crisis-support-tree', 'towns', 'survivor-next-steps', 'senior-home-boards', 'biz']) {
  vm.runInContext('(function(){\n' + readFileSync(join(source, 'js', 'kiosk-' + name + '.js'), 'utf8') + '\n})();', root, { filename: name, timeout: 5000 });
}
const config = root.KioskBiz.generateConfig('senior-home', '', 'CT');
const actions = { biz_back: 'back', biz_they_say: 'caption_teller' };
const targets = { senior_private: 'senior_private', senior_silent_emergency: 'emergency' };
const boards = {};
// Visitor entries point at lazily loaded location boards. The demo offers them as separate locations.
for (const [id, board] of Object.entries(config.boards)) {
  boards[id] = { title: board.title, tiles: board.tiles.filter(tile => !/^loc_/.test(tile.navigateTo || '')).map(tile => {
    const { dataset, safetyCritical, sentence, ...copy } = tile;
    if (targets[tile.action]) { copy.navigateTo = targets[tile.action]; copy.private = true; delete copy.action; }
    else if (actions[tile.action]) copy.action = actions[tile.action];
    return copy;
  }) };
}
for (const board of Object.values(boards)) for (const tile of board.tiles) {
  if (tile.navigateTo && !boards[tile.navigateTo]) throw new Error('Missing board: ' + tile.navigateTo);
}
const ids = Object.keys(boards);
writeFileSync(fileURLToPath(new URL('../../public/rideshare-tax-pros/care-kiosks/nursing-home.json', import.meta.url)),
  JSON.stringify({ places: [{ key: 'resident', name: 'Nursing Home — Resident', address: 'Bedside communication', boards: Object.fromEntries(ids.map((id, i) => [id, i])) }],
    pool: ids.map(id => boards[id]) }));
