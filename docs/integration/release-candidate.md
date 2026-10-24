# Release candidate record

Candidate: `0.2.0` (package version recorded by M5). This is a pending gate record; no RC tag has been created and no PR, merge, or release SHA is prefilled.

M0–M4 are accepted. M5 local full verification and independent review passed with P0/P1 = 0. The historical GitHub Actions run `40045183751` succeeded with 127 E2E, 4 Pages tests, and two builds, but it is not a final-HEAD check. The latest product-source two builds and anniversary 42 tests, historical 17 frozen regressions, and helper-source two builds are separately documented in `status.md` / `m5-modal-guard-results.json`. Current final-HEAD CI and Preview are pending coordinator verification.

Before creating any RC tag or integration PR, verify the current `main` SHA and existing tags, run/confirm required checks against the exact final HEAD, and inspect the independent review and Preview. The strict pixel comparison remains 3/16/0 at 360/393/430 with maximum delta 3/3/0; equal geometry and image bytes support an antialiasing hypothesis but do not establish exact equality. M6/M7 remain incomplete, and Android physical-device behavior is **未验收**.

Rollback must use a reviewed revert PR from the last verified checkpoint. Preserve all three v4 database tables and forward compatibility; Git rollback cannot restore browser/device data. See [rollback.md](rollback.md).