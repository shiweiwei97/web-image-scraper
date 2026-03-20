#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import crypto from 'crypto';

function parseArgs(argv) {
  const args = { input: '-', outDir: './downloads', top: 10, minScore: 0, timeoutMs: 20000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.input = argv[++i] || '-';
    else if (a === '--stdin') args.input = '-';
    else if (a === '--out-dir') args.outDir = argv[++i] || './downloads';
    else if (a === '--top') args.top = Number(argv[++i] || 10);
    else if (a === '--min-score') args.minScore = Number(argv[++i] || 0);
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i] || 20000);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: download_candidates.mjs [--file results.json|--stdin] [--out-dir dir] [--top N] [--min-score N] [--timeout-ms N]');
      process.exit(0);
    }
  }
  return args;
}

function readInput(file) {
  if (!file || file === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(file, 'utf8');
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function extFrom(url, contentType) {
  const pathname = (() => { try { return new URL(url).pathname; } catch { return ''; } })();
  const ext = path.extname(pathname || '').toLowerCase();
  if (ext && ext.length <= 8) return ext;
  if (!contentType) return '.img';
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('avif')) return '.avif';
  if (contentType.includes('svg')) return '.svg';
  return '.img';
}

function requestToFile(url, destBase, timeoutMs, redirects = 0) {
  const client = url.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': (() => { try { return new URL(url).origin + '/'; } catch { return undefined; } })(),
      },
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirects >= 5) {
          res.resume();
          return reject(new Error('Too many redirects'));
        }
        const redirected = new URL(res.headers.location, url).toString();
        res.resume();
        return resolve(requestToFile(redirected, destBase, timeoutMs, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const contentType = res.headers['content-type'] || '';
      const finalDest = destBase + extFrom(url, contentType);
      const file = fs.createWriteStream(finalDest);
      const hash = crypto.createHash('sha256');
      let bytes = 0;
      res.on('data', chunk => {
        hash.update(chunk);
        bytes += chunk.length;
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve({ path: finalDest, contentType, bytes, sha256: hash.digest('hex') })));
      file.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

const args = parseArgs(process.argv);
const data = JSON.parse(readInput(args.input));
const candidates = (data.candidates || []).filter(x => (x.score ?? 0) >= args.minScore).slice(0, args.top);
fs.mkdirSync(args.outDir, { recursive: true });

const manifest = {
  success: true,
  generatedAt: new Date().toISOString(),
  source: {
    pageUrl: data.pageUrl || null,
    title: data.pageTitle || null,
    query: data.query || null,
    label: data.label || null,
    input: args.input,
  },
  count: 0,
  results: [],
};

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  const stem = `${String(i + 1).padStart(2, '0')}-${slugify(c.alt || c.title || c.context || 'image')}`;
  const base = path.join(args.outDir, stem);
  try {
    const saved = await requestToFile(c.url, base, args.timeoutMs);
    manifest.results.push({
      ok: true,
      index: i + 1,
      url: c.url,
      score: c.score,
      alt: c.alt || '',
      title: c.title || '',
      context: c.context || '',
      sourcePage: c.sourcePage || data.pageUrl || '',
      kinds: c.kinds || [],
      width: c.width ?? null,
      height: c.height ?? null,
      saved: path.relative(args.outDir, saved.path) || path.basename(saved.path),
      savedAbs: saved.path,
      contentType: saved.contentType,
      bytes: saved.bytes,
      sha256: saved.sha256,
    });
  } catch (err) {
    manifest.results.push({
      ok: false,
      index: i + 1,
      url: c.url,
      score: c.score,
      alt: c.alt || '',
      title: c.title || '',
      context: c.context || '',
      sourcePage: c.sourcePage || data.pageUrl || '',
      error: String(err.message || err),
    });
  }
}
manifest.count = manifest.results.length;
fs.writeFileSync(path.join(args.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
