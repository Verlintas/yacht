#!/usr/bin/env node
/**
 * CDP smoke test for the Anvil Landing on-foot slice.
 * Requires: npm run dev -- --port 4329.
 *
 * node scripts/iac-smoke.mjs
 */
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9590);
const URL = process.env.IAC_URL ?? 'http://localhost:4330/yacht/iac-landing/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForJson(url, attempts = 160) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await sleep(200);
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
      if (!message.id) return;
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) entry.reject(new Error(message.error.message));
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
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result?.value;
  }
  async key(code, key, vkey, holdMs = 60) {
    // Headless Chrome batches CDP key state in a way that makes held keys look
    // like single-frame taps. Dispatch the same KeyboardEvent a real user
    // produces to exercise the game's window-level listener.
    await this.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${key}', bubbles: true }))`);
    await sleep(holdMs);
    await this.evaluate(`window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${key}', bubbles: true }))`);
  }
}

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1600,900',
    '--hide-scrollbars',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--use-angle=metal',
    '--no-first-run',
    `--user-data-dir=/private/tmp/iac-smoke-${process.pid}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

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
    width: 1600,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.navigate', { url: URL });
  for (let i = 0; i < 700; i += 1) {
    const ready = await cdp.evaluate('!!(window.__iac && window.__iac.ready)').catch(() => false);
    if (ready) break;
    await sleep(200);
  }
  await sleep(1400);

  check('boot mode is parked', (await cdp.evaluate('__iac.mode()')) === 'parked');
  check(
    'parked disembark panel visible',
    await cdp.evaluate("document.querySelector('#iac-parked')?.classList.contains('is-active') === true"),
  );

  await cdp.key('KeyF', 'f', 70);
  await sleep(1000);
  check('F disembarks', (await cdp.evaluate('__iac.mode()')) === 'foot');
  const start = await cdp.evaluate('__iac.player.position.toArray()');
  check('spawn is at the ramp / pad', Math.abs(start[0]) < 1 && Math.abs(start[2] - 23.5) < 1, JSON.stringify(start));

  await cdp.key('KeyW', 'w', 87, 1100);
  await sleep(300);
  const afterWalk = await cdp.evaluate('__iac.player.position.toArray()');
  check('WASD moves the player', Math.hypot(afterWalk[0] - start[0], afterWalk[2] - start[2]) > 1.5, JSON.stringify(afterWalk));

  // Ship / ramp collision: walk north from the ramp foot into the hull.
  await cdp.evaluate('__iac.teleport(0, 24, 0, 0)');
  await sleep(300);
  await cdp.key('KeyW', 'w', 87, 900);
  await sleep(250);
  const shipStop = await cdp.evaluate('__iac.player.position.toArray()');
  check('ramp/ship collision blocks the hull', shipStop[2] > 21.6, JSON.stringify(shipStop));

  // Terminal collision
  await cdp.evaluate('__iac.teleport(-80, 10, Math.PI / 2, 0)');
  await sleep(300);
  await cdp.key('KeyW', 'w', 87, 1200);
  await sleep(250);
  const terminalStop = await cdp.evaluate('__iac.player.position.toArray()');
  check('terminal wall collision blocks walking through', terminalStop[0] > -86.2, JSON.stringify(terminalStop));

  // Jump
  await cdp.evaluate('__iac.teleport(0, 23.5, Math.PI / 2, 0)');
  await sleep(300);
  await cdp.key('Space', ' ', 32);
  await sleep(180);
  const jumpY = await cdp.evaluate('__iac.player.position.y');
  check('Space jumps (gravity/ground snap alive)', jumpY > 40.4, String(jumpY));
  await sleep(900);

  // NPC dialogue
  await cdp.evaluate('__iac.teleport(-145, 111, 0, 0)');
  await sleep(500);
  await cdp.key('KeyE', 'e', 69);
  await sleep(400);
  check('E opens the dockmaster dialogue', (await cdp.evaluate('__iac.ui()')) === 'dialog');
  await cdp.key('KeyE', 'e', 69);
  await sleep(300);
  check('E advances the dialogue', (await cdp.evaluate('__iac.ui()')) === 'dialog');
  await cdp.key('Escape', 'Escape', 27);
  await sleep(300);
  check('Esc closes the dialogue', (await cdp.evaluate('__iac.ui()')) === null);

  // Shop + purchase
  const creditsBefore = await cdp.evaluate('__iac.credits()');
  await cdp.evaluate('__iac.teleport(-70, 117, 0, 0)');
  await sleep(500);
  await cdp.key('KeyE', 'e', 69);
  await sleep(400);
  check('E opens the shop', (await cdp.evaluate('__iac.ui()')) === 'shop');
  await cdp.evaluate("document.querySelector('[data-buy]')?.click()");
  await sleep(300);
  const creditsAfter = await cdp.evaluate('__iac.credits()');
  check('shop purchase deducts credits', creditsAfter === creditsBefore - 180, `${creditsBefore} → ${creditsAfter}`);
  await cdp.key('Escape', 'Escape', 27);
  await sleep(300);
  check('Esc closes the shop', (await cdp.evaluate('__iac.ui()')) === null);

  // Re-board
  await cdp.evaluate('__iac.teleport(0, 22, 0, 0)');
  await sleep(1700);
  await cdp.key('KeyF', 'f', 70);
  await sleep(1000);
  check('F re-boards the A-30', (await cdp.evaluate('__iac.mode()')) === 'parked');

  const stats = await cdp.evaluate('__iac.stats()');
  console.log('STATS', JSON.stringify(stats));
} finally {
  chrome.kill('SIGTERM');
}
if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll smoke checks passed.');
}
