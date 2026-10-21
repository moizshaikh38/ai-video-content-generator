# 03 — Local vs Friend Dashboard UI Diff
**Date:** October 12, 2026  
**Audit Scope:** Section-by-Section Comparison of Current Local vs Friend Dashboard  
**Mode:** READ-ONLY Verification  

---

## 1. Local Dashboard Baseline

The current local dashboard (`src/pages/DashboardPage.tsx` and `src/layouts/DashboardLayout.tsx`) was created as a light-mode editorial dashboard:
- **Palette:** Cream background (`#FBF8F3`), white cards, sage/forest green accents (`#16744D`), terracotta clay buttons (`#DF4C26`).
- **Typography:** Serif / display headings (`Fraunces`), body in `Inter`.
- **Layout Architecture:**
  1. Welcome Header: *"Welcome back, {Name}. Creator workspace"* with a terracotta "Clip a Video" button.
  2. Quota Usage Card: Large white card showing `"19.3 / 15 min used (0.0 min remaining)"` with a red/amber/green progress bar.
  3. Stat Counters (4 cards): Total Projects, Completed, In Progress, Transcripts Ready.
  4. Two-Column Split:
     - Left (60%): Quick Actions (Upload a video, View history, Latest transcript, Growth Coach).
     - Right (40%): Processing Queue (List of currently running video jobs).
  5. Recent Projects: 4-column cards with green placeholder icons and status badges.
  6. Sidebar: Fixed 240px white sidebar with 11 flat navigation links and an "Upgrade to Pro" terracotta promo card.

---

## 2. Comprehensive Comparison Table

| Area | My Current Dashboard | Friend's Dashboard | Exact Difference | Porting Recommendation |
|---|---|---|---|---|
| **Theme & Background** | Light Cream (`#FBF8F3`), White Cards (`#FFFFFF`), Gray borders (`#EAE8E3`). | Obsidian Dark (`#080B12`), Glass panels (`rgba(255,255,255,0.04)`), Subtle borders (`rgba(255,255,255,0.09)`). | Complete contrast inversion. Friend uses dark cinematic SaaS with backdrop blur; local uses warm light cream. | **ADAPT:** Adopt friend's dark palette strictly within `DashboardLayout.tsx` without touching global `:root`. |
| **Sidebar Width & Structure** | Fixed `240px` (`w-[240px]`), single flat list of 11 links. No collapse mechanism. | `260px` (`w-[260px]`) on desktop, collapsible to icon rail (`w-20`). Organized into 3 categorized sections: *Create*, *Publish*, *Workspace*. | Friend has collapsible rail, section headers, studio workspace switcher pill, and usage meter in sidebar footer. | **ADAPT:** Port friend's categorized sidebar and collapse rail into `DashboardLayout.tsx`. Wire workspace switcher to local `/workspaces`. |
| **Top Navigation Bar** | White sticky header (`bg-white/80`), search input with muted text, bell icon, user avatar pill, clay "+ New Project" button. | Obsidian glass header (`bg-[#080B12]/85 backdrop-blur-xl`), `Ctrl K` search pill, quota pill (`⚡ 15 min left`), `Upgrade` button, purple gradient `+ Create` button, user dropdown. | Friend adds keyboard shortcut badge, visible quota countdown pill, upgrade link, and popover profile dropdown. | **ADAPT:** Port friend's top bar layout and styling. Connect search to `/history`, quota to existing `useBillingUsage`, and profile dropdown to `signOut`. |
| **Hero / Ingest Area** | Simple text greeting: *"Welcome back, Zayn."* + subtitle + clay "Clip a Video" button navigating to `/projects/new`. | Massive interactive **AI Video Clipping Journey** hero (`vireo-dash-hero`) with radial grid, floating 3D creator cards, URL ingest form, dropzone, and 3 action channels. | Local is a passive greeting; friend is an active creation cockpit that initiates clipping directly on `/dashboard`. | **ADAPT:** Port friend's hero presentation and URL/file ingestion into `DashboardPage.tsx`. Wire upload to local `storageService` and link ingest to local `projectService`. |
| **Floating 3D Creator Cards** | None on dashboard. (Creator cards exist only on local landing page). | Two floating tilted cards inside hero: Left (-7deg, `creator-1.jpg`, `Your hook`), Right (+7deg, `creator-2.jpg`, `Best moment`). | Friend elevates the dashboard with cinematic 3D cards previewing AI clipping results. Hidden below 1280px. | **COPY:** Port friend's card layout. The required image files (`creator-1.jpg`, `creator-2.jpg`) already exist locally in `src/assets/creators/`. |
| **Quick Action Tiles** | 4 pastel tiles in a dedicated card (Upload video, View history, Latest transcript, Growth Coach). | 2 channel buttons inside hero (Upload Video, Browse Projects) + 4 workflow journey step badges (Add Video, Configure, AI Clipping, Edit & Export). | Friend integrates quick actions directly inside the hero rather than occupying a separate middle section. | **ADAPT:** Adopt friend's integrated hero channels. Maintain link to Growth Coach (`/analytics`) in sidebar. |
| **Quota & Usage Display** | Prominent full-width white card on dashboard body: `"19.3 / 15 min used (100%)"` with reset date. | Moved to two discrete locations: (1) Header badge: `⚡ 15 min left`; (2) Sidebar footer progress bar widget: `Free Plan 0 / 15m [Upgrade Plan]`. | Friend removes the bulky body card, decluttering the dashboard while keeping quota continuously visible in header and sidebar. | **ADAPT:** Adopt friend's discrete header + sidebar placement. Wire to local `useBillingUsage` hook. |
| **Stats Row** | 4 stat cards (Total Projects, Completed, In Progress, Transcripts Ready). | Removed. Replaced by filter tabs on the recent projects list (`All`, `Processing`, `Completed`). | Friend eliminates static vanity metrics in favor of actionable project status tabs. | **ADAPT:** Adopt friend's filtered list approach. |
| **Processing Queue Panel** | Dedicated 40% column panel showing live running jobs or "All caught up" empty state. | Integrated directly into the Recent Projects grid with animated gradient progress bars on cards and a `"Processing"` tab. | Friend unifies the queue and recent projects into a single coherent asset grid. | **ADAPT:** Adopt friend's unified grid with live card progress bars. |
| **Recent Projects Layout** | 4-column grid with simple green placeholder boxes (`bg-[#eff4ef]`), project title, date, and basic StatusBadge. | 4-column grid of rich `.vireo-dash-glass` cards with automatic YouTube thumbnail extraction, gradient fallbacks, status pills, format badges, and action buttons. | Friend provides rich visual previews, thumbnail resolution, and direct actions ("Open project", "View status"). | **COPY / ADAPT:** Port friend's project card component into `DashboardPage.tsx`. Preserve local project click navigation. |
| **Filter Tabs** | None. Only a "View all" link to `/history`. | Rounded pill tabs: `All`, `Processing`, `Completed` with animated counts and instant client-side filtering. | Friend allows 1-click filtering of active vs completed projects. | **COPY:** Port friend's tab state (`projectTab`) and filtering logic. |
| **Empty State** | Dashed box with green video icon and clay "Clip Your First Video" button. | High-contrast dashed glass panel with purple video icon, `Sora` typography, and purple "+ Create Your First Project" CTA. | Friend matches dark cinematic aesthetic. | **COPY:** Port friend's empty state JSX. |

---

## 3. Structural Code Differences

### 3.1 `src/layouts/DashboardLayout.tsx`
- **Local (186 lines):**
  - Renders `<div className="min-h-screen bg-cream text-foreground lg:flex">`.
  - Simple sidebar with static `links` array.
  - Clay "Upgrade to Pro" card.
  - Header has search input, notification bell, user initial avatar, and clay button.
- **Friend (487 lines):**
  - Renders `<div className="min-h-screen bg-[#080B12] text-[#F4F6FB] flex flex-col lg:flex-row antialiased ...">`.
  - Categorized `navSections` array (Create, Publish, Workspace).
  - Collapsible sidebar with state `collapsed`, adjusting layout from `w-[260px]` to `w-20`.
  - Workspace selector component with avatar badge and plan subtitle.
  - Sidebar footer with dynamic `usage` calculation and progress bar.
  - Header with `Ctrl K` search trigger, quota pill, upgrade button, `.vireo-btn-purple` create button, and profile popover menu.

### 3.2 `src/pages/DashboardPage.tsx`
- **Local (338 lines):**
  - Renders greeting, Quota Usage card, 4 Stats cards, Quick Actions grid, Processing Queue panel, and Recent Projects list.
  - Uses Tailwind classes: `bg-cream`, `bg-white`, `border-border`, `text-vireo-green`, `bg-clay`.
- **Friend (557 lines):**
  - Imports and mounts `<HomeClippingWorkflow />` at top.
  - Implements YouTube thumbnail resolver `getProjectThumbnail(p: Project)`.
  - Implements relative time formatter `formatTimeAgo(dateString)`.
  - Implements status tabs: `All`, `Processing`, `Completed`.
  - Renders 4-column `.vireo-dash-glass` cards with film watermarks, hover zoom on thumbnails, and animated gradient progress bars.

### 3.3 `src/components/dashboard/HomeClippingWorkflow.tsx`
- **Local:** Does not exist (0 lines).
- **Friend (1,866 lines):**
  - Houses the complete interactive multi-stage clipping hero and state machine (`no_source`, `source_selected`, `processing`, `clips_ready`, `exporting`, `error`).
  - Manages drag-and-drop, offscreen video metadata inspection, aspect ratio configuration, duration selection, and caption language choices.
