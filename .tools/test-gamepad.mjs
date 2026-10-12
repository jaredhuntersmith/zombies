import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

// Browser integration test: virtual standard-mapped pads pass through the actual
// navigator.getGamepads -> input -> gameplay path. Physical USB/Bluetooth device
// testing is still needed on each target OS.
const out = 'artifacts/gamepad'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const report = { checks: [], errors: [] };
page.on('pageerror', e => report.errors.push(String(e)));
page.on('response', r => { if (r.status() >= 400) report.errors.push(`HTTP ${r.status()} ${r.url()}`); });
await page.addInitScript(() => {
  window.testPad = { index: 0, id: 'Xbox Wireless Controller', connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.testPad.connected ? [window.testPad] : [] });
});
const state = () => page.evaluate(() => kino.debug.getState());
const advance = seconds => page.evaluate(seconds => kino.debug.step(seconds), seconds);
const controls = (buttons = [], axes = [0, 0, 0, 0]) => page.evaluate(({ buttons, axes }) => {
  testPad.axes = axes; testPad.buttons = testPad.buttons.map((_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 }));
}, { buttons, axes });
const tap = async button => { await controls(); await advance(.05); await controls([button]); await advance(.05); await controls(); await advance(.05); };
const pass = name => { report.checks.push(name); console.log('PASS', name); };
try {
  await page.goto(process.env.KINO_URL || 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => globalThis.kino?.debug.getState().ready, null, { timeout: 180000 });
  await page.bringToFront();
  await advance(.1);
  assert((await state()).input.controller.connected);
  await tap(9); assert((await state()).active); assert(await page.evaluate(() => !document.pointerLockElement));
  pass('Menu button starts controller gameplay without mouse capture');
  await page.evaluate(() => { kino.debug.setInvulnerable(true); kino.debug.setAutoSpawn(false); });
  const before = await state();
  await controls([], [.7, 0, .5, -.2]); await advance(.4); await controls(); await advance(.05);
  let after = await state();
  assert(Math.hypot(after.player.feet[0] - before.player.feet[0], after.player.feet[2] - before.player.feet[2]) > 10);
  assert(Math.abs(after.player.rotation[1] - before.player.rotation[1]) > .1);
  pass('Analog movement and right-stick looking reach the player controller');
  await page.waitForFunction(() => kino.debug.weaponVisual().mode === 'idle', null, { timeout: 30000 });
  await controls([6]); await advance(.2); assert((await state()).input.ads);
  await controls([6, 7]); await advance(.1); after = await state(); assert.equal(after.weapon.mag, 7);
  await advance(.5); assert.equal((await state()).weapon.mag, 7);
  pass('Left trigger aims and a held right trigger fires the semi-auto pistol once');
  await controls(); await advance(.05); await tap(2); await advance(3); assert.equal((await state()).weapon.mag, 8);
  pass('X reloads away from an interaction');
  await tap(1); await advance(.3); assert((await state()).player.crouched); await tap(1); await advance(.3); assert(!(await state()).player.crouched);
  await controls([0]); await advance(.12); assert(!(await state()).player.grounded); await controls(); await advance(1);
  pass('B toggles crouch and A jumps');
  await tap(11); assert((await state()).meleeLeft > 0); await advance(1);
  const grenades = (await state()).grenades; await tap(5); assert.equal((await state()).grenades, grenades - 1);
  pass('Right-stick click knifes and right bumper throws a grenade');
  await page.evaluate(() => { const e = kino.debug.getEntities().find(e => e.targetname === 'zombie_door' && e.target === 'foyer_bottom_door'); kino.debug.grantPoints(2000); kino.debug.teleportPlayer(e.position); kino.debug.step(.45); });
  await tap(2); assert((await state()).openDoors.includes('foyer_bottom_door'));
  pass('Contextual X opens a purchased door');
  await page.evaluate(() => { const b = kino.debug.getState().barriers[0]; kino.debug.setBoards(b.id, 0); kino.debug.teleportPlayer(b.position); kino.debug.step(.4); });
  const barrierBefore = (await state()).barriers.map(b => b.count);
  await controls([2]); await advance(3); await controls(); await advance(.05);
  assert((await state()).barriers.some((b, i) => b.count > barrierBefore[i]));
  pass('Holding X rebuilds a barricade');
  await page.evaluate(() => kino.debug.giveWeapon('mp40_zm'));
  await page.waitForFunction(() => kino.debug.getState().viewmodelReady && kino.debug.weaponVisual().mode === 'idle');
  const mag = (await state()).weapon.mag; await controls([7]); await advance(.6); await controls();
  assert((await state()).weapon.mag < mag - 1); await tap(3); assert.equal((await state()).weapon.id, 'm1911_zm');
  pass('Automatic weapons keep firing and Y switches weapons');
  await tap(9); assert(!(await state()).active);
  const time = (await state()).time; await advance(1); assert.equal((await state()).time, time);
  await page.locator('#controller-settings summary').click();
  await page.locator('[data-setting=sensitivity]').evaluate(input => { input.value = '1.75'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-setting=invertY]').check();
  assert.equal((await state()).input.controller.settings.sensitivity, 1.75);
  assert(await page.evaluate(() => JSON.parse(localStorage.getItem('kino.controller')).invertY));
  await page.screenshot({ path: `${out}/settings.png` });
  pass('Pause freezes simulation and controller settings persist');
  await tap(9); assert((await state()).active);
  await controls([7]); await advance(.05);
  await page.evaluate(() => { testPad.connected = false; }); await advance(.05);
  assert(!(await state()).active); assert(!(await state()).input.primary);
  await page.evaluate(() => { testPad.connected = true; testPad.id = 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)'; });
  await controls(); await advance(.1); assert(!(await state()).active); await tap(9);
  assert((await state()).active); assert((await page.locator('#controls-hint').textContent()).includes('Square'));
  pass('Disconnect pauses safely; PlayStation reconnect uses Square/Options labels');
  await page.screenshot({ path: `${out}/gameplay.png` });
  assert.deepEqual(report.errors, []); assert.deepEqual((await state()).errors, []);
} catch (error) {
  report.failure = String(error); console.error(error); process.exitCode = 1;
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
} finally {
  report.state = await state().catch(() => null);
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
