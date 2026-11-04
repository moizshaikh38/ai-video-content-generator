# 02 — Friend Dashboard UI Inventory
**Source Repository:** `https://github.com/Mayur0785/VireoClip` (HEAD: `024d31c`)  
**Audit Scope:** Complete Inventory of Visual Surfaces, Layouts, and Components  
**Mode:** READ-ONLY Verification  

---

## 1. Overview of Friend Dashboard Experience

The friend's dashboard represents a complete visual overhaul from the earlier cream/green MVP dashboard to a high-end, dark cinematic SaaS workspace.

Rather than being a passive collection of static cards, the friend's dashboard functions as an **interactive creation cockpit**:
1. It leads with a hero-style **AI Video Clipping Journey** (`HomeClippingWorkflow.tsx`) that allows creators to paste a video link, drop a raw MP4 file, or browse existing projects immediately.
2. It organizes the platform with an expandable/collapsible **Dark SaaS Sidebar** divided into functional studio sections (Create, Publish, Workspace).
3. It provides a **Modern SaaS Header** with instant search, quota balance pill, tier status, and quick create CTA.
4. It organizes past and active video assets into a **Categorized Recent Projects Grid** with automatic thumbnail extraction and live processing feedback.

---

## 2. Dashboard Shell Inventory (`src/layouts/DashboardLayout.tsx`)

### 2.1 Sidebar (`<aside>`)
- **Width:** `w-[260px]` expanded; transitions to `w-20` on desktop when collapsed; `fixed inset-y-0 left-0` off-canvas on mobile (`lg:hidden`, `-translate-x-full`).
- **Surface & Background:** `#0B0F19` with subtle right border `border-white/[0.05]`.
- **Header Elements:**
  - `Logo to="/dashboard"` (renders full logo when expanded, compact mark when collapsed).
  - Desktop collapse toggle: Square button (`size-8`, `border-white/[0.08]`) with `ChevronDown` that rotates 90° / -90°.
  - Mobile close button (`X` icon).
- **Workspace Switcher:**
  - Rounded card (`rounded-xl bg-white/[0.03] border border-white/[0.07]`) displaying creator initials in a purple gradient badge (`from-[#8B5CF6] to-[#6D4AFF]`), studio title (`"{Name}'s Studio"`), and plan tier (`"Free Plan · 1 member"`).
  - Clickable, navigates to `/workspaces`.
- **Navigation Sections:**
  - **CREATE:**
    - `Home` (`/dashboard`, icon: `LayoutDashboard`)
    - `Create Clips` (`/projects/new`, icon: `Scissors`)
    - `Video Editor` (`/dashboard#editor`, icon: `Video`)
    - `Content Studio` (`/dashboard#studio`, icon: `Sparkles`)
    - `Media Library` (`/history`, icon: `FolderClosed`)
  - **PUBLISH:**
    - `Publishing` (`/publishing`, icon: `Share2`)
    - `Analytics` (`/analytics`, icon: `TrendingUp`)
    - `A/B Testing` (`/ab-testing`, icon: `FlaskConical`)
  - **WORKSPACE:**
    - `Brand Brain` (`/brand`, icon: `Brain`)
    - `Workspaces` (`/workspaces`, icon: `Building2`)
    - `Workflows` (`/workflows`, icon: `GitBranch`)
  - **ADMIN (Conditional):**
    - Visible only for `vertexdigitals07@gmail.com`: `Owner Console` (`/admin`, icon: `Shield`, amber styling).
  - **UTILITIES (Pinned Bottom):**
    - `Settings` (`/settings`, icon: `Settings`)
    - `Help & tutorials` (`/support`, icon: `HelpCircle`)
- **Active Nav State:**
  - Uses `.vireo-nav-active`: Violet gradient background (`linear-gradient(135deg, rgba(139,92,246,0.22), rgba(109,74,255,0.12))`), white text, violet border (`rgba(139,92,246,0.35)`), and violet glow.
- **Sidebar Footer (Plan & Usage Widget):**
  - Frosted glass container (`bg-white/[0.03] border-white/[0.09] rounded-2xl p-3`).
  - Plan title + numeric quota (`0 / 15m` or `Unlimited`).
  - Animated horizontal progress bar (`bg-[#8B5CF6]`).
  - "Upgrade Plan" full-width CTA button (`.vireo-btn-purple`, navigates to `/billing`).

### 2.2 Top Navigation Header (`<header>`)
- **Position & Sizing:** Sticky top (`sticky top-0 z-30`), height `h-[64px] sm:h-[68px]`, glass blur `bg-[#080B12]/85 backdrop-blur-xl border-b border-white/[0.06]`.
- **Mobile Menu Trigger:** Hamburger `Menu` icon button for `< 1024px` viewports.
- **Search Component:**
  - Desktop: Full input pill (`max-w-[420px]`, `h-[40px]`, `rounded-xl`, `border-white/[0.08] bg-white/[0.04]`).
  - Search icon + placeholder text *"Search projects, clips, and tools"*.
  - Keyboard hint badge: `<kbd>Ctrl K</kbd>`.
  - Mobile: Compact square icon button (`size-9`).
  - Action: Navigates to `/history`.
- **Minutes Quota Badge:**
  - Pill displaying cyan lightning icon (`Zap`) and remaining time (e.g., `⚡ 15 min left`).
  - Visible on `xl+` viewports (>= 1280px).
- **Upgrade Button:**
  - Subtle frosted pill button (`bg-white/[0.05] border-white/[0.12]`), navigates to `/billing`.
  - Visible on `lg+` viewports.
- **Primary "+ Create" CTA Button:**
  - High-visibility purple gradient button (`.vireo-btn-purple`), `h-[38px] px-4 rounded-xl`, `Plus` icon + "Create".
  - Navigates to `/projects/new`.
- **Notifications Button:**
  - Frosted square button with bell icon and cyan notification dot badge (`size-1.5 bg-[#22D3EE]`).
- **User Profile Menu:**
  - Avatar circle with gradient background (`from-[#8B5CF6] to-[#22D3EE]`), user initial, user name, and `ChevronDown`.
  - Dropdown popover:
    - User name, email, plan tier pill.
    - Pinned links: Account Settings (`/settings`), Billing & Subscription (`/billing`), Support & Feedback (`/support`).
    - Sign out button with rose text (`text-rose-400`).

---

## 3. Dashboard Home Inventory (`src/pages/DashboardPage.tsx`)

### 3.1 Main Hero Container (`<HomeClippingWorkflow />`)
- **Class:** `.vireo-dash-glass .vireo-dash-hero`
- **Dimensions & Radius:** Large container with `rounded-[28px]`, responsive padding `p-6 sm:p-8 lg:p-10 xl:p-12`.
- **Ambient Lighting:** Purple top glow gradient + cyan bottom reflection + subtle dot-grid mesh background (`44px x 44px`).
- **Floating 3D Preview Cards (Visible on `xl+` >= 1280px):**
  - **Left Card (`.vireo-clipcard-left`):**
    - Rotation: `-7deg` (tilts slightly counterclockwise).
    - Image: `src/assets/creators/creator-1.jpg` (podcast host talking into studio microphone).
    - Top pill: Recording indicator `● 0:18` (red pulsing dot).
    - Bottom pill: `Your hook` in bold cyan typography (`#22D3EE`).
    - Hover animation: Smoothly untwists to `-2deg`, scales up `1.04x`, and intensifies purple shadow.
  - **Right Card (`.vireo-clipcard-right`):**
    - Rotation: `+7deg` (tilts slightly clockwise).
    - Image: `src/assets/creators/creator-2.jpg` (female creator speaking).
    - Top pill: `✨ Viral 98` in cyan pill.
    - Bottom pill: `Best moment` in bold purple typography (`#A78BFA`).
    - Hover animation: Untwists to `+2deg`, scales up `1.04x`, and intensifies cyan shadow.
- **Hero Typography:**
  - Badge: `● AI video clipping journey` pill with cyan pulse.
  - Headline: *"Turn Your Videos Into"* + gradient text *"Great Clips"* (gradient `from-[#A78BFA] via-[#C084FC] to-[#22D3EE]`). Font: `Sora`.
  - Body: *"Upload video files, paste a YouTube/Vimeo link, or select an existing project to extract viral shorts in one seamless workflow."*
- **URL Ingestion Bar:**
  - Pill-shaped dark input bar (`bg-[#080B12]/80 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.4)]`).
  - Left icon: `Link2`.
  - Placeholder: *"Paste a supported video URL (YouTube, Vimeo, MP4)..."*
  - Submit Button: *"Continue with URL"* (`.vireo-btn-purple`).
- **Channel Action Buttons:**
  - Button 1: *"Upload Video (MP4, MOV, WebM)"* with `UploadCloud` icon. Triggers native hidden file picker.
  - Button 2: *"Browse Projects (N)"* with `FolderOpen` icon. Opens existing projects modal.
- **Drag & Drop Target:**
  - The entire hero card acts as an active drag zone (`onDragOver`, `onDrop`) accepting up to 2 GB video files.
- **Workflow Journey Steps (4-stage progress indicators):**
  - `01 Add Video` — File or streaming URL
  - `02 Configure` — Aspect ratio & preferences
  - `03 AI Clipping` — Speech & hook extraction
  - `04 Edit & Export` — Timeline & multi-platform

### 3.2 Interactive State Machine inside `HomeClippingWorkflow.tsx`
The component supports 5 visual states without leaving `/dashboard`:
1. **`no_source`:** Initial hero view with URL input, file upload button, project browser, and floating cards.
2. **`source_selected`:** Replaces the hero with video configuration controls:
   - Video banner preview (duration, file size, thumbnail).
   - Aspect ratio selector (9:16 Portrait, 1:1 Square, 16:9 Landscape).
   - Duration selector (Auto, 15-30s, 30-60s, 60-90s).
   - Clip count selector (Auto, 3 clips, 5 clips).
   - Captions toggle & language selector (Auto, English, Spanish, French, German, Hindi).
   - Primary action: "Generate Clips Now".
3. **`processing`:** Live progress view:
   - Animated progress bar and percentage.
   - Stage status: "Transcribing audio", "Analyzing viral hooks", "Generating subtitles & reframing".
   - Educational tips carousel while waiting.
4. **`clips_ready`:** Generated candidates grid:
   - Video player with play/pause.
   - Virality score badge (e.g., 98/100).
   - Aspect ratio toggle.
   - Actions: "Edit in Video Editor", "Export / Download", "Publish to Socials".
5. **`error`:** Error banner with retry or choose new source buttons.

### 3.3 Recent Projects Section
- **Section Header:**
  - Title: *"Recent projects"* in `Sora` bold font (`text-[#F4F6FB]`).
  - Filter Tabs: Rounded pill group with three buttons:
    - `All`
    - `Processing`
    - `Completed`
  - Active tab styling: `bg-[#8B5CF6]/25 text-white font-semibold border border-[#8B5CF6]/40`.
  - Link: *"View all →"* navigating to `/history`.
- **Project Cards (4-column responsive grid):**
  - Container: `.vireo-dash-glass` with hover lift (`hover:-translate-y-1 hover:border-[#8B5CF6]/50`).
  - Thumbnail Header (`h-[132px]`):
    - Real YouTube thumbnail if source is YouTube.
    - Fallback: Dark gradient with translucent `Film` watermark.
    - Status badge:
      * Completed: Emerald pill (`bg-[#34D399]/20 text-[#6EE7B7]`).
      * Processing: Cyan pill (`bg-[#22D3EE]/20 text-[#67E8F9]` with pulsing dot).
      * Failed: Rose pill (`bg-rose-500/20 text-rose-300`).
    - Format badge: `URL` or `MP4` mono pill.
  - Card Body:
    - Project title (truncated, white on hover).
    - Relative time (*"Updated 2h ago"*, *"Yesterday"*).
    - If processing: Animated gradient progress bar (*"Analyzing moments - In progress"*).
    - CTA button: Full-width button (*"Open project"*, *"View status"*, or *"Continue"*).
- **Empty States:**
  - Tab empty state: *"No {tab} projects found. [Show all projects]"*.
  - Global empty state: Large dashed card with purple video icon, headline *"Your first project starts here"*, copy, and purple CTA *"Create Your First Project"*.

---

## 4. Visual Tokens & Styling Summary

| Token / Style | Value | Used In |
|---|---|---|
| Background Main | `#080B12` | Shell, page body, hero backdrop |
| Sidebar Background | `#0B0F19` | Left sidebar |
| Glass Surface | `rgba(255, 255, 255, 0.04)` | `.vireo-dash-glass`, project cards |
| Glass Border | `rgba(255, 255, 255, 0.09)` | Cards, search bar, dropdowns |
| Primary Violet | `#8B5CF6` to `#6D4AFF` | `.vireo-btn-purple`, hero glow, active nav |
| Cyan Accent | `#22D3EE` | "Best moment" badge, quota icon, processing pills |
| Emerald Accent | `#34D399` | Completed status badges |
| Text Main | `#F4F6FB` | Primary headers, active links |
| Text Muted | `#8E9AB4` | Secondary text, placeholders, timestamps |
| Title Font | `'Sora', sans-serif` | Hero headline, section titles, workspace name |
| Body Font | `'Inter', sans-serif` | General labels, descriptions |
| Mono Font | `ui-monospace, monospace` | Time badges, format badges, shortcut keys |
