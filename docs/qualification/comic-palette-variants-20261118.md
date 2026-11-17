# Comic Punch palette additions, 18 Nov 2026 IST

Two additive IDs use existing OFL Bangers and existing Comic cue motion:
- vireo_comic_red_green, Comic Punch Red + Green: white base, red numbers (#FF4545), green final-word accent (#20FF35).
- vireo_comic_violet_white, Comic Punch Violet + White: violet base/numbers (#C59AFF), white final-word accent.

The number color is now a preset-defined resolved property shared by preview and ASS. Existing defaults still use yellow (#F5FF00). Explicit per-word colors win. Original yellow/green house default, old Komika Comic ID, caption-OFF, existing saved styles and default selection are not replaced. These are palette variants, not distinct motion mechanisms. No font/dependency imports or entitlement changes.

Both additions were selected in actual local Studio, saved/reloaded, and exported through API/job/storage at 720p. Original fixture tracks were asserted unchanged. Export stills at 10.8s and 3.5s phone-sized motion extracts from 9.5s were visually inspected. Numeric/final accents appear in both preview and encoded output. Source words/timing and opening hook remain previously manually supplied. Existing explicit word colors still show where saved, deliberately.

75 focused tests passed, 0 failed, covering new palette rules, segment-only/timed cues, per-word override and position preservation, exact gallery IDs/groups, existing Comic, default and Compact. Server and frontend typechecks passed. Earlier 3 failures in the newly written color assertions were incorrect ASS alpha-prefix expectations; tests were corrected to inspect actual opaque ASS color syntax, not by changing output. Earlier unrelated caption-wide failures remain documented separately.

Evidence: /downloads/comic-palettes-qualified/{vireo_comic_red_green,vireo_comic_violet_white}/{saved-project.json,reloaded-preview.png,render-status.json,actual-api.mp4,export-10.8.png,motion-phone.mp4,result.json}.

Local mock auth/entitlement/storage only. No production release, spend, main merge or 4K qualification. Existing catalogue inventory of 36 IDs was the prior dated snapshot; these additions make 38 renderable IDs. No new reference match is certified. Additional preset improvement and content-aware placement remain open.
