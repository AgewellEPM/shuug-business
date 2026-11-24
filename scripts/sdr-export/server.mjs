import { demoDestination } from '../rideshare-site/sales-demo.mjs';
import { createServer } from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { createHandler } from '../../sales/handler.mjs';
import { createDirectoryHandler } from '../../sales/directory-handler.mjs';
import { createWebhookHandler } from '../../sales/webhook.mjs';
import { createMailWebhook } from '../../sales/mail-webhook.mjs';
import { service } from '../../sales/service.mjs';
import { HttpError, digest } from '../../sales/model.mjs';
import { discoverOffices } from '../../sales/discovery.mjs';
import { requestWorkspaceSession } from '../../sales/workspace-session.mjs';
import { httpsSetting, profileAt, projectAgreement, projectCatalogue, projectOutreach } from './configuration.mjs';
import { sqliteStore } from './sqlite.mjs';
import { renderWorkspace } from './pages.mjs';
import { savedProspects } from './saved-prospects.mjs';
import { campaignActions, campaigns } from './campaigns.mjs';
import { campaignNotifications } from './campaign-mail.mjs';
import { workspaceResearch } from '../../sales/workspace-research.mjs';
import { workspaceEarnings } from '../../sales/workspace-earnings.mjs';
import { salesDailyPlan } from '../../sales/sales-daily-plan.mjs';
import { salesCoach } from './sales-coach.mjs';
import { localCoachSpeech } from './coach-speech.mjs';
import coachArticles from './coach-help.cjs';
import { administratorPhotoOrigins } from '../../sales/facility-administrators.mjs';
import { territoryOwnership } from '../../sales/territory-facility-ownership.mjs';
import { setCountyLead, territoryMap } from '../../sales/territory-map.mjs';
import { territoryDashboard } from '../../sales/territory-dashboard.mjs';
import { directoryFacility, stateFacilityDirectory } from '../../sales/state-facilities.mjs';
import { googleFacilityReviews } from '../../sales/facility-reviews.mjs';
import { facilityOutreach } from './facility-outreach.mjs';
import { initialize, privateValue } from './setup.mjs';
import { workspaceProducts } from '../../sales/workspace-products.mjs';
import { bookings } from './bookings.mjs';
import { bookingHTTP } from './booking-http.mjs';
import { repEmailWorkspace } from './mail/workspace.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const profile = profileAt(root);
const port = Number(process.env.SDR_PORT || 8740);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Set SDR_PORT to a valid port.');
const localOrigin = 'http://127.0.0.1:' + port;
const origin = new URL(process.env.SDR_ORIGIN || localOrigin);
if (origin.href !== origin.origin + '/' || origin.username || origin.password || (origin.protocol !== 'https:' && origin.origin !== localOrigin)) {
  throw new Error('Set SDR_ORIGIN to an HTTPS origin or use the default loopback origin.');
}
const { directory, owner, session } = initialize(root);
const ownerCode = privateValue(owner);
const sessionKey = privateValue(session);
if (!/^[A-Za-z0-9_-]{43}$/.test(ownerCode) || !/^[a-f0-9]{64}$/.test(sessionKey)) throw new Error('Invalid SDR credentials.');
const catalogue = profile.directory === 'project' ? projectCatalogue(root) : null;
const agreementOnly = profile.contracts === 'agreement';
const signIn = httpsSetting('SDR_IDENTITY_PORTAL', process.env.SDR_IDENTITY_PORTAL);
const sessionEndpoint = httpsSetting('SDR_IDENTITY_SESSION_ENDPOINT', process.env.SDR_IDENTITY_SESSION_ENDPOINT);
const searchEndpoint = httpsSetting('SDR_SEARCH_ENDPOINT', process.env.SDR_SEARCH_ENDPOINT);
if (Boolean(signIn) !== Boolean(sessionEndpoint) || (signIn && (origin.protocol !== 'https:' || signIn.origin === origin.origin))) {
  throw new Error('Shared sign-in requires a separate HTTPS portal and its session endpoint.');
}
if (agreementOnly && (process.env.GIGTAX_STRIPE_SECRET_KEY || process.env.GIGTAX_STRIPE_WEBHOOK_SECRET)) {
  throw new Error('Stripe configuration requires the membership profile.');
}
const env = {
  GIGTAX_SALES_ORIGIN: origin.origin,
  GIGTAX_SALES_SESSION_KEY: sessionKey,
  GIGTAX_SALES_OWNER_HASH: digest(ownerCode),
};
for (const variable of ['GIGTAX_MAILGUN_API_KEY', 'GIGTAX_MAILGUN_DOMAIN', 'GIGTAX_MAILGUN_REGION', 'GIGTAX_MAILGUN_MODE',
  'GIGTAX_MAILGUN_WEBHOOK_KEY', 'GIGTAX_STRIPE_SECRET_KEY', 'GIGTAX_STRIPE_WEBHOOK_SECRET']) {
  if (process.env[variable]) env[variable] = process.env[variable];
}
const db = sqliteStore(join(directory, 'workspace.sqlite'));
const repEmail = repEmailWorkspace(db, sessionKey, process.env, { directory });
const booking = bookings(process.env, db, origin.origin, sessionKey, { repMail: repEmail });
const publicBooking = bookingHTTP(booking, origin.origin);
const facilities = stateFacilityDirectory({ db });
const googleReviews = googleFacilityReviews({
  key() {
    if (process.env.SDR_GOOGLE_PLACES_API_KEY) return process.env.SDR_GOOGLE_PLACES_API_KEY.trim();
    try { return privateValue(join(directory, 'google-places-key')); }
    catch { return ''; }
  },
});
const automation = campaigns(env, db, { catalogue });
db.discover = catalogue ? async (region, locality, { offset = 0, limit = 50 } = {}) => {
  const rows = catalogue(region, locality);
  return { results: rows.slice(offset, offset + limit), total: rows.length, offset, limit, hasMore: offset + limit < rows.length };
} : (region, locality, options) => discoverOffices(region, locality, fetch, options);
if (searchEndpoint) db.search = async query => {
  const response = await fetch(searchEndpoint, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12_000),
    headers: { 'Content-Type': 'application/json', ...(process.env.SDR_SEARCH_KEY ? { Authorization: 'Bearer ' + process.env.SDR_SEARCH_KEY } : {}) },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) return { results: [], status: 'unconfirmed' };
  const value = await response.json();
  const results = Array.isArray(value.results) ? value.results.slice(0, 10) : [];
  return { results, status: results.length ? 'results' : 'unconfirmed' };
};

let attempts = [];
const dailyPlan = salesDailyPlan(db);
const coachSpeech = localCoachSpeech();
const sales = createHandler(env, db, {
  cookieName: 'gigtax_sales_' + digest(sessionKey).slice(0, 16),
  localHttp: origin.origin === localOrigin,
  agreementOnly,
  agreement: agreementOnly ? projectAgreement : undefined,
  outreach: office => projectOutreach(profile.name, office),
  localDiscovery: catalogue ? { catalogue, placeLookup: async () => null } : undefined,
  sharedOrigin: signIn?.origin ?? null,
  workspaceName: profile.name,
  repEmail,
  savedProspects: savedProspects(db),
  campaigns: { actions: campaignActions, dispatch: automation.dispatch },
  careCampaign: profile.focus === 'senior-care',
  research: workspaceResearch(db, { catalogue }),
  earnings: agreementOnly ? workspaceEarnings(db) : null,
  products: profile.focus === 'senior-care' ? workspaceProducts(db) : null,
  facilities,
  facilityReviews: async (user, input, office) => googleReviews(office || await directoryFacility(facilities, user, input)),
  facilityOutreach: facilityOutreach(db, facilities, { model: process.env.SDR_OUTREACH_MODEL }),
  territoryMap: (user, input, team) => territoryMap(user, input, db, team),
  territoryDashboard: (user, input) => territoryDashboard(user, input, db),
  territoryOwnership: (user, input, team) => territoryOwnership(user, input, db, team),
  setCountyLead: (user, input, team) => setCountyLead(user, input, db, team),
  salesTeam: true,
  booking: booking.staff,
  nextBooking: booking.nextBooking,
  teamChat: db.chat,
  dailyPlan,
  coachSpeech,
  salesCoach: salesCoach(db, dailyPlan, { articles: coachArticles, demo: profile.focus === 'senior-care', model: process.env.SDR_COACH_MODEL, mail: repEmail, localVoice: coachSpeech.available }),
  beforeLogin() {
    const now = Date.now();
    attempts = attempts.filter(at => at > now - 60_000);
    if (attempts.length >= 24) throw new HttpError(429, 'Too many sign-in attempts. Wait a minute and try again.');
    attempts.push(now);
  },
  workspaceSession(action, token) {
    if (!sessionEndpoint) throw new HttpError(403, 'A shared identity provider has not been connected.');
    return requestWorkspaceSession(action, token, sessionEndpoint);
  },
});
const routes = new Map([
  ['/api/sales', sales],
  ['/api/sales/coach/voice', sales],
  ['/api/sales/mail/v1', sales],
  ['/api/offices', createDirectoryHandler(env, db, { defaultBookingURL: () =>
    origin.protocol === 'https:' && booking.publicAction('hosts', {}).hosts.length ? origin.origin + '/book' : '' })],
  ['/api/sales-webhook', createWebhookHandler(env, db)],
  ['/api/sales-mail-webhook', createMailWebhook(env, db, { campaignNotification: campaignNotifications(db), bookingNotification: booking.mailNotification })],
]);
const pages = renderWorkspace(profile, signIn?.href);
const files = new Map();
const staticRoot = join(root, 'site');
for (const path of readdirSync(staticRoot, { recursive: true, withFileTypes: true })) {
  if (!path.isFile()) continue;
  const filename = join(path.parentPath, path.name);
  files.set('/' + filename.slice(staticRoot.length + 1), filename);
}
const mimes = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const csp = `default-src 'self'; script-src 'self'; style-src 'self'; ${profile.focus === 'senior-care' ? "media-src 'self' blob:; " : ''}img-src 'self' data: ${profile.focus === 'senior-care' ? 'blob: ' : ''}https://tile.openstreetmap.org https://*.googleusercontent.com ${administratorPhotoOrigins.join(' ')}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
const server = createServer({ requestTimeout: 60_000, headersTimeout: 10_000 }, async (request, response) => {
  const finish = (status, body = '') => { response.statusCode = status; response.end(body); };
  response.setHeader('Content-Security-Policy', csp);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Cache-Control', 'no-store');
  if (request.headers.host !== origin.host) return finish(421);
  const path = request.url?.split('?')[0];
  try {
    if (path === '/api/booking' || path.startsWith('/api/booking/') || path.startsWith('/book/feed/')) return await publicBooking(request, response);
    if (routes.has(path)) return await routes.get(path)(request, response);
    if (!['GET', 'HEAD'].includes(request.method)) return finish(405);
    if (profile.focus === 'senior-care' && (path === '/sales/senior-care' || path === '/sales/senior-care/')) {
      response.setHeader('Location', '/sales' + new URL(request.url, origin).search);
      return finish(302);
    }
    const demo = profile.focus === 'senior-care' && demoDestination(path);
    if (path === '/' || demo) {
      response.setHeader('Location', demo || '/sales');
      return finish(302);
    }
    if (pages.has(path)) {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return finish(200, request.method === 'HEAD' ? '' : pages.get(path));
    }
    const filename = files.get(path);
    if (!filename) return finish(404, 'Page not found.');
    response.setHeader('Content-Type', mimes[extname(filename)] || 'application/octet-stream');
    return finish(200, request.method === 'HEAD' ? '' : readFileSync(filename));
  } catch {
    if (!response.headersSent) finish(500, 'The workspace could not complete the request.');
    else response.destroy();
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log('Universal SDR is available at ' + origin.origin + '/sales');
  console.log('Owner access code file: ' + owner);
});
const runScheduledSales = service(env, db).dispatch;
let scheduledRun;
const scheduler = setInterval(() => {
  booking.tick().catch(() => console.error('The booking notification cycle could not finish.'));
  if (!scheduledRun) scheduledRun = automation.tick(runScheduledSales)
    .catch(() => console.error('The campaign scheduler could not finish its current cycle.'))
    .finally(() => { scheduledRun = null; });
}, 30_000);
scheduler.unref();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  clearInterval(scheduler);
  db.chat.close();
  server.close(async () => { await Promise.allSettled([scheduledRun, booking.tick()]); db.close(); });
});
