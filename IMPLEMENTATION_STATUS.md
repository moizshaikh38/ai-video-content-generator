# VireoClip — Implementation Status

**Date:** 2026-10-24 · Consolidates every remediation phase across both audit roadmaps.
**Working tree:** all changes uncommitted by design (no commit was requested). Companion documents: `CLIPPING_ENGINE_PRODUCTION_AUDIT.md`, `CLIPPING_ENGINE_IMPLEMENTATION_ROADMAP.md`, `GENRE_INTELLIGENCE_AUDIT.md`, `GENRE_INTELLIGENCE_ROADMAP.md`.

---

## Production roadmap (clipping engine)

| Phase | Scope | Status |
|---|---|---|
| 1 | Data integrity: ripple-delete caption guard, duplicate-item cue rebase, `|| 94` score fallback removal, honest score labels | ✅ Shipped (`phase1CaptionRippleIntegrity.test.ts`) |
| 2 | Render parity: shared reframe decision, per-slice crop + styling in Pro graph, post-render ffprobe output gate, output-key idempotency | ✅ Shipped (`phase2RenderParity.test.ts`, real FFmpeg + ffprobe) |
| 3 | Job recovery: render sweep in `index.ts`, inline concurrency cap, queue depth on `/ready`, shutdown wiring | ✅ Shipped (`phase3RenderRecovery.test.ts`) |
| 4 | Editor input security: `editorAssetValidator` (host allowlist, user-scoped keys, tmp-only absolutes), validation on update + 3 render-input guards, redirect-manual fetch, extension parsing | ✅ Shipped (`phase4EditorAssetSecurity.test.ts`) |
| 5 | Selection benchmark | ✅ Superseded by genre roadmap Phase 0 harness |
| 6 | Transcription failover (OpenRouter↔Groq), OpenCV runtime capability check + `/ready` flag, source-cache pruning | ✅ Shipped (`phase6SensesReliability.test.ts`) |
| 7 | Real-media acceptance & release gate | ⛔ **Needs owner approval** — network + yt-dlp + paid transcription |

Plus audit low findings: L-1 ripple-copy drift **eliminated** (`rippleCutParity.test.ts` — server copy now normalizes word `text`/`word` exactly like the client), L-2 CORS substring hole **closed** (exact loopback regex), parked `getClipDownloadUrl` untouched as instructed.

## Genre intelligence roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Benchmark harness: `selectionMetrics` (mid-word/sentence, truncation, dead-air, redundancy, P@K/R@K, boundary error, Spearman), synthetic ground-truth fixtures, `npm run bench:selection` with sanity gate — including **engine-pipeline mode** (real score→refine→dedup→MMR chain vs ground truth; recall 1.0, no mid-word, boundary error ≤ 0.23s) | ✅ Shipped (`benchmarks/`, `rippleCutParity.test.ts` adjacent) |
| 1 | Honesty & consistency: no fabricated scores anywhere (UI + both fabrication layers removed), weight renormalization for missing LLM subscores with transparent explanations, unknown-genre warnings, `genreSelectionMode` default aligned with UI + ingest explicit-genre guard | ✅ Shipped (`genreRoadmapPhase1.test.ts`) |
| 2 | Multimodal activation: `MULTIMODAL_AUTO=on` enqueues timeline analysis after transcription (fire-and-forget, transcript-only fallback preserved); classifier fed real audio-peak/visual-motion signals; multimodal job sweep in `index.ts` | ✅ Shipped |
| 3 | Genre ablation + weight calibration | 🟡 **Scaffold shipped** (`npm run bench:ablation`); execution gated behind `ABLATION_APPROVED=on` (paid LLM tokens) |
| 4 | Diversity-aware selection (MMR, per-genre `redundancyPenalty` on all 11 genres) + mechanical context-completeness guard (unheard-question penalty with disclosure) | ✅ Shipped (`genreRoadmapPhase4.test.ts`) |
| 5 | Taxonomy hierarchy / registry changes | ⛔ Evidence-gated on Phase 3 ablation |
| 6 | Boundary & cross-pipeline parity: property tests P1–P4 through the real refiner (3 fixtures × 4 genres), whole-word priority, sweep/CORS wiring guards | ✅ Shipped (`genreRoadmapPhase6.test.ts`) |
| 7 | Performance, cost & regression validation | ⛔ Needs real runs |

## Platform quality roadmap (E-series)

| Phase | Scope | Status |
|---|---|---|
| E1 | Editor renders what it previews: 17 CapCut-style transition presets (shared registry + xfade/acrossfade chain + animated `TransitionPicker` UI), per-slice playback speed (setpts/atempo), timeline gap preservation | ✅ Shipped (`phaseE1Transitions.test.ts`, real FFmpeg per family) |
| E2 | Caption competitive polish: auto-emoji + keyword highlighting (Opus parity, flag-gated), readability audit (CPS + font, warn-first), burned-caption render gate (presence + placement PSNR) | ✅ Shipped (`phaseE2Captions.test.ts`) |
| E3 | Filler-word removal via ripple-cut infra (tiered detector, preview/confirm API + editor confirm flow) | ✅ Shipped (`phaseE3Fillers.test.ts`) |
| E4 | Settle experiments: **E4a** gated ablation (`ABLATION_APPROVED=on npm run bench:ablation`, paid LLM); **E4b** blind-rating kit READY (`server/benchmark-results/blind-rating-protocol.md` + CSV template) — needs your subscriptions + raters | 🟡 Kit ready, execution owner-gated |
| E5 | CI quality gates: `npm run verify:all` (typecheck + build + 281 safe tests + benchmark sanity) and `.github/workflows/ci.yml` making all gates blocking on push/PR | ✅ Shipped |

## Benchmark state

`npm run bench:selection` — **sanity PASS**: golden fixtures perfect on every automatable metric; degraded fixtures trip every embedded trap; the real deterministic engine chain (multimodal scoring → word-boundary refinement → dedup → MMR) preserves ground truth on both engine fixtures (reference recall 1.0, zero mid-word boundaries, zero redundancy, boundary error ≤ 0.23s — attributable to acoustic padding).

**NOT MEASURED** (never fabricated): LLM selection quality, human-rated completeness/genre relevance, rank correlation vs humans, latency & cost per media minute.

## Gated runs requiring owner approval

| Command | Spends | Gate |
|---|---|---|
| `ABLATION_APPROVED=on npm run bench:ablation` | Paid LLM tokens (4 arms × fixtures) | env flag + provider key |
| Production roadmap Phase 7 real-media E2E | Network + yt-dlp + paid transcription | explicit owner go-ahead |
| DB-backed suites (`phase37QueueReliability` etc.) | Mutates configured Mongo with disposable rows | explicit owner go-ahead |

## Pending human decisions

1. Enable `MULTIMODAL_AUTO=on` per deployment (local compute cost; benchmark gate recommended before default-on).
2. Score presentation: current "AI Rank"/"Unranked" is honest — decide whether to further expose per-dimension scorecards in the main workspace (data already stored in `metadata.explanation`).
3. Phase 3 ablation budget approval, then Phase 5 taxonomy decisions (product_marketing merge, vlog/documentary/low-dialogue families).
4. Commit strategy: the working tree holds all six implementation phases + four audit documents; nothing has been committed or pushed at any point.

## Verification snapshot (2026-10-24)

- Server: 250+ tests across 20 suites (all phase suites, genre suites, benchmarks metrics, parity, caption/reframe/render subsets) — **all pass**.
- `tsc --noEmit` clean (server + frontend); `npm run build:frontend` clean.
