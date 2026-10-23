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
