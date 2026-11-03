'use strict';
// Shared by the static build and browser. Public configuration must name a
// hosted HTTPS domain, never this Mac, a private network address or credentials.
(function (root) {
  function publicHttpsUrl(value) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/\.$/, '');
      const labels = host.split('.');
      if (url.protocol !== 'https:' || url.username || url.password || labels.length < 2
        || /^[\d.]+$/.test(host) || host.includes(':')
        || /\.(localhost|local|internal|lan|home|test|invalid|example)$/.test(host)
        || !labels.every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))) return null;
      return url.href;
    } catch { return null; }
  }
  const helpers = Object.freeze({ publicHttpsUrl });
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  else root.rtpLinks = helpers;
})(globalThis);
