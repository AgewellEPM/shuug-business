import { backend } from './backend.mjs';
import { publicDirectory } from './directory.mjs';

export function createDirectoryHandler(env = process.env, adapter) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(JSON.stringify({ error: 'Use GET for the office directory.' }));
    }
    try {
      if (!adapter && !env.GIGTAX_TINKY_KEY) throw new Error('Directory unavailable');
      const result = await publicDirectory(adapter || backend(env));
      res.statusCode = 200; res.end(JSON.stringify(result));
    } catch {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'The office directory could not be refreshed. Please try again.' }));
    }
  };
}
export default createDirectoryHandler();
