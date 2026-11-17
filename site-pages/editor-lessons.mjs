// Actual-editor lesson content.
export const editorLessons=[
  {
    "id": "editor-tour",
    "category": "Start here",
    "title": "Find your way around the editor",
    "time": "4 min",
    "summary": "Locate the preview, transcript, timeline and controls before making a change.",
    "steps": [
      {
        "title": "Start with the whole editor",
        "text": "Use a demo or a recording you have permission to edit. Locate the preview canvas, transcript, timeline, Save and Export. Your account and clip can affect which controls are available.",
        "media": "editor-overview"
      },
      {
        "title": "Move to a specific moment",
        "text": "Use the timeline playhead to choose the moment you want to review. Previous frame and Next frame move through the clip in smaller steps.",
        "media": "timeline-overview"
      },
      {
        "title": "Select before editing",
        "text": "Select the item you want to change. Video, captions and added elements have different controls. Check the selection rather than assuming a setting applies to everything.",
        "media": "timeline-selected"
      }
    ],
    "task": "Find one caption item and one video item. Select each and notice how the available controls change.",
    "caveat": "Your saved project may keep earlier choices instead of the defaults shown here. Check the current settings before changing them."
  },
  {
    "id": "auto-layout",
    "category": "Framing",
    "title": "Choose Auto Layout and understand its scope",
    "time": "5 min",
    "summary": "Choose an automatic layout for a scene or the whole clip without confusing the two.",
    "steps": [
      {
        "title": "Open Layout in the preview",
        "text": "Move the playhead into the scene you want to change. Open the Layout control above the preview.",
        "media": "layout-open"
      },
      {
        "title": "Choose this scene or the whole clip",
        "text": "Check the scope before selecting a layout. This scene applies to the analysis scene under the playhead when that scene data exists. Whole clip is a broader command. An analysis scene range is not a timeline cut.",
        "media": "layout-scope"
      },
      {
        "title": "Choose Auto, then review",
        "text": "Auto chooses among Fit, Fill and eligible two-person Split from available scene analysis. Check the complete scene, including edge text and speaker changes. Other named layouts in this menu are manual choices.",
        "media": "layout-auto"
      }
    ],
    "task": "Locate the scope controls and explain which range would change before choosing anything.",
    "caveat": "Automatic editorial quality is still being improved. Auto is not a guarantee that the best layout or every relevant person will be selected."
  },
  {
    "id": "auto-reframe",
    "category": "Framing",
    "title": "Turn Auto Reframe on or off",
    "time": "4 min",
    "summary": "Control automatic camera movement separately from the layout.",
    "steps": [
      {
        "title": "Find Auto Reframe for the video item",
        "text": "Select the relevant video item and locate Auto Reframe above the preview. It appears when automatic framing data or an automatic layout is available.",
        "media": "reframe-on"
      },
      {
        "title": "Turn movement off",
        "text": "Switch Auto Reframe to OFF to hold automatic movement at the current position. This does not turn every scene into the same layout. Manual framing choices keep priority.",
        "media": "reframe-off"
      },
      {
        "title": "Check the scope",
        "text": "Apply to whole clip is separate from the selected video-item toggle. Review the range you intend to change, then watch movement and scene changes.",
        "media": "reframe-scope"
      }
    ],
    "task": "Compare ON and OFF at the same source moment. Watch beyond that still frame before deciding.",
    "caveat": "Automatic framing can miss a person or choose an awkward crop. Watch the whole clip and inspect the exported file, especially around movement and speaker changes."
  },
  {
    "id": "manual-layout",
    "category": "Framing",
    "title": "Choose a manual layout and its scope",
    "time": "5 min",
    "summary": "Compare Fill, Blur and multi-panel layouts, then check what each view contains.",
    "steps": [
      {
        "title": "Choose the intended range",
        "text": "Open Layout and check This scene or Whole clip before choosing a composition. An analysis scene is not an edit cut.",
        "media": "layout-whole-scope"
      },
      {
        "title": "Inspect the tight Fill crop",
        "text": "Fill can remove source detail at the sides. Check faces, source text and anything important near an edge.",
        "media": "layout-fill"
      },
      {
        "title": "Review the background treatment",
        "text": "Blur changes the background treatment. Inspect the main sharp region separately; visible background is not proof that the sharp region preserves the whole source.",
        "media": "layout-blur"
      },
      {
        "title": "Assign each Split panel",
        "text": "This example uses one person and leaves the views unassigned. Choose the intended view for each panel. Repeating one person in two panels is not two-speaker detection.",
        "media": "layout-panels"
      },
      {
        "title": "Check every additional panel",
        "text": "Three creates more panel positions. Assign the intended view and review the composition over time. Do not treat repeated views of one person as extra cameras.",
        "media": "layout-three"
      }
    ],
    "task": "On a disposable copy, compare Fill and Blur, then identify the scope before making a manual layout change.",
    "caveat": "These examples use one person, so they do not show two-speaker detection. Review each assigned panel over time and in the exported file. Picture in picture is unavailable in the menu shown here."
  },
  {
    "id": "timeline-editing",
    "category": "Timeline",
    "title": "Trim, split and arrange timeline items",
    "time": "6 min",
    "summary": "Change an edit boundary deliberately instead of confusing it with an analysis scene.",
    "steps": [
      {
        "title": "Select the correct item",
        "text": "Select the video or caption item in the timeline. Use the playhead and frame-step controls to inspect the intended boundary.",
        "media": "timeline-selected"
      },
      {
        "title": "Trim the start or end",
        "text": "Drag Trim Start or Trim End on the selected item. Compare the sentence and audio before and after the adjustment.",
        "media": "timeline-trim"
      },
      {
        "title": "Split at the playhead",
        "text": "Place the playhead where the cut belongs and use Split Clip at Playhead. Review the resulting edit boundary and any captions crossing it.",
        "media": "timeline-split"
      },
      {
        "title": "Duplicate only what you intend",
        "text": "Duplicate copies the selected short segment. Check the new segment and later items before continuing.",
        "media": "timeline-duplicate"
      },
      {
        "title": "Review a ripple delete",
        "text": "Ripple delete changes the sequence and overall span. Inspect the join, caption alignment and audio after removing a segment. This is an edit operation, not a detected analysis scene.",
        "media": "timeline-ripple"
      }
    ],
    "task": "On a disposable demo copy, make one split, review both sides, then undo it.",
    "caveat": "Ripple delete, duplicate, locked tracks and speed changes can affect nearby content. Check the complete timeline and save only the intended result."
  },
  {
    "id": "preview-editing",
    "category": "Timeline",
    "title": "Move and resize captions from the preview",
    "time": "5 min",
    "summary": "Select a caption, move it, then compare a separate real resize example.",
    "steps": [
      {
        "title": "Select the item in the preview",
        "text": "Click the caption you want to adjust and confirm the selection outline.",
        "media": "preview-selected"
      },
      {
        "title": "Drag to position",
        "text": "Move the selected caption while keeping faces, source text and platform interface areas in mind. The short frame sequence is slowed for reading and contains no captured cursor.",
        "media": "preview-position"
      },
      {
        "title": "Check position separately from scale",
        "text": "Use Position X and Position Y to check placement. Scale is a separate control. The inspector below shows the moved caption; the size comparison follows next.",
        "media": "preview-resize"
      },
      {
        "title": "Start the size comparison",
        "text": "The next two images use a separate example. Notice the caption size and position before the resize.",
        "media": "caption-resize-before"
      },
      {
        "title": "Recheck the anchor after resizing",
        "text": "The text becomes larger as size changes from 70 to 95, and it also moves upward. The captured resize did not preserve the vertical anchor.",
        "media": "caption-resize-after"
      }
    ],
    "task": "Place a caption where it remains readable through a scene change, then check a phone-sized preview.",
    "caveat": "Moving, font sizing and inspector Scale are different operations. A layout or size change can alter usable space. Recheck the position and the actual export."
  },
  {
    "id": "caption-style",
    "category": "Captions",
    "title": "Change caption font, size and colours",
    "time": "5 min",
    "summary": "Find Typography & Layout and choose colours that keep your words readable.",
    "steps": [
      {
        "title": "Open Typography",
        "text": "Use the Typography tab for font, size and weight. Start with readable text before changing decorative effects.",
        "media": "caption-typography"
      },
      {
        "title": "Check the size change",
        "text": "The size changes from 70 to 95 in this example. The caption also moves upward, so check its position as well as its size.",
        "media": "caption-size-after"
      },
      {
        "title": "Choose the correct colour target",
        "text": "Open Effects. Text, Active, Stroke and Box affect different parts of the caption. This capture has Active selected with an orange swatch.",
        "media": "caption-colours"
      }
    ],
    "task": "Change one property at a time. Check whether readability improved before adjusting the next.",
    "caveat": "Resizing can change vertical placement too. Watch the whole sentence against the changing background, then check the downloaded file before publishing."
  },
  {
    "id": "single-word-captions",
    "category": "Captions",
    "title": "Show one caption word at a time",
    "time": "3 min",
    "summary": "Use Word Mode, not line count, to switch to a single active word.",
    "steps": [
      {
        "title": "Find Word Mode",
        "text": "Open Typography & Layout in the caption controls and locate Word Mode.",
        "media": "caption-modes"
      },
      {
        "title": "Choose Single word",
        "text": "Select Single word. This mode sets one word per cue and one line. Scrub or play a sentence so you can see the change over time.",
        "media": "caption-single-word"
      },
      {
        "title": "Check the reading rhythm",
        "text": "Watch fast and slow phrases. One word at a time can feel different from a grouped sentence even when the transcript is identical.",
        "media": "caption-single-preview"
      }
    ],
    "task": "Compare a complete sentence in Single word and Phrase + highlight, without changing the transcript.",
    "caveat": "This changes presentation, not transcription accuracy. Correct the words against the original audio."
  },
  {
    "id": "caption-lines",
    "category": "Captions",
    "title": "Compare one-line and two-line settings",
    "time": "3 min",
    "summary": "Find the Lines control and compare the one-line and two-line examples.",
    "steps": [
      {
        "title": "Find Lines in phrase mode",
        "text": "Choose Phrase + highlight for multi-word cues. Lines and Word Mode are different controls. Here, 2 Lines is selected.",
        "media": "lines-controls-candidate"
      },
      {
        "title": "Compare one line",
        "text": "The one-line example shows MAKES EVERY. Check long cues and wide words in your own project too.",
        "media": "lines-one-candidate"
      },
      {
        "title": "Compare two lines",
        "text": "With 2 Lines selected, the same moment includes more words across two rows. Watch how the grouping changes over the whole sentence.",
        "media": "lines-two-candidate"
      }
    ],
    "task": "Compare a long caption in both line settings at a phone-sized preview.",
    "caveat": "Line limits are still being improved. Some captions can wrap to an extra line, especially with long words, older styles or different writing systems. The examples shown here use a work-in-progress update, not a guarantee for every project. Check the visible lines in your own preview and export."
  },
  {
    "id": "word-highlight",
    "category": "Captions",
    "title": "Keep a phrase and highlight the current word",
    "time": "4 min",
    "summary": "Give readers phrase context while keeping selective word emphasis.",
    "steps": [
      {
        "title": "Choose Phrase + highlight",
        "text": "Use Phrase + highlight to keep surrounding words visible, rather than Single word. This is separate from Lines.",
        "media": "caption-phrase"
      },
      {
        "title": "Choose the Active colour",
        "text": "In Effects, select Active before choosing its swatch. Changing Text instead changes a different colour target.",
        "media": "caption-colours"
      },
      {
        "title": "Check the word in context",
        "text": "This actual preview highlights VIVID while keeping CREATE visible. Play the whole sentence and listen before deciding whether emphasis follows the intended word.",
        "media": "caption-highlight-preview"
      }
    ],
    "task": "Choose a restrained active-word colour, then watch the final sentence with sound off.",
    "caveat": "A still image cannot show whether highlighting follows the audio. Play the whole sentence and check both word timing and styling in the exported clip."
  },
  {
    "id": "correct-captions",
    "category": "Captions",
    "title": "Correct a sentence and review the new timing",
    "time": "4 min",
    "summary": "Change the wording, reopen your project and check the timing effects.",
    "steps": [
      {
        "title": "Enter the intended wording",
        "text": "Open the sentence editor, compare with the source audio and enter the correction. Here the revised sentence is entered before Save.",
        "media": "correction-entered"
      },
      {
        "title": "Apply and inspect the sentence",
        "text": "After applying the edit, the changed wording appears in the transcript. Sentence rewriting redistributes word timings over the original cue, so inspect timing as well as spelling.",
        "media": "correction-applied"
      },
      {
        "title": "Reopen and check again",
        "text": "Save your project, reopen it and check the corrected wording. In this example the wording remains, along with a 1.15-second duration set in the word-timing lesson. Listen again to make sure the words still match the audio.",
        "media": "correction-reopened"
      }
    ],
    "task": "Correct one name against the source audio, reopen the sentence, then listen to the start and end of every affected word.",
    "caveat": "Rewriting can change word timings even when the sentence span stays the same. Listen to every affected word and review subtitle timing in the exported clip."
  },
  {
    "id": "ratio-safe-zones",
    "category": "Framing",
    "title": "Choose an aspect ratio and check safe areas",
    "time": "4 min",
    "summary": "Compare portrait, square and landscape without losing useful context.",
    "steps": [
      {
        "title": "Cycle the canvas ratio",
        "text": "Use the ratio control above the preview to compare 9:16, 1:1 and 16:9. Recheck the crop after each change.",
        "media": "canvas-ratio"
      },
      {
        "title": "Show safe guides",
        "text": "Use the safe-zone control to inspect important text and faces near interface areas.",
        "media": "safe-guides"
      },
      {
        "title": "Compare landscape",
        "text": "Check captions and framing in the 16:9 canvas too. A composition that works in landscape may not work in portrait. Watch the full clip after this still-state comparison.",
        "media": "canvas-landscape"
      }
    ],
    "task": "Try the same moment in two canvas ratios and name the most important difference.",
    "caveat": "Safe guides are review aids, not a guarantee about every publishing platform or device."
  },
  {
    "id": "speed-and-playback",
    "category": "Timeline",
    "title": "Change a selected video item's speed",
    "time": "4 min",
    "summary": "Compare a 1x-to-1.5x change and its shorter timeline span.",
    "steps": [
      {
        "title": "Select the video item",
        "text": "Select the intended video item and inspect its Speed control. The before state is 1x. This is not a preview playback setting.",
        "media": "speed-before"
      },
      {
        "title": "Change the item to 1.5x",
        "text": "The selected item is now 1.5x. Review what retiming does to captions, later items and any locked tracks.",
        "media": "speed-after"
      },
      {
        "title": "Review the shorter timeline",
        "text": "The 12-second example now spans 8 seconds. Inspect sentence alignment and the complete join before saving.",
        "media": "speed-span"
      },
      {
        "title": "Save and check again",
        "text": "Save and reopen the project, then check the item speed. Here it remains at 1.5x. Listen to the final export too, since screenshots cannot show sound or pitch.",
        "media": "speed-reopened"
      }
    ],
    "task": "On a disposable copy, compare the same item at 1x and 1.5x. Note the changed timeline span, then undo if it was only a test.",
    "caveat": "This changes the selected item in your edit, not just how fast you preview it. Listen to the exported sound and check pitch, captions and joins before publishing."
  },
  {
    "id": "save-and-export",
    "category": "Export",
    "title": "Save and review export settings",
    "time": "5 min",
    "summary": "Check your saved project and export options, then use a final-file review checklist.",
    "steps": [
      {
        "title": "Save the intended edit",
        "text": "Check the current project and use Save. After reopening, confirm that your intended changes remain. The example below uses a separate 12-second project, not the trimmed timeline from the earlier lesson.",
        "media": "editor-save"
      },
      {
        "title": "Open Export",
        "text": "Open Export and review the available resolution and any plan watermark information. Do not infer availability from a tutorial screenshot.",
        "media": "export-settings"
      },
      {
        "title": "Render and review",
        "text": "When you choose to render, wait for completion, download the finished file and watch it all the way through. Check meaning, words, framing and sound. A completed render or download is not shown in these captures.",
        "media": null
      }
    ],
    "task": "Before rendering, write a four-part review checklist: meaning, words, frame, sound.",
    "caveat": "Available resolutions and watermark options can depend on your clip and account. A larger output size does not restore missing source detail. Check the finished file before publishing."
  },
  {
    "id": "word-timing",
    "category": "Captions",
    "title": "Adjust one word's start time",
    "time": "4 min",
    "summary": "Use the word timing controls and check the applied duration.",
    "steps": [
      {
        "title": "Inspect the word bounds",
        "text": "Open the word Timing controls. This example starts at 1.20 seconds and ends at 2.40 seconds, with a duration of 1200ms.",
        "media": "word-timing-before"
      },
      {
        "title": "Adjust the start carefully",
        "text": "The start changes to 1.25 seconds while the end remains at 2.40 seconds. The displayed duration changes to 1150ms. Listen around the boundary rather than guessing from the text alone.",
        "media": "word-timing-adjusted"
      },
      {
        "title": "Apply and review in context",
        "text": "Use Apply Word Timing, then inspect the transcript. The word badge shows 1.15s after applying.",
        "media": "word-timing-applied"
      },
      {
        "title": "Save and check again",
        "text": "Save and reopen your project to check that the timing remains. This example keeps the 1.15-second badge and corrected wording.",
        "media": "correction-reopened"
      }
    ],
    "task": "On a disposable copy, adjust one word slightly, listen with its neighbours and check the sentence before keeping the change.",
    "caveat": "A timing value can be saved without matching the speech perfectly. Listen to the word with its neighbours and check the exported subtitles before publishing."
  },
  {
    "id": "object-tracker-setup",
    "category": "Framing",
    "title": "Find object tracker scope and target setup",
    "time": "3 min",
    "summary": "Inspect scope and open the target picker without mistaking setup for tracking success.",
    "steps": [
      {
        "title": "Inspect tracker scope",
        "text": "Open Object tracker and check whether the intended range is this scene or the whole clip.",
        "media": "tracker-scope"
      },
      {
        "title": "Inspect the target picker",
        "text": "The picker opens before a target is applied. Check the intended target and scope before committing in your own project. This capture stops before Apply.",
        "media": "tracker-picker"
      }
    ],
    "task": "Locate the tracker scope and target picker. Explain the intended target before applying anything.",
    "caveat": "No target was applied and no successful tracking motion or export is demonstrated. Do not treat opening the picker as a tracking result."
  }
];
export const captureMedia={
  "editor-overview": {
    "src": "/learning/editor/editor-overview.png",
    "width": 1920,
    "height": 1440,
    "alt": "The Vireo editor with preview, caption styles, transcript and timeline",
    "caption": "Find the preview in the centre, transcript on the right and timeline below.",
    "annotated": false,
    "original": "01-editor-orientation.png",
    "crop": [
      0,
      0,
      1920,
      1440
    ]
  },
  "layout-open": {
    "src": "/learning/editor/layout-open.png",
    "width": 265,
    "height": 545,
    "alt": "Layout menu with scene and whole-clip scope",
    "caption": "Choose the range before selecting a layout.",
    "annotated": true,
    "original": "02-layout-menu.png",
    "crop": [
      1115,
      65,
      1380,
      610
    ]
  },
  "layout-scope": {
    "src": "/learning/editor/layout-scope.png",
    "width": 265,
    "height": 510,
    "alt": "This scene and Whole clip controls above layout choices",
    "caption": "This scene and Whole clip are separate controls.",
    "annotated": true,
    "original": "02-layout-menu.png",
    "crop": [
      1115,
      100,
      1380,
      610
    ]
  },
  "layout-auto": {
    "src": "/learning/editor/layout-auto.png",
    "width": 265,
    "height": 510,
    "alt": "Auto layout option and eligible-layout explanation",
    "caption": "Auto is selected. Review the complete scene after choosing it.",
    "annotated": true,
    "original": "02-layout-menu.png",
    "crop": [
      1115,
      100,
      1380,
      610
    ]
  },
  "reframe-on": {
    "src": "/learning/editor/reframe-on.png",
    "width": 500,
    "height": 66,
    "alt": "Auto Reframe ON and Apply to whole clip controls",
    "caption": "Auto Reframe is ON. Play the clip to review movement.",
    "annotated": true,
    "original": "01-editor-orientation.png",
    "crop": [
      700,
      64,
      1200,
      130
    ]
  },
  "reframe-off": {
    "src": "/learning/editor/reframe-off.png",
    "width": 500,
    "height": 66,
    "alt": "Auto Reframe OFF with Held layout Fit",
    "caption": "OFF is shown alongside Held layout: Fit. Turning motion off is separate from choosing a layout.",
    "annotated": true,
    "original": "03-autoreframe-off.png",
    "crop": [
      700,
      64,
      1200,
      130
    ]
  },
  "reframe-scope": {
    "src": "/learning/editor/reframe-scope.png",
    "width": 500,
    "height": 66,
    "alt": "Apply to whole clip beside the selected-item switch",
    "caption": "The captured scope controls distinguish This video item from Apply to whole clip.",
    "annotated": true,
    "original": "03-autoreframe-off.png",
    "crop": [
      700,
      64,
      1200,
      130
    ]
  },
  "caption-inspector": {
    "src": "/learning/editor/caption-inspector.png",
    "width": 350,
    "height": 545,
    "alt": "Typography tab and caption controls",
    "caption": "Typography contains the visible font, size, line and word-mode controls.",
    "annotated": true,
    "original": "04-typography.png",
    "crop": [
      70,
      135,
      420,
      680
    ]
  },
  "caption-modes": {
    "src": "/learning/editor/caption-modes.png",
    "width": 350,
    "height": 225,
    "alt": "Lines and Word Mode controls",
    "caption": "Lines and Word Mode are separate controls. Check visible wrapping after either change.",
    "annotated": true,
    "original": "04-typography.png",
    "crop": [
      70,
      450,
      420,
      675
    ]
  },
  "caption-single-word": {
    "src": "/learning/editor/caption-single-word.png",
    "width": 350,
    "height": 225,
    "alt": "Single word selected in Word Mode",
    "caption": "Single word is selected. Review timing through a whole sentence.",
    "annotated": true,
    "original": "05-single-word.png",
    "crop": [
      70,
      450,
      420,
      675
    ]
  },
  "caption-single-preview": {
    "src": "/learning/editor/caption-single-preview.png",
    "width": 580,
    "height": 1030,
    "alt": "Actual single-word preview showing CAPTIONS",
    "caption": "Single word shows one illustrative caption word at this moment.",
    "annotated": false,
    "original": "05-single-word.png",
    "crop": [
      700,
      145,
      1280,
      1175
    ]
  },
  "caption-lines": {
    "src": "/learning/editor/caption-lines.png",
    "width": 350,
    "height": 225,
    "alt": "Two Lines control selected",
    "caption": "2 Lines is selected. Check the actual line breaks in your own captions.",
    "annotated": true,
    "original": "07-two-lines.png",
    "crop": [
      70,
      450,
      420,
      675
    ]
  },
  "caption-lines-preview": {
    "src": "/learning/editor/caption-lines-preview.png",
    "width": 580,
    "height": 290,
    "alt": "Short illustrative phrase on two visible lines",
    "caption": "This short phrase fits two lines. Longer captions can wrap differently.",
    "annotated": false,
    "original": "07-two-lines.png",
    "crop": [
      700,
      880,
      1280,
      1170
    ]
  },
  "preview-selected": {
    "src": "/learning/editor/preview-selected.png",
    "width": 580,
    "height": 345,
    "alt": "Caption selected with corner handles in the preview",
    "caption": "The outline and corner handles identify the selected caption.",
    "annotated": true,
    "original": "14-preview-caption-selected.png",
    "crop": [
      700,
      830,
      1280,
      1175
    ]
  },
  "preview-position": {
    "src": "/learning/editor/preview-position.png",
    "width": 580,
    "height": 455,
    "alt": "Caption after moving upward in the preview",
    "caption": "The selected caption is higher than in the preceding image. The frame sequence below shows the intermediate states.",
    "annotated": true,
    "original": "15-preview-caption-moved.png",
    "crop": [
      700,
      720,
      1280,
      1175
    ],
    "video": "/learning/editor/preview-caption-drag.mp4",
    "videoLabel": "Four chronological editor screenshots captured over 0.5 seconds, slowed to 2 seconds for reading. No cursor was captured; this is not a continuous screen recording."
  },
  "preview-resize": {
    "src": "/learning/editor/preview-resize.png",
    "width": 350,
    "height": 235,
    "alt": "Caption Item Properties with Position X, Position Y, Scale and Opacity",
    "caption": "The captured inspector shows Position Y 756, Scale 1.00x and Opacity 100%. No resize is demonstrated.",
    "annotated": true,
    "original": "15-preview-caption-moved.png",
    "crop": [
      70,
      65,
      420,
      300
    ]
  },
  "canvas-ratio": {
    "src": "/learning/editor/canvas-ratio.png",
    "width": 1135,
    "height": 1115,
    "alt": "Square canvas with 1:1 ratio control above the preview",
    "caption": "The canvas is square in this captured state. Caption placement must be reviewed after a ratio change.",
    "annotated": true,
    "original": "17-canvas-square.png",
    "crop": [
      420,
      65,
      1555,
      1180
    ]
  },
  "canvas-landscape": {
    "src": "/learning/editor/canvas-landscape.png",
    "width": 1135,
    "height": 1115,
    "alt": "Landscape canvas with 16:9 ratio control",
    "caption": "Compare the same moment in a landscape canvas.",
    "annotated": true,
    "original": "18-canvas-landscape.png",
    "crop": [
      420,
      65,
      1555,
      1180
    ]
  },
  "safe-guides": {
    "src": "/learning/editor/safe-guides.png",
    "width": 580,
    "height": 1110,
    "alt": "Safe Zones ON and visible header and action-button guide regions",
    "caption": "Guides identify review areas, not a guarantee about every platform interface.",
    "annotated": true,
    "original": "14-preview-caption-selected.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "safe-guides-off": {
    "src": "/learning/editor/safe-guides-off.png",
    "width": 580,
    "height": 1110,
    "alt": "Safe Zones OFF with guide overlays hidden",
    "caption": "The guide overlays are hidden in this captured state.",
    "annotated": true,
    "original": "16-safe-guides-off.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "export-settings": {
    "src": "/learning/editor/export-settings.png",
    "width": 520,
    "height": 850,
    "alt": "Export Video dialog with 720p selected and source-detail warning",
    "caption": "720p is selected. Check the source-detail warning before rendering. This lesson shows settings, not a completed download.",
    "annotated": false,
    "original": "08-export-dialog.png",
    "crop": [
      700,
      295,
      1220,
      1145
    ]
  },
  "timeline-overview": {
    "src": "/learning/editor/timeline-overview.png",
    "width": 850,
    "height": 250,
    "alt": "Timeline with selected video item and time ruler",
    "caption": "The timeline before the edits. This example spans 12 seconds.",
    "annotated": false,
    "original": "21-timeline-selected.png",
    "crop": [
      0,
      1190,
      850,
      1440
    ]
  },
  "timeline-selected": {
    "src": "/learning/editor/timeline-selected.png",
    "width": 820,
    "height": 170,
    "alt": "Selected video item with a white outline in the timeline",
    "caption": "The selection outline identifies the video item, not the caption track.",
    "annotated": true,
    "original": "21-timeline-selected.png",
    "crop": [
      0,
      1200,
      820,
      1370
    ]
  },
  "timeline-trim": {
    "src": "/learning/editor/timeline-trim.png",
    "width": 820,
    "height": 170,
    "alt": "Video item after its end was shortened",
    "caption": "The video item ends earlier in this state. Review the caption and audio ranges separately.",
    "annotated": true,
    "original": "22-timeline-trim-end.png",
    "crop": [
      0,
      1200,
      820,
      1370
    ]
  },
  "timeline-trim-hint": {
    "src": "/learning/editor/timeline-trim-hint.png",
    "width": 360,
    "height": 110,
    "alt": "Restore trimmed end hint showing plus 1.4 seconds",
    "caption": "The transcript area offers Restore trimmed end (+1.4s). This is a reversible timeline trim, not automatic analysis.",
    "annotated": false,
    "original": "22-timeline-trim-end.png",
    "crop": [
      1560,
      90,
      1920,
      200
    ]
  },
  "timeline-split": {
    "src": "/learning/editor/timeline-split.png",
    "width": 820,
    "height": 170,
    "alt": "Two adjacent video items with the first selected",
    "caption": "The visible boundary divides the item near the playhead. It is an edit boundary, not an analysis scene marker.",
    "annotated": true,
    "original": "23-timeline-split.png",
    "crop": [
      0,
      1200,
      820,
      1370
    ]
  },
  "timeline-duplicate": {
    "src": "/learning/editor/timeline-duplicate.png",
    "width": 820,
    "height": 170,
    "alt": "Timeline with a duplicated short segment beside the first segment",
    "caption": "A duplicated short segment is visible. Review subsequent items after any duplicate operation.",
    "annotated": true,
    "original": "24-timeline-duplicate.png",
    "crop": [
      0,
      1200,
      820,
      1370
    ]
  },
  "timeline-ripple": {
    "src": "/learning/editor/timeline-ripple.png",
    "width": 820,
    "height": 170,
    "alt": "Timeline after ripple delete with a shorter overall span",
    "caption": "The captured post-delete timeline is shorter. Check the new join and caption timing, rather than treating deletion as a local visual change.",
    "annotated": true,
    "original": "25-timeline-ripple-delete.png",
    "crop": [
      0,
      1200,
      820,
      1370
    ]
  },
  "transcript-edit": {
    "src": "/learning/editor/transcript-edit.png",
    "width": 360,
    "height": 335,
    "alt": "Transcript sentence textarea with Cancel and Save",
    "caption": "Edit the intended sentence, then review it against the audio.",
    "annotated": false,
    "original": "20-transcript-sentence-edit.png",
    "crop": [
      1560,
      140,
      1920,
      475
    ]
  },
  "transcript-word": {
    "src": "/learning/editor/transcript-word.png",
    "width": 360,
    "height": 145,
    "alt": "Save control below an editable transcript sentence",
    "caption": "Save applies the sentence edit. Listen again after changing the wording.",
    "annotated": true,
    "original": "20-transcript-sentence-edit.png",
    "crop": [
      1560,
      190,
      1920,
      335
    ]
  },
  "editor-save": {
    "src": "/learning/editor/editor-save.png",
    "width": 500,
    "height": 120,
    "alt": "Green Saved indicator after reopening the separate restored fixture",
    "caption": "Saved is shown after reopening this separate 12-second example.",
    "annotated": true,
    "original": "26-save-reopen-autoreframe-off.png",
    "crop": [
      0,
      0,
      500,
      120
    ]
  },
  "saved-reframe-off": {
    "src": "/learning/editor/saved-reframe-off.png",
    "width": 500,
    "height": 66,
    "alt": "Auto Reframe OFF retained in the reopened fixture",
    "caption": "Auto Reframe remains OFF after reopening this example.",
    "annotated": true,
    "original": "26-save-reopen-autoreframe-off.png",
    "crop": [
      700,
      64,
      1200,
      130
    ]
  },
  "item-speed": {
    "src": "/learning/editor/item-speed.png",
    "width": 350,
    "height": 340,
    "alt": "Video Item Properties with Speed set to 1x",
    "caption": "The selected video item has its own Speed control. Preview playback settings are a different control.",
    "annotated": true,
    "original": "21-timeline-selected.png",
    "crop": [
      70,
      60,
      420,
      400
    ]
  },
  "caption-typography": {
    "src": "/learning/editor/caption-typography.png",
    "width": 350,
    "height": 545,
    "alt": "Typography before resizing, with font size 70",
    "caption": "Find font, size, weight and line settings in Typography.",
    "annotated": true,
    "original": "04-typography.png",
    "crop": [
      70,
      135,
      420,
      680
    ]
  },
  "caption-size-after": {
    "src": "/learning/editor/caption-size-after.png",
    "width": 350,
    "height": 575,
    "alt": "Typography after resizing, with font size 95",
    "caption": "The size is now 95. Recheck the caption position after resizing.",
    "annotated": true,
    "original": "42-caption-resize-after.png",
    "crop": [
      70,
      135,
      420,
      710
    ]
  },
  "caption-resize-before": {
    "src": "/learning/editor/caption-resize-before.png",
    "width": 580,
    "height": 520,
    "alt": "Caption before resizing",
    "caption": "Before the captured resize. Compare both text size and vertical placement.",
    "annotated": false,
    "original": "41-caption-resize-before.png",
    "crop": [
      700,
      650,
      1280,
      1170
    ]
  },
  "caption-resize-after": {
    "src": "/learning/editor/caption-resize-after.png",
    "width": 580,
    "height": 520,
    "alt": "Larger caption after resizing and moving upward",
    "caption": "After the captured resize: larger text and a higher position. The anchor did not stay fixed.",
    "annotated": false,
    "original": "42-caption-resize-after.png",
    "crop": [
      700,
      650,
      1280,
      1170
    ]
  },
  "caption-colours": {
    "src": "/learning/editor/caption-colours.png",
    "width": 350,
    "height": 655,
    "alt": "Effects panel with Active colour selected",
    "caption": "Active is selected with an orange swatch. Text, Active, Stroke and Box are different targets.",
    "annotated": true,
    "original": "30-caption-active-color-effects.png",
    "crop": [
      70,
      135,
      420,
      790
    ]
  },
  "caption-highlight-preview": {
    "src": "/learning/editor/caption-highlight-preview.png",
    "width": 580,
    "height": 230,
    "alt": "Phrase with VIVID highlighted orange",
    "caption": "VIVID is highlighted while CREATE stays visible. Play the sentence to check the timing.",
    "annotated": false,
    "original": "30-caption-active-color-effects.png",
    "crop": [
      700,
      940,
      1280,
      1170
    ]
  },
  "caption-phrase": {
    "src": "/learning/editor/caption-phrase.png",
    "width": 350,
    "height": 225,
    "alt": "Phrase plus highlight selected in Word Mode",
    "caption": "Phrase + highlight keeps surrounding words visible. Lines is a separate choice.",
    "annotated": true,
    "original": "04-typography.png",
    "crop": [
      70,
      450,
      420,
      675
    ]
  },
  "correction-entered": {
    "src": "/learning/editor/correction-entered.png",
    "width": 360,
    "height": 335,
    "alt": "Sentence rewrite entered before saving",
    "caption": "The revised wording is entered, ready to save.",
    "annotated": false,
    "original": "27-transcript-correction-entered.png",
    "crop": [
      1560,
      140,
      1920,
      475
    ]
  },
  "correction-applied": {
    "src": "/learning/editor/correction-applied.png",
    "width": 360,
    "height": 250,
    "alt": "Rewritten sentence in the transcript after applying the edit",
    "caption": "The changed wording appears in the transcript. Recheck timing after a sentence rewrite.",
    "annotated": false,
    "original": "28-transcript-correction-applied.png",
    "crop": [
      1560,
      140,
      1920,
      390
    ]
  },
  "correction-reopened": {
    "src": "/learning/editor/correction-reopened.png",
    "width": 360,
    "height": 250,
    "alt": "Corrected text and adjusted duration after reopening",
    "caption": "The corrected wording and 1.15-second duration remain after reopening.",
    "annotated": false,
    "original": "31-timing-correction-save-reopened.png",
    "crop": [
      1560,
      140,
      1920,
      390
    ]
  },
  "word-timing-before": {
    "src": "/learning/editor/word-timing-before.png",
    "width": 345,
    "height": 220,
    "alt": "Word Timing controls with start 1.20 and end 2.40 seconds",
    "caption": "Before adjustment: start 1.20s, end 2.40s, duration 1200ms.",
    "annotated": true,
    "original": "29-word-timing-controls-5ec3f3eb.png",
    "crop": [
      1515,
      25,
      1860,
      245
    ]
  },
  "word-timing-adjusted": {
    "src": "/learning/editor/word-timing-adjusted.png",
    "width": 345,
    "height": 220,
    "alt": "Word Timing start adjusted to 1.25 seconds",
    "caption": "Start is now 1.25s and end remains 2.40s. The displayed duration is 1150ms.",
    "annotated": true,
    "original": "39-word-timing-start-adjusted-1742539d.png",
    "crop": [
      1515,
      25,
      1860,
      245
    ]
  },
  "word-timing-applied": {
    "src": "/learning/editor/word-timing-applied.png",
    "width": 360,
    "height": 250,
    "alt": "Transcript word showing the applied 1.15-second duration",
    "caption": "After Apply Word Timing, the badge shows 1.15s.",
    "annotated": false,
    "original": "40-word-timing-applied-d1daae3f.png",
    "crop": [
      1560,
      140,
      1920,
      390
    ]
  },
  "layout-fill": {
    "src": "/learning/editor/layout-fill.png",
    "width": 580,
    "height": 1110,
    "alt": "Manual Fill with a tight crop of the speaker",
    "caption": "Fill makes a tighter view and can remove source detail at the sides. Inspect the actual result.",
    "annotated": false,
    "original": "32-layout-fill.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "layout-blur": {
    "src": "/learning/editor/layout-blur.png",
    "width": 580,
    "height": 1110,
    "alt": "Manual Blur with background and inset sharp region",
    "caption": "Blur changes the background treatment. Review the sharp region separately from the background.",
    "annotated": false,
    "original": "33-layout-blur.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "layout-panels": {
    "src": "/learning/editor/layout-panels.png",
    "width": 580,
    "height": 1110,
    "alt": "Manual Split with unassigned views on single-person footage",
    "caption": "This one-person example has unassigned views. Choose what each panel should show.",
    "annotated": false,
    "original": "34-layout-split.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "layout-three": {
    "src": "/learning/editor/layout-three.png",
    "width": 580,
    "height": 1110,
    "alt": "Manual Three layout with unassigned panels",
    "caption": "Unassigned panels need deliberate setup. A multi-panel layout does not create additional camera views.",
    "annotated": false,
    "original": "35-layout-three.png",
    "crop": [
      700,
      65,
      1280,
      1175
    ]
  },
  "layout-whole-scope": {
    "src": "/learning/editor/layout-whole-scope.png",
    "width": 265,
    "height": 510,
    "alt": "Layout menu with Whole clip scope selected",
    "caption": "Whole clip is selected in this captured menu. Scope is separate from the layout choice.",
    "annotated": true,
    "original": "36-layout-whole-clip-menu.png",
    "crop": [
      1110,
      100,
      1375,
      610
    ]
  },
  "tracker-scope": {
    "src": "/learning/editor/tracker-scope.png",
    "width": 580,
    "height": 250,
    "alt": "Object tracker menu with scope choices",
    "caption": "The tracker menu distinguishes this scene and whole clip. Check scope in the target picker before proceeding.",
    "annotated": false,
    "original": "37-tracker-scope-menu.png",
    "crop": [
      700,
      65,
      1280,
      315
    ]
  },
  "tracker-picker": {
    "src": "/learning/editor/tracker-picker.png",
    "width": 620,
    "height": 590,
    "alt": "Object tracker selection dialog before Apply",
    "caption": "The picker is open before a target is applied. No successful tracking run is demonstrated.",
    "annotated": false,
    "original": "38-tracker-picker-before-selection.png",
    "crop": [
      680,
      450,
      1300,
      1040
    ]
  },
  "speed-before": {
    "src": "/learning/editor/speed-before.png",
    "width": 350,
    "height": 335,
    "alt": "Selected video item with Speed 1x",
    "caption": "The selected item starts at 1x. This is an edit setting, not preview speed.",
    "annotated": true,
    "original": "43-selected-item-speed-before.png",
    "crop": [
      70,
      65,
      420,
      400
    ]
  },
  "speed-after": {
    "src": "/learning/editor/speed-after.png",
    "width": 350,
    "height": 335,
    "alt": "Selected video item with Speed 1.5x",
    "caption": "The selected video item is set to 1.5x.",
    "annotated": true,
    "original": "44-selected-item-speed-1p5.png",
    "crop": [
      70,
      65,
      420,
      400
    ]
  },
  "speed-span": {
    "src": "/learning/editor/speed-span.png",
    "width": 850,
    "height": 250,
    "alt": "Timeline after the 12-second item became 8 seconds",
    "caption": "The timeline span is now 8 seconds rather than 12. Review captions, neighbouring items and sound.",
    "annotated": false,
    "original": "44-selected-item-speed-1p5.png",
    "crop": [
      0,
      1190,
      850,
      1440
    ]
  },
  "speed-reopened": {
    "src": "/learning/editor/speed-reopened.png",
    "width": 350,
    "height": 335,
    "alt": "Selected item speed 1.5x retained after reopening",
    "caption": "The selected item remains at 1.5x after reopening.",
    "annotated": true,
    "original": "46-item-speed-reopen.png",
    "crop": [
      70,
      65,
      420,
      400
    ]
  },
  "lines-one-candidate": {
    "src": "/learning/editor/lines-one-candidate.png",
    "width": 580,
    "height": 250,
    "alt": "Local candidate preview with one visible caption line",
    "caption": "One visible line in this example. See the wrapping limitation below.",
    "annotated": false,
    "original": "06-one-line-76a1c661.png",
    "crop": [
      700,
      920,
      1280,
      1170
    ]
  },
  "lines-two-candidate": {
    "src": "/learning/editor/lines-two-candidate.png",
    "width": 580,
    "height": 250,
    "alt": "Local candidate preview with two visible caption lines",
    "caption": "Two visible lines at the same moment. Check the complete sentence too.",
    "annotated": false,
    "original": "07-two-lines-dcdfb7ce.png",
    "crop": [
      700,
      920,
      1280,
      1170
    ]
  },
  "lines-controls-candidate": {
    "src": "/learning/editor/lines-controls-candidate.png",
    "width": 350,
    "height": 225,
    "alt": "Candidate Lines controls with 2 Lines selected",
    "caption": "2 Lines is selected under Typography & Layout.",
    "annotated": true,
    "original": "07-two-lines-dcdfb7ce.png",
    "crop": [
      70,
      450,
      420,
      675
    ]
  }
};
