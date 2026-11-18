# VireoClip Operational Recovery & Backup Procedures

> DRAFT RUNBOOK, NOT VERIFIED PRODUCTION STATE. Backup-branch review on 2026-11-19 found unsupported storage assumptions and unfenced terminal render writes. The local recovery correction and its exact test limits are recorded in `qualification/render-lease-fencing-20261119.md`. No production backup schedule, successful restore, credential rotation, zero-data-loss guarantee or rollout is established by this document. Never run these procedures against production without validating the target, permissions and current vendor capabilities.

**Phase 13 Production Hardening & Operational Runbook**

---

## 1. Overview & Scope

This document details the operational disaster recovery, backup strategies, lock recovery, secret rotation, and webhook replay runbooks for VireoClip.
This is a proposed operational procedure. Each recovery path needs environment-specific validation and a measured restore drill. The procedures do not establish zero data loss or tenant isolation by themselves.

---

## 2. MongoDB Database Backup & Restoration

### 2.1 MongoDB Atlas Automated Backups
VireoClip uses MongoDB Atlas. In production environments:
1. **Continuous Cloud Backups (PITR)**: Point-in-Time Recovery must be enabled on the production cluster with a retention window of 7 to 35 days.
2. **Snapshot Frequency**: Automated snapshots occur every 6 hours, retained for 7 days. Weekly snapshots retained for 30 days.

### 2.2 On-Demand Database Backup via `mongodump`
To create a safe point-in-time logical backup prior to schema migrations or major version upgrades:

```bash
# Export full database with archive compression
mongodump --uri="$MONGODB_URI" --archive="vireoclip_backup_$(date +%Y%m%d_%H%M%S).gz" --gzip
```

### 2.3 Disaster Recovery Restoration via `mongorestore`
To restore from a logical backup archive:

```bash
# Dry run verification
mongorestore --uri="$MONGODB_URI" --archive="vireoclip_backup_TARGET.gz" --gzip --dryRun

# Production restore (non-destructive; does not drop collections unless specified)
mongorestore --uri="$MONGODB_URI" --archive="vireoclip_backup_TARGET.gz" --gzip --nsInclude="vireoclip.*"
```

*Note: Never execute `--drop` against production MongoDB Atlas without explicit sign-off.*

---

## 3. Cloudflare R2 Object Storage Recovery

### 3.1 Bucket Layout & Ownership
All assets in Cloudflare R2 are namespaced with strict multi-tenant path structures:
```
uploads/{userId}/{projectId}/{filename}
clips/{userId}/{projectId}/{clipId}.mp4
outputs/{userId}/{projectId}/...
```

### 3.2 R2 Lifecycle & Disaster Recovery
- **Versioning and replication are not assumed**: Cloudflare's current S3 compatibility page lists bucket versioning and bucket replication APIs as unimplemented. The earlier instructions to enable them were not an executable recovery plan.
- **Multipart lifecycle**: Verify the current bucket lifecycle configuration and an approved retention policy before changing it. No production lifecycle state has been checked here.
- **Independent backup required**: Define and test an authorized separate-copy strategy with an object manifest and content hashes. Super Slurper is a migration/copy tool, not proof of continuous replication, and migrated ETags can change. No copy job or new storage has been authorized or started.
- Sources verified 2026-11-19: https://developers.cloudflare.com/r2/api/s3/api/ and https://developers.cloudflare.com/r2/data-migration/super-slurper/ .

---

## 4. Background Job & Distributed Lock Recovery

### 4.1 Render Job Lock Recovery

The local queue recovery correction processes at most 25 stale/exhausted jobs per sweep, rechecks worker/heartbeat state transactionally, respects each job's retry budget and fails exhausted jobs rather than leaving them queued. New jobs start with zero acquired executions. See `qualification/render-retry-recovery-20261119.md` for actual isolated-Mongo claim/recovery tests and legacy limitations. This is backup engineering, not verified production deployment or a process-restart drill.

The local correction uses immutable per-attempt render output paths and fenced transactional stage/outcome updates. See the qualification record linked above for exact real-Mongo and mock coverage. No production restore or process-kill/restart test was performed. New attempt objects can remain orphaned after an interrupted or losing attempt; no cleanup or retention change is approved.

Do not bulk-clear worker IDs or reset job status from this runbook. Before any manual recovery, identify the exact owner/job/clip, current token and heartbeat, attempt budget, active worker and desired outcome. A reset that races a live worker can create duplicate work or discard a valid result. A reviewed, scoped recovery tool and a production recovery drill remain required.

### 4.2 Publishing Worker Stale Lock Recovery
Social publishing jobs utilize `publish_jobs` with atomic claims:
- **Lease Timeout**: 10 minutes (`staleCutoff = Date.now() - 10m`).
- **Exponential Backoff**: Transient failures automatically reschedule with delays of 2s, 5s, 15s.
- **Dead-Letter State**: After reaching `max_attempts` (3), the job transitions to `status: "failed"` with a sanitized `error_message`.

---

## 5. Webhook Replay Strategy

### 5.1 Idempotency & Deduplication
Every incoming billing webhook (Paddle / Razorpay) is verified via signature and recorded in `billing_events`:
- **Unique Event Index**: `{ provider: 1, event_id: 1 }` prevents double-credit or duplicate invoice generation.
- **Replay Safety**: If Paddle or Razorpay re-transmits an event due to network delay, VireoClip verifies the event ID against `billing_events`. Existing events return an immediate HTTP 200 `{ received: true, duplicate: true }` without repeating balance or subscription mutations.

### 5.2 Manual Webhook Replay
If a webhook failed due to database unavailability (HTTP 500 or timeout), provider consoles allow manual replay:
1. **Paddle Dashboard**: Billing > Developer Tools > Events > Select Event > "Re-send".
2. **Razorpay Dashboard**: Settings > Webhooks > Selected Webhook > "Webhook History" > "Resend".

---

## 6. Environment Secret Rotation Runbook

### 6.1 Safe Rotation Checklist
1. **Supabase JWT Secret / Anon Key**:
   - Update in Supabase dashboard.
   - Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in environment config.
   - Restart backend instances gracefully. Existing active client JWTs are validated according to Supabase public keys.
2. **Cloudflare R2 Credentials**:
   - Create new Access Key / Secret Key in Cloudflare R2 dashboard.
   - Update `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.
   - Validate pre-signed URL generation via `GET /api/ready`.
   - Revoke old R2 credentials in Cloudflare dashboard.
3. **OpenRouter / AI API Keys**:
   - Generate secondary key in OpenRouter.
   - Update `OPENROUTER_API_KEY` on backend.
   - Verify health via `GET /api/ready`.
   - Delete old key.

---

## 7. Graceful Shutdown & Health Probes

### 7.1 Health & Readiness Endpoints
- **Liveness Probe**: `GET /health` returns HTTP 200 `{ status: "ok", uptime: ... }` if Node process is responsive.
- **Readiness Probe**: `GET /ready` returns HTTP 200 if MongoDB is connected and core configs are valid; returns HTTP 503 if MongoDB or critical dependencies fail.

### 7.2 Bounded Shutdown and Remaining Qualification

The backup-branch implementation stops admission, reports readiness `not_ready`, stops pollers and closes idle HTTP connections. Admitted async HTTP handlers remain tracked even after a client disconnect. Detached render/transcription/reframe/subtitle/publishing jobs, sweeps, startup/bootstrap, maintenance and in-flight heartbeat callbacks have tracked lifetimes. Necessary children of work already admitted may finish during drain; new root work is rejected. Cleanup is inside the tracked lifetime.

A shared 10-second deadline covers HTTP close, tracked-work completion and MongoDB pool close. The pool closes only after HTTP and tracked work settle. Timeout or close failure is a nonzero exit, never a successful graceful-drain claim. No queued job is marked successful, reset or deleted merely because shutdown starts. A timed-out process can still leave expired leases or child processes for operational recovery.

Measured local evidence covers deferred synthetic jobs over a real loopback HTTP server and a real isolated Mongo transaction/client-close sequence. It does **not** qualify production signals, actual process termination/restart, FFmpeg child reaping, host stop grace periods, provider cancellation or interrupted imports/transcription. A real render may exceed the 10-second deadline. Before release, test the actual deployment's shutdown budget and restart/lease recovery under separately approved small resource bounds. Do not infer zero data loss or complete child cleanup from these component checks.

---

## 8. Emergency Production Deployment Rollback Runbook

### 8.1 Rollback Checks, Not Guarantees
- **Schema compatibility must be tested**: Check every migration, validator and persisted record format against the actual target revision. There is no blanket guarantee that an arbitrary application rollback is safe.
- **In-flight jobs need a version-aware plan**: Check worker leases, attempt paths, transaction support and queue retry limits before rollback. Do not assume the older worker can resume every newer record, and do not use an unreviewed bulk reset.

### 8.2 Rollback Steps
1. **Frontend Rollback**:
   - In Vercel or Cloudflare Pages, instantly promote the previous successful deployment to Production via the dashboard or CLI:
     ```bash
     vercel rollback [PREVIOUS_DEPLOYMENT_URL]
     ```
2. **Backend API Rollback**:
   - Roll back container image to the prior stable release tag on ECS / Railway / Render.
   - Run liveness & readiness probes:
     ```bash
     curl -i https://api.vireoclip.com/ready
     ```
3. **Database Sanity Check**:
   - If emergency restore is required due to data corruption, use `mongorestore` with PITR targeting the timestamp immediately before deployment.

