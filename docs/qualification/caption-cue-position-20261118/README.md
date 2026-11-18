# Per-cue caption positioning, November 18, 2026

Local/manual qualification, not a release or general automatic-layout proof.

## Interaction failures

The preview scope/preset bar stopped click propagation but not pointer-down propagation. Stage deselection removed the bar before This Cue Only could set its scope. The initial run consequently dragged the whole caption track, not one cue. Its unchanged cue array alone was NOT evidence of a reached per-cue update.

Separately, the per-cue update built changed cues before spreading the original caption object, overwriting them and setting global explicit-position intent. Corrected the per-cue merge to retain global fields and update only the targeted cue. The scope bar now stops pointer-down propagation.

The editor's preview cue-state synchronization previously compared only text/times/word times. Position and style edits could remain stale in preview even after persistence. Its equality now includes all cue data. Qualification harness now derives current project cues rather than a static initial fixture, matching the production resync contract for this simple one-item fixture.

## Fresh result

Evidence directory: /downloads/vireo-caption-cue-scope-fixed-2145

Actual EditorShell interaction: select visible caption, click This Cue Only, then pointer-drag first cue upward. Exactly one cue changed: cue-1 position_x=.5, position_y=.362. Global explicit flag and item transform remained unchanged; other cue text/times/words/styles unchanged. Actual save/get and direct export passed. Ordinary HTTP render returned 202, completed, ready, output stored locally. Fresh preview screenshot and decoded MP4 contact frames inspected: LAST YEAR moves upward; later Four cues retain seam placement; Blur cues stay lower. Full temporal or accuracy qualification not claimed.

36 focused cue-position/global-preset/scene-placement/ordinary-window/preview-plan tests pass. Frontend and server TypeScript checks pass. Existing broader-suite failures are not cleared by these focused checks.

No paid calls: genuine same-owner transcript replay with exact source receipt and hash. Source is the already-used Crew-2 426x240 excerpt, interpolated to 720x1280. NASA material is private technical qualification only and excluded from website/promotional demos. Local authentication, entitlement and storage fixtures, not end-to-end deployed account proof. Source: https://commons.wikimedia.org/wiki/File:NASA%27s_SpaceX_Crew-2_Astronauts_Discuss_Upcoming_Mission.webm

Full4K resource cause and active-speaker Fill remain unresolved. No new Auto/default activation, model weights, spending or main-branch release.
