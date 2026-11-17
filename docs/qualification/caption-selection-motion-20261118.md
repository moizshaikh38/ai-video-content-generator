# Preset-selection motion inheritance, 18 Nov 2026 IST

An actual Studio transition exposed a separate issue from Compact spacing: Comic's persisted animation=none was retained when choosing Compact Creator, overriding its intended pop. Conversely a stale pop override could reach a no-pop preset. This change affects explicit preset selection only, not saved-project loading or export resolution.

Different preset: use the new preset's default word animation (undefined override); self-animated cue-motion presets still explicitly use none to avoid incompatible pop. Reselecting the same normal preset preserves a deliberate animation override. Cues, per-word styles and manual coordinates retain their existing preservation. No stored migration or entitlement changes.

Qualification:
- 73 focused tests passed including switching Comic to Compact, pop to Soft Build, same-preset deliberate edits, default/palettes, inline spacing and manual-position contracts.
- Server and frontend typechecks pass.
- Fresh isolated fixture starts from the actual saved Comic caption with animation=none. Synthetic word timings are added without forcing animation=pop. Actual Studio selects Compact, saves/reloads; stored animation override is absent and own pop resolves correctly.
- API/job/storage 720p export completed. Actual Studio measurements show 5.226 CSS-pixel MOMENT/WORTH gap at active zoom 1.112, 1.158 and 1.18. Inspected actual screenshot and decoded phone-output motion samples show separated words.
- This supersedes only the earlier need to force pop in the qualification fixture. The captions/timing are still synthetic geometry evidence, not source transcription or alignment proof. Local auth/entitlement/storage mocked; no production/4K/new-spend claim.

Evidence: /downloads/comic-palettes-qualified/compact_creator and /downloads/caption-selection-motion-tests.log. This folder was regenerated for the final selection run; it now represents the no-forced-pop path. Old first-pass no-pop results were not treated as qualification.
