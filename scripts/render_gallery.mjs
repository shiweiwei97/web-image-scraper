#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = { input: '', outDir: '', title: 'Image Gallery' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.input = argv[++i] || '';
    else if (a === '--out-dir') args.outDir = argv[++i] || '';
    else if (a === '--title') args.title = argv[++i] || 'Image Gallery';
    else if (a === '--help' || a === '-h') {
      console.log('Usage: render_gallery.mjs --file manifest.json [--out-dir dir] [--title text]');
      process.exit(0);
    }
  }
  if (!args.input) {
    console.error('Missing --file manifest.json');
    process.exit(2);
  }
  return args;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mdEsc(s) {
  return String(s || '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

const args = parseArgs(process.argv);
const manifest = JSON.parse(fs.readFileSync(args.input, 'utf8'));
const outDir = args.outDir || path.dirname(args.input);
fs.mkdirSync(outDir, { recursive: true });
const title = args.title || manifest.source?.label || manifest.source?.title || 'Image Gallery';
const ok = (manifest.results || []).filter(x => x.ok && x.saved);

const cards = ok.map((item, idx) => {
  const caption = item.alt || item.title || item.context || `Image ${idx + 1}`;
  const meta = [
    item.score != null ? `score ${item.score}` : '',
    item.width && item.height ? `${item.width}×${item.height}` : '',
    item.contentType || '',
    item.bytes ? `${Math.round(item.bytes / 102.4) / 10} KB` : ''
  ].filter(Boolean).join(' · ');
  return `
  <figure class="card">
    <a href="${esc(item.saved)}"><img loading="lazy" src="${esc(item.saved)}" alt="${esc(caption)}"></a>
    <figcaption>
      <div class="title">${esc(caption)}</div>
      <div class="meta">${esc(meta)}</div>
      <div class="links"><a href="${esc(item.saved)}">local file</a> · <a href="${esc(item.url)}">source url</a>${item.sourcePage ? ` · <a href="${esc(item.sourcePage)}">page</a>` : ''}</div>
    </figcaption>
  </figure>`;
}).join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: Inter, system-ui, sans-serif; margin: 24px; line-height: 1.4; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .card { border: 1px solid #9994; border-radius: 14px; overflow: hidden; margin: 0; background: #fff1; }
    img { display: block; width: 100%; height: 220px; object-fit: cover; background: #0001; }
    figcaption { padding: 12px; }
    .title { font-weight: 600; margin-bottom: 6px; }
    .meta { color: #666; font-size: 0.9rem; margin-bottom: 8px; }
    .links { font-size: 0.9rem; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${esc(title)}</h1>
  <p>${esc(manifest.source?.pageUrl || '')}</p>
  <div class="grid">${cards}</div>
</body>
</html>`;

const markdown = [`# ${title}`, '', manifest.source?.pageUrl ? `Source page: ${manifest.source.pageUrl}` : '', ''];
for (const [idx, item] of ok.entries()) {
  const caption = item.alt || item.title || item.context || `Image ${idx + 1}`;
  markdown.push(`## ${idx + 1}. ${caption}`);
  markdown.push('');
  markdown.push(`![${caption}](${item.saved})`);
  markdown.push('');
  markdown.push(`- score: ${item.score}`);
  if (item.sourcePage) markdown.push(`- page: ${item.sourcePage}`);
  markdown.push(`- source url: ${item.url}`);
  markdown.push(`- local file: ${item.saved}`);
  markdown.push('');
}

fs.writeFileSync(path.join(outDir, 'gallery.html'), html);
fs.writeFileSync(path.join(outDir, 'gallery.md'), markdown.filter(Boolean).join('\n'));
console.log(JSON.stringify({ success: true, outDir, html: path.join(outDir, 'gallery.html'), markdown: path.join(outDir, 'gallery.md'), images: ok.length }, null, 2));
