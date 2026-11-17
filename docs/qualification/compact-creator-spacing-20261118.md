# Compact Creator inline spacing qualification, 18 Nov 2026 IST

Scope: only Compact Creator preview word scaling. CSS zoom reserves the scaled inline advance and scales the stroke/shadow with the word, rather than transforming a glyph over its neighbor. The ASS path and other preset families are unchanged.

Baseline component measurement found MOMENT overlapping WORTH by 1.74 CSS pixels at 238px caption width at 1.10/1.25s and 0.51px at 1.55s. The export path already reserved advance.

Fresh evidence:
- Four focused tests, shared gallery and existing preset tests passed.
- Actual local Studio selection/save/reload and API/job/storage 720p export exercised with synthetic words/timings, not STT or audio-alignment evidence.
- Actual Studio measurements over ten seek times 10.45-11.75s show MOMENT/WORTH advance gap 5.226 CSS pixels whenever both words are shown, including zoom 1.112, 1.158 and 1.18. A seek time with another phrase is not a gap observation.
- Decoded export frames at 10.50, 10.53, 10.57, 10.65, 10.80, 11.17, 11.20 and 11.25s were inspected; the outlined words remain separate through the active-word change. Full-frame phone motion samples were also inspected.
- Earlier segment-only run did not exercise pop. First word-timed run inherited animation=none from the selected Comic preset, so it was not counted as pop qualification. Final isolated fixture explicitly starts with animation=pop, then selects Compact through Studio, saves/reloads and exports. This follows existing selection behavior; no preset-selection animation policy is changed here.

Evidence folder: /downloads/comic-palettes-qualified/compact_creator, including saved-project.json, actual-studio-motion-measurements.json, active-word-studio.png, actual-api.mp4, motion-phone.mp4 and decoded frames. These are local temporary evidence, not a production release or durable online backup.

Limits: one synthetic phrase over existing comparison footage, mocked local auth/entitlement/storage, one Chromium runtime. This closes the reproduced inline-overlap case, not all phrases/fonts/resolutions, transcription accuracy, all-preset quality, or content-aware placement. No 4K test, spend or deployment.
