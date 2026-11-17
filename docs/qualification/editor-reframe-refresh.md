# Saved source-context preview refresh

Local only. No live activation, main merge, authentication change, spending or 4K run.

## Defect and change

Opening the editor at square makes existing portrait analysis stale. Changing back to portrait without reloading did not refresh either preview analysis effect, so the preview could remain a center-wall Fill while export used full-source Fit. Reloading restored the expected preview.

The editor hook now records a framing source key from initial loaded data and from the exact project/clip response pair after both save requests succeed. EditorShell refreshes its two cancellable analysis effects when this persisted key changes. The key covers source identity, source windows, speed and canvas aspect, not playhead or unrelated appearance edits. This avoids firing against an unsaved canvas or treating a generic Saved status as evidence that the current edited payload reached the server. It does not change selection, saved crops, renderer or analysis.

## Qualification

- Shared key tests cover relevant changes versus unrelated edits. Frontend and server TypeScript checks pass.
- Real ClipEditorPage local harness, actual API persistence and 720p API exports: pair and single-person studio each cycled square -> landscape -> portrait without reload between aspects. Outputs verified by ffprobe: 720x720, 1280x720, 720x1280.
- Added a 900ms artificial delay to each clip PATCH. Recorded analysis requests occur after clip save response, not during the delayed save. This tests request ordering, not every concurrent-edit/failure possibility.
- Inspected fresh preview/export comparison images. Returning to portrait now shows the expected Fit rather than center-wall Fill on both sources. Captures are not frame-synchronized and do not establish pixel identity.
- Explicit manual Fill survived save/reload and actual 720p export; Auto restored the prior automatic Fit. This is override persistence, not a claim that centered Fill is attractive.

## Remaining limits

- Backdrop approximation still has color/edge differences. Rounded preview corners and cast icon are not in export.
- General autosave concurrent edits, failures and retries are not repaired by this patch. A failed partial save does not advance this key, but broader save-state UX is outside this checkpoint.
- Live auth/default-detector configuration and Safari/device behavior remain unverified.
- Optional hand draft remains separate and inactive; tiny full-source pair fallback is not a composition-quality success.
- Tests used model-enabled controlled local fixtures, not live deployment or default no-model/Haar qualification.
