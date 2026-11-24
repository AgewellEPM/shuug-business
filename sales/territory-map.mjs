import { readFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { HttpError, state } from './model.mjs';
import { localityAllowed, stateAllowed } from './territory-access.mjs';

const decompress = promisify(gunzip);

export async function territoryMap(user, input) {
  const region = state(input.state);
  if (!stateAllowed(user, region)) throw new HttpError(403, 'This state is outside your territory.');
  const file = new URL(`./territory-map-data/${region}.json.gz`, import.meta.url);
  const map = JSON.parse(await decompress(await readFile(file)));
  map.features = map.features.filter(feature => localityAllowed(user, region, feature.name));
  map.landmarks = map.landmarks.filter(place => localityAllowed(user, region, place.name));
  return map;
}
