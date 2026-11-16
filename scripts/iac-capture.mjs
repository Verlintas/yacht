#!/usr/bin/env node
/**
 * Capture the IAC landing vertical slice with Chrome DevTools Protocol.
 *
 * Start the dev server first:
 *   npm run dev -- --port 4329
 *
 * Real GPU (default):
 *   node scripts/iac-capture.mjs
 *
 * For CI / no display:
 *   IAC_SOFTWARE=1 node scripts/iac-capture.mjs
 *
 * Outputs: docs/iac-landing/*.png and docs/iac-landing/stats.json
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9444);
const URL = process.env.IAC_URL ?? 'http://localhost:4330/yacht/iac-landing/';
const OUT = process.env.IAC_OUT ?? 'docs/iac-landing';
const WIDTH = Number(process.env.IAC_W ?? 1600);
const HEIGHT = Number(process.env.IAC_H ?? 900);
const SOFTWARE = process.env.IAC_SOFTWARE === '1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 160) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* Chrome is starting */
    }
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${url}`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        if (message.method === 'Runtime.consoleAPICalled') {
          const args = message.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
          console.log('[console]', args);
        }
        if (message.method === 'Runtime.exceptionThrown') {
          const details = message.params.exceptionDetails;
          console.error('[page-error]', details.exception?.description ?? details.text);
        }
        return;
      }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result?.value;
  }

  async screenshot(path) {
    const result = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(path, Buffer.from(result.data, 'base64'));
    console.log('wrote', path);
  }
}

const chromeArgs = [
  '--headless=new',
  `--remote-debugging-port=${CDP_PORT}`,
  `--window-size=${WIDTH},${HEIGHT}`,
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-angle=metal',
  `--user-data-dir=/private/tmp/iac-chrome-${process.pid}`,
  'about:blank',
];
if (SOFTWARE) {
  chromeArgs.push('--enable-unsafe-swiftshader', '--use-angle=swiftshader');
}
const chrome = spawn(CHROME, chromeArgs, { stdio: 'ignore' });

try {
  await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const tabs = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json`);
  const page = tabs.find((tab) => tab.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new Cdp(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 800; i += 1) {
    const ready = await cdp.evaluate('window.__iac && window.__iac.ready === true', false).catch(() => false);
    if (ready) break;
    await sleep(200);
  }
  await sleep(1800);
  await mkdir(OUT, { recursive: true });

  const initial = await cdp.evaluate('window.__iac.stats()');
  console.log('GPU', initial.gpu, 'software', initial.softwareRenderer, 'size', initial.size);

  const shots = [
    {
      name: '01-wide-landing',
      setup: `__iac.setStats(false); __iac.parkedView([-40, 54, 82], [-45, 44, 10], 60);`,
    },
    {
      name: '02-disembark-prompt',
      setup: `__iac.setStats(false); __iac.parkedView([-32, 48, 52], [0, 44, 2], 48);`,
    },
    {
      name: '03-foot-terminal',
      setup: `__iac.setStats(false); __iac.teleport(-145, 130, 0, -0.01); __iac.lookAt(-145, 94, 0.02);`,
    },
    {
      name: '04-npc-dialog',
      setup: `__iac.setStats(false); __iac.teleport(-145, 114, 0, 0); __iac.lookAt(-145, 108, 0.03); __iac.openDialog('dockmaster');`,
    },
    {
      name: '05-shop-panel',
      setup: `__iac.setStats(false); __iac.teleport(-108, -3.5, 0, 0); __iac.lookAt(-108, -12, 0.02); __iac.openShop();`,
    },
    {
      name: '06-perf-wide',
      setup: `__iac.closeUi(); __iac.setStats(true); __iac.parkedView([-40, 54, 82], [-45, 44, 10], 60);`,
    },
    {
      name: '07-pad-top',
      setup: `__iac.setStats(false); __iac.parkedView([0, 150, 42], [0, 40, 0], 55);`,
    },
    {
      name: '08-terrain-overview',
      setup: `__iac.setStats(false); __iac.parkedView([0, 380, 1250], [0, 20, -2000], 60);`,
    },
    {
      name: '09-ridge-vista',
      setup: `__iac.setStats(false); __iac.teleport(0, -690, 0, 0.04); __iac.lookAt(0, -2500, 0.04);`,
    },
  ];

  const shotStats = [];
  for (const shot of shots) {
    await cdp.evaluate(shot.setup);
    await sleep(900);
    const stats = await cdp.evaluate('window.__iac.stats()');
    shotStats.push({ name: shot.name, calls: stats.calls, triangles: stats.triangles });
    await cdp.screenshot(`${OUT}/${shot.name}.png`);
  }

  // FPS sample for ~6 s in the final parked view with everything visible.
  await cdp.evaluate(`__iac.setStats(true);`);
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < 6000) {
    await sleep(700);
    const stats = await cdp.evaluate('window.__iac.stats()');
    samples.push(stats);
  }
  const final = await cdp.evaluate('window.__iac.stats()');
  const fpsValues = samples.map((s) => s.fps).filter((v) => Number.isFinite(v));
  const avg = fpsValues.length ? Math.round(fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length) : 0;
  const min = fpsValues.length ? Math.min(...fpsValues) : 0;
  const max = fpsValues.length ? Math.max(...fpsValues) : 0;
  const worstCalls = shotStats.reduce((a, s) => Math.max(a, s.calls), 0);
  const worstTris = shotStats.reduce((a, s) => Math.max(a, s.triangles), 0);
  const report = {
    url: URL,
    testedAt: new Date().toISOString(),
    viewport: [WIDTH, HEIGHT],
    gpu: final.gpu,
    software: final.softwareRenderer,
    drawCalls: worstCalls,
    triangles: worstTris,
    finalView: { calls: final.calls, triangles: final.triangles },
    shots: shotStats,
    fps: { avg, min, max, samples: fpsValues },
    note: 'drawCalls/triangles are the worst measured among the captured gameplay/hero views; FPS sampled in the final parked view after shader compile and asset load (M4 Max, Metal, not SwiftShader).',
  };
  await writeFile(`${OUT}/stats.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  chrome.kill('SIGTERM');
}
