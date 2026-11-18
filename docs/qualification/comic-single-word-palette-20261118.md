# Comic single-word palette correction

The comic palette previously required more than one word in a cue before applying its accent to the last substantial word. As a result, genuine single-word captions rendered entirely in the base color even when the preset declared a green accent.

The shared preview/export color picker now applies the accent to a substantial word (four or more letters) even when it is the only word in the cue. Short words retain the base color. Numeric colors and explicit per-word overrides are unchanged. This is a persistent word accent, not multiword karaoke.

Validation: 16 focused comic/palette tests pass. A fresh 50-cue single-word ASS projection contains both base-white and accent-green dialogue fills, with at most one distinct caption word per centisecond. Static ASS pixels and a full 20-second 1080-by-1920 review export were inspected for both colors and review notices.

The export remains an assisted review preview. It uses an explicitly measured, derived audio alignment while preserving the original canonical transcription binding. It does not qualify automatic source acquisition, transcription accuracy, overlapping speech, ordinary job/download execution, or production readiness. No 4K result is established by this check.
