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

## Content-aware candidate policy, 2026-11-16 19:18 IST
Candidate guard `SMART_REFRAME_CONTENT_AWARE=1` now rejects crowd geometry as a two-person conversation and excludes tiny distant faces / two-person views from static-facecam suggestions. Default-off preserves existing selection. Fresh independent Caracas and Shibuya associated analyses were previously split at extreme x anchors; candidate now preserves the full scene. New candidate plans use full-source windows for crowds, removing the prior8% edge crop. Fresh Panetta two-feed12s sample still selects split atx0.25/0.76 (50samples,2faces each), not facecam. Actual helper outputs inspected; blur-heavy aesthetics remain unresolved.

Added a shared inspectable clip-wide `ContentFramingDecision`, persisted with fresh candidate analysis and returned by the API. Genre families choose distinct conservative policies: conversation, screen-content, action-context, scene-context, speaker-context or measured-auto. It records geometric evidence, reasons and uncertainty, preserves explicit layout choices and stable size. This is NOT a gameplay/object/OCR/active-speaker semantic detector. Gaming/screen and action/scene policies currently preserve source content until safe regions are measured rather than invent tight crops. The candidate UI shows the actual policy/reasons/limits. Toolbar, framing controls and timeline label use the same effective automatic decision without mutating stored user choices.

A fresh local synthetic Pong+VOA candidate was analyzed through the actual service with localSourcePath (the normal analysis endpoint correctly returned403 on the fixture's Free entitlement, no upgrade/bypass of live account). Analysis32samples found a possible embedded camera and chose single full-source presentation, rather than duplicating that camera as an extra inset. Actual Quick and Pro API exports are8s, inspected; both paddles and source camera appear once. This fixes automatic duplicate presentation in this bounded fixture, but game remains small and most canvas is background. It is not the final genre-aware gaming composition. Sampled Quick/Pro mean pixel error at0.5/3.5/6.5s was0.068/0.069/0.070 per255, not a full parity proof. Actual editor playback/reload inspected, automatic Blur label matches timeline after correction. Manual/default paths remain separate.

Follow-up cadence correction: first real Pro gaming candidate had239frames at30fps (audio8s/video7.9667s); this was not timing-qualified. Candidate single-item and multi-slice compiler paths now add a bounded tail clone plus exact per-output frame budget after resampling, including non-shot-concat Blur. New24fps-to30fps FFmpeg regression reproduces/catches the missing final frame. Fresh actual Pro API v5 now240frames/8.000s. Quick remains192frames/8s at source24fps.63 focused tests pass; both TypeScript checks clean. No claim that duplicating24fps motion to30fps adds motion detail.

## Face-associated body context experiment, 2026-11-16 19:35 IST
Separate explicit `SMART_REFRAME_PERSON_MODEL` opt-in. No model setting adds no
person keys to the analyzer's existing output. No runtime download or default
change. OpenCV Zoo NanoDet (Apache-2.0, local binary SHA-checked) yields candidate
person boxes, not active-speaker/gameplay semantics. Provenance/license and model
checksum are in `python/third_party/nanodet/README.md`.

A 24-frame/8-source local feasibility probe found built-in HOG unsuitable: it
missed closeups/leaning people and boxed bridge architecture. NanoDet found the
bridge bodies and seated interview people, but missed the foreground leaning
person at balcony0.5s, found only a subset in Shibuya, and sometimes boxed
background/pillow regions. Probe inference after first frame was about59-61ms,
150MiB peak RSS for the whole24-frame probe process, not deployed resource proof.
Model card source: https://huggingface.co/opencv/object_detection_nanodet

Candidate composition only uses repeated face-associated boxes (at least3
measurements and70% of that track's face sightings). Rejects invalid/weak boxes,
faces too low in a box, ambiguous multi-face bodies and unassociated regions.
It unions associated face bounds as well as padded body boxes. This is not limb
segmentation, body tracking or assurance about content outside detections.

Fresh full analyzer + helper graph renders: bridge4.5s, seated VOA8s,
balcony8s, talking-head9s. Inspected before/after sheets and sampled MP4 frames.
Bridge reserves more outer body room, seated VOA shows more shoulder context at
smaller scale. Balcony still problematic at the opening, talking-head remains
thinband because its face-free shot shares full-fit size across the entire clip.
Not an aesthetic pass. These are helper graphs, not new actual Quick/Pro API or
interactive editor acceptance. No release or full-parity claim.

### Independent game benchmark, 16 Nov 21:05 IST

Actual SuperTuxKart benchmark recording, not the prior synthetic game+camera
fixture. Source: https://commons.wikimedia.org/wiki/File:Benchmark_SuperTux_Kart_Base_Profile_2025.07.04_-_10.19.10.02.webm
Credit: SuperTux Kart-Autoren, uploader PantheraLeo1359531. CC BY-SA 4.0:
https://creativecommons.org/licenses/by-sa/4.0/deed.en . Local changes: 15-27s
excerpt of Wikimedia's 480p VP9 derivative, then portrait blurred-background fit.
No facecam was added. The local render helper omits audio intentionally.

48 samples at4Hz, explicit YuNet+NanoDet: 2 transient face boxes and20 person
boxes. Reviewed face boxes are on scenery/HUD, not a person. The composition
stays full-source with unresolved context under both default and opt-in review
policies. Actual output: 12.000s,360frames,1080x1920,30fps. Sampled decoded output
frames at0/3/6/9s show minimap, timer, rank gauge and kart within the unchanged
source rectangle. A detected cut at7.75s is not treated as semantic game boundary
proof. This is a false-crop guard qualification, NOT improved gaming composition,
active-speaker evidence, automatic game/HUD segmentation or final vertical
quality. Most of the portrait canvas remains blurred background.

Recorded the numeric detector payload (no video) as a provenance-bearing test
fixture to prevent transient detections becoming an invented subject crop.
