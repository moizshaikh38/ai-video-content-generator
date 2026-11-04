# VireoClip Clipping Engine — Production Audit

**Date:** 2026-10-24 · **Mode:** Read-only audit (no source, test, config, or data modifications)
**Repo state at audit time:** branch `fix/youtube-url-ingestion-player-client`, 8 modified + 2 untracked files (pre-existing uncommitted New-Project UI work — preserved untouched).

---

## 1. Executive Summary

VireoClip has a genuinely deep pipeline — word-timestamp Whisper transcription, LLM-driven clip discovery with genre rubrics, OpenCV-based active-speaker reframing, a 23-preset caption system with a single source of truth, a hardened SSRF-validated URL ingestion path, and a Mongo-backed render job model with atomic leases, heartbeats, and exponential-backoff retries. The word-boundary snapping engine (150 ms guard, whole-word priority) is real, tested, and correct as coded. A targeted 48-test subset of the pipeline suites passes, including real synthetic-media FFmpeg renders.

It is **not production-ready** for four reasons, all confirmed in code:

1. **The render-job recovery sweep is never started in production.** `ClipRenderService.processDueRenderJobs()` is invoked only by a test file. Transient-failed jobs scheduled for retry and jobs stuck in `processing` after a restart are never recovered. Renders execute inline in the web-server process.
2. **The Pro Editor render path and the Quick Clip render path disagree on framing.** Pro render applies a static center crop from canvas aspect ratio only; Quick render applies per-clip `crop_config` and smart-reframe tracks.
3. **A live data-integrity bug corrupts caption tracks** through the normal *split → ripple-delete* edit sequence.
4. **Trust issues in scoring display:** the frontend hardcodes a fallback "94 Viral" score when a clip has none, and the hybrid engagement score is composed of five LLM-claimed subscores never validated against outcome data.

Additionally, one **security gap**: editor project updates accept arbitrary `item.source_path` values, which the render compiler then `fetch()`es server-side (SSRF) and uses as local file inputs.

None of these require new infrastructure to fix. The remediation roadmap (`CLIPPING_ENGINE_IMPLEMENTATION_ROADMAP.md`) sequences them into verifiable phases.

---

## 2. Competitive Research Matrix

Sources: [opus.pro](https://www.opus.pro/), [Opus Clip workflow tutorial (Greg Preece, 2026)](https://gregpreece.com/articles/opus-clip-tutorial), [Opus Clip intro docs](https://help.opus.pro/docs/article/introduction-to-opusclip), [riverside.com/magic-clips](https://riverside.com/magic-clips), [Riverside Magic Clips review 2026](https://blitzcutai.com/blog/riverside-magic-clips-review-2026), [docs.vizard.ai](https://docs.vizard.ai/docs/introduction), Vizard/Opus comparisons ([Coursiv](https://coursiv.io/blog/opus-clip-alternatives), [Choppity](https://www.choppity.com/blog/best-opus-clip-alternatives)). Descript pages returned 403 during the audit window; Descript row is marked as inference from public positioning, not verified docs.

| Capability | Competitor evidence | VireoClip current state | Evidence level | Gap | Proposed benchmark | Priority |
|---|---|---|---|---|---|---|
| AI clip discovery | Opus: paste link/upload → pick clip length → generate; results ranked by virality score (tutorial verified). Riverside: AI picks "share-worthy" moments using keyword relevance, sentiment, speaker energy (vendor + review claims). | LLM candidate discovery via `ClipPromptService` + genre rubrics; 5 subscores → hybrid `engagement_score` (`clipAnalysisService.ts:346-362`); adaptive count + overlap dedup (426-481) | Verified (code) vs vendor-claimed (competitors) | No measured selection-quality evidence on either side; Vireo score unvalidated | Human-rated Precision@K / completeness vs reference moments on consented corpus | High |
| Natural-language / prompt selection | Opus "ClipAnything" prompt-based clipping (official docs) | `customInstructions` + `topicKeywords` flow into notes/prompt | Verified | Comparable in shape; untested for adherence | Prompt-adherence rate on fixture set | Medium |
| Virality scoring honesty | Opus presents virality scores ranked (tutorial); validation method undocumented | Frontend **hardcodes `engagement_score \|\| 94`** (`src/pages/HistoryPage.tsx:393`); score is 5 LLM-claimed subscores + duration heuristic | Confirmed (code) | Fabricated fallback score; unvalidated prediction | Remove fallback; label as internal ranking until outcome-validated | High |
| Speaker-aware reframing | Riverside "Active Speaker View" keeps speaker centered (vendor). Opus "ReframeAnything" AI object tracking (vendor). | Quick path: OpenCV Haar frontal+profile detection, mouth-ROI motion score, IoU NMS, scene-cut partitioning, hysteresis, ≤45 keyframes, velocity track association (`server/python/smart_reframe.py`, tests 13/13.1 pass incl. real FFmpeg) | Verified (code + passing tests) | **Pro render path ignores all of it** (static crop, `proEditorService.ts:652`) | Crop-bound violation rate, subject cut-off rate, abrupt-switch rate | High |
| Captions | Vizard: accurate transcripts + customizable subtitles (docs). Opus: animated captions + emoji, style templates (docs/tutorial) | 23 shared presets, single source of truth (`src/lib/captionPresets.ts` re-exports `server/src/shared/captionPresets.ts`), ASS sanitization (`captionService.ts:77-84`), word-pop karaoke timing | Verified | Parity risk low (shared module); emoji/keyword effects weaker than Opus | Caption timing error (ms), preview/export pixel parity | Medium |
| Transcript-based editing | Descript: edit video by editing transcript; filler removal (public positioning — inference) | Pro editor timeline w/ split/ripple/duplicate; transcript word-level data present | Verified (code) | Ripple-delete caption-branch bug (below); no filler removal | Edit-operation integrity suite | High |
| Duration/aspect controls | Vizard: set clip durations + aspect ratios (docs). Opus: <30s / 30–60s length picker (tutorial) | 4 duration bands, 9:16/1:1/16:9 (+4:5) with platform hints; enforced in analysis + render | Verified | None material | — | Low |
| Job reliability | Industry: durable queue, leases, retries, dead-letter (Azure reliability maturity model) | Mongo `render_jobs` with **atomic lease + heartbeat + stale-lease takeover + backoff-with-jitter retry classification** — but the sweep/worker that drives retries is **never started in production** | Confirmed (code) | Scheduler wiring, not design | Crash-recovery drill: kill mid-render → job recovered ≤15 min | Critical |
| Publishing | Opus/Vizard one-click multi-platform publish | Publishing worker IS production-wired (`index.ts:137`) + autopilot with human approval gate | Verified | — | — | Low |

**Feasible differentiators on the existing stack:** (1) explainable per-clip "why this clip" evidence (already partially present in candidate metadata); (2) genre-specific editorial rubrics (already implemented — competitors market blander equivalents); (3) honest scoring (drop fabricated fallbacks before competitors' marketing gets fact-checked). External paid dependencies today: OpenRouter/Groq Whisper transcription and the LLM provider for analysis.

---

## 3. Architecture & End-to-End Call Flow (as built)

```
Upload:  POST /projects (createProjectAsync) → browser PUTs to R2 presigned URL
         (/projects/:id/upload-url) → /projects/:id/confirm-upload → status 'uploaded'
URL:     POST /projects/ingest-url → UrlValidator (protocol, YouTube parse, platform
         denylist, SSRF DNS/IP) → yt-dlp (YouTube) or manual-redirect fetch with
         per-hop SSRF revalidation + streamed byte cap → ffprobe → R2 upload →
         project 'uploaded'   [urlIngestionService.ts:912-1097]
Processing: POST /projects/:id/process → audio extraction (16 kHz mono WAV,
         aresample=async=1:first_pts=0) → Whisper large-v3-turbo via OpenRouter
         (Groq fallback) with word+segment timestamps → LLM clip discovery
         (ClipPromptService, genre-normalized) → boundary refinement
         (150 ms whole-word-priority snapping) → candidates persisted
Render:  POST /clips/:id/render → render_jobs row (atomic lease, worker_id,
         heartbeat, attempts/max 3) → inline fire-and-forget renderClipJob →
         FFmpeg (execFile array args): trim/crop/captions(ASS)/audio → R2 → 'ready'
Pro Edit: editor_projects (multi-track) → compileRenderGraph → FFmpeg RenderGraph V2
Publishing: startPublishingWorker() (15 s poll) — the ONLY pipeline worker that
         production actually starts. Human approval gate preserved (autopilot).
```

**File/function inventory (core):** `urlIngestionService.ts` (validate/download/probe/ingest), `audioExtractionService.ts` (extract+probe), `transcription/openRouterTranscriptionProvider.ts` + `groqTranscriptionProvider.ts`, `clipAnalysisService.ts` (LLM discovery, scoring, dedup, boundary refine), `wordSnappingUtils.ts` (snap guard), `smartReframeService.ts` + `python/smart_reframe.py` (faces/mouth/scene), `captionService.ts` (ASS build, sanitize, presets), `clipRenderService.ts` (quick render, job model, leases, `processDueRenderJobs`), `proEditorService.ts` (editor CRUD, split/ripple/duplicate, compileRenderGraph), `publishing/publishingWorker.ts`, `index.ts` (startup).

---

## 4. Severity-Ranked Findings

Confidence: **[C]** Confirmed (code evidence inspected this audit) · **[S]** Strongly suspected · **[U]** Unverified.

### Critical

**C-1. Render-job recovery sweep not wired into production. [C]**
- `ClipRenderService.processDueRenderJobs()` — defined `clipRenderService.ts:975`; the only caller repo-wide is `server/src/tests/phase37QueueReliability.test.ts`. Production startup (`server/src/index.ts:80-138`) starts exactly: usage-reservation cleanup (10 min), OAuth-state cleanup (15 min), publishing worker. No render scheduler.
- Effect: jobs requeued with `nextRetryAt` after transient failure (`clipRenderService.ts:850-868`, backoff `base 2 s / max 30 s / jitter`) are **never retried**; jobs stuck `processing` after a crash stay stuck (stale-lease takeover at `:982-1011` never runs); renders execute inline in the web process (fire-and-forget at `:187`), so CPU-bound FFmpeg competes with API latency and platform deploys kill in-flight renders.
- User impact: "Generating…" forever after any transient failure or restart.

### High

**H-1. Pro Editor render ignores per-item crop/reframe (static center crop). [C]**
- `proEditorService.ts:652` `buildCropFilter(project.canvas.aspect_ratio || '9:16')` applied identically to every slice (`:687`, `:701`). Quick path uses `clip.crop_config` + smart-reframe track with focus fallbacks (`clipRenderService.ts:439-521`).
- Effect: a clip that looks correctly framed in Quick render/export loses speaker framing when re-rendered from the Pro editor — two products disagree about the same asset.

**H-2. Ripple-delete corrupts multi-item caption tracks. [C]**
- `proEditorService.ts:372-410` (CAPTION branch): shifts `timeline_end -= duration` for **every** caption item with no `timeline_start >= deletePoint` guard — the non-caption branch (`:411-418`) has the guard — and never shifts `timeline_start`. Cue-cut logic itself is correct per item, but item bounds diverge from cue times, and items *before* the delete point lose duration.
- Reachable via the normal sequence *split caption item → ripple-delete any item*, because split creates the second caption item (`:297-338`).
- Note: the previously reported *split-duplication* bug is **fixed** in current code — `partitionCaptionCues` correctly partitions cues into left/right slices (`:301-306`); keyframes are correctly rebased for the right slice (`:319-325`).

**H-3. Unvalidated `source_path` in editor projects → SSRF + local-file input surface. [C]**
- `updateEditorProject` (`proEditorService.ts:183-257`) validates limits/fonts/transitions/styles but not `item.source_path`; client tracks are persisted verbatim (`:250`).
- `compileRenderGraph` then: `fetch(item.source_path)` server-side for http(s) overlays (`:598`, no `UrlValidator` — contrast the hardened ingestion path) and treats local paths as FFmpeg inputs after `fs.existsSync` (`:787-802`, `:961`).
- Effect: an authenticated user can make the server fetch arbitrary URLs (internal metadata endpoints included) and reference arbitrary local files as render inputs. Cross-tenant readout of another user's cached media in `/tmp/vireo-source-cache` is theoretically possible if a cache path is known (hash of R2 key — low practical likelihood, unsound pattern).
- Also brittle, lower-severity: overlay extension sniffing by substring (`:588-595`, `:788`).

**H-4. Virality score presentation is partly fabricated. [C]**
- `src/pages/HistoryPage.tsx:393` `const viralityScore = (clip as any).engagement_score || 94;` — clips without scores display "94 Viral".
- Score itself (`clipAnalysisService.ts:346-362`) = clamped LLM subscores (hook/standalone/insight/emotion/platform) + duration heuristic (`:71-87`); defaults of 70 injected when LLM omits subscores (`:568-572`). It is an internal ranking signal, not an engagement prediction; it must not be labeled/presented as one until validated.

### Medium

**M-1. No post-render output validation. [C]** `clipRenderService.ts` never probes the rendered file (no ffprobe of output; success = exit code 0 + upload). Zero-byte/corrupt outputs would be marked `ready`. (Ingestion-side probing exists; render-side does not.)

**M-2. Pro compile applies first-item-only styling. [C]** Color/filter/effects and keyframe zoom come from `allVideoItems[0]` only (`proEditorService.ts:705-762`); later items' effects silently ignored; punch-in duration hardcoded 2.5 s (`:757`).

**M-3. `duplicateItem` does not rebase caption cue times. [S]** Cues on caption tracks are timeline-absolute (see split/ripple logic), but `duplicateItem` (`:437-472`) deep-copies the caption verbatim while placing the copy at a new timeline position. Verify cue-time semantics; if absolute, copied cues render at the original position.

**M-4. Single-vendor transcription dependency. [C]** OpenRouter Whisper large-v3-turbo primary, Groq fallback (`transcription/`), both paid external APIs; no local fallback; cost/availability risk at scale.

**M-5. `aresample=async=1:first_pts=0` pads leading audio gaps with silence. [C — known, documented]** `audioExtractionService.ts:30` (comment), `:188` (use). The prior investigation's conclusion stands: no global caption offset compensation is justified; keep behavior, keep it documented, treat any timing complaint with per-case diagnosis.

**M-6. Smart-reframe Python resolution is fragile. [C]** Path probing includes `/tmp/test_venv/bin/python` (`smartReframeService.ts:1048-1058`); graceful `fallback_center` exists, but a prod host without a venv silently degrades all reframing without alerting.

### Low

**L-1.** Server/client `editorRippleCut.ts` duplicates (113 diff lines, mostly type imports) — dual-maintenance drift risk. **[C]**
**L-2.** Non-production CORS allows any origin containing the substring "localhost" (`index.ts:47`). **[C]**
**L-3.** Parked bug `getClipDownloadUrl` (`clipController.ts:596-625`): currently delegates to `ClipRenderService.getSignedDownloadUrl` which enforces ownership via `getClip(clipId, userId)` (`clipRenderService.ts:1119-1126`). Left untouched per instructions.
**L-4.** Editor resource limits exist (`EDITOR_RESOURCE_LIMITS`) but no per-user concurrent-render cap beyond `expensiveLimiter` 15/min (`rateLimiter.ts:51-61`). **[C]**

### Confirmed strengths (for balance)

- SSRF defense is thorough: reserved-range IPv4/IPv6 (incl. CGNAT, metadata 169.254, IPv4-mapped), DNS resolution of all addresses, local-hostname denylist (`urlValidator.ts:32-157`); download follows redirects **manually with per-hop SSRF revalidation**, content-length precheck, streamed byte cap with backpressure (`urlIngestionService.ts:177-330`).
- No shell injection found: all FFmpeg/ffprobe/yt-dlp invocations use `execFile` with argument arrays (`audioExtractionService.ts:67`, `clipRenderService.ts:634,677`, `proEditorService.ts:568`) with timeouts.
- ASS caption text sanitization strips override tags/newlines (`captionService.ts:77-84`), applied on every text path (`:701,1059,1098-1120`).
- Caption presets: single source of truth (frontend re-exports server module) — preview/export parity by construction.
- Word-boundary snapping: 150 ms max adjustment, whole-word priority, pre/post-roll padding, duration clamps (`clipAnalysisService.ts:95-191`) — matches its tests.
- Render job model: atomic lease acquisition with stale cutoff 15 min, worker_id, heartbeat renewal, transient/permanent classification, backoff-with-jitter (`clipRenderService.ts:319-400, 844-885`).
- Ownership checks consistent across clip/project/editor controllers (`ownerContext` / `eq('user_id', userId)`).

---

## 5. Tests: What Was Actually Executed

Command (safe, no-DB, no-network subset selected after inspecting imports; DB-mutating suites like `phase37QueueReliability` were **not** run per audit rules):

```
cd server && npx tsx --test --test-concurrency=1 \
  src/tests/captionSplitAndExportIntegrity.test.ts \
  src/tests/p0RippleCutAndRender.test.ts \
  src/tests/phase12_5CaptionTiming.test.ts \
  src/tests/captionAudioSync.test.ts \
  src/tests/phase13SmartReframe.test.ts \
  src/tests/phase13_1ShotAwareReframe.test.ts
```

**Result: 48 tests / 48 pass / 0 fail** (duration ≈ 5.2 s), including real synthetic-media FFmpeg renders (dynamic piecewise crop expression; hard-cut filter render) and shot-aware reframe behaviors (active-speaker selection, hysteresis, track association, ≤45 keyframe cap).

**Coverage classification of the wider suite (106 files, inspected not executed):** mixed — a large fraction are **static source-assertion tests** (read source files and assert on code content — they verify that code *contains* patterns, not that it *behaves*); a minority are genuine unit/synthetic-media tests like the six above; DB-backed integration suites exist (`phase37*`); real-media E2E exists only as **scripts** (`src/scripts/real_youtube_e2e_test.ts`) excluded from the test glob and not run. The ripple-caption bug (H-2) is not covered by any executed test — the passing ripple tests evidently exercise single-item caption tracks only.

---

## 6. Benchmark Methodology (designed, not yet run — see Roadmap Phase 5)

Corpus: 12+ consented/synthetic sources covering single-speaker podcast, two-person interview, multi-speaker panel, tutorial, high-energy commentary, quiet conversation, noisy audio, moving subject, scene cuts/profile faces, missing audio, VFR/rotated, and short/long durations. Each with human-reviewed reference moments (≥2 raters, report agreement). Metrics: Precision@K/Recall@K vs references; human-rated completeness/hook-payoff; mid-word/mid-sentence start-end rate; caption timing error vs word timestamps (ms); crop-bound violations and subject cut-off rate; render success/retry/duplicate rates; p50/p95 latency and ×realtime; peak mem/CPU/disk; cost per media-minute (compute vs storage vs external AI). Baselines and confidence intervals required before any "better than X" claim. **No benchmark numbers exist today; none are claimed.**

---

## 7. Production-Readiness Gate (current status)

| Criterion | Status |
|---|---|
| No unresolved critical correctness/security findings | **FAIL** (C-1, H-2, H-3) |
| Timing integrity source→transcript→clip→output | Partially verified (snap tests pass); end-to-end A/V offset on real media **NOT VERIFIED** |
| Valid decodable output with expected streams/duration/aspect | **NOT VERIFIED** (no render output validation, M-1) |
| Captions/audio/crop aligned across edit ops | **FAIL** (H-2; M-3 suspected) |
| Jobs recover from failures/restarts | **FAIL** (C-1) |
| No duplicate final outputs per idempotent job | Leases exist; duplicate-output on retry-after-partial-upload **NOT VERIFIED** |
| Ownership/authorization enforced | Mostly pass (H-3 exception for render inputs) |
| Resource limits & cleanup verified | Partial (ingestion caps pass; temp cleanup present; render concurrency **NOT VERIFIED**) |
| Measured performance/cost on representative media | **NOT VERIFIED** |
| Regression + E2E fixtures passing | Subset passes; full DB suite not run this audit |
| Monitoring & actionable failure diagnostics | Structured errors + codes exist; render-job dashboards/alerts **NOT VERIFIED** |

---

## 8. Unresolved Questions / Human Decisions

1. Should render execution move out of the web process (bounded in-process pool vs separate worker dyno)? Design exists (leases) — only wiring + placement needed.
2. Is the Pro editor's static crop an intentional simplification or a defect? (Assumed defect in roadmap.)
3. Score presentation: hide scores entirely, or label "internal ranking" until validated? (Roadmap removes the `|| 94` fallback regardless.)
4. Approve running the DB-backed test suites (mutates the configured Mongo with disposable UUID rows) and, later, real-media E2E scripts (network + yt-dlp + paid transcription) — both intentionally not run in this audit.
5. Retention/deletion policy for source media and derived artifacts (currently: project delete removes records; storage-object lifecycle **NOT VERIFIED**).
