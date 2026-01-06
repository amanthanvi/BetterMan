# Backups & restore drill

**Goal**

- Maintain daily automated Postgres backups with ≥14 day retention.
- Be able to restore to staging and verify basic app functionality.

**Quarterly drill (staging)**

1. Restore latest prod backup to staging DB (new DB instance or overwrite staging).
2. Deploy staging app pointing at restored DB.
3. Smoke test:
   - `/api/v1/info` returns expected `datasetReleaseId`
   - `/api/v1/search?q=tar` returns results
   - `/man/tar/1` renders in UI
4. Record timings + any issues; update this runbook.

**Notes**

- Prefer PITR if the platform supports it.
- Keep at least one known-good rollback dataset release available.
