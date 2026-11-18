# Ordinary Auto caption layout windows

## Observed defect

Ordinary Auto preview derived caption windows from the current body-to-pair shot plan. Export's captionSceneWindows rejected all nonexperimental tracks before inspecting ordinary Auto. A synthetic placement label across the12s cut consequently used50% canvas height in the pair preview but81.25% in the normal queued output.

Export now asks for the same explicit ordinary Auto picture plan before the experimental-plan gate, then uses the existing captionCompositionWindows projection. This changes neither the placement heuristic nor the transcript. Legacy fallback is unchanged when no ordinary or experimental plan applies. Crop/panel/framing/tracker/manual precedence remains in the existing projection and source/timeline mapping.

## Evidence

- Saved real ordinary mixed track audit: vireo-ordinary-auto-caption-audit-1123.json
- Fresh normal queued before24s: vireo-auto-caption-old-job-1124/layout-auto-job.mp4
- Fresh normal queued after24s: vireo-auto-caption-fixed-job-1125/layout-auto-job.mp4
- Five-second comparison across the cut: vireo-auto-caption-before-after-1126.mp4, inspected decoded frames across moving output
- Actual EditorShell preview at13s: vireo-auto-caption-preview-1128/caption-preview-13.png, inspected with label at the pair seam

The test label LAYOUT CHECK is synthetic and explicitly supplied. It is not speech or transcription/selection proof. The preview harness was temporarily connected to the same fixture cues normally supplied by the editor's cues prop; the harness change was restored and is not a product patch. Preview/render font appearance differs in this fixture, so only the placement anchor and scene transition are qualified, not pixel-exact styling parity. Auth/storage/entitlements are isolated fixtures. Source is960x540, upscaled720p output.

## Validation

65 related tests pass, frontend/backend types pass, safe421 pass/0 fail/1 skip. Added tests cover ordinary Fill-to-Split without experimental metadata, immutable input, trim/2x speed/nonzero timeline, valid tracker/manual crop/panel/freeze/title/stale exclusions, and explicit caption position preservation. Invalid empty tracker evidence is intentionally not treated as measured tracker coverage.

No provider calls, release or full4K attempts. Generic safe placement around action/HUD and genuine automatic genre selection remain unqualified.
