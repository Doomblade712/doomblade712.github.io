// Checks the built site in dist/ before it ships. Run with `npm run check`
// (which builds first) or on an existing build with `node scripts/check-dist.mjs`.
//
// It fails on:
// - an internal link, script, style, image or iframe that points at nothing in dist/
// - a missing or stale dist/staticwebapp.config.json (must match public/)
// - a redirect whose target does not exist, a missing required redirect, or two
//   routes that differ only by a trailing slash (Azure SWA rejects the deploy)
// - a 404 rewrite target that does not exist
// - an external script, style, image, iframe, font or fetch target that the
//   Content-Security-Policy in staticwebapp.config.json does not allow
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const failures = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('check: dist/index.html is missing. Run `npm run build` first.');
  process.exit(1);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(dist);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const jsFiles = files.filter((f) => f.endsWith('.js'));
const cssFiles = files.filter((f) => f.endsWith('.css'));
const relPath = (f) => f.slice(dist.length + 1).split('\\').join('/');

// A root-relative path exists if it is a file, a folder with index.html, or a page without its .html.
function targetExists(urlPath) {
  let p = urlPath.split('#')[0].split('?')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    return false;
  }
  const rel = p.replace(/^\/+/, '');
  if (rel === '') return true;
  const candidates = [join(dist, rel), join(dist, rel, 'index.html'), join(dist, `${rel}.html`)];
  return candidates.some((c) => existsSync(c) && statSync(c).isFile());
}

const SKIP_SCHEMES = /^(#|mailto:|tel:|data:|javascript:|blob:)/i;
const ATTR_RE = /[\s:"'](href|src|srcset|poster|action)\s*=\s*"([^"]*)"/gi;

// 1. Internal links and assets
let linkCount = 0;
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const pageDir = posix.dirname(`/${relPath(file)}`);
  for (const match of html.matchAll(ATTR_RE)) {
    const attr = match[1].toLowerCase();
    const values = attr === 'srcset' ? match[2].split(',').map((s) => s.trim().split(/\s+/)[0]) : [match[2].trim()];
    for (const value of values) {
      if (value === '' || SKIP_SCHEMES.test(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) continue;
      const target = value.startsWith('/') ? value : posix.join(pageDir, value);
      linkCount += 1;
      if (!targetExists(target)) fail(`${relPath(file)}: ${attr}="${value}" points at nothing in dist/`);
    }
  }
}

// 2. staticwebapp.config.json: present, same as public/, redirects and 404 rewrite resolve
const configRel = 'staticwebapp.config.json';
const distConfig = join(dist, configRel);
const publicConfig = join(root, 'public', configRel);
let config = null;
if (!existsSync(distConfig)) {
  fail(`dist/${configRel} is missing`);
} else {
  if (readFileSync(distConfig, 'utf8') !== readFileSync(publicConfig, 'utf8')) {
    fail(`dist/${configRel} differs from public/${configRel} (stale build?)`);
  }
  try {
    config = JSON.parse(readFileSync(distConfig, 'utf8'));
  } catch (err) {
    fail(`dist/${configRel} is not valid JSON: ${err.message}`);
  }
}

// These two redirects must never be removed: the Chrome Web Store links to the second one.
const requiredRedirects = ['/malik-danab', '/sales-tax-calculator'];

if (config) {
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const seen = new Map();
  for (const route of routes) {
    if (typeof route.route !== 'string') {
      fail(`route without a "route" string: ${JSON.stringify(route)}`);
      continue;
    }
    const key = route.route.replace(/\/+$/, '') || '/';
    if (seen.has(key)) fail(`routes "${seen.get(key)}" and "${route.route}" differ only by a trailing slash; SWA rejects that`);
    seen.set(key, route.route);
    if (typeof route.redirect === 'string') {
      if (route.redirect.startsWith('/') && !targetExists(route.redirect)) {
        fail(`redirect ${route.route} -> ${route.redirect}: target does not exist in dist/`);
      }
      if (route.statusCode !== undefined && route.statusCode !== 301 && route.statusCode !== 302) {
        fail(`redirect ${route.route} has statusCode ${route.statusCode}; expected 301 or 302`);
      }
    }
  }
  for (const required of requiredRedirects) {
    const route = routes.find((r) => (r.route || '').replace(/\/+$/, '') === required);
    if (!route || typeof route.redirect !== 'string') fail(`required redirect ${required} is missing from ${configRel}`);
    // The Astro copy of the same redirect (the GitHub Pages rollback) must build too.
    if (!existsSync(join(dist, required.slice(1), 'index.html'))) {
      fail(`dist${required}/index.html is missing: the astro.config.mjs redirect for ${required} did not build`);
    }
  }
  const rewrite = config.responseOverrides?.['404']?.rewrite;
  if (typeof rewrite !== 'string') fail('responseOverrides.404.rewrite is missing');
  else if (!targetExists(rewrite)) fail(`404 rewrite target ${rewrite} does not exist in dist/`);
  if (typeof config.globalHeaders?.['Content-Security-Policy'] !== 'string') {
    fail('globalHeaders.Content-Security-Policy is missing');
  }
}

// 3. Content-Security-Policy covers every external resource the built pages use
const IGNORED_ORIGINS = new Set(['http://www.w3.org', 'https://www.w3.org', 'http://schema.org', 'https://schema.org']);
const ORIGIN_RE = /https?:\/\/[a-z0-9.-]+(?::\d+)?/gi;
const originOf = (url) => {
  const m = url.match(/^https?:\/\/[a-z0-9.-]+(?::\d+)?/i);
  return m ? m[0].toLowerCase() : null;
};

function parseCsp(text) {
  const directives = new Map();
  for (const part of text.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    directives.set(tokens[0].toLowerCase(), tokens.slice(1).map((t) => t.replace(/^'|'$/g, '').toLowerCase()));
  }
  return directives;
}

function sourceAllows(source, origin) {
  if (source === '*' || source === 'https:' || source === 'http:') return true;
  if (source.startsWith("'")) return false;
  const src = source.includes('://') ? source : `https://${source}`;
  if (src.includes('*.')) {
    const suffix = src.slice(src.indexOf('*.') + 1);
    const scheme = src.slice(0, src.indexOf('://'));
    return origin.startsWith(`${scheme}://`) && origin.endsWith(suffix) && origin !== `${scheme}://${suffix.slice(1)}`;
  }
  return originOf(src) === origin;
}

function allowed(csp, directive, origin) {
  const sources = csp.get(directive) ?? csp.get('default-src') ?? [];
  return sources.some((s) => sourceAllows(s, origin));
}

const uses = new Map(); // `${directive} ${origin}` -> first file seen
const note = (directive, url, file) => {
  const origin = originOf(url);
  if (!origin || IGNORED_ORIGINS.has(origin)) return;
  const key = `${directive} ${origin}`;
  if (!uses.has(key)) uses.set(key, file);
};

for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const rel = relPath(file);
  for (const tag of html.matchAll(/<(script|link|iframe|img|source|video|audio|style)\b([^>]*)>/gi)) {
    const name = tag[1].toLowerCase();
    const attrs = tag[2];
    const get = (a) => attrs.match(new RegExp(`(?:^|\\s)${a}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] ?? '';
    const src = get('src');
    if (name === 'script' && src) note('script-src', src, rel);
    if (name === 'iframe' && src) note('frame-src', src, rel);
    if (name === 'img' || name === 'source') {
      if (src) note('img-src', src, rel);
      for (const candidate of get('srcset').split(',')) note('img-src', candidate.trim().split(/\s+/)[0] ?? '', rel);
    }
    if (name === 'video' || name === 'audio') {
      if (src) note('media-src', src, rel);
      const poster = get('poster');
      if (poster) note('img-src', poster, rel);
    }
    if (name === 'link') {
      const relAttr = get('rel').toLowerCase();
      const href = get('href');
      if (/\bstylesheet\b/.test(relAttr)) note('style-src', href, rel);
      if (/\bicon\b/.test(relAttr)) note('img-src', href, rel);
      if (/\bmodulepreload\b/.test(relAttr)) note('script-src', href, rel);
      if (/\bpreload\b/.test(relAttr)) {
        const as = get('as').toLowerCase();
        const map = { script: 'script-src', style: 'style-src', font: 'font-src', image: 'img-src', fetch: 'connect-src' };
        if (map[as]) note(map[as], href, rel);
      }
    }
  }
  for (const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const url of block[1].matchAll(ORIGIN_RE)) note('connect-src', url[0], rel);
  }
  for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const url of block[1].matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)/gi)) note('style-url', url[1], rel);
  }
}
for (const file of jsFiles) {
  for (const url of readFileSync(file, 'utf8').matchAll(ORIGIN_RE)) note('connect-src', url[0], relPath(file));
}
for (const file of cssFiles) {
  for (const url of readFileSync(file, 'utf8').matchAll(/url\(\s*["']?(https?:\/\/[^"')\s]+)/gi)) note('style-url', url[1], relPath(file));
}

const cspText = config?.globalHeaders?.['Content-Security-Policy'];
if (typeof cspText === 'string') {
  const csp = parseCsp(cspText);
  for (const [key, file] of uses) {
    const [directive, origin] = key.split(' ');
    // A url() in CSS may be a font or an image; either directive may allow it.
    const ok = directive === 'style-url'
      ? allowed(csp, 'font-src', origin) || allowed(csp, 'img-src', origin)
      : allowed(csp, directive, origin);
    if (!ok) fail(`${file}: ${origin} is used but the CSP ${directive === 'style-url' ? 'font-src/img-src' : directive} does not allow it`);
  }
  // Google Fonts: the stylesheet host pulls font files from fonts.gstatic.com.
  if (allowed(csp, 'style-src', 'https://fonts.googleapis.com') && !allowed(csp, 'font-src', 'https://fonts.gstatic.com')) {
    fail('CSP style-src allows fonts.googleapis.com but font-src does not allow fonts.gstatic.com');
  }
}

if (failures.length > 0) {
  console.error(`check: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`check: ${htmlFiles.length} pages, ${linkCount} internal references, ${uses.size} external origin uses, config and redirects OK`);
