# VireoClip Feature Implementation Plan

> **Document Status:** Actionable Technical Implementation Specifications  
> **Target System:** VireoClip Video Creation Platform  
> **Development Model:** Independent Clean-Room Implementation  
> **Author:** Principal Software Architect & AI Video Specialist  
> **Date:** October 2026  

---

## 1. Overview & Implementation Scope

This document provides complete, actionable technical specifications for every capability approved for development in VireoClip based on the comparative audit with Hypit.

### Approved Features in Scope:
1. **Feature 1:** Word-Anchored Semantic Timeline Binding (Ripple Editing without Drift)
2. **Feature 2:** Declarative Brand & Style Recipes (`.vrecipe.json` & Mobile Safe Zones)
3. **Feature 3:** Viral Structure Blueprint & Pacing Extractor (Reference-Video Intelligence)
4. **Feature 4:** Fallback AI B-roll Asset Generation (Stock Search Enrichment via Replicate/OpenAI)
5. **Feature 5:** Declarative FFmpeg Filter Graph Compiler (Script-based complex filter pipeline)

---

## 2. Feature Specification 1: Word-Anchored Semantic Timeline

### 2.1 Feature Definition
* **Problem Being Solved:** When users cut, trim, or re-arrange dialogue in the transcript editor, overlays (B-roll, text stickers, sound effects) configured at absolute floating-point timestamps drift out of sync with the speaker's words.
* **Target User Workflow:** A creator cuts a 5-second rambling sentence from a podcast. The attached B-roll illustration automatically ripples back by exactly 5 seconds, maintaining its perfect alignment with the target keyword.
* **Expected Improvement:** Eliminates 100% of manual overlay realignment post-trim; reduces short-form editing time from 8 minutes to under 2 minutes per clip.
* **Explicit Non-Goals:** Real-time client-side video frame interpolation or automated optical-flow morph cuts.

### 2.2 Current Implementation Baseline
* **Existing Files:**
  * `server/src/types/producer.ts` (`BrollOverlay`, `TextOverlay`, `SceneSegment`)
  * `src/types/editor.ts` (`ClipItem`, `Track`, `EditorProject`)
  * `server/src/services/proEditorService.ts` (`compileProjectToFFmpeg()`)
* **Existing Services Reused:** `transcriptionService.ts` (Groq Whisper word timestamps).
* **Current Limitations:** `startTime` and `endTime` are absolute numbers. No concept of parent-child binding exists between words and secondary media items.

### 2.3 Proposed Solution Architecture
* **Data Model:** Add `anchor: WordAnchor` to `BrollOverlay` and `TextOverlay`.
  ```typescript
  export interface WordAnchor {
    anchorWordId: string;         // e.g. "w_42"
    offsetMs: number;             // Offset from word start (ms)
    dockingBehavior: 'lock-to-word' | 'ripple-with-speech' | 'absolute-time';
  }
  ```
* **Frontend Sync Engine:** In `src/pages/ClipEditorPage.tsx`, whenever `transcript` state mutates (deletion of words), an anchor resolver function recalculates active `startTime` and `endTime` for all anchored items.
* **Backend Render Compiler:** Before generating the FFmpeg filter graph in `server/src/services/proEditorService.ts`, the backend resolves all `WordAnchor` offsets against the final rendered transcript timeline.

### 2.4 Implementation Sequence & Tasks
* **Task 1.1: Schema Extension & Word ID Generation**
  * *Affected Files:* `server/src/types/producer.ts`, `server/src/services/transcriptionService.ts`
  * *Action:* Ensure Whisper transcription assigns deterministic, persistent `id` fields to each word object (`w_${index}_${Math.round(start*1000)}`).
  * *Acceptance Criteria:* Every transcribed word contains a unique, non-null `id`.
* **Task 1.2: Client-Side Ripple Binding Engine**
  * *Affected Files:* `src/utils/timelineAnchorUtils.ts` (new suggestion), `src/pages/ClipEditorPage.tsx`
  * *Action:* Write utility function `recalculateAnchoredTracks(tracks, words)` that adjusts item start/end boundaries on transcript edits.
  * *Acceptance Criteria:* Deleting 3 words shifts all downstream anchored B-roll clips left by the exact duration of the deleted words.
* **Task 1.3: FFmpeg Multi-Track Anchor Compilation**
  * *Affected Files:* `server/src/services/proEditorService.ts`
  * *Action:* Update filter complex generator to resolve word anchors before building `overlay=enable='between(t,...)'` expressions.
  * *Acceptance Criteria:* Rendered video output matches client-side preview within $\pm 1$ video frame ($<33\text{ms}$).

### 2.5 Cost & Performance
* **Engineering Complexity:** **M** (Medium — ~4–5 engineering days).
* **Inference Cost Impact:** $0.00 (Zero AI cost; mathematical recalculation).
* **Render-Time Impact:** Negligible ($<5\text{ms}$ CPU time during filter generation).

---

## 3. Feature Specification 2: Declarative Brand & Style Recipes (`.vrecipe.json`)

### 3.1 Feature Definition
* **Problem Being Solved:** Brand styling (fonts, active word colors, animations, safe-zone margins) is fragmented and hard-coded. Creators cannot apply consistent, reusable visual templates across multiple videos.
* **Target User Workflow:** A creator selects "Hormozi Punchy" or "Minimalist Corporate" from a dropdown. In one click, captions, fonts, active word highlights, safe margins, and audio ducking update instantly.
* **Expected Improvement:** Instant visual re-theming; 100% prevention of caption clipping behind TikTok/Reels UI buttons.
* **Explicit Non-Goals:** Creating an in-browser 3D animation keyframing tool.

### 3.2 Current Implementation Baseline
* **Existing Files:**
  * `server/src/services/captionService.ts` (`generateAssSubtitles()`)
  * `src/components/editor/CaptionsPanel.tsx` (UI presets)
* **Current Limitations:** Hard-coded style maps with fixed ASS coordinate positions that ignore platform-specific mobile overlay safe zones.

### 3.3 Proposed Solution Architecture
* **Schema Definition:** Create `server/src/types/recipe.ts` defining `VireoStyleRecipe`.
* **Preset Registry:** Create built-in default recipes stored as JSON in `server/src/recipes/`:
  * `hormozi-punchy.vrecipe.json` (Yellow karaoke highlight, Montserrat Black, 72% Y position).
  * `mrbeast-hyper.vrecipe.json` (Pop animations, green accents, rapid word batching).
  * `aliabdaal-clean.vrecipe.json` (Inter, subtle white/slate highlight, lower third).
  * `corporate-podcast.vrecipe.json` (Elegant serif/sans pairing, soft background box).
* **Safe-Zone Overlay in Editor:** Display an interactive toggle in `ClipEditorPage.tsx` showing the TikTok/Reels/Shorts UI overlay safe bounds (top 12%, bottom 20%, right 15%).

### 3.4 Implementation Sequence & Tasks
* **Task 2.1: Recipe Schema & Default JSON Definitions**
  * *Affected Files:* `server/src/types/recipe.ts` (new suggestion), `server/src/recipes/*.json`
  * *Action:* Author standard JSON recipes covering 6 major short-form creator archetypes.
  * *Acceptance Criteria:* JSON schemas validate against TypeScript interface.
* **Task 2.2: Recipe-to-ASS Subtitle Compiler**
  * *Affected Files:* `server/src/services/captionService.ts`
  * *Action:* Modify `generateAssSubtitles()` to accept a `VireoStyleRecipe` parameter and generate corresponding Advanced SubStation Alpha style headers and karaoke tags (`{\k...}`).
  * *Acceptance Criteria:* Output ASS file places subtitles within `safeArea.bottomInsetPercent` bounds.
* **Task 2.3: Safe Zone Preview Component**
  * *Affected Files:* `src/components/editor/MobileSafeZoneOverlay.tsx` (new suggestion), `src/components/editor/VideoPreview.tsx`
  * *Action:* Render translucent SVG overlay indicating TikTok/Reels dead zones on the preview player.
  * *Acceptance Criteria:* Users can toggle mobile safe-zone guides over the video canvas.

### 3.5 Cost & Performance
* **Engineering Complexity:** **S** (Small — ~2–3 engineering days).
* **Inference Cost Impact:** $0.00.
* **Render-Time Impact:** Zero additional overhead (ASS subtitle rendering performance remains unchanged).

---

## 4. Feature Specification 3: Viral Structure Blueprint & Pacing Extractor

### 4.1 Feature Definition
* **Problem Being Solved:** Creators struggle to identify the ideal rhythm, cut pacing, and hook length to make a clip go viral.
* **Target User Workflow:** The creator pastes the URL of a 1M+ view viral TikTok/Reels short. VireoClip analyzes the reference video's structural rhythm (hook duration, words-per-second, B-roll cadence) and applies that exact structural blueprint to their uploaded raw podcast.
* **Expected Improvement:** Clips adhere to proven psychological retention curves; increases clip retention rates by an estimated 25–40%.
* **Explicit Non-Goals:** Scraping private TikTok metrics or automatically copying copyrighted footage.

### 4.2 Current Implementation Baseline
* **Existing Files:**
  * `server/src/services/videoService.ts` (`downloadVideo()`)
  * `server/src/services/segmentationService.ts`
  * `server/src/services/highlightScoreService.ts`
* **Current Limitations:** VireoClip currently scores highlights based on standalone text enthusiasm and silence detection, without considering the pacing blueprint of high-performing creator references.

### 4.3 Proposed Solution Architecture
* **Module:** `server/src/services/viralIntelligenceService.ts` (new suggestion).
* **Pipeline:**
  1. Ingest reference video audio & video via `videoService.downloadVideo()`.
  2. Extract word density curve ($W(t) = \text{words per second}$).
  3. Detect visual scene transitions using OpenCV frame difference or FFmpeg `select='gt(scene,0.3)'`.
  4. Generate a `ViralBlueprint` JSON:
     * Hook duration: e.g., $2.8\text{s}$.
     * Average shot duration: e.g., $2.4\text{s}$.
     * B-roll placement density: e.g., every $3.5\text{s}$.
  5. Feed the blueprint to `producerPlanningService.ts` to guide clip boundary selection.

### 4.4 Implementation Sequence & Tasks
* **Task 3.1: Video Pacing Analyzer**
  * *Affected Files:* `server/src/services/viralIntelligenceService.ts` (new suggestion)
  * *Action:* Use FFmpeg scene detection and Whisper word timings to calculate average shot duration and speech tempo.
  * *Acceptance Criteria:* Emits structured JSON metrics from any public MP4 file in under 15 seconds.
* **Task 3.2: Blueprint-Guided Highlight Selection**
  * *Affected Files:* `server/src/services/producerPlanningService.ts`, `server/src/services/highlightScoreService.ts`
  * *Action:* Update Gemini 1.5 Pro prompt to penalize candidates that violate the blueprint's hook pace ($<3.0$ words/sec in first 3s).
  * *Acceptance Criteria:* Selected clips match the blueprint's hook-to-body rhythm within $15\%$ tolerance.

### 4.5 Cost & Performance
* **Engineering Complexity:** **L** (Large — ~6–8 engineering days).
* **Inference Cost Impact:** ~+$0.005 per analyzed reference URL (Groq Whisper + Gemini 1.5 Flash).
* **Performance Impact:** Reference analysis takes ~10–18 seconds; run asynchronously with BullMQ job updates.

---

## 5. Feature Specification 4: Fallback AI B-roll Asset Generation

### 5.1 Feature Definition
* **Problem Being Solved:** When a speaker discusses niche, abstract, or futuristic concepts (e.g., "quantum neural networks" or "neolithic pottery"), Pexels and Pixabay return zero relevant stock footage, leaving the video visually stagnant.
* **Target User Workflow:** When stock API search returns fewer than 2 relevant results for a high-priority scene, VireoClip automatically triggers an AI image/video generation prompt via Replicate (SDXL / Flux Schnell) to produce a contextual visual asset.
* **Expected Improvement:** 100% visual asset coverage across all dialogue topics; zero missing B-roll gaps.
* **Explicit Non-Goals:** Generating full synthetic avatars or AI voice clones.

### 5.2 Current Implementation Baseline
* **Existing Files:**
  * `server/src/services/brollService.ts` (`searchPexels()`, `searchPixabay()`)
* **Current Limitations:** Strict dependency on free stock photography databases. Fails when keywords are metaphorical or technical.

### 5.3 Proposed Solution Architecture
* **Fallback Cascade Logic:**
  $$\text{Query} \longrightarrow \text{Pexels API} \longrightarrow (\text{If count } < 2) \longrightarrow \text{Pixabay API} \longrightarrow (\text{If count } == 0) \longrightarrow \text{Replicate Flux Schnell / SDXL}$$
* **Asset Transformation:** Convert generated 1024x1024 AI image into a dynamic video B-roll clip using native FFmpeg slow-zoom / Ken Burns motion effect (`zoompan=z='min(zoom+0.0015,1.15)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`).

### 5.4 Implementation Sequence & Tasks
* **Task 4.1: Replicate API Client & Prompt Builder**
  * *Affected Files:* `server/src/services/aiGenerationService.ts` (new suggestion)
  * *Action:* Build prompt synthesizer using Gemini Flash to convert sentence into a photorealistic visual prompt, called via Replicate API.
  * *Acceptance Criteria:* Generates high-quality image URL in $<3.5\text{s}$ using Flux Schnell.
* **Task 4.2: Ken Burns Motion Synthesizer**
  * *Affected Files:* `server/src/services/ffmpeg/motionSynthesisService.ts` (new suggestion)
  * *Action:* Render static image to 1080x1920 3-second MP4 with smooth 60fps pan/zoom.
  * *Acceptance Criteria:* Produces buttery smooth motion video without frame stutter.

### 5.5 Cost & Performance
* **Engineering Complexity:** **M** (Medium — ~4 engineering days).
* **Inference Cost Impact:** ~$0.003 per generated image (Flux Schnell on Replicate); only triggered on stock search misses ($<10\%$ of scenes).
* **Storage Impact:** ~2MB per generated clip on S3/MinIO.

---

## 6. Feature Specification 5: Declarative FFmpeg Filter Graph Compiler

### 6.1 Feature Definition
* **Problem Being Solved:** Direct string concatenation of complex FFmpeg `-filter_complex` commands leads to syntax bugs, hard-to-trace audio channel mismatch errors, and command-line length limits.
* **Target User Workflow:** Under-the-hood stability enhancement. Renders succeed deterministically even when projects have 15+ concurrent visual overlays, blurred backgrounds, dynamic zooms, and audio ducking.
* **Expected Improvement:** Reduces FFmpeg rendering crash rate to $<0.1\%$; provides clean unit-testable filter graph validation before process spawning.

### 6.2 Implementation Sequence & Tasks
* **Task 5.1: Graph Node Model & Topological Sort**
  * *Affected Files:* `server/src/services/ffmpeg/filterGraphBuilder.ts` (new suggestion)
  * *Action:* Implement `FilterNode`, `StreamLink`, and `FilterGraph` classes with automatic stream naming (`[v0]`, `[broll_1]`, `[outv]`).
  * *Acceptance Criteria:* Unit tests verify acyclic graph validation and correct filter syntax.
* **Task 5.2: Script-File Execution Adapter**
  * *Affected Files:* `server/src/services/ffmpeg/filterGraphBuilder.ts`, `server/src/services/proEditorService.ts`
  * *Action:* Write filter complex string to a temporary file and pass to FFmpeg via `-filter_complex_script <path>`, completely bypassing OS CLI argument length limits.
  * *Acceptance Criteria:* Renders with 50+ overlays without `E2BIG` (Argument list too long) OS errors.

---

## 7. Quality Verification & Acceptance Matrix

| Feature | Target Metric | Measurement Method | Verification Threshold | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Word-Anchored Timeline** | Sync Drift post-cut | Frame difference comparison against audio waveform | $\le 33\text{ms}$ ($\le 1$ frame at 30fps) | Human eye perceives desynchronization above 50ms. |
| **Style Recipes & Safe Zones** | UI Element Clipping | Automated bounding-box intersection test against TikTok/Reels UI mask | $0\%$ pixel collision | Captions behind TikTok buttons are illegible. |
| **Viral Blueprint Extractor** | Pacing Extraction Time | End-to-end benchmark from reference URL to blueprint JSON | $<20\text{s}$ | User experience requires fast turnaround. |
| **Fallback AI B-roll** | Asset Generation Latency | Replicate Flux Schnell roundtrip | $<4.0\text{s}$ | Maintains fast overall video rendering queue. |
| **FFmpeg Graph Compiler** | Render Failure Rate | Error tracking on 1,000 synthetic test projects with random overlays | $<0.1\%$ failure rate | Enterprise SaaS stability requirement. |
