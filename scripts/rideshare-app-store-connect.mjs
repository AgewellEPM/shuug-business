#!/usr/bin/env node
// Edit this app's draft listing and genuine screenshot assets through Apple's API.
// No submission, release, invitation, user, agreement or signing-key operations.
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, relative, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  key: { type: 'string' }, issuer: { type: 'string' }, manifest: { type: 'string' },
  receipt: { type: 'string' }, contact: { type: 'string' },
} });
const command = positionals[0];
assert(['inspect', 'listing', 'screenshots', 'review'].includes(command),
  'Usage: rideshare-app-store-connect.mjs inspect|listing|screenshots|review --key PATH [--issuer ID] [--manifest PATH] [--contact PRIVATE_JSON] --receipt PRIVATE_PATH');
assert(values.key && values.receipt, 'A local API key path and private receipt path are required');
const keyPath = resolve(values.key), receiptPath = resolve(values.receipt);
for (const path of [keyPath, receiptPath]) {
  assert(relative(root, path).startsWith('..'), 'Keys and account receipts must stay outside this repository');
}
const match = basename(keyPath).match(/^(AuthKey|ApiKey)_([A-Z0-9]{10})\.p8$/);
assert(match, 'Use the original Apple API-key filename');
assert(match[1] === 'ApiKey' || values.issuer, 'Team API keys require the Issuer ID');
const privateKey = createPrivateKey(await readFile(keyPath));
assert(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails.namedCurve === 'prime256v1',
  'Expected Apple P-256 API key');
const listing = JSON.parse(await readFile(resolve(root, 'deployments/rideshare-tax-pros/app-store/en-US.json')));
assert.equal(listing.appStoreConnectId, '6835595554');
assert.equal(listing.bundleId, 'com.ridesharetaxpros.driver');
assert.equal(listing.version, '1.0.0');
assert(['MANUAL', 'AFTER_APPROVAL'].includes(listing.releaseType), 'Unsupported release option');
const digest = (kind, data) => createHash(kind).update(data).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const pause = ms => new Promise(done => setTimeout(done, ms));
function jwt() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iat: now - 5, exp: now + 600, aud: 'appstoreconnect-v1',
    ...(values.issuer ? { iss: values.issuer } : { sub: 'user' }) };
  const unsigned = `${encode({ alg: 'ES256', kid: match[2], typ: 'JWT' })}.${encode(payload)}`;
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned),
    { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
async function api(path, method = 'GET', data) {
  const url = new URL(path, 'https://api.appstoreconnect.apple.com');
  assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
  const response = await fetch(url, { method, headers: {
    Authorization: `Bearer ${jwt()}`, 'Content-Type': 'application/json',
  }, body: data ? JSON.stringify({ data }) : undefined, signal: AbortSignal.timeout(30000) });
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    // Never print tokens, upload URLs, private keys or arbitrary response bodies.
    const errors = (body.errors ?? []).map(e => `${e.code}: ${e.title} ${e.source?.pointer ?? ''}`).join('; ');
    throw new Error(`${method} ${url.pathname}: HTTP ${response.status} ${errors}`);
  }
  return body;
}
async function all(path) {
  const items = [];
  do {
    const page = await api(path);
    items.push(...page.data);
    path = page.links?.next;
  } while (path);
  return items;
}
const record = (type, id, attributes, relationships) => ({ type, ...(id ? { id } : {}),
  ...(attributes ? { attributes } : {}), ...(relationships ? { relationships } : {}) });
const link = (type, id) => ({ data: { type, id } });
const apps = await all(`/v1/apps?filter[bundleId]=${listing.bundleId}&limit=10`);
assert.equal(apps.length, 1, 'Expected exactly one matching app');
assert.equal(apps[0].id, listing.appStoreConnectId, 'Wrong account/app record');
const appId = apps[0].id;
const versions = await all(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=50`);
const normalizedVersion = value => value.split('.').map(Number).concat([0, 0]).slice(0, 3).join('.');
const matches = versions.filter(v => normalizedVersion(v.attributes.versionString) === normalizedVersion(listing.version));
assert(matches.length <= 1, 'Multiple equivalent draft versions need review');
const version = matches[0];
assert(version, 'The intended iOS draft version does not exist');
const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];
if (command !== 'inspect') assert(editable.includes(version.attributes.appStoreState), 'App version is not editable');
const locales = await all(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
const infos = await all(`/v1/apps/${appId}/appInfos?limit=50`);
const info = infos.find(i => editable.includes(i.attributes.appStoreState));
const infoLocales = info ? await all(`/v1/appInfos/${info.id}/appInfoLocalizations?limit=50`) : [];
const builds = await all(`/v1/builds?filter[app]=${appId}&filter[version]=2026111603&limit=10`);
const receipt = { observedAt: new Date().toISOString(), appId, bundleId: listing.bundleId,
  version: listing.version, storeVersion: version.attributes.versionString, command, versionState: version.attributes.appStoreState,
  builds: builds.map(b => ({ id: b.id, version: b.attributes.version, processingState: b.attributes.processingState,
    expired: b.attributes.expired })), publicReviewSubmitted: false, testersInvited: false };
await mkdir(dirname(receiptPath), { recursive: true, mode: 0o700 });
async function save() {
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
}
await writeFile(receiptPath + '.before.json', JSON.stringify({ observedAt: receipt.observedAt,
  version: { id: version.id, attributes: version.attributes },
  localizations: locales.map(v => ({ id: v.id, attributes: v.attributes })),
  appInfoLocalizations: infoLocales.map(v => ({ id: v.id, attributes: v.attributes })),
}, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
await save();
if (command === 'inspect') {
  const submissions = await all(`/v1/apps/${appId}/reviewSubmissions?limit=50`);
  receipt.reviewSubmissions = submissions.map(s => ({ id: s.id, ...s.attributes }));
  receipt.publicReviewSubmitted = submissions.some(s => Boolean(s.attributes.submittedDate));
  receipt.localizations = locales.map(l => ({ id: l.id, ...l.attributes }));
  receipt.appInfoLocalizations = infoLocales.map(l => ({ id: l.id, ...l.attributes }));
  receipt.screenshotSets = [];
  for (const locale of locales) {
    const sets = await all(`/v1/appStoreVersionLocalizations/${locale.id}/appScreenshotSets?limit=50`);
    for (const set of sets) {
      const assets = await all(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
      receipt.screenshotSets.push({ locale: locale.attributes.locale, displayType: set.attributes.screenshotDisplayType,
        screenshots: assets.map(a => ({ id: a.id, fileName: a.attributes.fileName,
          md5: a.attributes.sourceFileChecksum, state: a.attributes.assetDeliveryState.state })) });
    }
  }
  const expanded = await api(`/v1/appStoreVersions/${version.id}?include=appStoreReviewDetail,build`);
  const review = expanded.included?.find(r => r.type === 'appStoreReviewDetails')?.attributes ?? {};
  receipt.reviewContactComplete = ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone']
    .every(field => Boolean(review[field]));
  receipt.reviewNotesPresent = Boolean(review.notes);
  receipt.selectedBuildId = expanded.data.relationships.build.data?.id ?? null;
  receipt.releaseType = expanded.data.attributes.releaseType;
  if (info) {
    const categories = (await api(`/v1/appInfos/${info.id}?include=primaryCategory,secondaryCategory`)).data.relationships;
    receipt.categories = { primary: categories.primaryCategory.data?.id, secondary: categories.secondaryCategory.data?.id };
  }
  await save();
  console.log(JSON.stringify(receipt, null, 2));
} else if (command === 'listing') {
  assert(info, 'No editable app information record');
  const fields = { description: listing.description, keywords: listing.keywords,
    promotionalText: listing.promotionalText, supportUrl: listing.supportURL, marketingUrl: listing.marketingURL };
  const appFields = { name: listing.name, subtitle: listing.subtitle, privacyPolicyUrl: listing.privacyPolicyURL };
  for (const [field, limit] of [['description', 4000], ['keywords', 100], ['promotionalText', 170]])
    assert(fields[field].length <= limit, `${field} is too long`);
  assert(appFields.name.length <= 30 && appFields.subtitle.length <= 30);
  let locale = locales.find(l => l.attributes.locale === 'en-US');
  if (!locale) locale = (await api('/v1/appStoreVersionLocalizations', 'POST',
    record('appStoreVersionLocalizations', null, { locale: 'en-US', ...fields },
      { appStoreVersion: link('appStoreVersions', version.id) }))).data;
  else await api(`/v1/appStoreVersionLocalizations/${locale.id}`, 'PATCH',
    record('appStoreVersionLocalizations', locale.id, fields));
  let appLocale = infoLocales.find(l => l.attributes.locale === 'en-US');
  if (!appLocale) appLocale = (await api('/v1/appInfoLocalizations', 'POST',
    record('appInfoLocalizations', null, { locale: 'en-US', ...appFields },
      { appInfo: link('appInfos', info.id) }))).data;
  else await api(`/v1/appInfoLocalizations/${appLocale.id}`, 'PATCH', record('appInfoLocalizations', appLocale.id, appFields));
  await api(`/v1/appInfos/${info.id}`, 'PATCH', record('appInfos', info.id, null, {
    primaryCategory: link('appCategories', listing.primaryCategory),
    secondaryCategory: link('appCategories', listing.secondaryCategory),
  }));
  await api(`/v1/appStoreVersions/${version.id}`, 'PATCH', record('appStoreVersions', version.id,
    { copyright: listing.copyright, releaseType: listing.releaseType }));
  const build = builds.find(b => b.attributes.processingState === 'VALID' && !b.attributes.expired);
  if (build) {
    const prerelease = (await api(`/v1/builds/${build.id}/preReleaseVersion`)).data;
    assert.equal(prerelease.attributes.version, listing.version);
    assert.equal(prerelease.attributes.platform, 'IOS');
    const current = (await api(`/v1/appStoreVersions/${version.id}?include=build`)).data.relationships.build.data;
    assert(!current || current.id === build.id, 'Preserving a different build already selected on the draft');
    await api(`/v1/appStoreVersions/${version.id}`, 'PATCH', record('appStoreVersions', version.id, null,
      { build: link('builds', build.id) }));
    receipt.selectedBuild = { id: build.id, version: build.attributes.version, processingState: 'VALID' };
  }
  const saved = (await api(`/v1/appStoreVersionLocalizations/${locale.id}`)).data.attributes;
  const savedInfo = (await api(`/v1/appInfoLocalizations/${appLocale.id}`)).data.attributes;
  for (const [k, v] of Object.entries(fields)) assert.equal(saved[k], v, `Listing readback mismatch: ${k}`);
  for (const [k, v] of Object.entries(appFields)) assert.equal(savedInfo[k], v, `App info readback mismatch: ${k}`);
  const savedVersion = (await api(`/v1/appStoreVersions/${version.id}?include=build`)).data;
  assert.equal(savedVersion.attributes.copyright, listing.copyright);
  assert.equal(savedVersion.attributes.releaseType, listing.releaseType);
  if (build) assert.equal(savedVersion.relationships.build.data.id, build.id, 'Selected build readback mismatch');
  receipt.listingVerified = true;
  receipt.listingFields = Object.keys(fields);
  receipt.appInfoFields = Object.keys(appFields);
  receipt.listingSHA256 = digest('sha256', JSON.stringify(fields));
  await save();
  console.log('Listing text, support/privacy links and app information saved; field readback passed.');
} else if (command === 'review') {
  assert(values.contact, 'Supply the actual reviewer contact in a private JSON file');
  assert(relative(root, resolve(values.contact)).startsWith('..'), 'Review contact must stay outside Git');
  const contact = JSON.parse(await readFile(values.contact));
  const fields = {};
  for (const field of ['contactFirstName', 'contactLastName', 'contactEmail', 'contactPhone']) {
    assert(typeof contact[field] === 'string' && contact[field].trim(), `Missing reviewer ${field}`);
    fields[field] = contact[field];
  }
  fields.notes = await readFile(resolve(root, 'deployments/rideshare-tax-pros/app-store/reviewer-notes.txt'), 'utf8');
  assert(fields.notes.length <= 4000);
  const expanded = await api(`/v1/appStoreVersions/${version.id}?include=appStoreReviewDetail`);
  let review = expanded.included?.find(r => r.type === 'appStoreReviewDetails');
  if (review) review = (await api(`/v1/appStoreReviewDetails/${review.id}`, 'PATCH', record('appStoreReviewDetails', review.id, fields))).data;
  else review = (await api('/v1/appStoreReviewDetails', 'POST', record('appStoreReviewDetails', null, fields,
    { appStoreVersion: link('appStoreVersions', version.id) }))).data;
  const saved = (await api(`/v1/appStoreReviewDetails/${review.id}`)).data.attributes;
  for (const [field, value] of Object.entries(fields)) assert.equal(saved[field], value, `Review detail readback mismatch: ${field}`);
  receipt.reviewContactComplete = true;
  receipt.reviewNotesPresent = true;
  receipt.reviewAccessVerified = false;
  await save();
  console.log('Actual review contact and guest/permission notes saved and read back; hosted review access remains unverified.');
} else {
  assert(values.manifest, 'A genuine current screenshot manifest is required');
  const manifestPath = resolve(values.manifest);
  const manifest = JSON.parse(await readFile(manifestPath));
  assert.equal(manifest.build, '2026111603');
  assert.equal(manifest.version, listing.version);
  assert.equal(manifest.currentBuildVerified, true);
  const locale = locales.find(l => l.attributes.locale === 'en-US');
  assert(locale, 'Save the en-US listing first');
  const specs = { APP_IPHONE_67: [1320, 2868], APP_IPAD_PRO_3GEN_129: [2064, 2752] };
  const groups = [];
  const sets = await all(`/v1/appStoreVersionLocalizations/${locale.id}/appScreenshotSets?limit=50`);
  for (const [type, size] of Object.entries(specs)) {
    const images = manifest.screenshots.filter(s => s.screenshotDisplayType === type);
    assert(images.length >= 1 && images.length <= 10, `Missing/invalid screenshot count for ${type}`);
    for (const image of images) {
      const path = resolve(dirname(manifestPath), image.file);
      assert(!relative(dirname(manifestPath), path).startsWith('..'), 'Screenshot outside manifest folder');
      image.bytes = await readFile(path);
      assert.equal(digest('sha256', image.bytes), image.sha256, 'Screenshot hash mismatch');
      assert.equal(image.bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.deepEqual([image.bytes.readUInt32BE(16), image.bytes.readUInt32BE(20)], size);
      assert([0, 2].includes(image.bytes[25]), 'Apple does not accept screenshot alpha channels');
      image.md5 = digest('md5', image.bytes);
      image.uploadName = `gigtax-1603-${type}-${basename(image.file, '.png')}-${image.sha256.slice(0, 12)}.png`;
    }
    const set = sets.find(s => s.attributes.screenshotDisplayType === type);
    const current = set ? await all(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`) : [];
    assert(current.every(s => images.some(i => i.uploadName === s.attributes.fileName)),
      `Existing screenshots for ${type} need review; preserving them`);
    groups.push({ type, images, set, current });
  }
  receipt.screenshots = [];
  for (const group of groups) {
    const set = group.set ?? (await api('/v1/appScreenshotSets', 'POST', record('appScreenshotSets', null,
      { screenshotDisplayType: group.type }, { appStoreVersionLocalization: link('appStoreVersionLocalizations', locale.id) }))).data;
    const ordered = [];
    for (const image of group.images) {
      let asset = group.current.find(s => s.attributes.fileName === image.uploadName);
      if (!asset) asset = (await api('/v1/appScreenshots', 'POST', record('appScreenshots', null,
        { fileName: image.uploadName, fileSize: image.bytes.length }, { appScreenshotSet: link('appScreenshotSets', set.id) }))).data;
      if (asset.attributes.assetDeliveryState.state === 'AWAITING_UPLOAD') {
        for (const op of asset.attributes.uploadOperations) {
          const target = new URL(op.url);
          assert(target.protocol === 'https:' && (target.hostname.endsWith('.apple.com') || target.hostname.endsWith('.icloud.com')),
            'Unexpected Apple asset-upload host');
          assert(op.offset >= 0 && op.length > 0 && op.offset + op.length <= image.bytes.length);
          const response = await fetch(target, { method: op.method,
            headers: Object.fromEntries(op.requestHeaders.map(h => [h.name, h.value])),
            body: image.bytes.subarray(op.offset, op.offset + op.length), signal: AbortSignal.timeout(60000) });
          assert(response.ok, `Apple asset upload returned HTTP ${response.status}`);
        }
        asset = (await api(`/v1/appScreenshots/${asset.id}`, 'PATCH', record('appScreenshots', asset.id,
          { uploaded: true, sourceFileChecksum: image.md5 }))).data;
      }
      for (let attempt = 0; !['COMPLETE', 'FAILED'].includes(asset.attributes.assetDeliveryState.state) && attempt < 36; attempt++) {
        await pause(5000);
        asset = (await api(`/v1/appScreenshots/${asset.id}`)).data;
      }
      assert.equal(asset.attributes.assetDeliveryState.state, 'COMPLETE',
        `Screenshot ${image.uploadName} has not completed processing`);
      assert.equal(asset.attributes.sourceFileChecksum, image.md5, 'Apple screenshot checksum mismatch');
      ordered.push({ type: 'appScreenshots', id: asset.id });
      receipt.screenshots.push({ file: image.file, screenshotDisplayType: group.type, sha256: image.sha256,
        appleMD5: asset.attributes.sourceFileChecksum, state: 'COMPLETE', id: asset.id });
      await save();
      console.log(`Processed ${group.type}: ${basename(image.file)}`);
    }
    await api(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`, 'PATCH', ordered);
    const saved = await all(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
    assert.deepEqual(saved.map(s => s.id), ordered.map(s => s.id), 'Screenshot display order mismatch');
  }
  receipt.screenshotsVerified = true;
  await save();
  console.log('Both screenshot sizes uploaded, processed and verified in order.');
}
