# Integration routing and ownership

- M0 sole write owner: `/root/m0_baseline` (gpt-6-luna, low); no other writer is assigned.
- Worktree: `D:\cozy-days-integration-20261023T141904Z`.
- Branch/base: `integration/cozy-next-20261023T141904Z` at `b059b6d9982062958f0a866e763f84383d69430d`.
- This milestone may add only `GOAL.md`, `AGENT_ROUTING.md`, `docs/integration/*`, and `artifacts/integration/m0/*` logs. Do not change `AGENTS.md`, source, tests, or generated screenshots.
- Future milestone ownership and read-only review assignment are for the main orchestrator to define. Keep milestone writes serial and assign one writer per phase.
- User authorized the controlled squash merge for this Goal only, after all requirements and branch protections pass. No bypass or direct main update is authorized.
- Preserve the original `D:\daylight-app` user changes. Recorded SHA-256 values are in `status.md`; do not alter or stage those files.

Execution verification: delegated read-only agents ran as gpt-6-luna low and gpt-6.1-sol medium. The current primary session's local runtime `turn_context` at `2026-10-23T14:31:54.207Z` records `model=gpt-6.1-sol` and `effort=high`. This is verification of the selected model, not a model switch. The earlier assumption that model verification was unavailable is superseded; M1 may proceed.

M1 routing: primary coordinator performs the reviewed three-way merge of PR #9 and assigns one independent-worktree writer using gpt-6.1-sol medium for persistence consistency, migration preservation, and regression tests. Scope is anniversary implementation, anniversary repository additions, and anniversary tests only; todo implementation and existing regressions remain frozen. Escalation requires a reproducible failure, diagnosis, and evidence that a narrowed medium task is insufficient. No escalation has been requested.

M2 routing: one independent-worktree gpt-6.1-sol medium writer, because failed-write recovery, cross-unmount state, corrupted storage and date/timezone regression require reliable persistence reasoning. Inputs are only period files and dedicated tests from PR #10 plus the integration SHA. Outputs are verified recovery behavior, tests and a source commit; no todo, shared schema, global navigation/style or asset changes. An independent gpt-6.1-sol medium reader audited only period model/storage coverage and returned static gaps, not runtime acceptance. Escalation requires narrowed reproducible failures and evidence; none has occurred.

M1 evidence writer: `/root/m1_evidence_record` (gpt-6-luna, low), documentation/evidence only. The source under verification is `d4adc9d1e7f3bd85f402159b857455b7e82f02b3`; final builds, 35 specialist tests, 17 existing main regressions, and 4 Pages tests all exited 0. The 11 screenshots were copied and SHA-256 checked. An independent final-review agent could not be run because the agent thread limit was reached; the coordinator must perform the version-boundary diff review and must not claim dual review. Physical-device acceptance and visual-reference comparison remain outstanding.
