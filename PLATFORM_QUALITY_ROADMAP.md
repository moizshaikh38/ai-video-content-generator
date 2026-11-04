# VireoClip Platform Quality Roadmap

Companion to `PLATFORM_QUALITY_AUDIT.md`. Ordering principle: **stop shipping videos that differ from the preview before adding new capabilities** (E-1/E-2 are user-facing honesty bugs), then close the two gaps where competitors are publicly ahead, then run the settle experiments. No paid APIs without approval.

---

## Phase E1 — Editor renders what it previews (highest priority)

**Scope**
- **Transitions (E-1):** implement `xfade` in `compileRenderGraph` for the validated `EDITOR_TRANSITION_TYPES` (cut/fade/dip-to-black/slide/wipe as registered) across the concat chain — or, if a type is out of scope, reject it at save time so the UI never offers an unrenderable transition. Crossfade audio (`acrossfade`) where both sides have audio.
- **Speed (E-2):** apply `setpts=PTS/{speed}` + `atempo` (0.5–2.0 clamped) per video slice and its audio; keep split-math consistency (already speed-aware).
- **Gap preservation (E-3):** confirm gap collapse with one synthetic render; fix by padding the concat chain (`tpad`/`apad` to the next item's timeline_start) or explicitly documenting gap-snap as intended and mirroring it in the preview.
- Tests: synthetic two-item project per transition type + speed values rendered with real FFmpeg and probed (duration/streams/frame-sampled), plus parity-vs-preview expectations.

**Files:** `proEditorService.ts` (compile), possibly `src/components/editor` (hide unsupported types until rendered), tests.
**Acceptance:** no UI-selectable edit silently changes or disappears between preview and export; render tests pin each transition/speed/gap case.
**Rollback:** per-feature commits; transition types can ship incrementally (render-or-reject per type).

## Phase E2 — Caption competitive polish + parity gate

**Scope**
- Optional auto-emoji + keyword-highlight captions (Opus/Vizard parity): keyword list per preset (or per project), emoji injection + highlight color in the existing word renderer — server-side only, single-source presets keep preview parity automatic.
- **Pixel-parity spot gate:** render one representative clip per preset family (clean/highlight/karaoke) and store reference frame hashes; a CI-runnable test re-renders and compares (with tolerance) — turns the font-metrics math from "correct by construction" into "correct by measurement."
- Readability guard in caption building: max characters-per-second and minimum effective font size per aspect; clamp/flag rather than silently emitting dense captions.

**Files:** `captionPresets.ts`, `captionService.ts`, new render-parity test.
**Acceptance:** parity test green in CI; CPS/font violations impossible in output; emoji feature parity with documented competitor sets.
**Rollback:** emoji behind a preset/project toggle; guards warn-first.

## Phase E3 — Filler-word removal (Descript parity)

**Scope**
- Transcript-driven filler detection (locale-aware list: "um/uh/like/you know…" with confidence from existing word tokens) surfaced in the editor as removable words; removal uses the **existing ripple-cut infrastructure** (applyBatchRippleCuts already slices cues+items consistently — the hard part is already built and tested).
- Optional auto-suggest on import ("remove 42 fillers, ~38s") with explicit user confirmation; never silent.
- Metrics: filler-recall/precision on a labeled transcript fixture; zero caption drift after removal (existing suites).

**Files:** new `fillerDetectionService` (pure util + lexicon), editor UI hook, `editorRippleCut` reuse.
**Acceptance:** fixture-measured filler detection ≥ target; all ripple/caption/timing suites green; removal preserves word-snapped boundaries.
**Rollback:** feature-flagged; opt-in per project.

## Phase E4 — Settle "better than" (the two gated experiments)

**Scope**
- 4a (internal validity): run `ABLATION_APPROVED=on npm run bench:ablation` (paid LLM, owner approval) — genre ablation across 4 arms; feeds genre-roadmap Phase 5 taxonomy decisions and any weight recalibration.
- 4b (external validity): manual blind-rating study — same consented sources processed on VireoClip and 2 competitor accounts (team's own subscriptions; manual, ToS-compliant, no scraping). 2+ raters rank/score completeness, boundaries, caption quality, framing per clip; report win-rates with confidence intervals. Small: 6–10 sources.
- Publish results into `benchmark-results/` with methodology; update `PLATFORM_QUALITY_AUDIT.md` verdicts from "unmeasured" to measured.

**Dependencies:** E1 first (don't rate outputs containing known parity bugs); Phase 0 fixtures as the shared corpus.
**Acceptance:** first honest head-to-head numbers either way; verdict table updated.

## Phase E5 — Continuous quality gates

**Scope**
- CI-wire the benchmark harness (`bench:selection` sanity gate must block merges; engine-pipeline mode as the canary for deterministic-chain regressions).
- Extend `/ready` advisories with caption-parity and ablation-baseline status once they exist; release gate per `IMPLEMENTATION_STATUS.md` (nothing unevidenced marked PASS).

**Acceptance:** a deterministic-chain or caption-parity regression cannot merge silently.

---

### Sequencing

E1 (days, honesty) → E2 (parity gate first, then emoji) → E3 (filler) → E4 (gated runs; E4a can proceed as soon as approved) → E5 (CI wiring can land anytime after E2's parity gate exists).
