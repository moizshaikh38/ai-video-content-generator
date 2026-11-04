# VireoClip Genre Intelligence — Upgrade Roadmap

Companion to `GENRE_INTELLIGENCE_AUDIT.md` (findings F1–F7). Ordering rationale: **stop presenting fabricated scores and activate the machinery already built before inventing anything new**; measure before adding model complexity. No paid services, new models, or dependencies without explicit approval.

---

## Phase 0 — Reproducible baseline & benchmark fixtures (prerequisite for every quality claim)

**Scope**
- Fixture corpus per audit §9: consented/synthetic sources across all 11 genres + at least one low-dialogue source; each with human-reviewed reference moments (≥2 raters, report agreement), acceptable boundary ranges, and recorded source characteristics. Separate dev/tuning vs holdout sets.
- Metric harness (`server/src/tests/benchmarks/` runner, no product-code changes): mid-word/mid-sentence rate (fully automatable from word timestamps — build first), Precision@K/Recall@K vs references, truncation/dead-air rate, redundancy rate, boundary error, rank agreement (Spearman) vs human ranking, p50/p95 latency, LLM tokens & cost per media-minute.
- Pin model versions (provider + model id) and record them in every benchmark output.

**Files:** new test/benchmark dir; fixture generator scripts reusing existing synthetic-media patterns from the reframe tests.
**Deps:** none. **Risks:** human-rating scheduling; keep initial corpus small (2 sources/genre).
**Acceptance:** `npm run bench:selection` (or tsx equivalent) emits a JSON report with the automatable metrics; methodology documented; all subjective metrics marked NOT MEASURED until rated.
**Rollback:** additive only.

## Phase 1 — Correctness, honesty & consistency (small, ship immediately)

**Scope**
- **F2/F7 fix:** remove `?? 94` fallbacks (`src/components/clips/ClipWorkspace.tsx:652,1117`); render "Unranked" when no score; relabel `Viral` → `AI Rank` (mirror the HistoryPage fix).
- **F3 fix:** delete dead `computeHybridScore` + `filterWithAutoRelaxation` (or export for tests only with a comment pointing at `vireo_score`), eliminating the misdocumented scoring path.
- **F6 fix:** log + record a diagnostic when genre falls back to `general` (unknown/misspelled input) in `getGenreProfile`/`normalizePreferences`.
- **F7 fix:** align `genreSelectionMode` server default with UI (`'auto'`) or log when omitted — decide explicitly.
- Replace the silent `70` default for missing LLM subscores with null-skipping weight renormalization (a candidate scored on 4 of 5 dimensions should not inherit a fabricated mid score).

**Files:** `ClipWorkspace.tsx`, `clipAnalysisService.ts`, `genreIntelligenceService.ts`; tests in `phaseACGenreIntelligence.test.ts` pattern.
**Deps:** none. **Risks:** score distributions shift slightly (renormalization) — acceptable; communicated in changelog.
**Acceptance:** no UI path can display a fabricated score; no dead scoring functions; fallbacks logged; suite green + new tests for each fix.
**Rollback:** per-fix commits.

## Phase 2 — Activate the dormant multimodal brain (the single biggest capability unlock)

**Scope**
- **F1 fix:** wire multimodal timeline analysis into the standard processing flow — after transcription succeeds, kick off `startMultimodalAnalysis` as a background step (or gate `analyze-clips` to auto-run it when absent and source is local), respecting the existing render-concurrency cap and `expensiveLimiter`. Progressive enhancement: analysis must still work transcript-only if multimodal fails.
- **F4 fix:** feed the classifier its real signals — pass `audioPeakEnergyDb`, `visualMotionScore`, `audienceLaughterDetected` (laughter detection hook), `screenShareDetected` from the multimodal timeline into `classifyVideoGenreLocally` at the analysis-time call site.
- Cost guard: make auto-run configurable (`MULTIMODAL_AUTO=on/off`, default off in dev, decided per deployment); log per-project added latency/cost once measurable.

**Files:** `videoProcessingService.ts`, `clipAnalysisService.ts`, `multimodal/*`, `index.ts` (no new worker needed — reuse processing flow), config.
**Deps:** Phase 0 harness to quantify the lift. **Risks:** processing latency/cost increase (audio/scene analysis is local FFmpeg/OpenCV — compute, not paid APIs; verify); long-video multimodal runtime bounds.
**Acceptance:** with multimodal on: silence-snap active in scoreCandidate (assert `was_snapped` diagnostics populate), face/OCR bonuses observable, `[SCENE_CUT]/[HIGH_ACTIVITY]` markers present in the built prompt (unit-testable), laughter→comedy and screen-share→education classifier paths fire on fixtures; transcript-only fallback path still passes all existing tests.
**Rollback:** config flag off; behavior returns to today's.
**Benchmark gate:** report selection metrics with multimodal ON vs OFF on the Phase 0 corpus before making it default-on for all users.

## Phase 3 — Rubric & scoring quality (measurement-driven)

**Scope**
- Genre ablation study (audit Part 6 design): same source × {correct genre, plausible-wrong genre, no-genre/general, genre+custom-intent}; compare selection, rank, duration, boundary, diversity metrics. Requires approval for LLM runs (paid) — design first, run on approval.
- Calibrate scoring weights: correlate `vireo_score` + subscores with human ratings from Phase 0; adjust genre weights only where evidence supports it; publish dimension breakdown in UI (data already in `metadata.explanation`).
- Hardening from ablation findings: e.g., if wrong-genre barely changes output, strengthen rubric differentiation or demote that genre to a preset of `general`.

**Files:** `genreIntelligenceService.ts` (weights/rubrics), `clipPromptService.ts`, UI scorecard component.
**Deps:** Phases 0–2. **Risks:** overfitting to a small corpus — holdout set discipline.
**Acceptance:** ablation report with confidence intervals; any weight change cites its evidence line; scorecard shows per-dimension values with explanations.
**Rollback:** weights are data in the registry — revert per-genre.

## Phase 4 — Diversity & contextual completeness

**Scope**
- **F5 fix:** genre-aware diversity policy — replace flat 0.25 dedup + top-N slice with diversity-aware selection (e.g., MMR with a genre-tunable redundancy penalty; storytelling stricter than gaming). Include context-window evaluation: penalize candidates whose preceding segment contains a question/setup the clip answers without including it (podcast safeguard made mechanical, not just prompted).
- Clip-count policy per genre (optional, evidence-gated by Phase 3).

**Files:** `clipAnalysisService.ts` (selection), `wordSnappingUtils.ts` or new selection util + tests.
**Deps:** Phase 0 metrics (redundancy rate baseline). **Risks:** changing selection order changes user-visible results — ship behind the benchmark evidence.
**Acceptance:** redundancy rate drops on corpus without Recall@K loss; new unit tests for the selection util; ablation shows no regression in completeness.

## Phase 5 — Taxonomy evolution (only after Phase 3 evidence)

**Scope**
- Introduce the hierarchy where evidence justifies it: `contentFamily` (registry genre) + `format` (new optional field defaulting from `recommendedLayoutMode`) + existing `ContentGoal` as intent + creatorProfile audience. Backward compatible: absent fields resolve from genre profile.
- Registry changes driven by ablation: merge `product_marketing` into `business_finance` preset OR keep with demonstrated differentiation; add families the corpus proves unrepresentable (vlog/documentary/cooking — candidates for `general` + format first).

**Files:** types, registry, UI picker (progressive disclosure), normalization.
**Acceptance:** no breaking change to stored preferences (normalize handles absent new fields); UI shows family→format→intent without increasing first-run decisions (defaults visible, tuning hidden — matches the New Project page pattern).
**Rollback:** additive fields; defaulting preserves old behavior.

## Phase 6 — Boundary & cross-pipeline parity (genre-lens)

**Scope**
- Verify silence-snap (once active from Phase 2) composes correctly with the 150 ms word-snap and genre duration clamps across: chunked long transcripts (window-boundary candidates), cold-open insertion, editor split/ripple (prior roadmap Phase 1 fixed the known bug), and caption timing through export.
- Property tests: for every persisted candidate, boundaries lie on word boundaries (±snap diagnostics) and inside genre duration windows.

**Files:** `clipAnalysisService.ts`, `multimodalScoringService.ts`, tests.
**Acceptance:** property test suite green on fixtures incl. two-speaker and low-dialogue sources; no regression in the caption/reframe suites from the production-audit roadmap.

## Phase 7 — Performance, cost & regression validation

**Scope**
- Measure per-media-minute cost/latency split: transcription (paid), LLM analysis (paid), multimodal (compute), render (compute); genre-specific overhead (chunked long transcripts × concurrency 2).
- Load profile: 10-minute and 2-hour sources; retry/failure rates from render_jobs telemetry (wired in the prior roadmap's Phase 3).
- Release gate: all suites green (unit + synthetic-media + benchmark runner), no unresolved Critical/High from either audit, costs within approved budget.

**Acceptance:** published cost/latency table per genre and per media-minute; regression suite integrated into CI-safe runner (no network by default; paid runs behind explicit flag).

---

### Sequencing summary

Phase 1 (days, zero risk) → Phase 0 (fixtures + automatable metrics, parallel) → Phase 2 (capability unlock, evidence-gated default) → Phase 3 (measurement-driven quality) → Phases 4–5 (evidence-justified selection/taxonomy) → 6–7 (parity hardening + release gate).
