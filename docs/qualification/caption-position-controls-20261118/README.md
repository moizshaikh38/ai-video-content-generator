# Caption position controls after numeric edits and dragging

2026-11-18. Local technical qualification only, no production/default activation or paid calls. Same genuine Crew-2 source transcript replay, same owner/key/bytes/receipt, all external network requests forbidden. NASA footage remains private technical evidence only, excluded from website/promotional demos. Source 426x240 is soft and output720p interpolated, not native detail.

## Explicit overrides work across scenes

Actual timeline first-half Four / second-half Blur, then Effects > Top. Numeric position_y=.20 and explicit user position persist through actual preview/save/get/ordinary HTTP202/async-completed/clip-ready/local-storage MP4. Inspected actual MP4 samples: top caption in both scenes rather than automatic seam/lower anchors. No product patch was needed for that behavior.

## Stale position bug and fix

After Effects > Top, Styles > Preset Position > Bottom marked Bottom active but left position_y=.20. Actual screenshot showed top captions while Bottom selected. Preview and output respected the stale numeric coordinate, not the newest control.

The final shared preset-position action replaces global caption numeric coordinates AND prior global transform position offsets, retaining explicit user intent. Actual pointer drag test changed numeric coordinates/transform, then Bottom releases those old channels and places the caption lower in both scenes. The helper does not change per-cue positions/cues, typography/colors, transform scale/rotation/opacity, or other item fields. Source context and scene automatic anchors do not override the explicit position preset. Bottom is not a request to restore the Four automatic seam.

Fresh actual EditorShell controls, pointer drag, save/get, direct export and ordinary captioned HTTP job completed on final code. Actual drag/bottom screenshots and decoded MP4 contact sheet inspected. Final output uses Bottom across Four and Blur. The intermediate clear-only patch did not cover transform channels and was replaced before backup. This is global position control coverage; per-cue drag/reset UI is not claimed.

22 dedicated caption placement tests pass, including three new preset-position tests covering all Top/Center/Bottom values with prior numeric/transform offsets, retained cue-specific positions, preserved style/other transform fields, source immutability and explicit positioning blocking automatic scene placement. The initial test compared cloned cue identity, corrected to value equality; no product change was hidden by that test correction. Final broader focused checks recorded with backup.

Sources: https://commons.wikimedia.org/wiki/File:NASA%27s_SpaceX_Crew-2_Astronauts_Discuss_Upcoming_Mission.webm and https://www.nasa.gov/nasa-brand-center/images-and-media/ . Cost unchanged $0.07055374117999781 cumulative of original TOTAL $0.20 grant. No full upload/highlight, Genre Auto, active-speaker Fill, full4K or production proof.
