# VireoClip Product Friction Log & Severity Registry

**Document Version:** 1.0.0  
**Audit Target:** End-to-End Friction Points & UX Debt  
**Date:** October 11, 2026  
**Status:** COMPLETE FRICTION AUDIT  

---

## 1. Severity Classification Framework

- **P0 — BLOCKER:** Critical roadblock; user cannot complete core workflow or export video.
- **P1 — CRITICAL:** Major confusion, severe layout shifts, risk of lost creator work, or inaccessible core features.
- **P2 — HIGH:** Significant friction or missing step that degrades creator efficiency and creates cognitive strain.
- **P3 — MEDIUM:** Noticeable inconsistency, missing feedback state, or secondary workflow inefficiency.
- **P4 — LOW:** Visual polish, typography alignment, or minor microcopy improvement.

---

## 2. Master Friction Registry

---

### Issue FL-01: The "Two Different Apps" Theme Shock
- **Page:** Global Application (`/` → `/dashboard` → `/clips/:clipId/edit`)
- **Component:** `RootLayout.tsx` vs `DashboardLayout.tsx` vs `ClipEditorPage.tsx`
- **User Goal:** Experience a cohesive, trustworthy, premium creative platform.
- **Observed Behavior:** The marketing landing page is pure black/violet spatial dark mode. Upon logging into `/dashboard`, the user is jolted into an antique botanical cream background (`#FBF8F3`) with Fraunces serif headers, forest green links, and terracotta clay buttons. Then, entering `/clips/:clipId/edit`, the user is jolted back into pitch-black studio dark mode (`#0a0a0a`) with orange/purple buttons.
- **Expected Behavior:** Consistent Pure Black, White/Grey, Restrained Violet, and Spatial Glass aesthetic across marketing, dashboard, and studio.
- **Opus Reference:** OpusClip maintains a consistent modern dark-grey theme across all surfaces.
- **Severity:** **P1 — CRITICAL**
- **Frequency:** 100% of all user journeys.
- **Affected Personas:** All Personas (A, B, C, D, E, F).
- **Evidence:** `src/index.css` sets `--background: #FBF8F3; font-family: 'Fraunces'`; `ClipEditorPage.tsx` sets `bg-neutral-950`.
- **Recommended Direction:** Replace legacy cream and serif CSS variables with unified Pure Black, Restrained Violet, and Inter sans tokens.

---

### Issue FL-02: Email Verification Gate Traps Immediate Onboarding Intent
- **Page:** `/signup` & `/login`
- **Component:** `SignupPage.tsx` / Supabase Auth flow
- **User Goal:** Paste a video URL on the landing page, create an account, and instantly begin processing clips.
- **Observed Behavior:** When a new user signs up, Supabase rejects immediate session creation with `Please confirm your email address before signing in.` The user cannot enter the product without switching tabs, opening their email inbox, and clicking a confirmation link. If they return later, their initial project intent may be lost.
- **Expected Behavior:** Immediate onboarding via passwordless magic link, instant demo session, or auto-confirmed email on signup, preserving the pending URL.
- **Opus Reference:** OpusClip logs the creator in immediately upon SSO or email signup and begins processing the submitted video.
- **Severity:** **P1 — CRITICAL**
- **Frequency:** 100% of new signups.
- **Affected Personas:** Persona A (First-time creator), Persona B (Experienced creator), Persona D (Podcast creator).
- **Evidence:** Browser verification during audit; Supabase error banner `Please confirm your email address before signing in.`
- **Recommended Direction:** Enable instant session issuance on signup or provide passwordless one-click authentication.

---

### Issue FL-03: Complete Absence of Pre-Processing Source Configuration
- **Page:** `/projects/new`
- **Component:** `NewProjectPage.tsx`
- **User Goal:** Tell the AI what kind of clips to generate (length, target topics, timeframe).
- **Observed Behavior:** `NewProjectPage` only presents: Mode Switcher (Upload vs URL), Drag & Drop dropzone, Title input (mandatory), and Notes (optional 500 chars). There is **no clip length selector**, **no timeframe trimmer**, **no target aspect ratio picker**, and **no caption preset selector**. The user clicks "Start Processing" and receives whatever length the backend defaults to.
- **Expected Behavior:** An intuitive pre-processing sheet with:
  1. Preferred clip length (`<30s`, `30–60s`, `60–90s`, `Auto`)
  2. Source timeframe selection (e.g. process only minutes 10–25)
  3. Clipping topic / prompt guidance
  4. Target aspect ratio (`9:16`, `1:1`, `16:9`)
- **Opus Reference:** OpusClip's core pre-processing screen allows selecting clip duration and topic filters before GPU analysis begins.
- **Severity:** **P1 — CRITICAL**
- **Frequency:** 100% of project creations.
- **Affected Personas:** Persona A (wants shorts <60s), Persona B (wants specific hooks), Persona D (wants 15-min segment of 2-hr podcast).
- **Evidence:** `NewProjectPage.tsx` lines 418–480.
- **Recommended Direction:** Introduce a lightweight pre-processing configuration drawer with smart defaults and optional advanced controls.

---

### Issue FL-04: The 11-Tab Inspector Tab Strip Causes Severe Layout Shifts
- **Page:** `/clips/:clipId/edit`
- **Component:** `ClipEditorPage.tsx` right sidebar (`lines 1660–1750`)
- **User Goal:** Navigate between styling captions, reframing video, and checking hook suggestions.
- **Observed Behavior:** 11 enterprise tools (`Captions`, `Framing`, `Headline`, `Audio`, `Producer`, `Translate`, `Content Pack`, `Hook Lab`, `Thumbnail Lab`, `Autopilot`, `A/B Studio`) are crammed into an `overflow-x-auto no-scrollbar` horizontal strip. Clicking tabs dynamically changes the inspector width between `lg:w-96` (384px), `lg:w-[450px]` (540px), and `lg:w-[480px]` (720px), violently shrinking and jumping the video canvas in real time.
- **Expected Behavior:** Stable inspector width (fixed 420px–460px) with structured, progressive tool grouping (Edit → Enhance → Optimize → Package) rather than 11 unranked horizontal buttons.
- **Opus Reference:** OpusClip maintains a fixed-width two-panel layout with dedicated text and style tabs.
- **Severity:** **P1 — CRITICAL**
- **Frequency:** Every time a user explores AI features in the editor.
- **Affected Personas:** Persona A, Persona B, Persona C.
- **Evidence:** `ClipEditorPage.tsx` line 1663: `activeTab === 'ab_studio' ? 'lg:w-[480px] xl:w-[620px] 2xl:w-[720px]' : ... : 'lg:w-96'`.
- **Recommended Direction:** Implement fixed-width inspector container and categorize tools into hierarchical navigation tabs.

---

### Issue FL-05: Silent Failure When Toggling to Pro Multi-Track Mode
- **Page:** `/clips/:clipId/edit`
- **Component:** `ClipEditorPage.tsx` (`toggleEditorMode`) & `proEditorService.ts`
- **User Goal:** Switch from Beginner Mode to Pro Multi-Track NLE to edit audio and video tracks.
- **Observed Behavior:** Clicking "Pro Multi-Track" triggers `loadEditorProject()`. If the user's network drops, authentication token refreshes, or the backend returns an error, the error is caught silently in `console.error`. The UI condition `editorMode === 'pro' && editorProject ?` evaluates to false, silently leaving the user on the Beginner Mode screen with zero error messaging or feedback.
- **Expected Behavior:** Instant optimistic mode switch, clear loading skeleton over the timeline area, and explicit toast/banner if project synchronization fails.
- **Opus Reference:** N/A (Opus does not have a Pro Multi-Track NLE).
- **Severity:** **P1 — CRITICAL**
- **Frequency:** Intermittent (occurs during token expiry or network latency).
- **Affected Personas:** Persona C (Professional editor).
- **Evidence:** Live browser audit: clicking "Pro Multi-Track" stayed on Beginner layout without visual error notification.
- **Recommended Direction:** Display an inline retry state in the timeline area and surface a descriptive error toast if pro project load fails.

---

### Issue FL-06: Lack of Direct Quick Export from Results Gallery
- **Page:** `/projects/:id`
- **Component:** `ClipWorkspace.tsx`
- **User Goal:** Download or export a high-scoring AI clip immediately without editing.
- **Observed Behavior:** On `/projects/:id`, generated clips are displayed in the "AI Suggestions" tab. A creator cannot export directly from a suggestion card. They must first click "Create Clip", wait for server rendering, switch to the "My Clips" tab, and only then access the download button.
- **Expected Behavior:** 1-click "Quick Download" / "Export MP4" button directly on every generated clip card in the primary results feed.
- **Opus Reference:** OpusClip provides a prominent "Export" button on every clip card in the feed.
- **Severity:** **P2 — HIGH**
- **Frequency:** 100% of results browsing sessions.
- **Affected Personas:** Persona A (wants fast shorts), Persona E (Social media manager needing batch clips).
- **Evidence:** `ClipWorkspace.tsx` line 50 navigation tabs separation.
- **Recommended Direction:** Add a primary "Quick Export" CTA directly on every clip candidate card.

---

### Issue FL-07: Virality Score Displayed as "undefined" or Unexplained Numeric
- **Page:** `/projects/:id`
- **Component:** `ClipWorkspace.tsx`
- **User Goal:** Understand which clip is best and why the AI selected it.
- **Observed Behavior:** Database records show `virality_score: undefined` on multiple clip candidate records, causing the badge to render as blank or unranked. Where scores do appear (e.g. `83 VireoClip`), there is no qualitative breakdown explaining *why* it scored 83.
- **Expected Behavior:** Clear virality score (e.g. `88/100`) accompanied by 2–3 qualitative indicators: *"High-energy hook"*, *"Clean punchline"*, *"Strong facial reaction"*.
- **Opus Reference:** OpusClip provides a 0–99 score with 3-sentence qualitative rationale per clip.
- **Severity:** **P2 — HIGH**
- **Frequency:** 80% of project results.
- **Affected Personas:** Persona A, Persona B, Persona D.
- **Evidence:** MongoDB query returned `Candidate ID: c021e5ca... Virality: undefined`.
- **Recommended Direction:** Provide fallback virality calculation and surface qualitative hook/energy explanations.

---

### Issue FL-08: Manual Trim Offset Sliders Lack Draggable Interactive Handles
- **Page:** `/clips/:clipId/edit`
- **Component:** `ClipEditorPage.tsx` (`lines 1618–1650`)
- **User Goal:** Fine-tune the start and end of a 50-second clip.
- **Observed Behavior:** Trimming in Beginner Mode is controlled by two separate HTML range inputs: "Start Offset: +0.0s" and "End Offset: -0.0s". The user must drag two disconnected sliders while looking at numerical timecodes, rather than dragging interactive left/right handles over the video scrubber.
- **Expected Behavior:** A unified interactive timeline scrubber with left/right dragging handles, audio waveform display, and live video scrubbing.
- **Opus Reference:** OpusClip provides visual trim handles overlaid on the video progress bar.
- **Severity:** **P2 — HIGH**
- **Frequency:** 100% of clip trimming attempts.
- **Affected Personas:** Persona A, Persona B.
- **Evidence:** `ClipEditorPage.tsx` lines 1626 & 1642 (`input[type="range"]`).
- **Recommended Direction:** Replace dual range sliders with a dual-handled visual trim scrubber.

---

### Issue FL-09: Inconsistent Save & Persistence Model (Manual vs Auto-Save)
- **Page:** `/clips/:clipId/edit`
- **Component:** `ClipEditorPage.tsx`
- **User Goal:** Confidently adjust captions and framing without worrying about losing work.
- **Observed Behavior:** In Beginner Mode, changes set `isDirty = true` and require clicking a manual "Save Edits" button. In Pro Mode, an automatic background autosave runs with an "Autosave: Saved" badge. Switching between modes or refreshing creates confusion over whether changes were saved.
- **Expected Behavior:** Universal cloud autosave with debounce (1000ms), an explicit "All changes saved" indicator, and an unsaved changes warning modal on page unload if a save is pending.
- **Opus Reference:** OpusClip automatically autosaves all script and styling edits in real time.
- **Severity:** **P3 — MEDIUM**
- **Frequency:** 100% of editing sessions.
- **Affected Personas:** All Personas.
- **Evidence:** `ClipEditorPage.tsx` line 1166 (Beginner manual save) vs line 1089 (Pro autosave badge).
- **Recommended Direction:** Unify autosave logic across both Beginner and Pro modes.

---

### Issue FL-10: Caption Presets Lack Visual Preview Thumbnails
- **Page:** `/clips/:clipId/edit`
- **Component:** `ClipEditorPage.tsx` (`Presets` accordion)
- **User Goal:** Quickly browse and choose an engaging subtitle animation style.
- **Observed Behavior:** Caption presets are represented as text-only rectangular cards (`Clean: White + dark stroke`, `Bold Impact: Heavy uppercase sans`, `Minimal`, `Podcast Gold`, `Punchy`, `Karaoke`). A creator cannot see how the font, highlight color, or animation looks without clicking each one and watching the video canvas.
- **Expected Behavior:** Visual preview thumbnails showing rendered sample text with active word highlights and font styling for each preset.
- **Opus Reference:** OpusClip displays graphical badge previews for every caption template.
- **Severity:** **P3 — MEDIUM**
- **Frequency:** 100% of caption styling sessions.
- **Affected Personas:** Persona A, Persona B, Persona E.
- **Evidence:** `vireo_editor_beginner_1791707122257.png` Presets section.
- **Recommended Direction:** Add mini visual preview cards demonstrating typography and active word styling for each preset.

---

### Issue FL-11: Alarmist Quota Warning Dominates Dashboard Top Fold
- **Page:** `/dashboard`
- **Component:** `DashboardPage.tsx`
- **User Goal:** Check recent projects and continue editing.
- **Observed Behavior:** Right beneath the greeting, a large red progress bar occupies the prime visual real estate: `19.3 / 15 min used (0.0 min remaining) 100%`. It looks like an error banner and distracts from continuing projects.
- **Expected Behavior:** Subtle, elegant usage indicator in the sidebar or account dropdown; dashboard top fold should prioritize the creator's **most recent unfinished project**.
- **Opus Reference:** Usage credits are displayed as a small badge in the user profile menu; dashboard focuses on projects.
- **Severity:** **P3 — MEDIUM**
- **Frequency:** Whenever a user hits tier quota limits.
- **Affected Personas:** Persona F (Returning user), Persona A.
- **Evidence:** `vireo_dashboard_1791707073697.png` top section.
- **Recommended Direction:** Move detailed quota tracking to `/billing` and sidebar badge; replace dashboard top banner with "Continue Recent Project" hero card.

---

### Issue FL-12: 50MB File Size Limit Communication Causes False Ingestion Failure Perception
- **Page:** `/projects/new`
- **Component:** `NewProjectPage.tsx`
- **User Goal:** Upload a high-quality video recorded on phone or camera.
- **Observed Behavior:** Large helper text reads: `Supports MP4, MOV, AVI, WEBM • Max file size: 50 MB`. Standard 10-minute 1080p videos typically exceed 150MB. While the backend supports direct multipart R2 uploads up to 2GB, the UI aggressively warns against files >50MB.
- **Expected Behavior:** Clear communication of multi-gigabyte cloud upload capabilities with automatic client-side chunking/compression guidance.
- **Opus Reference:** OpusClip allows up to 5GB / 2-hour file uploads on free tier.
- **Severity:** **P2 — HIGH**
- **Frequency:** Every local video upload attempt >50MB.
- **Affected Personas:** Persona B, Persona C, Persona D.
- **Evidence:** `NewProjectPage.tsx` lines 344 and 370.
- **Recommended Direction:** Align frontend validation limits with actual R2 backend limits (500MB+ for local uploads).
