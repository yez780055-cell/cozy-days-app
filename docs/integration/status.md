# Integration status — M0 baseline

- Goal/version: Cozy Days integration, package version `0.1.0`.
- Integration branch: `integration/cozy-next-20261023T141904Z`.
- Baseline HEAD: `b059b6d9982062958f0a866e763f84383d69430d`.
- Remote checkpoint: `checkpoint/pre-integration-20261023T141904Z` was independently read back at the baseline SHA.
- Worktree: `D:\cozy-days-integration-20261023T141904Z`; clean at start.
- Main protection: ruleset `25687265` requires PR and latest `verify`; no bypass. Do not force-push or delete refs. PRs #7/#8/#9/#10 are open; each has `verify` and Cloudflare success (as prevalidated for M0; refresh before any later merge).
- M0 state: inventory and baseline checks complete. The primary-session model was subsequently verified from its current local `turn_context`: `gpt-6.1-sol`, effort `high`, timestamp `2026-10-23T14:31:54.207Z`. M1 functionality is accepted. M2 code and scoped checks passed on source `88fa1b7f313410cb16fcf124015452314889ea44`; its checkpoint is awaiting coordinator push/read-back. Asset quality and visual comparison remain for M3/M4.
- M0 checkpoint reference: `checkpoint/m0-baseline-20261023T143021Z`; the coordinator must push and read it back before reporting the checkpoint as available remotely.
- Asset inventory: anniversary 6 assets available / 9 missing; period 8 assets available / 11 missing, including 3 icons. Refer to `asset-map.md`; paths exist. Copyright/permission status remains under review.
- Protected original-workspace files were not edited. SHA-256: `D:\daylight-app\README.md` = `6546A211B931E151FC5D1472589B0D4C1B401C6A5EA435D73B0A960C6AAC296D`; `D:\daylight-app\tests\swipe.spec.ts` = `E93D93F71332DD12F00C381B2926F7E3AD50DA563CE5D7F1A50894AD3E9E4145`.
- Checks ran serially in the requested order. Each full console transcript and exit code is recorded under `artifacts/integration/m0/`. The 40 generated evidence files were copied to `artifacts/integration/m0/generated/`, each copy was SHA-256 verified, and only those generated tracked paths were restored. `generated-index.json` binds their hashes to tested source `b059b6d9982062958f0a866e763f84383d69430d`. Logs and generated media remain local ignored artifacts; they were not included in the documentation commit.
- Rollback: see `rollback.md`. Git rollback cannot restore browser/device data or reverse a Dexie migration.

## Milestones

| Milestone | Scope | State / entry gate |
|---|---|---|
| M0 | Inventory, protection, baseline, task/asset map | Complete; both builds, 59 E2E and 4 Pages tests passed |
| M1 | Anniversary functionality | Complete; source `d4adc9d1e7f3bd85f402159b857455b7e82f02b3`; 35 specialist + 17 existing regressions + 4 Pages tests and both builds passed; checkpoint `checkpoint/anniversary-functional-20261023T144942Z` |
| M2 | Period functionality and failed-save behavior | Functionality passed on `88fa1b7f313410cb16fcf124015452314889ea44`; 45 period, 35 anniversary, 17 legacy regression, 4 Pages, both builds and 1 recovery-evidence test all exited 0. Coordinator checkpoint push/read-back pending. No Android device or reference-image visual acceptance. |
| M3 | Anniversary assets and visual comparison | Not started; copyright/asset review required |
| M4 | Period assets and responsive review | Not started; copyright/asset review required |
| M5 | Cross-feature audit and regression | Not started; only after M1–M4 |
| M6 | Release candidate and protected PR merge | Not started; all goal gates and current checks required |
| M7 | Delivery and stop for user feedback | Not started |

## Baseline command record

| Order | Command | Exit code | Outcome |
|---|---|---:|---|
| 1 | `npm ci` | 0 | Passed; 2 dependency advisories (1 moderate, 1 high) |
| 2 | `npm run build` | 0 | Passed |
| 3 | `npm run build:pages` | 0 | Passed |
| 4 | `npm run test:e2e` | 0 | 59 passed |
| 5 | `npm run test:pages` | 0 | 4 passed |

## Follow-up risks and execution boundary

- Supplemental M1 online checks: Cloudflare build `75e7de3a7a2811c3d0ccd5c766f2e8979012e387` and screenshot source `d4adc9d1e7f3bd85f402159b857455b7e82f02b3` were checked at `https://1e7386ab.cozy-days-app.pages.dev/`. The unchanged default 60-second remote suite produced two failures on the 430x932 case (the first run and retry); both failure records/traces are retained. The first preserved trace shows the pre-existing `bedroom_header.png` API request consumed 45.235 seconds. A supplemental full remote run with an explicitly recorded 180-second observation budget passed all 4 cases with assertions unchanged. The user confirmed on 2026-10-24 that Cloudflare main auto-production deployment is disabled; this is recorded from the user's confirmation, not an API read. Required local test files/default budgets remain unchanged and passed as recorded. Online responsiveness remains an M5 release risk until reevaluated; the M1 tag establishes scoped functionality, not general network-performance acceptance.

- Runtime used: Node `v22.23.4`, npm `11.10.1`, via temporary PATH prefix.
- M1 final verification on source `d4adc9d1e7f3bd85f402159b857455b7e82f02b3`: `npm run build` and `npm run build:pages` exited 0; `npx playwright test --config playwright.anniversary.config.ts` passed 35, including migration, persistence failure/retry and mobile coverage; `npx playwright test tests/swipe.spec.ts tests/audit-regressions.spec.ts tests/font-switcher.spec.ts` passed 17; `npm run test:pages` passed 4. These are scoped M1 runs, not the full M5 E2E suite. Exact transcripts and source SHA are under ignored `artifacts/integration/m1/`. The 11 screenshots under `public/review/anniversary/` were copied from the test run and SHA-256 checked against the archived originals. No physical-device test or visual comparison against a reference was performed; screenshots are evidence for review, not visual approval. No independent final review agent ran (agent thread limit); the primary coordinator completed the version-boundary diff review, including committed source/tests, complete migration snapshots/indexes, frozen paths, source identity and command exits. This is not dual review.
- M1 evidence scheduling: after the prior writer ended, the Luna Low evidence writer started successfully. Two earlier final-review dispatch attempts did not execute; no platform-limit cause is inferred. Final review remains coordinator-owned.
- M1 frozen-area check: `todo`, `categories`, `App`, settings/styles, and the pre-existing regression suite had no diff against `b059b6d9982062958f0a866e763f84383d69430d`; the test output confirms the 17 existing regressions passed. Original-workspace file hashes remain unchanged as recorded above.
- Static source review (not a reproduced failure): M2 pending period edits live only in component state/ref and can be lost on page unmount; `PeriodPage.tsx` closes the dialog immediately after update. Add cross-unmount draft recovery and failed-save retry coverage during M2.
- PR #9/#10 merge-base against the base is `24a413bf914675d3c2f2fdb4e10525febcf87e26`; #9 contributes 23 files and #10 24. Their changed-file inventories do not include `App`, `TodoForm`, todo date code, or main audit/font tests. Three-way integration should retain main fixes when file-level edits are reviewed; never overlay the full tree. See `source-audit.md`.
- Test-generated modifications were observed after Playwright: 40 files under `public/review/evidence/screenshots/`, `public/review/evidence/videos/`, and `public/review/evidence/source.json`. The coordinator archived and hash-verified all 40, then restored only these generated paths in the isolated integration worktree. The user's original worktree and file hashes remain unchanged.
- Agent orchestration was performed by the parent. Successful gpt-6-luna low and gpt-6.1-sol medium read-only agents were used. A later inspection of the current primary session's local runtime metadata proved `model=gpt-6.1-sol`, `effort=high` (turn timestamp `2026-10-23T14:31:54.207Z`). No model switch was performed. The earlier inability-to-verify assumption was incorrect; the configuration gate is resolved without further user confirmation.
- M0 is an inventory/baseline result only. It does not approve source code, feature behavior, asset quality/licensing, or PR merge readiness.
- M2 detailed command, failure/recovery history, log hashes, and evidence provenance are recorded in `m2.md` and `m2-results.json`. The test transcript and raw generated media remain in the source worktree artifacts at `D:\cozy-days-m2-period-20261023T150338Z\artifacts\integration\m2\`; no tests were rerun by the evidence writer.

M2 checkpoint accepted by coordinator: remote `checkpoint/period-functional-20261023T2337Z` and integration branch read back at `9814fe754b8a182b08c8e80b7e8c7c0d34260615`; source under tests is `88fa1b7f313410cb16fcf124015452314889ea44`. The evidence-only commit changes no source/tests. M3 begins from reviewed PR #7 merge `11a3e4812cdf1380ad61d9b601276d8da1fd5a8b`. Cloudflare production gate is satisfied by the user's explicit 2026-10-24 confirmation that main automatic production deployment is disabled, not by an authenticated dashboard/API read.
