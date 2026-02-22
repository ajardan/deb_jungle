# dnb.md — Project Context

## What this is
A single-file static HTML music player with a Matrix (black/green) aesthetic. No build tools, no dependencies, no server required — open `index.html` directly in a browser.

## Key file
`index.html` — the entire app (HTML + CSS + JS, self-contained)

## Audio source
Remote MP3 via `raw.githubusercontent.com`:
```
https://raw.githubusercontent.com/ajardan/deb_jungle/refs/heads/master/mAcRoS-Junglebrain.mp3
```
Current track: **mAcRoS — Junglebrain**

The `<audio>` element has `crossorigin="anonymous"` because `raw.githubusercontent.com` serves proper `Access-Control-Allow-Origin: *` headers, and this attribute is required for the Web Audio API to process cross-origin audio.

## Architecture
- **Matrix rain**: `<canvas id="rain">` — katakana + hex chars, `setInterval` at 50 ms
- **Visualizer**: `<canvas id="viz">` — frequency bar graph when playing, idle sine wave when paused
- **Web Audio API**: `AudioContext → createMediaElementSource → AnalyserNode → destination`
- **Graceful degradation**: if Web Audio API setup fails (CORS or API error), audio is connected directly to `destination` and the visualizer shows the idle sine wave

## Critical Web Audio API pattern
`createMediaElementSource(audio)` **captures** the `<audio>` element and reroutes its output through the Web Audio graph. If the graph is not connected to `audioCtx.destination`, playback is **silent**. The `audioCtx` object must be created **outside** the try/catch so it is always valid after `initAudioCtx()` returns.

## Known gotchas
- Using `github.com/raw/...` redirect URLs (instead of `raw.githubusercontent.com`) causes CORS failures with `crossorigin="anonymous"` — always use the direct `raw.githubusercontent.com` URL
- `AudioContext` starts in `"suspended"` state in modern browsers; must call `.resume()` on a user gesture before `.play()`
- `if (audioCtx && audioCtx.state === 'suspended')` — null-guard required since `audioCtx` can be null if init failed

## Browser targets
Safari and Chrome (macOS). Cross-browser CSS includes `-webkit-appearance` prefixes on range inputs.

## Testing

Playwright (Chromium) tests live in `tests/player.spec.js`. They run against `public/index.html` via `file://` and mock the AudioContext + network MP3 request so no real audio hardware or internet is needed.

**Run tests:**
```
pnpm test              # one-shot, all 15 tests
pnpm test:watch        # nodemon re-runs on changes to public/
```

Tests cover: initial state, play/pause toggle, stop reset, mute toggle, volume slider auto-unmute, seek slider, timeupdate display, and spacebar shortcut.

A **pre-commit hook** (`.git/hooks/pre-commit`) automatically runs `pnpm test` before every commit and blocks the commit if any test fails.

**Toolchain:** Node 25 (via Homebrew), pnpm 10, Playwright 1.58.
