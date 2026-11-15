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
