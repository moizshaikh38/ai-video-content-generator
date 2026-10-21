# 06 — Dashboard Behavior and Logic Dependencies
**Scope:** Functional Logic, State Machines, APIs, and Data Contracts Audit  
**Mode:** READ-ONLY Verification  

---

## 1. Classification Overview

To protect existing application stability and the unified video editor architecture, all changes are categorized into four strict tiers:

- **VISUAL-ONLY:** Layout, styling, CSS classes, typography, animations, icons. (Safe to port).
- **VISUAL + EXISTING LOGIC:** UI structures that trigger existing service calls and hooks. (Requires wiring to verified local handlers).
- **BEHAVIORAL CHANGE:** New workflows, client state machines, navigation redirections. (Documented for explicit review).
- **BACKEND/DATA DEPENDENCY:** Backend API calls, database schema modifications. (Zero new dependencies found).

---

## 2. Granular Behavior Breakdown

### 2.1 Project Fetching & Real-Time Sync
- **Classification:** **VISUAL + EXISTING LOGIC**
- **Implementation:**
  - Local: Calls `projectService.fetchProjects(user.id)`, listens to `vireo_project_updated` window event.
  - Friend: Also calls `projectService.fetchProjects(user.id)`, listens to `vireo_project_updated` event.
  - Minor Improvement in Friend Code: Friend adds a fallback `catch` handler: if the JWT token is expiring or unavailable in demo mode, it falls back to `projectService.getProjects()` from localStorage rather than crashing.
- **Porting Verdict:** Safe. Connects directly to existing local `projectService`.

---

### 2.2 Recent Projects Filter Tabs (`All`, `Processing`, `Completed`)
- **Classification:** **VISUAL-ONLY**
- **Implementation:**
  - Implemented entirely in client-side React state (`useState<'all' | 'processing' | 'completed'>('all')`).
  - Filters the in-memory array of `projects` based on `p.video_status || p.status`.
  - Active statuses: `['uploading', 'uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating']`.
  - Completed statuses: `['completed', 'complete', 'transcribed']`.
- **Porting Verdict:** 100% client-side logic. Safe to adopt.

---

### 2.3 YouTube & Video Thumbnail Resolution
- **Classification:** **VISUAL-ONLY**
- **Implementation:**
  - Client-side helper `getProjectThumbnail(p: Project)`:
    1. Checks if `(p as any).thumbnail_url` exists.
    2. Parses YouTube video IDs from URLs (`youtube.com/watch?v=...`, `youtube.com/shorts/...`, `youtu.be/...`).
    3. If valid 11-character video ID is found, returns `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`.
    4. Otherwise returns `null`, prompting the card to render the dark gradient background with film watermark.
- **Porting Verdict:** Pure client-side visual enhancement. Zero backend requirements. Safe to port.

---

### 2.4 Top Bar Search Behavior
- **Classification:** **VISUAL + EXISTING LOGIC**
- **Implementation:**
  - The friend's search bar in `DashboardLayout.tsx` does NOT perform live backend fuzzy queries or drop down complex autocomplete results.
  - It functions as an entry point: clicking the input bar, clicking the mobile search button, or pressing `Enter` navigates to `/history` (`navigate('/history')`).
  - Keyboard hint badge: renders `<kbd>Ctrl K</kbd>`.
- **Porting Verdict:** Connects to existing `/history` page. Safe to port.

---

### 2.5 Sidebar Navigation & Collapse State
- **Classification:** **VISUAL-ONLY**
- **Implementation:**
  - Desktop collapse toggled via React state (`useState(false)`). When collapsed, width changes from `w-[260px]` to `w-20`, hiding text labels and centering icons.
  - Mobile drawer controlled by `menuOpen` state and overlay backdrop.
  - Active route highlighting uses `NavLink` with `location.pathname` and `location.hash` matching.
- **Porting Verdict:** Purely UI shell behavior. Safe to port.

---

### 2.6 Quota & Plan Calculation
- **Classification:** **VISUAL + EXISTING LOGIC**
- **Implementation:**
  - Uses existing hook: `const { usage } = useBillingUsage();`.
  - Calculates percentage:
    ```typescript
    const usagePercent = usage?.is_unlimited
      ? 100
      : Math.min(100, Math.max(4, Math.round(((usage?.total_used_minutes || 0) / (usage?.limit_minutes || 1)) * 100)));
    ```
  - Calculates remaining minutes for header badge:
    ```typescript
    `${Math.max(0, usage?.remaining_minutes || 0).toFixed(0)} min left`
    ```
- **Porting Verdict:** Matches local hook schema 1:1. Safe to port.

---

### 2.7 Multi-Stage Clipping Workflow (`HomeClippingWorkflow.tsx`)
- **Classification:** **BEHAVIORAL CHANGE (UI State Machine) + EXISTING SERVICES**
- **Implementation:**
  - State machine: `no_source` -> `source_selected` -> `processing` -> `clips_ready` -> `exporting` -> `error`.
  - Service Integration:
    - Ingest file: Calls `storageService.validateVideoFile` -> `projectService.createProjectAsync` -> `storageService.uploadVideoFile` -> `projectService.startProcessing`.
    - Ingest URL: Calls `projectService.createProjectAsync` -> `projectService.startProcessing`.
    - Polling: Polls project status every 3 seconds until completed.
    - Result display: Calls `clipService.getCandidates` to render clip preview tiles.
    - Pro Editor integration: When a creator clicks "Open in Editor", navigates to `/clips/${clip.id}/edit` (matching local route!).
    - Publishing: Opens `PublishModal` (matching local component!).
- **Porting Verdict:**
  The clipping workflow is an interactive enhancement that streamlines project creation directly from the dashboard home. Because all underlying services (`projectService`, `storageService`, `clipService`, `PublishModal`) are already present locally, this component requires zero backend changes.

---

## 3. Strict Safety Exclusions

1. **Parked Clip Download 5% Issue:**  
   The friend's dashboard does NOT touch or modify `server/src/services/clipRenderService.ts` or local clip download logic. The parked 5% issue remains completely untouched and isolated.
2. **Unified Pro Video Editor Architecture:**  
   The friend's dashboard navigates to `/clips/:clipId/edit` upon clicking "Edit in Video Editor". This cleanly hands off execution to our local `ClipEditorPage.tsx` and unified timeline suite without conflict.
3. **Database Schemas & Migrations:**  
   Zero migrations, zero table additions, zero Supabase schema alterations.
