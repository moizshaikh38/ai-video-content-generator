# Comic reference refinement

17 November2026, following the user's request to reach the reference level. This delta supersedes the initial candidate's narrow Bangers default and monotonic motion. Candidate ID/name and existing unrelated presets stay unchanged. It remains In testing, local only.

## Font and license

Komika Axis Regular2.0 provides materially closer rounded/heavy slanted lettering. This is observed resemblance, not a verified statement that Opus uses this font. Its original TTF bytes are unchanged from the retrieved Font Squirrel distribution. SHA256:a6d750a82402c22e79ac360943b714726a63e1e5550b459ffbbee6906a7cb597. Bundled license travels beside the font in both locations. No outlines, names, subsetting, font conversion or font-source modification.

The earlier decision to avoid this face was based on conflicting distributor labels. Further inspection recovered the actual bundled Apostrophic Labs license, which permits unchanged use in any context except racist/criminal/illegal material; prohibits modification for repackaging/re-release without permission; and prohibits sale/purchase of the font itself. It is not OFL.1001Fonts independently supplies the same short license and marks commercial use allowed. Do not sell these font files, modify or relicense them. Bangers remains available unchanged; its previous default is no longer used by this candidate.

Observed sources:
- https://www.fontsquirrel.com/fonts/komika-axis
- https://www.fontsquirrel.com/license/komika-axis
- https://www.fontsquirrel.com/fonts/download/Komika-Axis
- https://www.1001fonts.com/komika-axis-font.html
- https://st.1001fonts.net/license/komika-axis/readme.txt

Default125ASS units, exact-family cap200,1000/(1380+255)CSS-em ratio from font metrics. Existing font metrics/families stay unchanged; only Komika Axis added to the width table. Actual libass selection names KomikaAxis. No paid font or vendor assets imported.

## Motion correction

Consecutive frames of reference BEING SERIOUS, beginning around3.4034s, show core widths approximately186,214,241,233,224,220px then rest220px. Initial candidate's simple growth missed the overshoot. New original piecewise envelope starts84%, peaks110% near60ms, then settles to100% by160ms; shorter cues compress it to60% of their own duration. Both paths use10ms clip-timeline states, no wall-clock CSS transition. No vendor keyframe/code data was accessed or copied.

## Same-content evidence

Main supplied a clean854x48028.429s excerpt from the same recording/content. Audio correlation previously found approximate alignment, not frame identity. New comparison is rendered from this clean source, not painted over Opus's burned-in captions. The red-rectangle shot is visually checked against reference3.8s. A manual4:3 center crop and blurred cover compose the vertical canvas; framing/retiming/encodes differ and there is no claim to replicate Opus's source edit or tracker. Original top title/watermark are outside caption scope and omitted.

Comparison phrases/colors and phrase onset changes around3.2-6.3s were manually transcribed from sampled reference frames. Per-word timing inside each comparison phrase is synthetic fixture spacing only; it is not a recovered word-timestamp track. This demonstrates explicit persistent color capability, not automatic semantic keyword or grouping equality. The transparent numeric-yellow/final-substantial-green default rule remains unchanged and still differs from manual reference choices.

Actual Vite/index.css and ASS native sampled early/overshoot/rest pixels were inspected. In reference3.8s, core white/yellow ink bounds are220x27; local settled CSS221x26 and ASS220x25, within1px vertical/top edge. Rounded forms now resemble the reference much more closely, but halo strength, rasterization, some word gaps, phrase selection/timing and automatic keyword choice remain limitations. No full-clip exactness or superiority claim.

## Checks and remaining work

265 focused caption/expanded-preset tests passed,1 skipped; frontend/server TypeScript checks and Vite build pass with existing chunk-size warning. Same5known older accuracy failures remain outside that focused count. New tests cover pure overshoot envelope, fractional/invalid/outside/short clocks, fontselect, new default125/bounds, unchanged palette/explicit edit behavior, service/manual anchor/source-timing contracts. Prior unrelated Prism/Echo tests remain green.

Actual Studio selection/new125size/edit/save/full reopen/project export remains for runtime owner. Qualify only changed rounded font and overshoot path, with the same clean footage/manual phrase fixture if practical. Do not duplicate previous unchanged default paths. Wider arbitrary-text, complex shaping, long token, near-edge/manual and two-line product qualification remain bounded gaps. This is not release permission.

Integration: delta follows39b79eb only. Old numeric input patch89eac6d remains separate. No push/main/shared runtime changes, live release, paid generation or spending.
