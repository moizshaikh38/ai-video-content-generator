# Ordinary Auto source clocks and finite silent renders

## Reproduced failures

An ordinary Auto24s constructed walking-then-pair source, edited to source6->18 at2x on a6s timeline, compiled only one6s source-time camera window. It omitted the source12s portrait-to-Split cut, then sped that shortened graph again. The single-item caller also sought the original clip opening rather than the edited item's source start unless the review candidate/framing-window route was active. Ordinary Auto must use the same analysis-relative source clock without enabling a candidate.

Actual queued qualification first failed during dynamic audio normalization on the genuinely silent source. Measurement had a finite duration bound, but dynamic reconstruction dropped it. Bounding only that prepass allowed it to finish but the final render still stalled: an unused generated-silence branch feeding anullsink had no EOF. The interrupted local fixture rows were cleaned by exact fixture-owner IDs, and incomplete current-run render directories removed after preserving graph text and failure logs. No live account data or older evidence was deleted. No background encoder remains.

## Repairs

- Shared ordinary-Auto/candidate source-clock eligibility drives compiler and caller seek behavior; manual/genre ownership does not gain the bridge.
- Single-item source windows use edited source_start, selected source_end, speed and canvas duration. Output time is selected source duration divided by speed. Slow playback is no longer capped at the original clip duration, while a stale oversized canvas cannot expand the selected source interval.
- Multi-item ordinary Auto supplies source duration to the shot compiler before timeline speed is applied.
- Dynamic normalization reconstruction retains the same finite pre-marker program bound as measurement.
- Generated primary silence is finite to the maximum declared source/timeline extent, including speed. It therefore reaches EOF even when its unused processed branch is sunk in favor of normalized audio.

## Actual evidence

Fresh normal analysis, actual saved/reloaded project and queued render/download produced the6s180frame fast mixed export. Inspected moving output shows body portrait then stacked Split at timeline3s. Actual EditorShell preview of the saved edit was inspected at0/3.5s; measured source clocks6/13 match portrait/Split. The trim/speed values were applied through the save API fixture, not claimed as UI speed-control interactions.

An independent24fps animation source12s long was selected source2->10 at0.5x. Fresh ordinary queued export completes16s480frames, including output beyond the old12s clamp. Moving output inspected: retains per-shot4:3Fit, existing sidecrop and small sharp-band limits. No new composition or semantic safety claim. Real audio passed the dynamic normalization path, but audio quality/listening is not separately qualified here.

All are bounded local auth/storage/entitlement adapters with full-source manually selected intervals and empty transcript protocol fixtures. They do not prove transcript accuracy, genre or selection. No paid provider calls, deployment, old-analysis rewrite, defaultOCR/HUD activation or4K retry.

## Regression coverage

Pure source-clock tests cover ordinary vs manual ownership, fast and slow selected-window bounds, stale canvas clamp, nonzero analysis origin and multi-item cut crossing. Executable finite-silence regression exercises both dynamic reconstruction and its unused audio sink. Reduced existing synthetic loudness tests cover silent audio, dynamic fallback and caller input seek. Cadence pixel tests cover brief first/interior/last scenes at24/25/29.97/30/60fps without claiming every60fps source frame survives30fps output.
