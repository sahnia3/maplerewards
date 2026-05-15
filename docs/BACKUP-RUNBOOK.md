# Backup + Disaster Recovery Runbook

**Owner**: Solo (Aditya)
**Last reviewed**: 2026-05-15
**Last successful restore-test**: not yet (run before paid launch)

The independent review flagged "no backup/DR plan" as a P0 launch blocker.
This runbook closes the gap. It is **deliberately manual** for the solo-dev
stage — automating before we have user data we can lose is premature.
Automate this when paid-customer count crosses 50.

## What gets backed up

| Resource | Importance | Recovery cost if lost |
|---|---|---|
| `maplerewards` PostgreSQL DB | **Critical** | Total: every user wallet, every Pro subscription, every cached valuation history. |
| Redis | Low | Cache only; rebuilds from PG on cold start. No backup needed. |
| Secrets (`.env` + deployment store) | Critical | Re-issue from each provider's dashboard. Documented in `scripts/rotate-keys.md`. |
| Brand assets (`frontend/public/brand/`) | Low | Committed to git; recoverable from `origin/main`. |
| `design/` (logo explorations) | None | Gitignored, local-only, regenerable via the Higgsfield brand-kit skill. |

Backups focus exclusively on the database.

## Backup schedule

| Cadence | Action | Destination | Retention |
|---|---|---|---|
| Daily | Logical `pg_dump --format=custom` | S3 bucket `maplerewards-backups/daily/` | 14 days |
| Weekly (Sunday) | Same dump → separate prefix | `maplerewards-backups/weekly/` | 12 weeks |
| Monthly (1st) | Same dump → separate prefix + cold-storage class | `maplerewards-backups/monthly/` | 12 months |

Until S3 is wired (Open Dependency #3 in the plan — deployment target unchosen),
use a local backup spot:

```bash
# Daily — run this from a launchd job or cron entry on the production host
DATE=$(date -u +%Y-%m-%d)
pg_dump \
  "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  -f "/var/backups/maplerewards/daily/maplerewards-$DATE.dump"

# Then sync to S3 (placeholder for the chosen target)
# aws s3 cp /var/backups/maplerewards/daily/maplerewards-$DATE.dump \
#   s3://maplerewards-backups/daily/ \
#   --storage-class STANDARD_IA
```

## Restore drill (run monthly)

The goal is to confirm the backups are **restorable** — not just "backed up."
A backup you've never restored is a backup you can't rely on.

1. Spin up a fresh local Postgres on a non-default port:
   ```bash
   docker run -d --rm \
     -p 5433:5432 \
     -e POSTGRES_DB=maple_restore \
     -e POSTGRES_PASSWORD=password \
     --name maple-restore-test \
     postgres:16-alpine
   ```
2. Grab the most recent daily backup:
   ```bash
   LATEST=$(ls -t /var/backups/maplerewards/daily/ | head -1)
   ```
3. Restore:
   ```bash
   pg_restore \
     --host=localhost --port=5433 \
     --username=postgres \
     --dbname=maple_restore \
     --no-owner --no-acl \
     /var/backups/maplerewards/daily/$LATEST
   ```
   Expected: no errors. A row-count check on `cards`, `users`, and
   `loyalty_programs` should match the production counts (off-by-a-few is
   fine — production traffic during the dump).
4. Run the API against the restored DB for 5 minutes:
   ```bash
   DATABASE_URL=postgres://postgres:password@localhost:5433/maple_restore \
     APP_ENV=development \
     go run ./cmd/api
   ```
   Smoke-test by hitting `/api/v1/cards` and `/api/v1/programs` from
   another terminal. Both should return the expected row counts.
5. Tear down:
   ```bash
   docker stop maple-restore-test
   ```
6. Log the restore-test outcome (date, latest backup tested, anything
   weird) at the bottom of this file.

## Disaster scenarios + RPO/RTO targets

| Scenario | Recovery point objective (RPO) | Recovery time objective (RTO) | Action |
|---|---|---|---|
| Single-row corruption (logical bug) | < 1 day | < 1 hour | Spot-restore from the most recent daily dump into a side DB, copy the affected rows back |
| Whole-DB corruption | < 1 day | < 4 hours | Restore the daily dump into a fresh Postgres, repoint `DATABASE_URL`, communicate to users |
| Datacenter loss | < 1 day | < 8 hours | Provision new host (any cloud), restore from S3, repoint DNS — see the "Region failover" section below |
| Ransomware on the production host | < 7 days (worst case) | < 8 hours | Reach for the offsite-only weekly dump; old data loss is acceptable to avoid paying out |

## Region failover (post-MVP)

Skipping for now. Single-region (Ontario, Canada) is appropriate at our
scale. Revisit when the user count or contractual SLA demands a multi-region
posture. Document the cross-region replication setup at that time.

## What ISN'T covered

- **Point-in-time recovery (PITR)**: requires Postgres WAL archiving and
  a base backup. Adds operational complexity. Defer until daily backups
  alone become insufficient (i.e., you have customers complaining about
  lost work between daily snapshots).
- **Automated restore-testing**: a script that fires monthly and emails
  a green/red status. Wire after the first manual restore-test confirms
  the manual procedure works.
- **Off-key backup encryption**: backups in S3 are encrypted at rest by
  the provider. Adding our own envelope encryption is overkill at our
  scale; revisit at scale or upon contractual obligation.

## Restore-test log

| Date | Latest backup tested | Notes |
|---|---|---|
| _(none yet — first test before paid launch)_ | | |
