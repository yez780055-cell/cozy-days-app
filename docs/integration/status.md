# Integration status — M0 baseline

- Goal/version: Cozy Days integration, package version `0.1.0`.
- Integration branch: `integration/cozy-next-20261023T141904Z`.
- Baseline HEAD: `b059b6d9982062958f0a866e763f84383d69430d`.
- Remote checkpoint: `checkpoint/pre-integration-20261023T141904Z` was independently read back at the baseline SHA.
- Worktree: `D:\cozy-days-integration-20261023T141904Z`; clean at start.
- Main protection: ruleset `25687265` requires PR and latest `verify`; no bypass. Do not force-push or delete refs. PRs #7/#8/#9/#10 are open; each has `verify` and Cloudflare success (as prevalidated for M0; refresh before any later merge).
- M0 state: inventory and baseline checks in progress. This record does not mark the features, assets, copyright, or visual quality as accepted.
- Asset inventory: manifest available 6/8; needs-redraw 9/11. Refer to `asset-map.md`; paths exist. Copyright/permission status remains under review.
- Protected original-workspace files were not edited. SHA-256: `D:\daylight-app\README.md` = `6546A211B931E151FC5D1472589B0D4C1B401C6A5EA435D73B0A960C6AAC296D`; `D:\daylight-app\tests\swipe.spec.ts` = `E93D93F71332DD12F00C381B2926F7E3AD50DA563CE5D7F1A50894AD3E9E4145`.
- Checks will run serially in the requested order. Each full console transcript and exit code is recorded under `artifacts/integration/m0/`. Any generated public screenshots are preserved and must not be staged.
- Rollback: see `rollback.md`. Git rollback cannot restore browser/device data or reverse a Dexie migration.

## Milestones

| Milestone | Scope | State / entry gate |
|---|---|---|
| M0 | Inventory, protection, baseline, task/asset map | In progress; report failures without code changes |
| M1 | Anniversary functionality | Not started; requires M0 review |
| M2 | Period functionality and failed-save behavior | Not started; requires M1 completion |
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

- Runtime used: Node `v22.23.4`, npm `11.10.1`, via temporary PATH prefix.
- Static source review (not a reproduced failure): M1 anniversary write/read error handling can report failure after a successful save, and retry may duplicate because the created ID is not returned to the draft. Add persistence/read-failure distinction, retry and migration completeness coverage during M1.
- Static source review (not a reproduced failure): M2 pending period edits live only in component state/ref and can be lost on page unmount; `PeriodPage.tsx` closes the dialog immediately after update. Add cross-unmount draft recovery and failed-save retry coverage during M2.
- PR #9/#10 merge-base against the base is `24a413bf914675d3c2f2fdb4e10525febcf87e26`; #9 contributes 23 files and #10 24. Their changed-file inventories do not include `App`, `TodoForm`, todo date code, or main audit/font tests. Three-way integration should retain main fixes when file-level edits are reviewed; never overlay the full tree. See `source-audit.md`.
- Test-generated modifications were observed after Playwright: 40 files under `public/review/evidence/screenshots/`, `public/review/evidence/videos/`, and `public/review/evidence/source.json`. They are preserved in the worktree and intentionally excluded from the M0 commit. They must be reviewed by the parent before any cleanup or later commit.
- Agent orchestration was performed by the parent. The parent reports successful gpt-6-luna low and gpt-6.1-sol medium read-only agents. The primary session has no tool to change/read its own model or reasoning setting; do not claim a switch to gpt-6.1-sol high. M0 baseline is complete; M1 is gated on the parent resolving its model configuration question.
- M0 is an inventory/baseline result only. It does not approve source code, feature behavior, asset quality/licensing, or PR merge readiness.
