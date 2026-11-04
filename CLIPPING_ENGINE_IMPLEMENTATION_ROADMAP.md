# VireoClip Clipping Engine — Implementation Roadmap

Companion to `CLIPPING_ENGINE_PRODUCTION_AUDIT.md` (findings C-1, H-1..H-4, M-1..M-6 referenced below).
Ordering principle: **stop silent data corruption and stuck jobs before quality work**; every phase is independently verifiable and revertible. No new infrastructure, paid APIs, or dependencies are introduced.

---

## Phase 1 — Data-integrity fixes in the editor (highest value, smallest diff)

**Scope**
- Fix `rippleDelete` CAPTION branch (`server/src/services/proEditorService.ts:372-410`): apply the same `timeline_start >= deletePoint` guard the video branch uses (`:411-418`); shift both `timeline_start` and `timeline_end` for caption items after the delete point; leave items entirely before it untouched; keep the existing per-cue cut/shift logic.
- Fix `duplicateItem` (`:437-472`): if caption cues are timeline-absolute (verify first), rebase copied cue times (and word times) by the placement offset; add a regression test that catches the semantic either way.
- Remove the fabricated score fallback: `src/pages/HistoryPage.tsx:393` — render the score badge only when `engagement_score` exists; add an explicit "Unranked" state.
- Relabel any user-facing "virality" copy to "AI ranking" until outcome validation exists.

**Files:** `proEditorService.ts`, `HistoryPage.tsx`, new tests in `server/src/tests/`.
**Dependencies:** none. **Risks:** low; editor projects already persisted with corrupt bounds must be re-derivable — fix computes from current state, no migration needed.
**Tests to write:** split → ripple-delete with caption items before/after cut; duplicate caption item cue positions; HistoryPage unranked state.
**Test command:** `cd server && npx tsx --test src/tests/p0RippleCutAndRender.test.ts <new tests>`; frontend build `npm run build:frontend`.
**Rollback:** revert single commit.
**Acceptance:** new tests fail on old code, pass on new; existing 48-test subset stays green; no UI shows a score for score-less clips.

## Phase 2 — Render-path parity and output validation

**Scope**
- Pro render per-item framing: in `compileRenderGraph` (`proEditorService.ts:652-703`), build the crop filter per video item from `item.crop_config ?? smart-reframe track ?? center` — mirroring the Quick path decision order (`clipRenderService.ts:439-521`). Keep canvas aspect ratio as the fallback, not the driver.
- Per-item styling: evaluate applying color/filter/effect chains per slice instead of first-item-only (`:705-762`); at minimum, document the limitation in-product if intentional.
- Post-render output gate: after FFmpeg success in `clipRenderService.ts` render flow, run ffprobe on the output; require: has video stream, has audio stream (when source had audio), duration within ±0.5 s of expected, size > 0. Fail the job (non-transient) otherwise. Reuse `probeVideoFile` pattern from `audioExtractionService.ts`.
- Idempotency hardening: on retry, overwrite-not-duplicate the R2 output key (verify current key derivation; add test).

**Files:** `proEditorService.ts`, `clipRenderService.ts`, tests.
**Dependencies:** Phase 1 (test fixtures for corrupt-bounds replay optional). **Risks:** changing Pro crop changes existing exports' framing — intended, but ship behind a project-version check if a staged rollout is wanted.
**Tests:** parity test Quick-vs-Pro on a synthetic clip with a reframe track; probe-gate unit tests with a deliberately corrupt output file.
**Rollback:** feature-flag per change; each is an isolated commit.
**Acceptance:** Pro and Quick renders of the same clip produce equivalent crop decisions (assertable on filter strings + rendered output); a corrupt/zero-byte output can never reach `render_status='ready'`.

## Phase 3 — Production job recovery (wire what already exists)

**Scope**
- Start a render sweep in `server/src/index.ts` (alongside the existing timers): interval ≤60 s calling `ClipRenderService.processDueRenderJobs()` with overlap protection (skip if previous tick still running), plus an immediate call after Mongo bootstrap to recover crash-stranded jobs.
- Bound inline rendering: cap concurrent `renderClipJob` executions per process (small semaphore, e.g. 2×CPU) and let the sweep pick up overflow instead of running unbounded fire-and-forget (`clipRenderService.ts:187`).
- Observability: log + counters for jobs retried, recovered-stale, and permanent-failed per sweep; surface stuck-queue count on `/ready` (existing `checkReadiness`).

**Files:** `index.ts`, `clipRenderService.ts`, `healthController.ts`.
**Dependencies:** none (Phase 2's output gate makes retries safe against corrupt outputs). **Risks:** double-processing — already mitigated by atomic leases (`clipRenderService.ts:354-361`); verify sweep's `findOne` claim uses the same atomic acquisition.
**Tests:** DB-backed suite `phase37QueueReliability.test.ts` (requires approval — mutates configured Mongo with disposable rows); crash drill: start render, SIGKILL server, restart, assert recovery ≤15 min stale cutoff.
**Rollback:** disable the interval; inline path unchanged.
**Acceptance:** transient-failed job retries with backoff without user action; restart mid-render recovers; `/ready` reflects queue depth.

## Phase 4 — Editor input security

**Scope**
- Validate `item.source_path` in `updateEditorProject` (`proEditorService.ts:183-257`): allow only (a) R2-derived paths/keys owned by the user's projects, or (b) https URLs that pass `UrlValidator.checkSsrf` **and** an allowlist of asset hosts (own storage domain, approved sticker/element providers). Reject everything else with a classified 400.
- Replace the server-side `fetch(item.source_path)` (`:598`) with the same validated path (and keep redirects off / revalidated as in ingestion).
- Drop substring-based extension sniffing (`:588-595`, `:788`) in favor of URL/MIME parsing.
- Optional hardening: constrain local overlay reads to a dedicated overlay tmp subdir.

**Files:** `proEditorService.ts`, possibly `urlValidator.ts` (reuse only).
**Dependencies:** none. **Risks:** rejecting previously-accepted projects — run a read-only scan of stored editor_projects for source_path shapes before enforcing (script, read-only).
**Tests:** unit tests for the validator; negative tests (localhost URL, `file://`, `/etc/passwd`, another user's R2 key).
**Acceptance:** no unvalidated URL fetch or arbitrary local path can reach `compileRenderGraph`; existing legitimate overlay flows (server-supplied asset paths) still pass.

## Phase 5 — Selection-quality benchmark & honest scoring

**Scope**
- Build the consented/synthetic corpus + reference labels per audit §6 (start with 6 synthetic fixtures: podcast, interview, tutorial, noisy, scene-cuts, quiet — generator scripts already partially exist in the test suite).
- Metrics harness: mid-word/mid-sentence rate (automatable from word timestamps vs final boundaries — cheap, run first), Precision@K vs references, human-rated completeness (2 raters, report agreement).
- Score calibration: correlation of `engagement_score` subscores with human ratings on the corpus; keep or demote subscores accordingly; keep presentation as internal ranking.

**Files:** new `server/src/tests/benchmarks/` fixtures + a runner script; no product code changes required for the first milestone.
**Dependencies:** Phases 1-3 (so results aren't confounded by broken jobs). **Risks:** time-heavy human rating — schedule, don't block.
**Acceptance:** reproducible `npm run bench:selection` emitting a JSON report; VireoClip's first real quality numbers with confidence intervals.

## Phase 6 — Reliability of the senses (transcription & reframe robustness)

**Scope**
- Provider failover test OpenRouter → Groq → hard-fail-with-classified-error (both providers exist; verify failover path actually triggers, add test with mocked 5xx).
- Python/reframe availability: startup capability check with a one-time logged warning + `/ready` degradation flag when no OpenCV runtime is found (`smartReframeService.ts:1048-1058`); remove `/tmp/test_venv` from prod probing.
- Cleanup audit: verify overlay tmp files and render temps are removed on failure paths (survey `finally` blocks; add tests where absent).

**Acceptance:** capability degradation is visible in ops, not silent; failover verified by test.

## Phase 7 — Real-media acceptance & release gate

**Scope**
- With explicit approval: run `real_youtube_e2e` scripts against a consented video; measure end-to-end timing accuracy (source vs transcript vs output audio offset) and cost per minute; execute the full DB-backed suite.
- Publish the gate table (audit §7) with evidence links; anything unevidenced stays **NOT VERIFIED**.

---

### Suggested sequencing

Phase 1 (days) → Phase 3 (small, unblocks reliability) → Phase 4 (small, closes security) → Phase 2 (parity + validation) → Phase 5 (benchmark) → 6 → 7.
Phases 1, 3, 4 are each small enough to ship independently this week; Phase 2 is the largest engineering effort; Phase 5 needs human-rater scheduling.
