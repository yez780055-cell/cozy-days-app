# Remote month-gesture diagnosis

Remote run [40252387309](https://github.com/yez780055-cell/cozy-days-app/actions/runs/40252387309), integration commit `093189ee08a7063aec8db7fd409da5a0d5afee46`, completed **159/160**. The month gesture test failed at its final right swipe: November remained selected instead of returning to October. This is an actual assertion failure, separate from the earlier local loading-budget timeouts.

Artifact `12620774861`, `regression-093189ee08a7063aec8db7fd409da5a0d5afee46-evidence`, was downloaded read-only. Archive SHA256: `bccce348b5fef1fe46c5ce930c9a0f1355eedc7a969e36963435853baedb535b`. Its failing `trace.zip` SHA256: `b95c1d218d705e88b3b12832622a767f4088cec62b2f945653b91f72fffa4973`.

`hashes.sha256` hashes the files in this directory except itself. JPEG hashes use raw bytes; text hashes use UTF-8 with LF line endings for portable Windows/Linux verification.

## Evidence and cause

The original test measured `monthBox` once before the short swipe, then reused it for the vertical, two-finger, and final right swipe. Vertical touch intentionally allows native vertical scrolling. Consequently the cached viewport coordinates do not necessarily hit the calendar later.

The two extracted remote screencast frames are preserved here. `remote-before-vertical.jpeg` is trace timestamp 464830.036; `remote-after-vertical.jpeg` is 465161.704. Filenames of the extraction intermediates represented lookup times, not exact frame timestamps. Frame geometry is approximate: the calendar moves upward about 90px, its bottom to about 445 CSS px, while the cached touch point stays near 456px. The filtered API event records in `remote-events.jsonl` place the vertical, multi-touch and right gestures at approximately 464992, 465126 and 465253ms. CDP touch parameters are absent from the remote trace; remote hit targets are therefore inferred from its frames rather than claimed as directly logged events.

A local read-only copy of the original test, with capturing `pointerdown` diagnostics, passed 1/1 (`local-original.log`). `local-stale-coordinate-probe.json` directly records the native scroll: calendar y236/bottom546 at scrollTop0 becomes y167/bottom477 at scrollTop69. The unchanged cached point (575.156,459.2) moves from a date span to `P.period-selected`. This smaller local scroll still happens to leave the point within the calendar, explaining why the original test can pass locally.

A second read-only probe temporarily set the same container's scrollTop to101, recorded `elementFromPoint` at that cached coordinate, then restored its previous scrollTop without dispatching a gesture at the altered position. `controlled-hit-probe.json` records calendar y135/bottom445 and target `SECTION.period-card.period-daily`, `calendarHit:false`. This demonstrates the stale-coordinate failure mechanism at the geometry observed remotely; it is a controlled probe, not a claim of reproducing the remote browser's exact scroll scheduling. Its original interaction assertions still passed 1/1 (`controlled-hit-probe.log`).

## Correction and provenance

Only `tests/v022-interactions.spec.ts` changes. It measures the current calendar immediately before each month gesture and asserts that `elementFromPoint` belongs to the calendar. All gesture distances, vertical/two-finger cases, selection, click safety, button navigation and business assertions remain. No waits, retries, thresholds or application code change.

The local pre-fix HEAD is `f9e38a7f5d0d07fe647bd8634d63df471bf91b9f`. App source remains byte-for-byte equivalent to `afc908261f20646e2307c119dc32e9c02f5eecbc` and its integration equivalent `eda099dfc92d913562581bbc5a6b4e3138162ed2`. The existing 18 images, historical `source.json`, manifests and public review files are untouched. Their historical test/image provenance is unchanged. This directory records a subsequent test positioning correction and does not claim a new complete 160-test pass.

## Verification

The isolated local config uses Chromium Desktop Chrome, one worker, default 30s test/6s expect budgets, zero retries, and a new Vite server on strict port5299. Test contexts and IndexedDB fixtures are synthetic and isolated.

- `npx playwright test --config artifacts/v022-gesture-fixed.config.ts --grep 'touch date gestures' --repeat-each=3 --output=artifacts/v022-remote-gesture/fixed-repeat3 --reporter=line`: **3/3 passed**, 31.7s; raw `fixed-repeat3.log`.
- `npx playwright test --config artifacts/v022-gesture-fixed.config.ts --output=artifacts/v022-remote-gesture/fixed-all8 --reporter=line`: **8/8 passed**, 31.9s; raw `fixed-all8.log`.
- `npm run build`: **passed**; raw `build.log`.

The verified corrected test Git blob is `b55719f100c3af292808c1666b6371de3ee0bfbd`. The temporary config used for these commands is reproducible as follows (place under `artifacts/`):

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../tests', testMatch: 'v022-interactions.spec.ts',
  workers: 1, timeout: 30000, expect: { timeout: 6000 },
  use: { baseURL: 'http://127.0.0.1:5299', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5299 --strictPort',
    url: 'http://127.0.0.1:5299', reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

Full regression on the integrated correction is left to the parent agent's subsequent remote run. No new local full160 run was performed.
