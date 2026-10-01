// Screenshot the menu in a real browser, driven over the DevTools protocol.
//
// Headless Chrome's --screenshot flag never delivers IntersectionObserver
// callbacks, so it misses scroll-spy, chapter rendering and anything else the
// page does as you scroll. This opens a real tab instead.
//
//   node tools/shot.mjs jobs.json
//
// jobs.json is a list of shots:
//   [{ "out": "shots/kumo.png", "path": "/menu/?b=kumo", "w": 390, "h": 844,
//      "lang": "ar", "steps": ["window.scrollTo(0, 900)", "click('[data-item]')"] }]
//
// Each shot starts with empty localStorage; set "fresh": false to keep it.
// "settle" is the pause after each step (default 600ms). "record":
// { "trigger": "click('...')", "ms": 2500 } records a clip after the steps.
//
// Each step is a JS expression run in the page (awaited), with two helpers:
// click(selector) and sleep(ms). Page errors are printed, so this doubles as
// a smoke test. Needs a local server, e.g. `python -m http.server 8099`.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const [jobsFile] = process.argv.slice(2);
if (!jobsFile) throw new Error('usage: node tools/shot.mjs jobs.json');
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:8099';
const PORT = 9338;

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HELPERS = `
  window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.click = (sel) => { const n = document.querySelector(sel); if (!n) throw new Error('no ' + sel); n.click(); };
`;

async function main() {
  if (!CHROME) throw new Error('no Chrome or Edge binary found');
  const profile = await mkdtemp(join(tmpdir(), 'menu-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i += 1) {
      try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl; }
      catch { await sleep(250); }
    }
    if (!wsUrl) throw new Error('Chrome did not expose a debugging port');

    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let next = 0;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method) { listeners.forEach((fn) => fn(msg)); return; }
      const waiter = pending.get(msg.id);
      if (!waiter) return;
      pending.delete(msg.id);
      if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
      else waiter.resolve(msg.result);
    });
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = (next += 1);
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

    for (const job of jobs) {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const cmd = (m, p) => send(m, p, sessionId);
      const errors = [];
      const onEvent = (msg) => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
        if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
        if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`);
      };
      listeners.push(onEvent);

      await cmd('Page.enable');
      await cmd('Runtime.enable');
      await cmd('Log.enable');
      const w = Number(job.w || 390);
      const h = Number(job.h || 844);
      // Stills are taken with reduced motion on, so a dish is never caught
      // half-plated; recordings get the full animation.
      if (!job.record) {
        await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      }
      await cmd('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: job.scale || 2, mobile: w < 700 });
      await cmd('Page.addScriptToEvaluateOnNewDocument', {
        // Every shot starts from a clean slate unless it asks not to, so
        // filters or a list from one shot never leak into the next.
        source: `${HELPERS}${job.fresh === false ? '' : 'try { localStorage.clear(); } catch (e) {}'}${job.lang ? `try { localStorage.setItem('menu.lang', JSON.stringify(${JSON.stringify(job.lang)})); } catch (e) {}` : ''}`,
      });
      await cmd('Page.navigate', { url: `${ORIGIN}${job.path || '/menu/'}` });
      await sleep(job.wait || 2200);

      for (const step of job.steps || []) {
        const res = await cmd('Runtime.evaluate', { expression: `(async () => { ${step}; await sleep(${job.settle ?? 600}); })()`, awaitPromise: true });
        if (res.exceptionDetails) {
          // Later steps assume this one worked; running them anyway can
          // navigate the tab away (history.back() with nothing open).
          errors.push(`step "${step}": ${res.exceptionDetails.exception?.description || res.exceptionDetails.text}`);
          break;
        }
      }

      // A recording: Chrome's screencast pushes a frame every time the page
      // paints, with its real timestamp, so the result plays at true speed.
      // Writes out-000.png, out-001.png ... and out.json (the timestamps);
      // stitch them with tools/frames_to_webp.py.
      if (job.record) {
        const frames = [];
        const onFrame = (msg) => {
          if (msg.sessionId !== sessionId || msg.method !== 'Page.screencastFrame') return;
          frames.push({ data: msg.params.data, t: msg.params.metadata.timestamp });
          send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }, sessionId);
        };
        listeners.push(onFrame);
        await cmd('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
        const trigger = cmd('Runtime.evaluate', { expression: `(async () => { ${job.record.trigger}; })()`, awaitPromise: true });
        await trigger;
        await sleep(job.record.ms || 2500);
        await cmd('Page.stopScreencast');
        listeners.splice(listeners.indexOf(onFrame), 1);
        mkdirSync(dirname(job.out), { recursive: true });
        const base = job.out.replace(/\.png$/, '');
        frames.forEach((fr, i) => writeFileSync(`${base}-${String(i).padStart(3, '0')}.png`, Buffer.from(fr.data, 'base64')));
        writeFileSync(`${base}.json`, JSON.stringify(frames.map((fr) => fr.t)));
        console.log(`  ${job.out} (${frames.length} frames)${errors.length ? `\n    ERRORS:\n    ${errors.join('\n    ')}` : ''}`);
        listeners.splice(listeners.indexOf(onEvent), 1);
        await send('Target.closeTarget', { targetId });
        continue;
      }

      const params = { format: job.out.endsWith('.jpg') ? 'jpeg' : 'png' };
      if (job.full) {
        const { cssContentSize } = await cmd('Page.getLayoutMetrics');
        params.clip = { x: 0, y: 0, width: w, height: Math.min(cssContentSize.height, 12000), scale: 1 };
        params.captureBeyondViewport = true;
      }
      const { data } = await cmd('Page.captureScreenshot', params);
      mkdirSync(dirname(job.out), { recursive: true });
      writeFileSync(job.out, Buffer.from(data, 'base64'));
      console.log(`  ${job.out}${errors.length ? `\n    ERRORS:\n    ${errors.join('\n    ')}` : ''}`);
      listeners.splice(listeners.indexOf(onEvent), 1);
      await send('Target.closeTarget', { targetId });
    }
    ws.close();
  } finally {
    chrome.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
