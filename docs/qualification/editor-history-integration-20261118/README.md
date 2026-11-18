# Actual editor history integration, November 18, 2026

## Scope and boundary

Actual EditorShell with production useEditorProject, useEditorHistory and useEditorAutosave hooks, mounted under React StrictMode, driven by real browser pointer/button/keyboard actions. Service methods alone are offline fixtures: loading uses captured genuine-source local qualification data, saves write browser localStorage, and clip synchronization returns the local fixture. No authenticated/deployed account or backend-save claim. This deliberately avoids another render under the disk constraint. No paid/provider requests or model downloads.

Run: copy fixture.json from this directory to a new output directory, then run `node server/scripts/local-qualification/editor-history-ui.cjs NEW_OUTPUT`. Requires existing private Crew-2 excerpt at /downloads/vireo-natural-panel-scout-1900/nasa-four-natural-14s.mp4 and existing local Chromium tooling. The script serves only local GET requests, closes its browser/server, and removes its temporary public fixture on completion. Final evidence directory: /downloads/vireo-editor-history-position-final-2127.

## Findings and changes

1. Quick Top and Inherit Position both recorded a project update and committed the same pre-operation history snapshot, leaving a duplicate Undo entry after one edit. Keyboard nudges used the same duplicated pattern. Removed extra commits from these discrete actions. Pointer drags retain their existing single commit after unrecorded motion updates.
2. The caption scope/preset bar exceeded the canvas width after selection persisted across Undo/Redo. Its button bounding box could lie outside the clipped canvas, and real pointer clicks hit the backdrop. Bar now wraps within canvas bounds. The test checks actual scope-button hit target; screenshots were inspected for readability.
3. Bottom Safe was permanently emphasized in green, incorrectly resembling selected state at any caption location. Top/Center/Bottom Safe now expose pressed state and visual selection from effective caption coordinates. At .20 only Top, at .50 only Center, at .75 only Bottom Safe. Inherited Fit lower anchor and free-position drag show no matching preset selected.

## Actual integration results

- Top edit updates project and hook-derived preview cues. One Undo restores full pre-edit tracks/cues and disables Undo; Redo restores the exact edit.
- Bottom Safe and Center clicks select their actual positions and undo back to Top.
- Inherit Position removes selected-cue manual coordinates. Undo restores Top, Redo inherits again. Two undos exhaust both genuine edits, without duplicate history entries.
- Pointer drag is one undoable edit; all cue fields and original transform restore in one Undo. Redo restores the completed drag, not an intermediate motion.
- A new edit after Undo clears redo.
- ArrowUp nudge changes selected cue by .005 and safely undoes/redoes.
- Measured Four layout choice changes the first scene via actual menu. Undo restores prior layout and edited cue; Redo restores Four.
- Explicit real-hook save reaches saved state at offline service boundary. Page reload retains saved tracks/cues, has saved status and begins with empty history.
- Fresh screenshots inspected: Top, inherited lower cue after Undo, readable wrapped bar, .75 selected state, and reloaded Four with manually positioned cue. No moving-output/render claim for this check.

38 focused caption/preview/ordinary-window tests pass. Adding unifiedEditor tests gives 53/54 passing. The remaining drawtext text-overlay assertion reproduces unchanged on prior backup 9dc39af (15/16 in unifiedEditor there), not fixed here. Frontend/server TypeScript checks pass. Existing broader-suite failures remain caveats.

The 426x240 Crew-2 source is visibly soft; NASA material remains private technical qualification only, excluded from website/promotional demos. Source: https://commons.wikimedia.org/wiki/File:NASA%27s_SpaceX_Crew-2_Astronauts_Discuss_Upcoming_Mission.webm . No Auto/active-speaker Fill/full4K/production qualification or activation. Main remains unchanged.
