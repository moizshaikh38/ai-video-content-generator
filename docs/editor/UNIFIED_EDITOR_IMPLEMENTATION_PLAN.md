# Unified Editor Implementation Plan (Phases 0–14)
**VireoClip AI — Production-Grade Video Editing Engine Architecture**

---

## 1. Executive Summary & Architectural Audit

VireoClip currently has two parallel, disconnected editing paradigms:
1. **Beginner / Flat Mode:** Operates on MongoDB `clips` document fields (`trim_start_offset`, `crop_config`, `caption_config`, `overlay_config`).
2. **Pro Multi-Track Mode:** Operates on MongoDB `editor_projects` collection with multi-track data (`tracks`, `items`, `keyframes`, `effects`, `audio`).

### Key Deficiencies & Critical Bugs Identified:
1. **The Disconnected Render Pipeline (Critical Defect):**
   - In Pro mode, user modifications (B-roll, text overlays, secondary audio, keyframe zooms) are saved to `editor_projects`, but `handleRenderChanges` triggers `POST /clips/:clipId/render` which calls `ClipRenderService.renderClipJob`.
   - `ClipRenderService.renderClipJob` reads *only* the flat `clip` document, completely ignoring `editor_projects`.
   - As a result, Pro timeline edits never reach the rendered MP4 export.
2. **Duplicate Caption Burn Risk:**
   - When a clip has completed rendering (`clip.render_status === 'ready'`), `getClipEditorData` returns the signed URL of the *rendered* MP4 with burned-in subtitles.
   - When loaded into `<EditorCanvas>`, live CSS kinetic captions are rendered on top of the already burned-in subtitles, causing double-rendered, overlapping text.
   - Fix: The editor preview canvas must always stream clean source video (`clip.source_storage_path` or `project.source_url`) with independently composited CSS overlay layers during editing. The rendered MP4 should only be displayed in a dedicated "Export Review / Final Render Preview" mode.
3. **Dual State & Desynchronization:**
   - Beginner controls and Pro controls maintain separate state variables in `ClipEditorPage.tsx`. Switching modes risks loss of edits and desynchronizes video playheads.
   - Fix: One canonical `EditorProject` document. Beginner and Pro modes become *workspace view presets* operating on the exact same project document and canonical timeline.
4. **Inspector Layout Shifts:**
   - `ClipEditorPage.tsx` dynamically switches widths (384px, 540px, 720px) depending on `activeTab`, violently resizing the video preview canvas.
   - Fix: Standardize on an elevated dark inspector (fixed 420px width on desktop or resizable/collapsible) with grouped progressive disclosure tabs: `Edit` (Captions, Framing, Audio), `Optimize` (Hook, Thumbnail, A/B), and `Package` (Content Pack, Dubbing, Publishing).
5. **Autosave & Concurrency Fragility:**
   - Edits are not cleanly debounced or revision-locked; concurrent writes can overwrite newer revisions.

---

## 2. Capability Matrix

| Feature Area | Existing Capability | Missing Capability | Defect / Risk | Proposed Solution |
| :--- | :--- | :--- | :--- | :--- |
| **Project Model** | `EditorProject` and `Clip` exist in DB | Unified single document schema syncing flat clip & timeline items | Dual state; edits in one mode do not propagate to the other | Canonical `EditorProject` as single source of truth; bidirectional synchronization bridge |
| **Preview Pipeline** | `<EditorCanvas>` with CSS overlays | Clean unburned source preview stream separation | Rendered clips with burned subtitles get double captions in editor | Dedicated `cleanSourceUrl` for editing canvas; `renderedPreviewUrl` only for Export Review |
| **Render Pipeline** | `ClipRenderService` (flat) and `ProEditorService.compileRenderGraph` (graph) | Unified render router calling compiled FFmpeg graph when project has edits | Pro edits completely discarded on render | Route `POST /clips/:clipId/render` to check `EditorProject` and invoke `compileRenderGraph` with full asset resolution |
| **Playback Clock** | Independent video elements in Pro vs Beginner | Shared singleton playback controller and store | Video time and playhead desynchronize on mode switch | `useEditorPlayback` hook with unified playhead clock and bounded seek |
| **Transcript Editing** | Cue text editing in simple list | Document-like word-level transcript editor with ripple cutting | Deleting text only hides captions, does not cut video | `TranscriptEditor` component with word-level click-to-seek and true ripple edit |
| **Caption Studio** | Preset dropdown with 6 styles | Visual preset gallery with live typography cards and direct canvas drag | Arbitrary pixel offsets; stale word tokens on edited cues | Pointer-events draggable captions with normalized coordinates (0.0–1.0) and safe zone bounds |
| **Smart Framing** | Dynamic smart crop filter & face tracking | Seamless sync between timeline boundaries and smart reframe keyframes | Stale keyframe warnings when trims change | Automatic keyframe transformation to timeline timebase; fallback to center |
| **Audio Engine** | Master volume & basic enhancement | Multi-track audio mixing, ducking, speech cleanup, and peak limiter | In-memory web audio clipping on volume > 100% | Gain limiter in preview; full FFmpeg `amix` + `alimiter` in export graph |
| **AI Workspaces** | 7 standalone workspaces | Clean drawer / progressive tab integration with structured edit ops | 11 horizontal tabs overflowing header; UI clutter | Progressive workflow tabs (Edit / Optimize / Package / AI Copilot) |

---

## 3. Component Architecture & Files Affected

### Frontend Refactoring
- `src/pages/ClipEditorPage.tsx`: Refactored into a high-performance shell integrating unified state hooks.
- `src/components/editor/EditorShell.tsx`: Root dark-neutral workspace container (`#09090b`).
- `src/components/editor/EditorTopBar.tsx`: Unified header (Back, Title, Save status, Undo/Redo, Quality, View Preset toggle, Export).
- `src/components/editor/EditorSidebar.tsx`: Grouped navigation drawer (Edit, Captions, Framing, Audio, AI Tools, Media).
- `src/components/editor/PreviewCanvas.tsx`: High-performance video canvas rendering clean source video with independently composited CSS layers.
- `src/components/editor/PlaybackController.tsx`: Synchronized time display, transport controls, loop, and safe-guide toggles.
- `src/components/editor/ContextualInspector.tsx`: Dynamic right panel displaying settings for active selection or active tool.
- `src/components/editor/UnifiedTimeline.tsx`: Multi-track timeline supporting trim, split, ripple delete, duplicate, keyframes, and track controls.
- `src/components/editor/TranscriptEditor.tsx`: Document-style transcript editor with word-level highlight, seek, and ripple delete.
- `src/components/editor/ExportDialog.tsx`: Modal supporting 720p/1080p, aspect ratio, burned vs sidecar subtitles, and real-time job tracking.

### Frontend Hooks (`src/hooks/`)
- `useEditorProject.ts`: Loads, synchronizes, and mutates canonical `EditorProject`.
- `useEditorPlayback.ts`: Single video clock, seek, play/pause, timecode formatting.
- `useEditorSelection.ts`: Selected track, item, word, or tool.
- `useEditorHistory.ts`: Bounded undo/redo stack (max 50 revisions) for deterministic time-travel.
- `useEditorAutosave.ts`: Debounced server persistence with revision concurrency checks.
- `useEditorRender.ts`: Render job triggering, stage tracking, polling, and download handling.

### Backend Enhancements (`server/src/`)
- `server/src/services/clipRenderService.ts`:
  - Enhance `getClipEditorData` to provide `cleanSourceUrl` (unburned source) and `renderedPreviewUrl`.
  - In `renderClipJob`, check if an active `EditorProject` exists for the clip. If present, compile and execute the complete render graph via `ProEditorService.compileRenderGraph`.
- `server/src/routes/projectRoutes.ts` & `server/src/controllers/clipController.ts`:
  - Ensure `/editor-projects/:id/render` endpoint exists and routes to render job execution.

---

## 4. Phase-by-Phase Execution Order

- **Phase 0:** Audit & Architecture Specification (this document).
- **Phase 1:** Unified Editor Architecture & State Hooks (`useEditorProject`, `useEditorPlayback`, `useEditorHistory`, `useEditorAutosave`).
- **Phase 2:** Professional Dark-Neutral UI Shell (`EditorShell`, `EditorTopBar`, `EditorSidebar`, `ContextualInspector`).
- **Phase 3:** Preview & Render Correctness (clean source streaming, elimination of duplicate captions, backend compile graph integration).
- **Phase 4:** Document-Like Transcript Editing (word-level seek, selection, text deletion with true timeline ripple cuts).
- **Phase 5:** Advanced Caption Studio & Draggable Overlays (visual presets, normalized positioning, safe zones).
- **Phase 6:** Smart Layout & Dynamic Reframe (multi-aspect ratio, smoothed keyframes, fallback).
- **Phase 7:** Unified Multi-Track Timeline (trimming, splitting, ripple delete, keyframes, waveforms).
- **Phase 8:** Audio & Media Workflow (waveforms, ducking, speech cleanup, B-roll library).
- **Phase 9:** Seamless Integration of Existing AI Workspaces (Producer, Translation, Hook Lab, Thumbnail Lab, Autopilot, A/B Studio).
- **Phase 10:** Vireo AI Copilot (typed edit-operation schema, preview diffs, user approval).
- **Phase 11:** Autosave, Undo/Redo & Revision Concurrency.
- **Phase 12:** Export Pipeline & Quality Validation (720p/1080p, real-time stage progress, verified MP4 download).
- **Phase 13:** Performance Optimization (isolated playback renders, memoization, lazy loading).
- **Phase 14:** Comprehensive Test Suite & Verification (unit, integration, and browser E2E tests).
