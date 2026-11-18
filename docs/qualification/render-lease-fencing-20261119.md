# Render lease and output fencing, 2026-11-19

## Defect and correction

The prior renderer checked a worker token during some stage writes, but its catch path could requeue/fail a job by ID alone and mark its clip failed after losing the lease. Its success path wrote clip-ready separately from job-completed and ignored the final job write's match count. Both competing attempts also uploaded to the same per-version object key. Database token checks alone could not protect the winning video's bytes from a late old upload.

New local engineering behavior:

- Each acquired execution gets a UUID output path under the existing owner/project/clip/version prefix: `vN/attempts/{uuid}/render.mp4`. Different attempts cannot target each other's path. The old key helper remains for legacy objects; no existing object was renamed or deleted.
- Terminal success, failure, retry and stage transitions use a MongoDB snapshot transaction with majority write concern. The job write must match job, clip, owner, worker token and processing state. Clip and job writes commit together or neither commits. There is no unguarded/nontransactional fallback.
- Original render/editor version numbers are checked in the transaction. An older outcome cannot replace a newer clip edit/revision. Failure of an old version can finalize only its own still-owned job while preserving the newer clip.
- All actual renderer stage calls carry the worker token and original version numbers, including caption preparation and automatic-analysis preparation. Progress writes require the worker token and processing state. Lease acquisition is also bound to owner and clip, not job ID alone.
- A fencing error skips failure publication entirely. A replacement worker's job/clip are not reset by the losing worker's catch.
- Retry clip state is queued when the job is queued, rather than simultaneously claiming a failed clip and a queued job.

## Qualification performed

33 focused Node checks passed across render lease commits, existing render parity/wiring and startup recovery wiring. Server TypeScript completed with exit 0. Fake-session tests include rollback, wrong owner, late failure/completion, transaction retry ownership re-evaluation and input-version changes. A storage Map demonstrates distinct paths but is not a real object-store qualification.

### Actual MongoDB, not a mock

Only the new database `vireo_render_fence_20261119_0006` on the existing loopback MongoDB 7.0.16 replica set `homeproof` was used. No existing data collections were read or changed. The database was required to be empty before setup. No collections/documents were deleted or dropped. Final retained fixtures: 10 jobs and 9 clips.

Seven real transaction scenarios passed:

1. Job and clip publish together.
2. A stale worker cannot fail the replacement worker's clip or reset its job.
3. A wrong owner cannot commit.
4. A real MongoDB schema validation error on the clip write rolls back the earlier job write.
5. A missing clip rolls back the job write.
6. A newer editor version rejects old completion; recording old failure preserves the newer clip.
7. Two simultaneous real transactions have exactly one winner. The loser re-evaluates ownership and raises fencing mismatch. The resulting job-completed/clip-ready pair is consistent.

Three additional calls through the actual `ClipRenderService.updateJobStage` method passed against that same isolated database: atomic normal stage update, stale-token rejection, and rollback after a newer editor revision. These are real service/database calls, not merely source-text assertions, but they do not run `renderClipJob` or encode/upload media.

First real transaction group: 0.50 seconds, peak shared memory 1,352,056,832 bytes. Actual-service stage group: 0.75 seconds, peak 1,392,590,848 bytes. Evidence output remained under 4 KiB and free disk remained above 399 MiB. Each group ran under a 15-second/20-MiB work guard and a 350-MiB free-disk floor. Existing database storage is outside that work-directory accounting; the document count was bounded separately to 19 small records.

Reproduction scripts are in `server/scripts/local-qualification/render-fence-real-mongo.mts` and `render-fence-real-stage.mts`. They intentionally refuse unexpected/reused fixture state. Evidence JSON and logs are retained locally, not part of a user-data backup.

## Compatibility and operational consequences before release

Existing preview/download methods sign the stored `output_storage_path`; they do not reconstruct the old per-version key. Existing objects therefore remain readable by their unchanged stored paths. Prefix-based clip cleanup still covers both formats. This is code-path inspection, not production download proof.

Attempt isolation can leave unreferenced attempt objects after failed uploads, interrupted transactions or losing workers. This uses more storage than overwriting one shared key. No garbage collection, lifecycle change, deletion or retention policy was added. Such a policy needs its own review and permission.

A replica set or mongos with transaction support is required. Transaction unavailability fails closed and leaves the lease for recovery rather than publishing half a result. Deployment configuration and topology remain unverified. The readiness endpoint currently checks configuration/DB reachability, not this entire storage/auth/provider/transaction workflow.

## Still open

No production database, real R2 bucket, ordinary render-job HTTP workflow, process-kill/restart or actual storage-fault E2E was exercised in this qualification. Attempt keys isolate paths; write-once enforcement at the storage API and provider behavior remain separate checks. Poster objects have their own older per-version path and are not covered by the render-output atomic transaction. Cross-system database/object-store atomicity is not claimed.

Queue retry-budget/stale-exhausted edge cases and graceful child-process drain need further work. The existing runbook's zero-data-loss statements were not evidence. This correction is backup engineering, not permission to merge, deploy, alter live data or call the product production-ready.
