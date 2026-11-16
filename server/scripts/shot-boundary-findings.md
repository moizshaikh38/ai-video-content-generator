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
