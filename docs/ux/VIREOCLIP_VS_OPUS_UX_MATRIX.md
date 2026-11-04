# VireoClip vs. OpusClip UX Benchmark Matrix

**Document Version:** 1.0.0  
**Audit Target:** End-to-End Workflow Parity & Differentiation  
**Date:** October 11, 2026  
**Status:** COMPLETE COMPETITIVE BENCHMARK  

---

## 1. Classification Taxonomy

Each interaction pattern is evaluated and assigned one of four strategic classifications:
- **ADOPT:** OpusClip possesses a proven, low-friction UX pattern that VireoClip should adopt to match creator expectations.
- **ADAPT:** The Opus pattern is valid, but VireoClip should adapt it to fit its unique architecture and aesthetic.
- **OUTPERFORM:** VireoClip possesses superior underlying capabilities (e.g. multi-track timeline, multi-studio suite, autonomous Autopilot) and should deliberately surpass OpusClip.
- **NOT RELEVANT:** An Opus feature or constraint that does not align with VireoClip's product mission.

---

## 2. Complete Workflow Benchmark Matrix

| Flow / Feature | OpusClip UX Pattern | VireoClip Current UX | Friction in VireoClip | Parity Status | Recommendation | Classification |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Landing CTA** | Hero URL input with immediate "Get clips in 1 click" button | Interactive URL input in hero (`LandingHero.tsx`) | None; works well on landing page. | **PARITY (8/10)** | Maintain clean input; ensure paste event triggers instant validation. | **ADOPT** |
| **URL Submission** | Validates YouTube/Google Drive/Zoom links instantly with visual provider icons | Accepts YouTube & direct video links; checks regex | Fails silently on TikTok/IG links with explanatory note below. | **PARTIAL (7/10)** | Provide instant inline domain feedback (e.g., green checkmark on valid YouTube). | **ADAPT** |
| **Local Upload** | High-contrast drag-and-drop zone supporting up to 5GB files | 50MB file size limit with drag-and-drop zone (`NewProjectPage.tsx`) | 50MB limit is too low for standard 1080p/4K podcast video files. | **DEFICIT (5/10)** | Communicate R2 direct PUT capability and scale file limit messaging. | **ADAPT** |
| **Auth Handoff** | Persists submitted video URL through signup; user lands directly on processing | Preserves URL via `?next=%2Fprojects%2Fnew%3Furl%3D...` | Supabase email verification gate blocks instant login for new signups. | **PARTIAL (6/10)** | Enable passwordless magic link or instant trial session so user isn't trapped in email verification. | **ADAPT** |
| **New Project Navigation** | Single streamlined modal: Source → Configuration → Process | Multiple pages: `/projects/new` → Upload → `/projects/:id` | Creator must fill Project Title manually before processing starts. | **PARTIAL (6/10)** | Auto-populate project title from YouTube video metadata or uploaded filename. | **ADAPT** |
| **Pre-Processing Setup** | Exposes Clip Length pills (`<30s`, `30–60s`, `60–90s`), Timeframe slider, and Topic prompt | **Completely absent**. Only exposes Title and Notes inputs. | Creator has zero control over generated clip length or content focus before processing. | **CRITICAL DEFICIT (2/10)** | Implement Opus-style pre-processing sheet: Length, Timeframe, Topic prompt, Aspect ratio. | **ADOPT** |
| **Processing Clarity** | 4-stage stepper, estimated time remaining, background safe notice | Status badges (`uploading` → `transcribed` → `completed`), no ETA | Creator is unsure if they can leave page; no email notification on completion. | **DEFICIT (5/10)** | Add clear 4-stage progress stepper and explicit "Safe to close tab" confirmation. | **ADOPT** |
| **Results Gallery** | Scored clip feed (0–99 Virality Score) with qualitative rationale sentences | 3-column split view (List, Player, Moment Details) in `/projects/:id` | Virality score is rendered as `undefined` or generic `83 VireoClip` without clear rationale. | **DEFICIT (5/10)** | Display structured virality breakdown: Hook Strength, Topic Retention, Emotional Energy. | **ADAPT** |
| **Clip Cards** | Card with hover video preview, virality badge, duration, transcript snippet, Edit CTA | Text-heavy candidate card with timestamp and title | No hover video preview on candidate card; user must select card to view player. | **PARTIAL (6/10)** | Add instant hover scrubber or fast preview poster to candidate cards. | **ADAPT** |
| **Clip Selection** | Click card to preview; 1-click Quick Export without entering editor | User selects candidate, must click "Create Clip" or "Edit in Studio" | Forces two-step rendering process before clip can be edited or exported. | **DEFICIT (5/10)** | Allow 1-click Direct Download/Export directly from the results card. | **ADOPT** |
| **Editor Entry** | Seamless transition to ClipGenius editor; preserves clip state | Navigates to `/clips/:clipId/edit`; mode defaults to Beginner | Jolt from light cream dashboard into pure black editor; unrendered suggestions cannot open editor. | **PARTIAL (6/10)** | Unify dark theme across app; allow instant editor entry with auto-render on save. | **ADAPT** |
| **Text-Based Editing** | Deleting transcript words ripple-trims corresponding video segment | Word-level caption timing exists, but deleting words does **not** cut video | Creator must manually adjust trim sliders instead of simply cutting script text. | **DEFICIT (4/10)** | Add text-based ripple cutting: deleting words in transcript cuts video frames. | **ADOPT** |
| **Timeline Editing** | Basic single-track timeline with handles for beginners | **Dual Mode**: Beginner scrubber + Pro Multi-Track NLE (`Timeline.tsx`) | Pro Mode is hidden or fails silently if user has network/auth hiccup. | **SUPERIOR (8/10)** | Surface Pro Multi-Track prominently; fix silent fallback on toggle. | **OUTPERFORM** |
| **Captions** | Visual style presets (Karaoke, Bold, Minimal), emojis, auto-highlighting | 6 presets (Clean, Bold, Minimal, Podcast, Punchy, Karaoke), word styling | Caption presets lack visual thumbnail cards; represented as text buttons only. | **PARTIAL (7/10)** | Add visual thumbnail cards showing exact caption font and animation preview. | **ADAPT** |
| **Smart Reframe** | Face detection speaker tracking for 9:16 vertical crop | Face detection, keyframe smoothing, dominant track focus (`CropConfig`) | Creator cannot easily adjust crop anchor manually without typing coordinates. | **PARTIAL (7/10)** | Add visual canvas draggable bounding box for manual framing override. | **ADAPT** |
| **Layout Controls** | 1-click layout switcher: Full vertical, Split screen (reaction/speaker) | Full, split, and custom layouts supported in Pro canvas | Layout switcher is buried inside "Framing" tab under advanced dropdowns. | **PARTIAL (6/10)** | Expose 1-click visual layout buttons: Fill, Split Top/Bottom, Picture-in-Picture. | **ADOPT** |
| **Trimming** | Visual handles on video player with precise millisecond zoom | Range sliders for Trim Start Offset and Trim End Offset | Dual sliders (`input[type=range]`) are awkward compared to interactive playhead handles. | **DEFICIT (5/10)** | Upgrade Beginner scrubber to dual-handle dragging bar with visual waveform. | **ADOPT** |
| **B-Roll Integration** | AI keyword suggestion + integrated stock video library insertion | AI B-roll planning service exists in backend (`broll_plans`) | UI for B-roll is scattered across MediaBin and Pro Editor; no 1-click stock insert in Beginner. | **DEFICIT (5/10)** | Add dedicated "Add B-roll" card with 1-click stock suggestions in Beginner mode. | **ADAPT** |
| **Audio Studio** | Noise reduction, voice clarity, background music ducking | Speech enhancement, volume, mute, music tracks in `AudioStudioPanel` | Advanced engineering controls (EQ, gain) overwhelm non-technical creators. | **PARTIAL (7/10)** | Simplify Beginner Audio into 3 toggles: "Clean Voice", "Remove Noise", "Auto-Ducking". | **ADAPT** |
| **Brand Memory** | Custom brand templates (colors, fonts, logo watermark) | Brand Brain service (`brand_brain_profiles`), tone, CTAs, vocabulary | Brand Brain is separated on `/brand` page; not auto-applied to new projects. | **SUPERIOR (8/10)** | Allow 1-click "Apply Brand Brain" directly from pre-processing or editor header. | **OUTPERFORM** |
| **Multi-Studio Suite** | None. Opus is only a clipping engine. | Hook Lab, Thumbnail Lab, Content Pack, Dubbing, A/B Studio | 11 tabs crammed into horizontal editor strip creates severe cognitive overload. | **SUPERIOR (9/10)** | Reorganize into structured progressive disclosure: Edit → Optimize → Package. | **OUTPERFORM** |
| **Autopilot Pipeline** | None. Opus requires manual clip review and export. | End-to-end autonomous pipeline (Producer → Hook → Thumb → Pack → Human Approval) | Discoverability is low; users do not understand how Autopilot differs from Producer. | **SUPERIOR (9/10)** | Present Autopilot as a prominent "1-Click Full Campaign" option on New Project page. | **OUTPERFORM** |
| **Save / Persistence** | Cloud autosave with instant status indicator | Local dirty tracking (`isDirty`), manual "Save Edits" button | Beginner mode requires manual "Save Edits"; Pro mode has autosave. Inconsistent! | **DEFICIT (5/10)** | Unify autosave across both modes with a clear "All changes saved" badge. | **ADOPT** |
| **Export / Download** | Clear modal: Resolution (720p/1080p/4K), SRT download, NLE XML export | "Render Changes" button initiates server render; download button on ready | Parked 5% download issue on certain large files; lack of resolution options. | **PARTIAL (6/10)** | Add export dialog: Choose resolution, caption burn-in toggle, separate SRT download. | **ADAPT** |
| **Publishing Handoff** | Social media scheduler with visual weekly calendar grid | Social OAuth connections and publish jobs (`PublishModal.tsx`) | No visual calendar; posts are published or handed off individually. | **PARTIAL (6/10)** | Add lightweight scheduling queue with human approval confirmation. | **ADAPT** |
| **Project Management** | Clean grid/list with thumbnail, duration, clip count, and duplicate/delete | Projects list in `/dashboard` and `/history` with metadata | Equal-weight cards on dashboard obscure the single most important unfinished project. | **PARTIAL (7/10)** | Highlight "Continue Unfinished Project" banner at top of dashboard. | **ADAPT** |

---

## 3. Flow Parity Summary & Strategic Takeaways

1. **Top-of-Funnel Parity (Landing → Setup):**  
   - VireoClip currently loses points due to the complete lack of pre-processing configuration (clip length, timeframe, topic prompt) and Supabase email verification friction.
2. **Results Surface Parity:**  
   - VireoClip possesses multimodal moment search (which Opus lacks), but falls behind on 1-click export and qualitative virality explainability.
3. **Editor Surface Parity:**  
   - VireoClip's Pro Multi-Track NLE and specialized studio suite (Hook Lab, Thumbnail Lab, Dubbing) vastly outperform OpusClip's single-track timeline. However, Opus wins on text-based script deletion and simple 1-click presets.
4. **Differentiation Advantage:**  
   - By adopting OpusClip's effortless top-of-funnel simplicity and adapting its 1-click results clarity, VireoClip can retain its deep pro-editor and autonomous Autopilot advantages without overwhelming new creators.
