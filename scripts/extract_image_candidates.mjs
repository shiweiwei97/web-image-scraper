#!/usr/bin/env node

import fs from 'fs';

function parseArgs(argv) {
  const args = { limit: 50, input: '-', baseUrl: '', pageTitle: '', pageUrl: '', query: '', label: '' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrl = argv[++i] || '';
    else if (a === '--page-url') args.pageUrl = argv[++i] || '';
    else if (a === '--page-title') args.pageTitle = argv[++i] || '';
    else if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--label') args.label = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 50);
    else if (a === '--file') args.input = argv[++i] || '-';
    else if (a === '--stdin') args.input = '-';
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: extract_image_candidates.mjs [--file path | --stdin] --base-url <url> [--page-title t] [--query q] [--label x] [--limit N]\n\nReads HTML and outputs ranked image candidates as JSON.`);
      process.exit(0);
    }
  }
  return args;
}

function readInput(path) {
  if (!path || path === '-') return fs.readFileSync(0, 'utf8');
  return fs.readFileSync(path, 'utf8');
}

function safeUrl(raw, baseUrl) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^url\((.*)\)$/i, '$1').replace(/^['"]|['"]$/g, '');
  if (!cleaned || cleaned.startsWith('data:')) return null;
  try {
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function attrValue(attrs, name) {
  return decodeHtml((attrs.match(new RegExp(`${name}=["']([^"']+)["']`, 'i')) || [])[1] || '');
}

function scoreUrl(url) {
  let score = 0;
  const lower = url.toLowerCase();
  if (/(menu|gallery|photo|image|images|dish|food|hero|content|banner)/.test(lower)) score += 4;
  if (/(restaurant|hotel|travel|venue|storefront|shop)/.test(lower)) score += 2;
  if (/(logo|icon|sprite|avatar|emoji|badge|placeholder|thumb|qr|wxqrcode)/.test(lower)) score -= 6;
  if (/\.svg($|\?)/.test(lower)) score -= 4;
  if (/\.(jpe?g|png|webp|gif|avif)($|\?)/.test(lower)) score += 2;
  return score;
}

function scoreAttrs(attrText, alt, title) {
  let score = 0;
  const lower = attrText.toLowerCase();
  if (/data-src|data-original|srcset|data-lazy|loading=['"]lazy/.test(lower)) score += 2;
  if ((alt || '').length >= 4) score += 1;
  if ((title || '').length >= 4) score += 1;
  const width = Number((lower.match(/width=['"]?(\d{2,4})/) || [])[1] || 0);
  const height = Number((lower.match(/height=['"]?(\d{2,4})/) || [])[1] || 0);
  if (width >= 300) score += 2;
  if (height >= 200) score += 2;
  if (width > 0 && width <= 64) score -= 4;
  if (height > 0 && height <= 64) score -= 4;
  if (/^\[[^\]]{1,6}\]$/.test((alt || '').trim())) score -= 5;
  if (/(logo|icon|avatar|二维码|扫码|公众号|表情|emoji)/.test(`${alt} ${title}`.toLowerCase())) score -= 6;
  return { score, width: width || null, height: height || null };
}

function scoreContext(text) {
  const lower = String(text || '').toLowerCase();
  let score = 0;
  if (/(menu|gallery|photo|dish|food|招牌|菜|环境|门头|店内|餐厅|烧烤|烀饼|饭庄)/.test(lower)) score += 2;
  if (/(logo|icon|avatar|下载|扫码|二维码|advert|广告)/.test(lower)) score -= 4;
  return score;
}

function collectFromSrcset(srcset, baseUrl) {
  return srcset
    .split(',')
    .map(p => p.trim().split(/\s+/)[0])
    .map(u => safeUrl(u, baseUrl))
    .filter(Boolean);
}

function extractContext(html, index) {
  const start = Math.max(0, index - 180);
  const end = Math.min(html.length, index + 180);
  return decodeHtml(html.slice(start, end).replace(/<[^>]+>/g, ' '));
}

function extract(html, baseUrl, meta) {
  const out = new Map();
  const add = (url, kind, attrText = '', extra = {}, atIndex = 0) => {
    if (!url) return;
    const alt = extra.alt || '';
    const title = extra.title || '';
    const context = extra.context || '';
    const existing = out.get(url) || { url, kinds: new Set(), score: 0, width: null, height: null, alt: '', title: '', context: '', sourcePage: meta.pageUrl || baseUrl };
    const attr = scoreAttrs(attrText, alt, title);
    existing.kinds.add(kind);
    existing.score += scoreUrl(url) + attr.score + scoreContext(`${alt} ${title} ${context}`);
    existing.width ??= attr.width;
    existing.height ??= attr.height;
    if (!existing.alt && alt) existing.alt = alt;
    if (!existing.title && title) existing.title = title;
    if ((!existing.context || existing.context.length < context.length) && context) existing.context = context;
    existing.atIndex = Math.min(existing.atIndex ?? atIndex, atIndex);
    out.set(url, existing);
  };

  const imgTagRegex = /<img\b([^>]*?)>/gis;
  for (const m of html.matchAll(imgTagRegex)) {
    const attrs = m[1] || '';
    const alt = attrValue(attrs, 'alt');
    const title = attrValue(attrs, 'title');
    const context = extractContext(html, m.index || 0);
    const sources = [];
    for (const attrName of ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-image', 'data-url']) {
      const value = attrValue(attrs, attrName);
      if (value) sources.push(value);
    }
    const srcset = attrValue(attrs, 'srcset');
    if (srcset) sources.push(...collectFromSrcset(srcset, baseUrl));
    for (const raw of sources) add(safeUrl(raw, baseUrl) || raw, 'img', attrs, { alt, title, context }, m.index || 0);
  }

  const sourceTagRegex = /<source\b([^>]*?)>/gis;
  for (const m of html.matchAll(sourceTagRegex)) {
    const attrs = m[1] || '';
    const srcset = attrValue(attrs, 'srcset');
    const context = extractContext(html, m.index || 0);
    if (srcset) {
      for (const url of collectFromSrcset(srcset, baseUrl)) add(url, 'source', attrs, { context }, m.index || 0);
    }
  }

  const styleBgRegex = /background-image\s*:\s*url\(([^)]+)\)/gis;
  for (const m of html.matchAll(styleBgRegex)) {
    add(safeUrl(m[1], baseUrl), 'background-image', m[0], { context: extractContext(html, m.index || 0) }, m.index || 0);
  }

  return [...out.values()]
    .map(x => ({ ...x, kinds: [...x.kinds] }))
    .filter(x => x.score >= -2)
    .sort((a, b) => b.score - a.score || (a.atIndex ?? 0) - (b.atIndex ?? 0) || a.url.localeCompare(b.url));
}

const args = parseArgs(process.argv);
const html = readInput(args.input);
const candidates = extract(html, args.baseUrl, { pageUrl: args.pageUrl || args.baseUrl }).slice(0, args.limit);
console.log(JSON.stringify({
  success: true,
  pageUrl: args.pageUrl || args.baseUrl,
  pageTitle: args.pageTitle || '',
  query: args.query || '',
  label: args.label || '',
  count: candidates.length,
  candidates,
}, null, 2));
