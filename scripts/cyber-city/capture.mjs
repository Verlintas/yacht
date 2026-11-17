#!/usr/bin/env node
/**
 * Cyber-city screenshot + performance capture via Chrome CDP.
 *
 * Usage:
 *   npm run dev -- --port 4331
 *   node scripts/cyber-city/capture.mjs
 *
 * Env:
 *   CYBER_URL=http://localhost:4331/yacht/cyber-city/
 *   CDP_PORT=9444
 *   CYBER_SHOTS=hero,store,street,wide,ui
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT ?? 9444);
const BASE = process.env.CYBER_URL ?? 'http://localhost:4331/yacht/cyber-city/';
const OUT_DIR = 'docs/cyber-city';
const WIDTH = 1600;
const HEIGHT = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForJson(url, attempts = 160) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
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
    this.logs = [];
    this.errors = [];
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const entry = this.pending.get(msg.id);
        if (!entry) return;
        this.pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
        else entry.resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args ?? [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ');
        this.logs.push({ type: msg.params.type, text });
        console.log(`  [console.${msg.params.type}] ${text.slice(0, 700)}`);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        const text = d.exception?.description ?? d.text;
        this.errors.push(text);
        console.error(`  [exception] ${text}`);
      }
      if (msg.method === 'Network.responseReceived' && msg.params.response.status === 404) {
        console.error(`  [404] ${msg.params.response.url}`);
      }
      if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        if (e.level === 'error') {
          this.errors.push(e.text);
          console.error(`  [log.error] ${e.text}`);
        }
      }
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
      const d = result.exceptionDetails;
      throw new Error(d.exception?.description ?? d.text);
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 900; i += 1) {
      try {
        const ready = await this.evaluate(
          'document.readyState === "complete" && !!window.__cyber && window.__cyber.ready === true',
          false,
        );
        if (ready) {
          await sleep(900);
          return;
        }
      } catch {
        /* navigating */
      }
      await sleep(200);
    }
    throw new Error(`page not ready: ${url}`);
  }

  async screenshot(path) {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path, Buffer.from(result.data, 'base64'));
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const profile = join(tmpdir(), `cyber-chrome-${Date.now()}`);
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--use-angle=metal',
    '--enable-gpu',
    '--disable-gpu-sandbox',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${WIDTH},${HEIGHT}`,
    'about:blank',
  ], { stdio: 'ignore' });

  try {
    await waitForJson(`http://127.0.0.1:${PORT}/json/version`);
    const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('no page target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log(`▶ navigate ${BASE}?shot=hero&hud=0`);
    await cdp.navigate(`${BASE}?shot=hero&hud=0`);
    console.log('✔ ready');
    console.log('  gpu:', await cdp.evaluate(
      `(() => { const gl = window.__cyber.renderer.getContext(); const d = gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; })()`,
    ));

    const shots = (process.env.CYBER_SHOTS ?? 'hero,store,street,wide,ui')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const manifest = [];
    for (const shot of shots) {
      const ui = shot === 'ui';
      if (ui) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: 1280,
          height: 720,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await cdp.evaluate('window.dispatchEvent(new Event("resize"))');
        await sleep(500);
      } else {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: WIDTH,
          height: HEIGHT,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await cdp.evaluate('window.dispatchEvent(new Event("resize"))');
        await sleep(300);
      }
      await cdp.evaluate(`window.__cyber.setShot(${JSON.stringify(shot)})`);
      await sleep(1400);
      const file = join(OUT_DIR, `${shot}.png`);
      await cdp.screenshot(file);
      const stats = await cdp.evaluate('window.__lastStats');
      console.log(`  ✓ ${file}`, JSON.stringify(stats));
      manifest.push({ shot, file, stats });
    }

    // perf bench on the hero shot at 1600x900
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.evaluate('window.dispatchEvent(new Event("resize"))');
    await cdp.evaluate('window.__cyber.setShot("hero")');
    await sleep(900);
    const perf = await cdp.evaluate('window.__cyber.bench(180)');
    console.log('  bench:', JSON.stringify(perf, null, 2));

    // perf for the wide shot and reflection-off comparison
    await cdp.evaluate('window.__cyber.setShot("wide")');
    await sleep(900);
    const perfWide = await cdp.evaluate('window.__cyber.bench(120)');
    console.log('  wide bench:', JSON.stringify(perfWide, null, 2));

    await writeFile(join(OUT_DIR, 'perf.json'), JSON.stringify({ hero: perf, wide: perfWide, logs: cdp.logs, errors: cdp.errors }, null, 2));
    await writeFile(join(OUT_DIR, 'captures.json'), JSON.stringify(manifest, null, 2));
    console.log(`\n✔ ${manifest.length} screenshots + perf.json`);

    try {
      await cdp.send('Browser.close');
    } catch {
      /* ignore */
    }
    ws.close();
  } finally {
    chrome.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
