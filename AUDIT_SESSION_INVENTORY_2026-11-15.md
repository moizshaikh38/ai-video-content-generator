# Audit session inventory - 15 Nov 2026 (local branch audit/phase1-fixes)

Compact change/test ledger for closeout. The narrative report lives in the
published audit File (generation 16); this file is the diff-level truth.
Base: origin/main b1b65db. Nothing pushed; no production changes.

## Commits this session (oldest first)
- 68b5af4 Phase 1/1b: speed setpts before fps, single-item graph comma, crop focus clamp + preview crop-pan drag
- 403b53b / 0d228a8 / b94b5a5 / 8eac8e1 / bd3a78c / b5398f3 Genre engine: profiles into reframe, caption style defaults, hook banner + punch-in toggles, rendered-pixel proofs (genre reframe, karaoke word timing)
- a4d782f / 0520860 Smart reframe: confidence-weighted centering + subject retention
- 385ec79 / 9e3bc70 / cd7fcdf / ef5e589 Real-media harness + investigation notes (docs)
- 2bb2032 / cc8fa97 / 9cd35c6 / aca2968 Experiments, ALL default OFF, audit branch only: YuNet detector, weighted-centering gate, shot-track gate, HSV scene cuts (server/python/smart_reframe.py + smartReframeService.ts)
- f2c9502 / 9c0dffb / 03346f7 / 8ff2dc7 / 9ee7ad4 Gaming/screencast: facecam-region inset, production config path, analysis-time suggestion, editor controls, explicit-null opt-out
- 08bb446 / ab62389 / 9938de4 / 56fb42f / e511dfb Test tooling: regex tolerance, fluent-ffmpeg lavfi probe bypass, reframe-analyze billing validation + phase13 exit, phase19 fixture skip/self-generate
- de3ede7 / b37a683 / 9df9d4e / 935ced2 Two-pass normalization (OOM fix), producer two-pass, primary-track base slices, B-roll pixel regression
- 69d19d6 / c0ed103 / 0b05da0 Dynamic fallback pre-render, producer+A/B preview consistency, phase17 fallback E2E
- b61f1a9 ebur128-metered two-pass + alimiter level=0 (fixes +1LU hot renders, hot-mix clipping)
- 0f1107a SUPERSEDED TP assertion (arithmetic backwards; kept for history)
- 5e28a39 -2.0dBTP pre-encode headroom so post-encode holds -1.5dBTP (fallback TP, feasibility targetTP x2, baseline strings)
- b01b8b2 Preview/final dynamic unification: shared renderNormalizedDialogue, -2.0 feasibility parity, delta 1.2-1.3 -> 0.20 LU
- 5bc4630 phase38 test-DB bootstrap (47/47) + phase37 stale-lease test isolation (17/17)

## Measured results (delivered files, ebur128)
- Linear-feasible dialogue: -16.0/-16.1 LUFS integrated (was -14.2), TPK -10.0dBTP
- Dynamic fallback: TPK -2.2dBTP post-encode on transient fixture (was -0.7 pre-fix)
- Preview/final dynamic delta: 0.20 LU (was 1.2-1.3)
- alimiter level=0: transparent when not limiting (was +1.0dB makeup); hot mix -1.0dBFS (was 0.0 clipping)
- Long-render memory: two-pass peaks ~473MB (in-graph one-pass peaked ~1.2GB and OOM-died on 120s 1080p)

## Suite state (fresh bootstrapped test DB)
- Green: loudnormTwoPass 17/0 (TPK<=-1.5 + 0.5 LU parity), phase20 37/0, phase2RenderParity 15/0, phase19 20/0, unifiedEditor 16/0, phase3 ducking 18/0, titleCard 3/0, phaseE1 15/0, phase37 17/0, phase38 47/0, phase4b3Integration 9/0, billingWebhook 15/0, problem1Idempotency 9/0
- Known pre-existing env gap: phase17 7/1, phase18 20/1 (drawtext font in ffmpeg-static; verified identical on base b1b65db)
- Failing explicitly (missing uncommitted fixtures, no synthetic stand-in per review): phase3HighlightFusion 6/6, phase3_1ShotBoundaryAndCreditVerification 4/4 (public/demo/creator-demo.mp4)

## Remaining blockers / open items
1. Authenticated save/reload + editor-to-export E2E: blocked (production Supabase down; no local auth workaround approved)
2. Live paid paths (transcription, AI selection): code+tests only; one approved 30s smoke consumed. Social publishing needs SEPARATE representation approval, not just paid-run approval
3. Launch-video fixture commit: maintainer's call; several suites depend on artifacts/vireo-launch/ (uncommitted)
4. Smart-reframe experiments stay default-off pending real-footage validation; HSV fade double-count + pan FP documented, time-boxed
5. Dynamic fallback is program-dependent: does not guarantee -16 integrated on peak-limited content (stated in File)
6. loudnorm-vs-ebur128 internal meter divergence bounded, mechanism not isolated (not pursuing)
7. Per-output true-peak validation NOT implemented; ceiling is fixture-tested, not enforced per render
8. Operational: DBs with pre-index duplicate workspaces/members/invitations will fail bootstrap index build at startup (E11000); needs a dedupe migration before index creation if such DBs exist
9. Cancellation of in-flight renders: no cancel API; SIGKILL/SIGTERM leaks temp dirs (pre-existing); startup tmp-sweep recommended, not done
