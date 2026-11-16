#!/usr/bin/env node
/**
 * 鱼雷/爆炸 VFX 逐帧截图与性能采集。
 *
 * 前置：
 *   npm run dev -- --port 4329
 *
 * 运行：
 *   node scripts/vfx-capture.mjs
 *
 * 产物：
 *   docs/vfx-torpedo/*.png
 *   docs/vfx-torpedo/perf.json
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.CDP_PORT ?? 9333);
const GAME_URL = process.env.VFX_URL ?? 'http://localhost:4329/yacht/vfx-torpedo-test/';
const OUT_DIR = 'docs/vfx-torpedo';
const WIDTH = 1600;
const HEIGHT = 900;

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function waitForJson(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      /* Chrome 还在启动 */
    }
    await sleep(250);
  }
  throw new Error(`等待 ${url} 超时`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
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
      const description = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`页面脚本异常：${description}`);
    }
    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 600; i += 1) {
      try {
        const ready = await this.evaluate(
          'document.readyState === "complete" && !!window.__vfxDemo && window.__vfxDemo.ready === true',
          false,
        );
        if (ready) {
          // 等 shader 编译 / 首帧完成
          await sleep(350);
          return;
        }
      } catch {
        /* 页面正在导航 */
      }
      await sleep(200);
    }
    throw new Error(`页面未就绪：${url}`);
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

const SCENES = [
  {
    scene: 'torpedo',
    times: [0.3, 0.48, 0.66, 0.82, 0.98, 1.18],
  },
  {
    scene: 'volley',
    times: [0.3, 0.7, 1.2, 1.8, 2.6, 3.6],
  },
  {
    scene: 'impact',
    impact: true,
    // 相对于命中时刻
    relativeTimes: [-0.55, -0.18, -0.04, 0.06, 0.2, 0.5, 1.1, 2.4],
  },
  {
    scene: 'death',
    times: [0.3, 2.2, 5.2, 9.5, 14.2, 17.55, 17.92, 18.04, 18.16, 18.45, 19.1, 20.6, 23.0],
  },
  {
    scene: 'finale',
    times: [0.05, 0.3, 1.0, 2.5, 4.5, 7.5],
  },
];

function sceneUrl(scene) {
  return `${GAME_URL}?scene=${scene}&hud=0`;
}

function fileName(scene, index, time) {
  const tag = time >= 0 ? `t${time.toFixed(2)}` : `m${Math.abs(time).toFixed(2)}`;
  return join(OUT_DIR, `${scene}-${String(index + 1).padStart(2, '0')}-${tag}.png`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const profile = join(tmpdir(), `vfx-chrome-${Date.now()}`);
  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
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
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('没有找到 Chrome 页面 target');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      ws.addEventListener('open', resolveOpen, { once: true });
      ws.addEventListener('error', rejectOpen, { once: true });
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

    const manifest = [];
    const performanceReports = {};
    const sceneFilter = process.env.VFX_SCENES?.split(',').map((name) => name.trim()).filter(Boolean);

    for (const entry of SCENES) {
      if (sceneFilter && !sceneFilter.includes(entry.scene)) continue;
      console.log(`\n▶ ${entry.scene}`);
      await cdp.navigate(sceneUrl(entry.scene));

      let absoluteTimes = entry.times ?? [];
      if (entry.impact) {
        const impactTime = await cdp.evaluate('window.__vfxDemo.findImpactTime()');
        console.log(`  命中时刻 ≈ ${Number(impactTime).toFixed(3)}s`);
        performanceReports.impactTime = impactTime;
        await cdp.navigate(sceneUrl(entry.scene));
        absoluteTimes = entry.relativeTimes.map((offset) => Math.max(0, impactTime + offset));
      }

      let index = 0;
      for (const time of absoluteTimes) {
        const result = await cdp.evaluate(`window.__vfxDemo.captureAt(${time})`);
        const file = fileName(entry.scene, index, time);
        await cdp.screenshot(file);
        console.log(`  ✓ ${time.toFixed(2)}s  ${file}`);
        manifest.push({ scene: entry.scene, time, file });
        if (result?.info) performanceReports[`${entry.scene}-${index}`] = result.info;
        index += 1;
      }
    }

    console.log('\n▶ bench');
    if (!sceneFilter || sceneFilter.includes('bench')) {
      await cdp.navigate(sceneUrl('bench'));
      const perf = await cdp.evaluate('window.__vfxDemo.bench(140, 80, 240)');
      performanceReports.bench = perf;
      console.log('  ', JSON.stringify(perf, null, 2));
    }

    await writeFile(join(OUT_DIR, 'perf.json'), JSON.stringify(performanceReports, null, 2));
    await writeFile(join(OUT_DIR, 'captures.json'), JSON.stringify(manifest, null, 2));
    console.log(`\n完成：${manifest.length} 张截图，性能数据已写入 ${join(OUT_DIR, 'perf.json')}`);

    try {
      await cdp.send('Browser.close');
    } catch {
      /* 忽略 */
    }
    ws.close();
  } finally {
    chrome.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
