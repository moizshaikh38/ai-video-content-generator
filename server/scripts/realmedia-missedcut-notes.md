# Missed scene-cut investigation (Nov 15, ~05:32 IST)
Root cause: gray 32-bin histogram correl threshold 0.50 never trips on luma-stable cuts.
Measured (full fps, consecutive frames):
- tos-talkinghead: gray min 0.739 (miss). HSV 24x24 correl dips: 0.10 @5.58s, 0.01 @7.88s.
  Frame-verified: 5.5s vs 5.67s are different scenes (true cut).
- Sintel: gray caught only 3.25s. HSV dips 0.386 @2.42s, 0.485 @3.17s.
  Frame-verified: 2.33s vs 2.42s are different shots (true cut gray MISSED).
- BBB: HSV min 0.997 (no false positives at 0.5). tos-twoshot: -0.053 @8.38s (true cut, gray caught 8.5), rest >=0.996.
Proposal: add HSV 24x24 histogram; cut if gray<0.50 OR hsv<0.50. Gate behind
SMART_REFRAME_HSV_CUTS=1 (default off) pending held-out validation. NOT yet implemented.

## Synthetic ground-truth transitions (transitions-gt.mp4, built Nov 15, ffmpeg lavfi)
Labels: hard cut 2.0 | crossfade 3.25-4.0 | white-flash cut 6.0->6.2 | fast pan 8.0-10.0 (no cut).
Gray default: [2, 3.5, 6, 8.25] - 2.0/3.5/6 correct (flash merged by 1.0s dedup), 8.25 FALSE POSITIVE (pan).
HSV flag:    [2, 3.5, 4, 6, 8.25] - plus 4.0 = fade DOUBLE-COUNT (fade dips at 3.5/3.75/4.0; the
  single-event-per-transition assumption does NOT hold for fades; 0.5s dedup admits 3.5+4.0).
  Pan FP fires on BOTH gray (-0.144) and HSV (-0.002) - high-frequency synthetic pattern; HSV adds
  no protection there. Hard cut 2.0 caught by gray only (hsv 0.975 - hue distribution survives).
Open: motion-aware verification for pans; fade multi-dip vs rapid-cut spacing is a real dedup
  tension (Sintel true cuts 0.75s apart vs fade double-dip 0.5s apart) - not resolved by tuning.
