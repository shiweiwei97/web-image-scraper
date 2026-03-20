#!/usr/bin/env node

import { execFileSync } from 'child_process';

function parseArgs(argv) {
  const args = {
    query: '',
    engine: 'baidu',
    site: '',
    limit: 8,
    domainHint: '',
    noSandbox: true,
    openBest: true,
    retries: 2,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--engine') args.engine = argv[++i] || 'baidu';
    else if (a === '--site') args.site = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 8);
    else if (a === '--domain-hint') args.domainHint = argv[++i] || '';
    else if (a === '--no-sandbox') args.noSandbox = true;
    else if (a === '--no-open') args.openBest = false;
    else if (a === '--retries') args.retries = Number(argv[++i] || 2);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: search_then_open_detail.mjs --query <text> [--site domain] [--engine baidu|duckduckgo|bing] [--limit N] [--domain-hint text] [--no-open] [--retries N]');
      process.exit(0);
    }
  }
  if (!args.query) {
    console.error('Missing --query');
    process.exit(2);
  }
  return args;
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function abBaseArgs(noSandbox) {
  return noSandbox ? ['--args', '--no-sandbox'] : [];
}

function tryClose(noSandbox) {
  try { run('agent-browser', [...abBaseArgs(noSandbox), 'close']); } catch {}
}

function searchUrlFor(engine, q) {
  const query = encodeURIComponent(q);
  if (engine === 'bing') return `https://www.bing.com/search?q=${query}`;
  if (engine === 'baidu') return `https://www.baidu.com/s?wd=${query}`;
  return `https://html.duckduckgo.com/html/?q=${query}`;
}

function openSearch(engine, q, noSandbox, retries) {
  const url = searchUrlFor(engine, q);
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    try {
      tryClose(noSandbox);
      run('agent-browser', [...abBaseArgs(noSandbox), 'open', url]);
      run('agent-browser', [...abBaseArgs(noSandbox), 'wait', '3000']);
      const htmlJson = run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'html', 'body', '--json']);
      const parsed = JSON.parse(htmlJson);
      return { url, html: (parsed.data && (parsed.data.value || parsed.data.html)) || '', attempt };
    } catch (err) {
      lastError = String((err && err.stderr) || err.message || err);
    }
  }
  return { url, html: '', attempt: retries, error: lastError || 'search_open_failed' };
}

function decodeHtml(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanTitle(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractLinks(html, engine) {
  const links = [];
  if (!html) return links;
  if (engine === 'duckduckgo') {
    for (const m of html.matchAll(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gis)) {
      links.push({ url: decodeHtml(m[1]), title: cleanTitle(m[2]) });
    }
  } else if (engine === 'baidu') {
    for (const m of html.matchAll(/<a[^>]+href=["'](https?:\/\/www\.baidu\.com\/link\?url=[^"']+)["'][^>]*>(.*?)<\/a>/gis)) {
      links.push({ url: decodeHtml(m[1]), title: cleanTitle(m[2]) });
    }
    for (const m of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gis)) {
      const url = decodeHtml(m[1]);
      if (/baidu\.com\/(s|from=|cache|pagecache|index\.php)/.test(url)) continue;
      links.push({ url, title: cleanTitle(m[2]) });
    }
  } else {
    for (const m of html.matchAll(/<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>(.*?)<\/a>/gis)) {
      links.push({ url: decodeHtml(m[1]), title: cleanTitle(m[2]) });
    }
  }
  const seen = new Set();
  return links.filter(x => {
    if (!x.url || seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}

function scoreLink(link, query, site, domainHint) {
  let score = 0;
  const hay = `${link.title} ${link.url}`.toLowerCase();
  const url = (link.url || '').toLowerCase();
  for (const token of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (hay.includes(token)) score += 3;
  }
  if (site && hay.includes(site.toLowerCase())) score += 12;
  if (/大众点评|dianping/.test(hay)) score += 10;
  if (domainHint && hay.includes(domainHint.toLowerCase())) score += 4;
  if (/shop|store|detail|merchant|poi|hotel|restaurant|menu|photo|album|review|item/.test(hay)) score += 4;
  if (/图片|地图|贴吧|知道|文库|视频|百科/.test(link.title || '')) score -= 10;
  if (/image\.baidu|map\.baidu|tieba\.baidu|zhidao\.baidu|wenku\.baidu|video\.baidu/.test(url)) score -= 12;
  if (/login|passport|account|signup|register|pclogin|verify|captcha/.test(hay)) score -= 12;
  return score;
}

function pickBest(links, query, site, domainHint, limit) {
  return links
    .map(l => ({ ...l, score: scoreLink(l, query, site, domainHint) }))
    .filter(l => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function openDetail(url, noSandbox, retries) {
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt++) {
    try {
      tryClose(noSandbox);
      run('agent-browser', [...abBaseArgs(noSandbox), 'open', url]);
      run('agent-browser', [...abBaseArgs(noSandbox), 'wait', '3000']);
      let title = '';
      let finalUrl = url;
      try {
        title = JSON.parse(run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'title', '--json'])).data.title || '';
      } catch {}
      try {
        finalUrl = JSON.parse(run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'url', '--json'])).data.url || url;
      } catch {}
      return { title, finalUrl, attempt };
    } catch (err) {
      lastError = String((err && err.stderr) || err.message || err);
    }
  }
  return { title: '', finalUrl: url, error: lastError || 'detail_open_failed' };
}

const args = parseArgs(process.argv);
const q = args.site ? `${args.query} site:${args.site}` : args.query;
const search = openSearch(args.engine, q, args.noSandbox, args.retries);
const links = extractLinks(search.html, args.engine);
const candidates = pickBest(links, args.query, args.site, args.domainHint, args.limit);
let opened = null;
if (args.openBest && candidates.length) {
  opened = openDetail(candidates[0].url, args.noSandbox, args.retries);
}

console.log(JSON.stringify({
  success: true,
  engine: args.engine,
  searchUrl: search.url,
  searchAttempt: search.attempt,
  searchError: search.error || null,
  candidateCount: candidates.length,
  candidates,
  opened,
}, null, 2));
