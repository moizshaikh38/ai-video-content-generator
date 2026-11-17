# Preview backdrop approximation, local checkpoint

The prior preview used a fixed 40px CSS blur, multiplicative brightness 0.55, contrast 1.1 and 1.15 zoom. The existing export instead uses a width-scaled radius25 box blur with five passes, additive brightness -0.15, contrast0.95, with no extra zoom.

This preview-only patch scales blur from the design canvas width using the repeated-box variance, removes the unmatched zoom and uses an additive sRGB SVG color approximation. Export, layout selection, saved crop geometry and detector settings are unchanged.

Local actual UI captures at1,4,7,10.5seconds were compared to existing720p exports. Pair background RGB mean absolute error fell from29.84/31.75/32.78/32.36 to10.82/11.02/11.11/10.91. Measurement excludes foreground height28%-62%, uses resized screenshots, and is not an exact color or timing guarantee. Fresh studio captures were also inspected against exports. CSS transparent edges, rounded preview corners, FFmpeg YUV and repeated-box filtering still leave visible differences. Other aspect ratios, browsers, mobile moving playback and other export backdrop paths are unverified. This is a bounded approximation improvement, not a closed parity issue.

Three focused tests pass; frontend and server TypeScript checks pass. No live deployment. Optional hand-detection draft is separate and excluded.
