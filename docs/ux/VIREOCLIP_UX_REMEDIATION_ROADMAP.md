# VireoClip UX Remediation Roadmap & Effort/Impact Matrix

**Document Version:** 1.0.0  
**Audit Target:** Prioritized Phased Implementation Sequence & ROI Matrix  
**Date:** October 11, 2026  
**Status:** COMPLETE REMEDIATION ROADMAP (PLANNING ONLY — NO CODE MODIFIED)  

---

## 1. Remediation Sequencing Principles

This roadmap sequences all recommendations by **Creator Value and Flow Coherence**, rather than page-by-page. Fixes are organized into seven chronological phases designed to deliver maximum immediate creator impact with minimal architectural risk:

1. **PHASE UX-1:** Critical Blockers & Broken State Recovery (P0 / P1)
2. **PHASE UX-2:** Core Opus-Parity Golden Journey (Landing → Import → Results → Export)
3. **PHASE UX-3:** Beginner Studio Ergonomics & Visual Presets
4. **PHASE UX-4:** Pro Multi-Track NLE Stability & Audio Waveforms
5. **PHASE UX-5:** AI Studio Suite Consolidation & Autopilot Surfacing
6. **PHASE UX-6:** Responsive Viewport & Accessibility (WCAG AA)
7. **PHASE UX-7:** Unified Design System (Pure Black, Violet, Spatial Glass)

---

## 2. Effort / Impact Matrix

| Recommendation | Phase | User Impact | Engineering Effort | Priority Tier | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Fix Silent Failure on Pro Editor Mode Toggle** | UX-1 | **Very High** | **Small** (1-2h) | **Tier 1 (Immediate Quick Win)** | Unlocks core differentiator; prevents users getting trapped in Beginner mode. |
| **1-Click Quick Export Direct from Results Card** | UX-2 | **Very High** | **Small** (2-3h) | **Tier 1 (Immediate Quick Win)** | Matches Opus's core value: export great clips without forcing an editor visit. |
| **Add Pre-Processing Source Configuration Sheet** | UX-2 | **Very High** | **Medium** (1 day) | **Tier 2 (High Value Core)** | Gives creators control over clip length, timeframe, and topic before GPU burn. |
| **Unified Debounced Autosave with Cloud Indicator** | UX-3 | **High** | **Small** (2-3h) | **Tier 1 (Immediate Quick Win)** | Eliminates fear of lost work; unifies Beginner and Pro persistence. |
| **Replace Dual Range Sliders with Visual Scrubber** | UX-3 | **High** | **Medium** (1-2 days) | **Tier 2 (High Value Core)** | Replaces awkward numerical sliders with intuitive drag handles over video. |
| **Fix 11-Tab Inspector Layout Shift (Lock 420px Width)** | UX-3 | **Very High** | **Medium** (1 day) | **Tier 2 (High Value Core)** | Stops video canvas from violently expanding/shrinking on tab clicks. |
| **Unify Design Tokens to Pure Black & Restrained Violet**| UX-7 | **Very High** | **Medium** (2 days) | **Tier 2 (High Value Core)** | Solves the jarring "Two Different Apps" theme shock across dashboard and editor. |
| **Add Keyboard Shortcuts Modal & Legend (`?` Key)** | UX-4 | **Medium** | **Small** (1-2h) | **Tier 1 (Immediate Quick Win)** | Exposes existing Pro editing shortcuts (`Space`, `Cmd+K`, `S`, `X`) instantly. |
| **Add Visual Thumbnail Cards to Caption Presets** | UX-3 | **High** | **Small** (3-4h) | **Tier 1 (Immediate Quick Win)** | Allows creators to preview subtitle styles without clicking each one. |
| **Display Qualitative Virality Rationale on Cards** | UX-2 | **High** | **Small** (2-3h) | **Tier 1 (Immediate Quick Win)** | Turns confusing `undefined` or generic numbers into trustworthy AI explanations. |
| **Surface Autopilot as Primary 1-Click Option** | UX-5 | **High** | **Small** (3-4h) | **Tier 1 (Immediate Quick Win)** | Promotes Vireo's autonomous pipeline from hidden 10th tab to flagship hero feature. |
| **Implement Text-Based Video Cutting on Word Delete** | UX-4 | **Very High** | **Large** (3-4 days) | **Tier 3 (Strategic Parity)** | Matches Opus's flagship text-based editing workflow. |

---

## 3. Detailed Phased Implementation Roadmap

---

### PHASE UX-1: Critical Blockers & Broken State Recovery
**Goal:** Eliminate silent failures, traps, and state desynchronizations.

1. **UX-1.1: Pro Editor Mode Fallback & Retry Banner:**
   - Update `ClipEditorPage.tsx: line 323`. If `getOrCreateEditorProject()` fails, display an explicit inline alert: *"Unable to load Pro Project. [Retry Sync]"* instead of silently falling back to Beginner Mode.
2. **UX-1.2: Modal Focus Lock & Escape Handling:**
   - Add focus trap listeners to `PublishModal`, `QuotaExceededModal`, and `ABCsvImportModal` to prevent tabbing behind active backdrops.
3. **UX-1.3: Document Parked 5% Download Issue in UI:**
   - On the export modal, if an oversized video encounters the parked backend download queue issue, display a transparent status message: *"High-resolution render queue active. If download stalls, click [Direct Cloud Link]."*

---

### PHASE UX-2: Core Opus-Parity Golden Journey
**Goal:** Achieve flawless, low-friction flow from Video URL → Clips → Quick Export in under 60 seconds.

1. **UX-2.1: Pre-Processing Configuration Sheet (`NewProjectPage.tsx`):**
   - Add an intuitive drawer with 4 smart controls before generation:
     - *Preferred Clip Length:* Pills `<30s` | `30s–60s (Default)` | `60s–90s` | `Auto`
     - *Processing Timeframe:* Visual slider to crop a 20-minute segment of a 2-hour video.
     - *Topic Guidance:* Optional text field for clipping prompt instructions.
     - *Aspect Ratio:* `9:16 Vertical` (Default) | `1:1 Square` | `16:9 Landscape`.
2. **UX-2.2: 1-Click Quick Export from Results Cards (`ClipWorkspace.tsx`):**
   - Add a primary `[Quick Export]` CTA directly on every clip suggestion card in `/projects/:id`.
   - Generates the ready-to-post MP4 with burned-in subtitles in 1 click without requiring an editor visit.
3. **UX-2.3: Transparent 4-Stage Processing Stepper:**
   - Add an explicit 4-stage stepper on `/projects/:id` during ingestion/analysis with a reassuring notice: *"You can safely close this tab. Your clips will be saved in your dashboard."*
4. **UX-2.4: Qualitative Virality Explanations:**
   - Replace `undefined` scores with a structured scorecard: `Virality Score: 88/100` with 2 plain-English sentences: *"Strong opening hook: starts with an unexpected stat at 01:14. Builds high energy with a clean punchline."*

---

### PHASE UX-3: Beginner Studio Ergonomics
**Goal:** Provide an effortless, visual subtitle and styling studio for non-technical creators.

1. **UX-3.1: Stable Fixed-Width Inspector (420px):**
   - In `ClipEditorPage.tsx`, lock the right sidebar to a fixed `420px` width. Eliminate the dynamic jumps between 384px, 540px, and 720px to keep the video canvas completely stable.
2. **UX-3.2: Universal Debounced Autosave:**
   - Implement debounced (1s) background autosave for all caption, trim, and styling tweaks.
   - Replace manual "Save Edits" button with a persistent cloud badge: *"All changes saved"*.
3. **UX-3.3: Visual Caption Preset Thumbnails:**
   - Upgrade caption presets from text buttons to graphical thumbnail cards showing the exact font, uppercase styling, and karaoke highlight animation.
4. **UX-3.4: Dual-Handle Visual Trim Scrubber:**
   - Replace the two disconnected HTML range inputs with an interactive scrubbing bar featuring draggable left/right trim handles directly beneath the video player.

---

### PHASE UX-4: Pro Multi-Track NLE Stability
**Goal:** Deliver a rock-solid, Hollywood-grade timeline editor for professional creators.

1. **UX-4.1: Standard Laptop Ergonomics (1366×768):**
   - Enforce `max-h-[200px]` on the timeline container on displays with height ≤800px so canvas, top bar, and timeline fit without full-page scrolling.
2. **UX-4.2: Keyboard Shortcuts Legend (`?` Key):**
   - Add a persistent keyboard shortcut button in top bar opening a clean modal cheatsheet for `Space`, `Cmd+K`, `Cmd+Z`, `Cmd+D`, `S` (split), and `X` (ripple delete).
3. **UX-4.3: Audio Waveform Visualization:**
   - Render cached Web Audio waveforms across audio tracks (`A1`, `A2`) to assist editors with speech cut precision.
4. **UX-4.4: Text-Based Ripple Trimming:**
   - Connect transcript word deletion to video trimming: deleting words in the transcript cuts the corresponding video frames on the timeline.

---

### PHASE UX-5: AI Studio Suite Consolidation & Autopilot
**Goal:** Structure Vireo's 11 specialized studios into a progressive, non-intrusive hierarchy.

1. **UX-5.1: Three-Phase Studio Navigation:**
   - Restructure the 11 editor tabs into three clear progressive phases:
     - `Phase 1: EDIT` (Captions, Framing, Audio)
     - `Phase 2: OPTIMIZE` (Hook Lab, Thumbnail Lab, A/B Studio)
     - `Phase 3: PACKAGE` (Content Pack, Multilingual Dubbing, Publishing Handoff)
2. **UX-5.2: Flagship Autopilot Surfacing:**
   - Promote Autopilot from the 10th tab of the editor to a prominent 1-click option on the New Project page: *"Run Autopilot: AI Producer + Hook + Thumbnail + Social Pack with Human Approval"*.

---

### PHASE UX-6: Responsive Viewport & Accessibility
**Goal:** Ensure seamless ergonomics across mobile and standard laptops; meet WCAG 2.1 AA.

1. **UX-6.1: Mobile Strategy Implementation (<768px):**
   - Implement the "View & Quick Approve" mobile strategy: full mobile capability for review, 1-click styling, and export; clean desktop prompt for Pro Multi-Track NLE.
   - Add sticky mini-player (180px height) when scrolling stacked mobile editor controls.
2. **UX-6.2: Elevate Low Contrast Text on Dark Surfaces:**
   - Replace `text-neutral-500` with `text-neutral-400` across all dark editor headers to meet the 4.5:1 WCAG AA threshold.
3. **UX-6.3: Collapsible Sidebar for Medium Laptops (1024px–1280px):**
   - Add toggle to collapse 240px sidebar into a 64px icon rail to maximize screen space for data tables and split-view results.

---

### PHASE UX-7: Unified Design System (Pure Black & Restrained Violet)
**Goal:** Eradicate the legacy cream/botanical theme and establish VireoClip's signature aesthetic globally.

1. **UX-7.1: Global Token Migration (`src/index.css` & `tailwind.config.js`):**
   - Update `--background` to `#09090b` (Pure Black / Neutral 950).
   - Update `--foreground` to `#F8FAFC` (Pure Off-White).
   - Update `--primary` to `#7C3AED` / `#8B5CF6` (Restrained Violet).
   - Eliminate Fraunces serif font; standardize 100% of display and body text on `Inter` / `Plus Jakarta Sans`.
2. **UX-7.2: Spatial Glass Surface Elevation:**
   - Apply translucent glass styles (`backdrop-blur-xl`, `bg-white/[0.04]`, `border-white/[0.08]`) to cards, sidebars, and modals.
   - Replace flat terracotta buttons (`#df4c26`) with elegant restrained violet and spatial glass buttons.
