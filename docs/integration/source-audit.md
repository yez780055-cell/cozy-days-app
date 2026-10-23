# Static source audit for M1/M2 planning

Baseline under review: `b059b6d9982062958f0a866e763f84383d69430d`; this is a static inspection summary, not runtime reproduction. Findings below are risks to address with phase-specific tests, not confirmed user-visible incidents.

## Merge scope and main preservation

- PR #9 and PR #10 merge-base against the integration baseline: `24a413bf914675d3c2f2fdb4e10525febcf87e26`.
- PR #9 contributes 23 files; PR #10 contributes 24 files.
- Their file deltas do not touch `App`, `TodoForm`, todo date code, or main's audit/font tests.
- Old PR snapshots being behind `main` does not by itself mean a three-way merge would revert main. Review file-level conflicts and preserve current main changes; do not replace the tree wholesale.

## M1 anniversary risk

Static locations: `AnniversaryPage.tsx:51-52` and `:58-59`; `database.ts:75`.

A successful write followed by a failed read inside the same error-handling path may be presented as a save failure. The new record ID is not returned to the draft, so a user retry can create a duplicate. During M1, add tests that distinguish save success from follow-up read failure and cover retry identity, plus migration tests that preserve all legacy todo fields/categories and verify the new table/indexes.

## M2 period draft risk

Static locations: `usePeriod.ts:6-12` and `:22-28`; `PeriodPage.tsx:33` and `:35`.

Pending edits appear to live only in hook/component state and refs; unmounting the page may lose them. The dialog closes immediately after update. During M2, test drafts across navigation/unmount and recovery after failed persistence, and make the UI clearly show whether a save completed.

## Evidence boundary

Neither issue was reproduced during M0. The baseline E2E and Pages suites passed, but they do not close these untested feature-specific failure paths. No code or test files were changed in M0.
