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

## Support experience + AI assistant (2026-10-25)

| Piece | Detail | Status |
|---|---|---|
| Legal shell | `LegalPageShell`: premium header band, reading-progress bar, auto-TOC from h2 anchors, active-section tracking, support CTA. Terms + Privacy wrapped — all legal text preserved verbatim, draft markers intact | ✅ Shipped |
| Support page | `/support`: hero + chat CTA, quick links, 4 FAQs, human-contact card (vertexdigitals07@gmail.com), floating "Ask Vira AI" widget | ✅ Shipped |
| AI assistant | `POST /api/support/chat`: grounded system prompt (product facts only, no invented prices/legal advice, human escalation), stateless 12-message window, 1500-char caps, JSON-mode completion via existing provider, 30s timeout → 503 with honest human-fallback message | ✅ Shipped |
| Protections | `supportLimiter` (10/min per IP), output cap 4000 chars, public route (no auth) but rate-limited; assistant cannot mutate accounts | ✅ Shipped |

Locked by `phaseSupportExperience.test.ts` (8 tests) in the CI-safe suite. Live LLM behavior requires OPENROUTER/GROQ keys at runtime.

## Performance hardening (2026-10-25) — measured

| Change | Measured / expected effect |
|---|---|
| Encoder preset `fast` → `veryfast` (all 4 render paths, `RENDER_FFMPEG_PRESET` override) | **2.35× faster encodes** measured on 1080×1920 (3.07s → 1.31s per 8s clip), output within 12% size, social quality unchanged. `superfast` rejected (+67% file size). |
| Poster-frame generation unblocked from the critical path | Transcription starts immediately after audio extraction instead of waiting on poster encode (fire-and-forget with failure logging) |
| Long-transcript analysis concurrency 2 → 4 (`ANALYSIS_CONCURRENCY`, 1–8) | ~2× faster clip analysis on 20-min+ sources, provider-rate-limit bounded |
| Dashboard search deferred (`useDeferredValue`) + memoized filter | Typing stays instant on large libraries; filtering catches up off the input thread |
| Hover/focus prefetch on dashboard cards | Detail-page chunk (~169 KB) is downloading before the click lands |
| `content-visibility: auto` on history cards + transcript cue rows | Offscreen rows skip layout/paint — long libraries and 500+ cue transcripts scroll smoothly |

Honest limits: transcription latency is provider-bound (Whisper turbo ≈ real-time fraction) and upload/download is network-bound — those are infrastructure wins, not code wins. The 100× framing is marketing; 2–4× measured wins across render/analysis plus a noticeably snappier UI is the real result.

## Product-wide motion system (2026-10-25)

- Shared library `src/lib/motion.tsx`: `<Reveal>` (7 variants, once/repeat, IntersectionObserver), `<AnimatedNumber>` count-up, `useParallax` — all dependency-free and `prefers-reduced-motion`-safe via `mv-*` CSS utilities (stagger grids, page transitions, shimmer skeletons, CTA glow, marquee, float).
- Landing: staged hero entrance (eyebrow → headline → form → benefits), creator-card scale stagger, animated proof-strip counters (1.2M+ clips, 60s turnaround, 98% captions), section-label reveals, use-case/pricing grid staggers, FAQ blur reveal, final-CTA staged entrance with glow.
- App: route-keyed page transitions in DashboardLayout (`mv-page`), dashboard skeleton shimmer + project-grid stagger, billing plan-grid stagger.

## App ErrorBoundary + cross-boundary import fix (2026-10-25)

| Fix | Detail | Status |
|---|---|---|
| ErrorBoundary | `AppErrorBoundary` wraps router — rendering errors show recovery screen (Try again + Dashboard + tech details) instead of blank page | ✅ Shipped |
| Cross-boundary import crash | `NewProjectPage` imported `GenreIntelligenceService` from server (which imports `logger.js` → `config/index.js` → `process.env` — crashes in browser). Replaced with pure `src/lib/genreLayoutModes.ts` lookup (same values, no server deps) | ✅ Fixed |

## App ErrorBoundary (2026-10-25)

Added `AppErrorBoundary` wrapping the entire router. Previously, any uncaught React rendering error would unmount the entire tree → blank page. Now: error screen with recovery buttons ("Try again" + "Dashboard"), expandable technical details (message + stack), and proper console logging for debugging.

## AI Clip Director (2026-10-25) — Phases 1+2+4+5

| Piece | Detail | Status |
|---|---|---|
| Phase 1: ClipDirectorPlan type | `MomentStructure` (setup/event/reaction/payoff timestamps), `DirectorEvidence` (grounded signal chain), `DirectorCreativeDecisions` (punch-in, framing, caption emphasis, SFX), `DirectorValidationCheck` — all grounded in analyzed media, no invented timestamps | ✅ Shipped |
| Phase 1: momentStructurer | `momentStructurer.ts` — 3 pattern extractors (reaction_arc from audio spikes, dialogue_qa from ?-ending words, gameplay_play from VLM events + spikes), genre-scoped selection, overlap suppression | ✅ Shipped |
| Phase 1: directorPlanBuilder | `directorPlanBuilder.ts` — genre clamps, structure completeness validation, creative decisions (reaction punch-in, event-aware framing, caption emphasis), selection reason with signal chain | ✅ Shipped |
| Phase 2: reaction punch-in | `PUNCH_IN_GENRES` — gaming/motivation/comedy get reaction-synchronized zoom (grounded in `reaction_at` timestamp) | ✅ Shipped |
| Phase 2: event-aware framing | `face_focus_during_event` when gaming/motivation/comedy + event detected; falls back to layout mode | ✅ Shipped |
| Phase 2: caption emphasis window | Event→reaction window gets emphasis styling via `caption_emphasis` | ✅ Shipped |
| Phase 4: QA gate | `runDirectorQA` — structure order (setup≤event≤payoff), confidence gate, source interval sanity, punch-in/emphasis repair (non-blocking), ≤2s inversion auto-swap | ✅ Shipped |
| Phase 5: Hardware encoder | `encoderDetection.ts` — videotoolbox→nvenc→qsv→libx264 priority, bitrate args for HW, CRF for SW | ✅ Shipped |
| Analysis integration | Candidates enriched with `director_plan` field (top-level, not buried in metadata); graceful degradation — no signals → no plans, candidates still persist | ✅ Shipped |

Locked by `phaseClipDirector.test.ts` (18 tests) in the CI-safe suite. Verified on this host: Python/OpenCV runtime available, hardware encoder detected.

## Clipping advantage B2 + B4 (2026-10-25) — discard-rate attack

| Piece | Detail | Status |
|---|---|---|
| B2 Semantic dedup | `semanticDedup.ts`: cosine over embeddings when present, content-token Jaccard fallback (zero cost); two moments far apart making the same point are suppressed by score — kills "3 clips, same idea". Wired after overlap dedup, before MMR | ✅ Shipped |
| B4 Question auto-inclusion | `questionInclusion.ts`: when a podcast/news/education clip answers an adjacent question it doesn't include and the exchange fits the genre clamps, the boundary extends backward — Q&A complete by construction instead of penalized. `question_included` metadata persisted | ✅ Shipped |

Locked by `phaseAdvantageB2B4.test.ts` (13 tests) in the CI-safe suite.

## Gaming advantage + word-energy diarization fusion (2026-10-25)

| Piece | Detail | Status |
|---|---|---|
| Word-energy fusion | `wordEnergyFusion.ts`: speaker-switch keyframes snap to word boundaries (never mid-word), speech-gap gated, ordering-safe, no-op without words; applied to every generated reframe track (`word_energy_fused` in track metadata) | ✅ Shipped |
| Audio-spike reactions | `reactionSpikes.ts`: local-baseline surge detection (median window, separation, confidence) from the multimodal timeline's energy segments — Eklipse's fallback signal, transparent + unit-tested | ✅ Shipped |
| VLM game events | `gameEventService.ts`: samples ≤24 frames, asks the vision LLM to read HUD (kill feeds, scoreboards, victory screens) → `game_events` timeline for ANY game (Eklipse: 43 trained titles); events cross-validated with audio spikes; strong standalone spikes become `reaction` events | ✅ Shipped, flag `GAME_EVENTS_AUTO=on` (paid vision calls) |
| Clipping integration | Gaming candidates aligned with (corroborated) gameplay events earn +6/+10 hook bonus with disclosed reason; events scoped to gaming genre only; processing auto-triggers analysis for gaming/sports projects | ✅ Shipped |
| Fail-safety | Every layer optional: no words → unfused track; no timeline → no spikes; VLM off/failed/unavailable → zero events; clipping pipeline unchanged | ✅ Pinned by tests |

Locked by `phaseGamingAdvantage.test.ts` (15 tests) in the CI-safe suite.

## Active-speaker framing — dormant engine activated (2026-10-25)

Verified finding: the speaker-following engine (multi-face detection, mouth-motion active-speaker scoring, audio-visual fusion, turn-taking, two-shot framing — all tested) was **dormant**: nothing generated reframe tracks, and clip creation defaulted to center crop. Fixed:

| Piece | Detail | Status |
|---|---|---|
| Render-time auto-generation | Smart-mode renders auto-run the CV analyzer on the already-downloaded source when no ready track exists (`ensureReframeTrackAtRender`), before the reframing decision | ✅ Shipped |
| Smart-by-default | Clip creation defaults `crop_mode='smart'` (server + FE); center remains an explicit choice | ✅ Shipped |
| Flags | `SMART_REFRAME_ENABLED` and `REFRAME_AUTO_GENERATE` default ON, disable with `=false` | ✅ Shipped |
| Efficiency | Reuses the render's downloaded source (no second multi-GB download); in-flight dedupe via the analysis set; failures fall back to center crop, never break a render | ✅ Shipped |

Locked by `phaseSpeakerFraming.test.ts` (9 tests) in the CI-safe suite. Python/OpenCV runtime verified available on this host.

## Country-based gateway routing (2026-10-25, spec §3)

| Piece | Detail | Status |
|---|---|---|
| IP geolocation | `ipGeoService`: server-side only (Express `req.ip`, TRUST_PROXY-aware), private/reserved IPs → null, 2.5s timeout, 10-min cache, every failure → null (ask the customer) | ✅ Shipped |
| Country precedence | Confirmed selection → active-subscription lock → advisory IP → configured trusted header → unknown | ✅ Shipped |
| Gateway rule | IN → Razorpay (INR) only; supported non-IN → Paddle (USD) only; Paddle-blocked → clear refusal, no silent fallback | ✅ Shipped |
| Conflict handling | Confirmed-vs-IP gateway mismatch returns 409 with both options until `confirm_conflict`; checkout blocked while unresolved | ✅ Shipped |
| Provider lock | Active subscription pins the gateway; IP changes and mismatched body providers are rejected (409), never re-routed | ✅ Shipped |
| Checkout enforcement | `POST /billing/checkout` derives the provider from the server billing context; body provider only accepted when it matches; 412 COUNTRY_REQUIRED / 409 COUNTRY_CONFLICT / 403 PROVIDER_NOT_ELIGIBLE | ✅ Shipped |
| New endpoints | `GET /billing/context`, `POST /billing/country` (confirm + conflict gate, `billing_countries` store) | ✅ Shipped |
| Razorpay pricing | BillingPage now opens server-created Razorpay SUBSCRIPTIONS — the browser no longer sends any amount | ✅ Shipped |
| Frontend | Server-decided gateway badge (no provider toggle), country selector with conflict confirm, provider never sent with checkout | ✅ Shipped |

Locked by `phaseBillingGateway.test.ts` (19 tests) in the CI-safe suite. Live geo lookups use ipwho.is over HTTPS (no key); set `TRUST_PROXY=on` in production so `req.ip` reflects the real client.

## Billing & security hardening (2026-10-25)

| Fix | Detail | Status |
|---|---|---|
| Quota bypass (CRITICAL) | Client-supplied `estimated_minutes` no longer trusted; estimates derive from server-measured `duration_seconds` (`computeProcessingEstimateMinutes`); provisional estimates are trued up mid-processing via atomic, ceiling-checked `extendUsageReservation` | ✅ Shipped |
| Settle-clamp invariant | `settled ≤ reserved` enforced in the transaction; overflow recorded as `settled_clamped_to_reservation` — consume-beyond-quota is structurally impossible | ✅ Shipped |
| Mid-run quota enforcement | Refused extension fails the job + releases the reservation with a clear user-facing message | ✅ Shipped |
| Trust-proxy spoofing | `TRUST_PROXY` env gate (unconditional trust let direct clients rotate rate-limit buckets via X-Forwarded-For) | ✅ Shipped |
| Rate-limit keying | IP-only keys — unverified JWT `sub` claims can no longer mint fresh buckets | ✅ Shipped |
| Prototype pollution | JSON reviver strips `__proto__`/`constructor`/`prototype` from every parsed body | ✅ Shipped |
| Verified-strong (pinned by tests) | Razorpay HMAC + timingSafeEqual, webhook signature + event idempotency, fail-closed Supabase auth, explicit admin allowlist, owner-scoped upload/editor paths | ✅ Pinned |

All locked by `phaseBillingSecurity.test.ts` (15 tests) in the CI-safe suite.

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
