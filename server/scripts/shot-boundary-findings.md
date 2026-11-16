# Local shot-boundary investigation, 16 Nov 2026

Candidate only. No default environment or deployment change.

The 9s Tears of Steel talking-head excerpt cuts at 5.583333s and 7.875s
(24fps source). The default grayscale discovery found neither cut. Existing
opt-in color discovery found 5.75s and 8s at 4fps sampling, late by 4 and 3
source frames. With SMART_REFRAME_REFINE_CUTS=1, local adjacent-frame color
comparison refines discovered cuts to 5.583333s and 7.875s. The analyzer now
returns coarse timestamps, refined timestamps and a one-source-frame timing
uncertainty. SMART_REFRAME_HSV_CUTS remains independently opt-in.

The refinement searches only around already-discovered cuts. It does not
prove a semantic cut, find missed cuts, fix false-positive discovery, infer
bodies or make a tight crop safe. Missing/unreadable input preserves coarse
evidence rather than inventing a successful refinement.

Bounded 4fps histogram discovery checks on five excerpts: balcony, solo VOA
and two-feed VOA had no extra color cuts; the other two-shot excerpt had the
same 8.5s cut with gray and color; talking-head had the two missing cuts above.
This is not a held-out false-positive benchmark. Fast motion, flashes, fades
and camera moves still need qualification.

Track metadata now preserves scene_cuts used by smoothing and the analyzer's
refinement evidence for downstream work. Existing cached tracks will not gain
that provenance without reanalysis. The separate group-composition helper is
still global across the clip and does not yet consume these boundaries.

Next: shot-local composition for track/group/face-free scenes, shared by export
and editor; no cross-cut center carryover or interpolation; wider solo body
context; real output and reload checks; held-out cut/non-cut clips. Do not
promote the detector flags or call general framing complete from this test.

Blender footage credit: (CC) Blender Foundation | mango.blender.org.
See realmedia-sources.md for the existing media source inventory.

## Shot-local composition candidate

SMART_REFRAME_SHOT_COMPOSITION=1 stamps newly analyzed tracks. It remains off
by default and is separate from detector choice and cut discovery/refinement.
Quick, Pro slice graphs, the safe track API and live preview use the same
shot-local plan. Cached tracks do not silently opt in. Manual crop/layout
choices still take precedence.

Group decisions use only samples in each shot. Otherwise the existing
subject-score function selects a sufficiently present solo track; its context
window reserves extra width and lower-body room and stays fixed within the
shot. With insufficient subject evidence, the source is fitted in full. This
is a heuristic, not a person/body detector, and can produce a small foreground
or trust detector artifacts. It is not universal framing acceptance.

Source-time trims are rebased in each Pro slice before a speed change.
Candidate single-item rendering seeks the item's actual source_start. The
preview subtracts the analyzed source origin (clip start plus analyzed trim)
when looking up the plan. Foreground clipping and auxiliary-video metadata
seeks are explicit. Render-review mode does not crop a rendered group again.

Cut pieces are resampled to a 30fps composition grid with integer frame budgets
computed from cumulative boundaries, then bounded to the requested total.
This avoids accumulated missing/excess frames at fractional cut boundaries.
The displayed composition boundary may differ from source cut time by up to
one output frame; source refinement evidence still retains its uncertainty.

Local checks: actual Quick and Pro 9s exports each270frames at30fps; actual
trimmed single-item Pro4s export120frames. At sampled matching6.2/8.5s frames,
Quick and Pro pixels were identical; at0.5s full-frame mean absolute channel
difference was0.15 (8-bit scale). These samples do not establish full parity.
Actual editor source playback/reload checked the candidate9s clip and a4s
source4.5-8.5s item. Media fixture needed Range responses before browser seek
results were valid; its initial lack of Range support was not a product bug.

## User-corrected crop stability, 2026-11-16 19:04 IST
The per-shot scale change in b8ec0d3's delivered output was rejected by the user. Candidate computation now uses one maximum required source-window size across the full analyzed clip, while preserving shot-local subject decisions. Full-source fallback in any shot therefore gives full-source size for this entire clip. A fresh actual Pro API v5 output has270frames/9s and visually constant foreground bounds across the three shots; actual editor playback/reload inspected. This is a conservative anti-jump fix, NOT a satisfactory aesthetic solution: wide source becomes a thin horizontal foreground band. Genre-specific/content-aware stable-layout selection remains open. No defaults or live release changed.42 focused tests pass and both TypeScript checks clean.

Independent new holdout sources acquired for broader motion/occlusion work:
- Caracas walking crowd, Vicente Quintero / QuinteroP, CC BY3.0: https://commons.wikimedia.org/wiki/File:Sabana_Grande_Caracas._People_walking_on_the_Boulevard_of_Sabana_Grande,_famous_in_Caracas,_Venezuela.webm
- Shibuya crossing, Basile Morin, attribution/share-alike: https://commons.wikimedia.org/wiki/File:Shibuya_Crossing,_Tokyo,_Japan_(video).webm
Fresh analysis of12s excerpts reports no cuts; source pixels show moving and mutually occluding people. No output framing quality result yet. Downloads are local qualification only, no paid services.
