const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = `file://${path.resolve(__dirname, '../public/index.html')}`;

// Stub browser APIs that require real audio hardware / network
const INIT_SCRIPT = () => {
  // A minimal node factory that satisfies all Web Audio API calls the player makes
  const makeNode = () => ({
    connect() {},
    disconnect() {},
    gain: { value: 1 },
    fftSize: 64,
    frequencyBinCount: 32,
    getByteFrequencyData(arr) { arr.fill(0); },
  });

  window.AudioContext = window.webkitAudioContext = class {
    constructor() {
      this.state = 'running';
      this.destination = makeNode();
      this.onstatechange = null;
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createMediaElementSource() { return makeNode(); }
    createAnalyser()           { return makeNode(); }
    createGain()               { return makeNode(); }
  };

  // Resolve immediately so the play().then() callback runs synchronously
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
};

test.beforeEach(async ({ page }) => {
  // Abort the remote MP3 — we don't need real audio data for UI tests
  await page.route('https://raw.githubusercontent.com/**', route => route.abort());
  await page.addInitScript(INIT_SCRIPT);
  await page.goto(PAGE_URL);
});

// ── Initial state ─────────────────────────────────────────────────────────────
test('initial state: labels, slider positions, and status', async ({ page }) => {
  await expect(page.locator('#playBtn')).toContainText('PLAY');
  await expect(page.locator('#stopBtn')).toContainText('STOP');
  await expect(page.locator('#seek')).toHaveValue('0');
  await expect(page.locator('#vol')).toHaveValue('1');
  await expect(page.locator('#elapsed')).toHaveText('00:00');
  await expect(page.locator('#duration')).toHaveText('--:--');
  await expect(page.locator('#status')).toContainText('READY');
});

// ── Play / Pause button ───────────────────────────────────────────────────────
test('play button: switches to PAUSE and gains active class', async ({ page }) => {
  const btn = page.locator('#playBtn');
  await btn.click();
  await expect(btn).toContainText('PAUSE');
  await expect(btn).toHaveClass(/active/);
});

test('play button: second click returns to PLAY and removes active class', async ({ page }) => {
  const btn = page.locator('#playBtn');
  await btn.click();
  await btn.click();
  await expect(btn).toContainText('PLAY');
  await expect(btn).not.toHaveClass(/active/);
});

test('play button: status shows STREAMING then PAUSED', async ({ page }) => {
  await page.locator('#playBtn').click();
  await expect(page.locator('#status')).toContainText('STREAMING');

  await page.locator('#playBtn').click();
  await expect(page.locator('#status')).toContainText('PAUSED');
});

// ── Stop button ───────────────────────────────────────────────────────────────
test('stop button: resets play button, seek, elapsed, and status after playing', async ({ page }) => {
  await page.locator('#playBtn').click();
  await expect(page.locator('#playBtn')).toContainText('PAUSE');

  await page.locator('#stopBtn').click();
  await expect(page.locator('#playBtn')).toContainText('PLAY');
  await expect(page.locator('#playBtn')).not.toHaveClass(/active/);
  await expect(page.locator('#seek')).toHaveValue('0');
  await expect(page.locator('#elapsed')).toHaveText('00:00');
  await expect(page.locator('#status')).toContainText('STOPPED');
});

test('stop button: is safe to click when already stopped', async ({ page }) => {
  await page.locator('#stopBtn').click();
  await expect(page.locator('#seek')).toHaveValue('0');
  await expect(page.locator('#elapsed')).toHaveText('00:00');
  await expect(page.locator('#playBtn')).toContainText('PLAY');
});

// ── Mute / Unmute ─────────────────────────────────────────────────────────────
test('mute icon: toggles between speaker and muted icon', async ({ page }) => {
  const icon = page.locator('#volIcon');
  const original = await icon.innerHTML();

  await icon.click();
  expect(await icon.innerHTML()).not.toBe(original);  // now muted

  await icon.click();
  expect(await icon.innerHTML()).toBe(original);      // back to unmuted
});

test('mute icon: shows MUTED in status while playing', async ({ page }) => {
  await page.locator('#playBtn').click();
  await page.locator('#volIcon').click();
  await expect(page.locator('#status')).toContainText('MUTED');
});

test('mute icon: unmuting while playing restores STREAMING status', async ({ page }) => {
  await page.locator('#playBtn').click();
  await page.locator('#volIcon').click();   // mute
  await page.locator('#volIcon').click();   // unmute
  await expect(page.locator('#status')).toContainText('STREAMING');
});

// ── Volume slider ─────────────────────────────────────────────────────────────
test('volume slider: reflects updated value', async ({ page }) => {
  const slider = page.locator('#vol');
  await slider.fill('0.5');
  await slider.dispatchEvent('input');
  await expect(slider).toHaveValue('0.5');
});

test('volume slider: moving above 0 while muted auto-unmutes', async ({ page }) => {
  const icon = page.locator('#volIcon');

  await icon.click();                         // mute
  const mutedHtml = await icon.innerHTML();

  const slider = page.locator('#vol');
  await slider.fill('0.8');
  await slider.dispatchEvent('input');

  expect(await icon.innerHTML()).not.toBe(mutedHtml);   // unmuted
});

test('volume slider: moving to 0 while muted leaves mute state unchanged', async ({ page }) => {
  const icon = page.locator('#volIcon');

  await icon.click();                         // mute
  const mutedHtml = await icon.innerHTML();

  const slider = page.locator('#vol');
  await slider.fill('0');
  await slider.dispatchEvent('input');

  expect(await icon.innerHTML()).toBe(mutedHtml);       // still muted
});

// ── Seek / progress bar ───────────────────────────────────────────────────────
test('timeupdate: updates elapsed display and seek thumb position', async ({ page }) => {
  await page.evaluate(() => {
    const audio = document.getElementById('audio');
    // Override read-only media properties with fake values
    Object.defineProperty(audio, 'duration',    { value: 300, configurable: true });
    Object.defineProperty(audio, 'currentTime', { value: 90,  configurable: true, writable: true });
    audio.dispatchEvent(new Event('timeupdate'));
  });

  await expect(page.locator('#elapsed')).toHaveText('01:30');
  // seek = (90 / 300) * 100 = 30
  await expect(page.locator('#seek')).toHaveValue('30');
});

test('seek slider: dragging sets audio.currentTime proportionally', async ({ page }) => {
  await page.evaluate(() => {
    const audio = document.getElementById('audio');
    Object.defineProperty(audio, 'duration', { value: 200, configurable: true });
    // Spy on currentTime so we can read back what was assigned
    let _ct = 0;
    Object.defineProperty(audio, 'currentTime', {
      get: () => _ct,
      set: v => { _ct = v; },
      configurable: true,
    });
  });

  await page.locator('#seek').fill('50');
  await page.locator('#seek').dispatchEvent('input');

  const ct = await page.evaluate(() => document.getElementById('audio').currentTime);
  expect(ct).toBeCloseTo(100, 0);   // 50% of 200 s = 100 s
});

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
test('spacebar: toggles play/pause when focus is on body', async ({ page }) => {
  // Playwright starts with body focused; just press space
  await page.keyboard.press('Space');
  await expect(page.locator('#playBtn')).toContainText('PAUSE');

  await page.keyboard.press('Space');
  await expect(page.locator('#playBtn')).toContainText('PLAY');
});
