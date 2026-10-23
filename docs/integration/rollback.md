# Rollback and recovery notes

M0 changes are inventory documentation and command logs only. They do not alter application behavior or user data.

- Baseline commit: `b059b6d9982062958f0a866e763f84383d69430d`.
- Remote checkpoint tag: `checkpoint/pre-integration-20261023T141904Z`, verified at that commit before this work.
- Preserve the checkpoint tag; do not overwrite or delete it. No force push, branch deletion, or branch-protection bypass.
- If a later integration stage must be rolled back, create a recovery branch from the last verified checkpoint and use a reviewed revert PR for changes already merged. Confirm current `main`, branch protection, PR state, and tests before doing so.
- Git rollback does not roll back browser or device IndexedDB and cannot reverse a Dexie migration or restore records. Migrations must remain forward-compatible; never promise user-data recovery from a source rollback.
- After a device upgrades `little-days` to schema v4, do not deploy the pre-integration v3 code directly: it risks a `VersionError` that can prevent the database from opening. A rollback PR must retain the v4 schema that adds only `anniversaries`, along with compatibility reads for existing `todo` and `categories`; retain all three tables and their data, with no downgrade or database clearing. Revert only the UI/business changes that need removal. Before merging a rollback PR, verify in a temporary v4 synthetic fixture that old todo data and data in every table remain readable. A code checkpoint is a source anchor, not a backup of device data.
- Generated test screenshots or artifacts are not part of M0 documentation commits and must not be discarded if they appear; report and preserve them.
