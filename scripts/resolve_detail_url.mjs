#!/usr/bin/env node

import { execFileSync } from 'child_process';

function parseArgs(argv) {
  const args = { url: '', noSandbox: true, retries: 2 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i] || '';
    else if (a === '--retries') args.retries = Number(argv[++i] || 2);
    else if (a === '--no-sandbox') args.noSandbox = true;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: resolve_detail_url.mjs --url <candidate-url> [--retries N]');
      process.exit(0);
    }
  }
  if (!args.url) {
    console.error('Missing --url');
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

function classify(url, title) {
  const hay = `${url} ${title}`.toLowerCase();
  if (/pclogin|account\.dianping\.com|login|signup|register/.test(hay)) return 'login';
  if (/dianping\.com/.test(hay)) return 'dianping';
  if (/meituan\.net|dpfile\.com/.test(hay)) return 'asset';
  return 'other';
}

function resolveOnce(url, noSandbox) {
  tryClose(noSandbox);
  run('agent-browser', [...abBaseArgs(noSandbox), 'open', url]);
  run('agent-browser', [...abBaseArgs(noSandbox), 'wait', '3000']);

  let finalUrl = url;
  let title = '';
  let html = '';

  try {
    finalUrl = JSON.parse(run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'url', '--json'])).data.url || url;
  } catch {}
  try {
    title = JSON.parse(run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'title', '--json'])).data.title || '';
  } catch {}
  try {
    const j = JSON.parse(run('agent-browser', [...abBaseArgs(noSandbox), 'get', 'html', 'body', '--json']));
    html = (j.data && (j.data.value || j.data.html)) || '';
  } catch {}

  const pageType = classify(finalUrl, title);
  const hasLoginPrompt = /请登录|登录\/注册|扫码|去app查看更多内容|pclogin/i.test(html);
  const hasShopSignals = /商户|地址|评价|推荐菜|人均|图片|菜单|电话/i.test(html);

  return {
    initialUrl: url,
    finalUrl,
    title,
    pageType,
    hasLoginPrompt,
    hasShopSignals,
  };
}

const args = parseArgs(process.argv);
let result = null;
let lastError = null;
for (let i = 1; i <= Math.max(1, args.retries); i++) {
  try {
    result = resolveOnce(args.url, args.noSandbox);
    result.attempt = i;
    break;
  } catch (err) {
    lastError = String((err && err.stderr) || err.message || err);
  }
}

if (!result) {
  console.log(JSON.stringify({ success: false, error: lastError || 'resolve_failed' }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ success: true, ...result }, null, 2));
