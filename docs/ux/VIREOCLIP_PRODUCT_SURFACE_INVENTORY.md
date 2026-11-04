# VireoClip Product Surface & Route Inventory

**Document Version:** 1.0.0  
**Audit Target:** Complete Application Surface Coverage  
**Date:** October 11, 2026  
**Status:** COMPLETE ROUTE INVENTORY  

---

## 1. Inventory Summary

This inventory documents all 20 discovered user-facing routes in VireoClip based on source code analysis (`src/App.tsx`) and live browser verification.

| Route Pattern | Page Name | Auth Required | Layout Container | Surface Classification |
| :--- | :--- | :--- | :--- | :--- |
| `/` | `LandingPage` | No (Public) | `RootLayout` | Top-of-Funnel Conversion & Asset Showcase |
| `/terms` | `TermsPage` | No (Public) | `RootLayout` | Legal / Compliance |
| `/privacy` | `PrivacyPage` | No (Public) | `RootLayout` | Legal / Compliance |
| `/login` | `LoginPage` | Public Only (Redirects if Auth) | `AuthLayout` | Identity / Session Authentication |
| `/signup` | `SignupPage` | Public Only (Redirects if Auth) | `AuthLayout` | User Onboarding / Registration |
| `/dashboard` | `DashboardPage` | Yes (Protected) | `DashboardLayout` | Workspace Overview & Quick Actions |
| `/workspaces` | `WorkspacePage` | Yes (Protected) | `DashboardLayout` | Multi-Tenant Team & Workspace Admin |
| `/workflows` | `WorkflowPage` | Yes (Protected) | `DashboardLayout` | Automation Rules & Webhook Pipeline |
| `/projects/new` | `NewProjectPage` | Yes (Protected) | `DashboardLayout` | Media Ingestion (Upload / URL) |
| `/projects/:id` | `ProjectDetailPage` | Yes (Protected) | `DashboardLayout` | Project Results, Content Kit, AI Clips |
| `/clips/:clipId/edit` | `ClipEditorPage` | Yes (Protected) | Fullscreen Studio | Dual-Mode Editor (Beginner vs Pro NLE) |
| `/brand` | `BrandPage` | Yes (Protected) | `DashboardLayout` | Brand Brain Identity & Voice Profile |
| `/analytics` | `AnalyticsPage` | Yes (Protected) | `DashboardLayout` | Content Analytics & Growth Coach |
| `/ab-testing` | `ABStudioHistoryPage` | Yes (Protected) | `DashboardLayout` | Split-Testing Experiments & CSV Import |
| `/publishing` | `PublishingHistoryPage`| Yes (Protected) | `DashboardLayout` | Social OAuth & Published Post History |
| `/billing` | `BillingPage` | Yes (Protected) | `DashboardLayout` | Subscription Plans & Usage Metering |
| `/history` | `HistoryPage` | Yes (Protected) | `DashboardLayout` | Project & Media Processing Log |
| `/settings` | `SettingsPage` | Yes (Protected) | `DashboardLayout` | Profile, Security, & Integration Settings |
| `/admin` | `AdminPage` | Yes (Admin Role) | `DashboardLayout` | Internal Console & Processing Telemetry |
| `*` | `NotFoundPage` | No (Catch-all) | `RootLayout` | 404 Error Surface |

---

## 2. Route Deep-Dive Specifications

---

### Route 1: `/` — LandingPage
- **Page Name:** `LandingPage.tsx`
- **Purpose:** Brand landing page, value proposition communication, product visual showcase, and top-of-funnel video import handoff.
- **Authentication Requirement:** Public (Accessible to all visitors).
- **Primary CTA:** "Get Free Clips" (URL submission button in hero) / "Start Creating Free" (Top navbar).
- **Secondary CTAs:** "Watch Demo Video", "Explore Templates", "Login", "Sign Up".
- **Major Components:** `Navbar`, `LandingHero`, `ResponsiveFeatureShowcase`, `ProductVisuals`, `CookieNotice`, `Footer`.
- **Navigation Source:** Direct URL entry, external marketing, logo clicks from public pages.
- **Navigation Destination:** `/signup?next=%2Fprojects%2Fnew%3Furl%3D...` (if logged out) or `/projects/new?url=...` (if logged in).
- **Desktop Behavior:** Full-width dark spatial aesthetic (`#0a0a0a`), interactive video player showcases, animated creator clip comparisons.
- **Mobile Behavior:** Responsive single-column stack, sticky top navigation with hamburger menu, touch-friendly CTA buttons.
- **Loading State:** Skeleton pulsed placeholder in `React.Suspense`.
- **Empty State:** Not applicable (static/promotional content).
- **Error State:** Generic browser crash boundary if WebGL/video fails.
- **Potential Dead Ends:** None.

---

### Route 2: `/login` — LoginPage
- **Page Name:** `LoginPage.tsx`
- **Purpose:** User authentication via email/password or Google OAuth.
- **Authentication Requirement:** Public Only (Redirects authenticated users to `destination` or `/dashboard`).
- **Primary CTA:** "Sign in" (Form submit button).
- **Secondary CTAs:** "Continue with Google", "Forgot password?", "Sign up for free" link.
- **Major Components:** `AuthLayout`, `Input`, `Button`, `GoogleIcon`.
- **Navigation Source:** Marketing navbar, session expiry redirect, protected route redirect (`state.from`).
- **Navigation Destination:** `/dashboard` or preserved `destination` (`landingReturnPath`).
- **Desktop Behavior:** Centered card with botanical cream background (`#FBF8F3`) and terracotta clay primary button.
- **Mobile Behavior:** Full-width card with comfortable touch inputs.
- **Loading State:** "Signing in…" spinner state on submit button.
- **Empty State:** Clean empty input fields.
- **Error State:** Red destructive banner above form for invalid credentials or unconfirmed email.
- **Potential Dead Ends:** Password reset button triggers alert without clear reset link page (redirects to `/settings`).

---

### Route 3: `/signup` — SignupPage
- **Page Name:** `SignupPage.tsx`
- **Purpose:** New user registration, account creation, and terms consent.
- **Authentication Requirement:** Public Only.
- **Primary CTA:** "Create account" (Form submit button).
- **Secondary CTAs:** "Continue with Google", "Sign in" link, Terms & Privacy policy links.
- **Major Components:** `AuthLayout`, `Input`, `Button`, `GoogleIcon`.
- **Navigation Source:** Marketing CTA "Get Free Clips", Login page link.
- **Navigation Destination:** Preserved `destination` (e.g. `/projects/new?url=...`) or `/dashboard`.
- **Desktop Behavior:** Centered card layout matching LoginPage with password confirmation and terms checkbox.
- **Mobile Behavior:** Single-column scrollable form.
- **Loading State:** "Creating account…" button spinner.
- **Empty State:** Clean empty fields.
- **Error State:** Error banner for password mismatch, short password, or existing account.
- **Potential Dead Ends:** Supabase requires email verification; user receives "Please confirm your email address" banner and cannot proceed without checking inbox.

---

### Route 4: `/dashboard` — DashboardPage
- **Page Name:** `DashboardPage.tsx`
- **Purpose:** Creator dashboard, monthly quota tracker, quick project starters, and recent processing status.
- **Authentication Requirement:** Protected (Requires active session).
- **Primary CTA:** "+ Clip a Video" (Top right button navigating to `/projects/new`).
- **Secondary CTAs:** "Upload a video", "View history", "Latest transcript", "Growth Coach", "Upgrade Now".
- **Major Components:** `DashboardLayout`, `SpotlightCard`, Quota Progress Bar, Metrics Cards, Quick Action Tiles, Processing Queue list.
- **Navigation Source:** Post-login default destination, Sidebar "Dashboard" link.
- **Navigation Destination:** `/projects/new`, `/history`, `/projects/:id`, `/analytics`, `/billing`.
- **Desktop Behavior:** 2-column card grid in cream background (`#FBF8F3`) with Fraunces serif headings and fixed left sidebar.
- **Mobile Behavior:** Collapsible hamburger drawer, stacked single-column metric tiles.
- **Loading State:** Skeleton pulse cards while querying MongoDB projects and usage.
- **Empty State:** "No projects created yet" with prominent "Create your first project" CTA.
- **Error State:** Error banner if project fetch fails.
- **Potential Dead Ends:** High quota warning bar (100% used) disables creation until reset or plan upgrade.

---

### Route 5: `/projects/new` — NewProjectPage
- **Page Name:** `NewProjectPage.tsx`
- **Purpose:** Media source ingestion via direct file upload or external video URL.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Start Processing →" / "Upload Video…" / "Import Video URL…".
- **Secondary CTAs:** "Back to Dashboard", "Change video file", "Cancel Upload", "Retry".
- **Major Components:** Mode Switcher Tabs (Upload vs URL), Drag & Drop Zone, File Requirements Grid, Title input, Notes textarea, R2 Upload Progress Bar.
- **Navigation Source:** Dashboard CTA, Sidebar "+ New Project", Landing Hero URL handoff.
- **Navigation Destination:** `/projects/:id` (upon successful upload/ingestion).
- **Desktop Behavior:** Centered form card with side helper panels ("Get the best results", "What happens next?").
- **Mobile Behavior:** Stacked form; file picker opens native OS file/gallery sheet.
- **Loading State:** Byte-accurate percentage bar during R2 upload; pulsating spinner during URL stream verification.
- **Empty State:** Clean file dropzone and empty URL field.
- **Error State:** Red alert for invalid video format, files >50MB, or invalid YouTube URL.
- **Potential Dead Ends:** If upload fails mid-way, "Retry" button restarts upload from 0%. Missing pre-processing options (no clip length, timeframe, or caption selection).

---

### Route 6: `/projects/:id` — ProjectDetailPage
- **Page Name:** `ProjectDetailPage.tsx`
- **Purpose:** Multi-tab project workspace: Generated AI Clips, Multi-Platform Content Kit, Transcripts, and Media Assets.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Edit in Studio" (Navigates to `/clips/:clipId/edit`).
- **Secondary CTAs:** "Regenerate Suggestions", "Find Moment" (Multimodal search), "Generate Content", "Download Clip", "Publish".
- **Major Components:** Project Header Card, Tab Strip (`Clips`, `Content Kit`, `Transcript`), `ClipWorkspace`, Moment Search Bar, Candidate Card List, Video Player, Moment Details Inspector, `PublishModal`.
- **Navigation Source:** Dashboard recent list, `/projects/new` completion redirect, `/history`.
- **Navigation Destination:** `/clips/:clipId/edit`, `/publishing`, `/projects/new`.
- **Desktop Behavior:** 3-column split view (Clip list, preview player, moment intelligence inspector).
- **Mobile Behavior:** Stacked view; video player pushes clip list off-screen.
- **Loading State:** Pulsing progress steps during transcription and AI candidate discovery.
- **Empty State:** "No clips generated yet" with "Analyze video now" trigger.
- **Error State:** Retry button if backend analysis fails.
- **Potential Dead Ends:** Clicking "Edit in Studio" on an unrendered suggestion requires rendering first before opening the full editor.

---

### Route 7: `/clips/:clipId/edit` — ClipEditorPage
- **Page Name:** `ClipEditorPage.tsx`
- **Purpose:** Deep video editing workspace with dual modes: Beginner Mode (1-click styling) and Pro Mode (Multi-Track NLE).
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Render Changes" (Burn in new edits and re-render MP4).
- **Secondary CTAs:** "Beginner Mode" / "Pro Multi-Track" toggle, "Save Edits", "Reset", "Download", "Apply Brand", Undo/Redo, Safe Area toggle.
- **Major Components:** Top Bar, `EditorCanvas`, Video Scrubber & Trim Sliders, 11-Tab Right Inspector (`Captions`, `Framing`, `Headline`, `Audio`, `Producer`, `Translate`, `Content Pack`, `Hook Lab`, `Thumbnail Lab`, `Autopilot`, `A/B Studio`), `Timeline` (in Pro mode), `MediaBin`, `CommandPalette`.
- **Navigation Source:** `/projects/:id` clip card "Edit in Studio" button.
- **Navigation Destination:** `/projects/:id` (via Back arrow), External download.
- **Desktop Behavior:** Fullscreen pitch-black studio (`#0a0a0a`). Canvas centered, inspector on right (variable width 384px–720px).
- **Mobile Behavior:** Severely constrained; inspector tabs wrap or overflow, timeline is unusable on portrait mobile screens.
- **Loading State:** Full-screen pulse loader "Connecting to your studio…".
- **Empty State:** Fallback message if clip data fails to load.
- **Error State:** Red toast banner in canvas header on API or render failures.
- **Potential Dead Ends:** Toggling to Pro Mode when unauthenticated or network drops silently keeps user on Beginner Mode without an error message.

---

### Route 8: `/brand` — BrandPage
- **Page Name:** `BrandPage.tsx`
- **Purpose:** Brand Brain workspace: configure brand tone, target audience, preferred hook styles, vocabulary rules, and brand colors/fonts.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Save Brand Profile".
- **Secondary CTAs:** "Reset to Defaults", "Add Forbidden Phrase".
- **Major Components:** Persona Form, Tone Selector, Visual Asset Uploaders, Brand Rule Badges.
- **Navigation Source:** Sidebar "Brand Brain".
- **Navigation Destination:** `/dashboard`, `/clips/:clipId/edit`.
- **Desktop Behavior:** Multi-section form in cream theme.
- **Mobile Behavior:** Single-column vertical form.
- **Loading State:** Form skeleton while fetching profile.
- **Empty State:** Blank profile pre-populated with "Tech & SaaS" / "Friendly" defaults.
- **Error State:** Form validation warnings for string lengths.
- **Potential Dead Ends:** None.

---

### Route 9: `/analytics` — AnalyticsPage
- **Page Name:** `AnalyticsPage.tsx`
- **Purpose:** Growth Coach, content performance tracking, platform ROI metrics, and hook retention scores.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Generate Performance Report".
- **Secondary CTAs:** Date range picker, Platform filter tabs.
- **Major Components:** Metrics Cards, Growth Coach AI Recommendations, Retention Charts.
- **Navigation Source:** Sidebar "Analytics".
- **Navigation Destination:** `/dashboard`, `/publishing`.
- **Desktop Behavior:** Multi-column dashboard layout.
- **Mobile Behavior:** Stacked chart cards.
- **Loading State:** Chart skeleton loaders.
- **Empty State:** "No published post analytics yet. Connect your social channels to track real engagement."
- **Error State:** Alert banner on telemetry sync error.
- **Potential Dead Ends:** None.

---

### Route 10: `/ab-testing` — ABStudioHistoryPage
- **Page Name:** `ABStudioHistoryPage.tsx`
- **Purpose:** A/B Studio experiment dashboard, split-test variants, statistical significance tracker, and CSV metric importer.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Create New Experiment".
- **Secondary CTAs:** "Import CSV Metrics", "Filter by Platform", "Archive Test".
- **Major Components:** Experiment Card Grid, Significance Confidence Badges, `ABCsvImportModal`.
- **Navigation Source:** Sidebar "A/B Studio".
- **Navigation Destination:** `/clips/:clipId/edit?tab=ab_studio`.
- **Desktop Behavior:** Table and card grid with detailed CTR and Retention delta statistics.
- **Mobile Behavior:** Stacked experiment cards.
- **Loading State:** Pulsing experiment rows.
- **Empty State:** "No active A/B experiments. Test different hooks and thumbnails in the clip editor."
- **Error State:** CSV parse error toast.
- **Potential Dead Ends:** None.

---

### Route 11: `/publishing` — PublishingHistoryPage
- **Page Name:** `PublishingHistoryPage.tsx`
- **Purpose:** Social media account connections (YouTube, Instagram, TikTok, LinkedIn) and published post history log.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Connect New Account".
- **Secondary CTAs:** "Disconnect", "Retry Failed Publish", "View on Platform".
- **Major Components:** Connected Channels Grid, OAuth Action Modals, Publish Job Table.
- **Navigation Source:** Sidebar "Publishing".
- **Navigation Destination:** External social OAuth flows.
- **Desktop Behavior:** Channel status cards with toggle switches and audit history table.
- **Mobile Behavior:** Stacked channel list.
- **Loading State:** Spinner during OAuth callback.
- **Empty State:** "No social accounts connected yet."
- **Error State:** Red badge for expired OAuth tokens.
- **Potential Dead Ends:** Redirect mismatch if OAuth environment variables are unconfigured.

---

### Route 12: `/billing` — BillingPage
- **Page Name:** `BillingPage.tsx`
- **Purpose:** Subscription plan selection (Free, Creator, Pro, Agency), monthly/annual toggle, and credit management.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Upgrade Plan" / "Manage Subscription".
- **Secondary CTAs:** Annual billing toggle (Save 20%), "Contact Enterprise".
- **Major Components:** Plan Comparison Matrix, Feature Checklist, Invoice History Table.
- **Navigation Source:** Sidebar "Billing & Plans", Dashboard "Upgrade to Pro" banner.
- **Navigation Destination:** Stripe / Paddle checkout portal.
- **Desktop Behavior:** 4-column pricing tier comparison grid.
- **Mobile Behavior:** Horizontally scrollable or stacked tier cards.
- **Loading State:** Loading skeletons while querying subscription status.
- **Empty State:** Free plan active badge.
- **Error State:** Payment failed alert.
- **Potential Dead Ends:** Clicking checkout in demo mode shows unconfigured provider alert.

---

### Route 13: `/history` — HistoryPage
- **Page Name:** `HistoryPage.tsx`
- **Purpose:** Master chronological log of all imported projects, transcribed videos, and rendered clips.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Open Project".
- **Secondary CTAs:** Search bar, Status filter dropdown, Delete project action.
- **Major Components:** Search & Filter Toolbar, Chronological Project Table, Status Badges.
- **Navigation Source:** Sidebar "History".
- **Navigation Destination:** `/projects/:id`.
- **Desktop Behavior:** Paginated data table with timestamps, durations, and clip counts.
- **Mobile Behavior:** Stacked history cards.
- **Loading State:** Table skeleton loader.
- **Empty State:** "No project history found matching your filters."
- **Error State:** Error banner if project database query fails.
- **Potential Dead Ends:** Deleting a project is irreversible (warns via modal).

---

### Route 14: `/settings` — SettingsPage
- **Page Name:** `SettingsPage.tsx`
- **Purpose:** User account profile, password change, email preferences, API keys, and notification toggles.
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Save Changes".
- **Secondary CTAs:** "Change Password", "Delete Account".
- **Major Components:** Profile Picture Avatar, Form Inputs, Toggle Switches.
- **Navigation Source:** Sidebar "Settings", Top user dropdown menu.
- **Navigation Destination:** `/dashboard`.
- **Desktop Behavior:** Clean form card in cream layout.
- **Mobile Behavior:** Single-column scrollable form.
- **Loading State:** Skeleton loader while fetching user metadata.
- **Empty State:** Not applicable.
- **Error State:** Inline validation errors for passwords or email formats.
- **Potential Dead Ends:** None.

---

### Route 15: `/workspaces` — WorkspacePage
- **Page Name:** `WorkspacePage.tsx`
- **Purpose:** Multi-tenant workspace management, team member invites, and role-based permissions (Owner, Editor, Viewer).
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Create New Workspace" / "Invite Team Member".
- **Secondary CTAs:** Role selector dropdown, "Remove Member", "Switch Workspace".
- **Major Components:** Workspace Switcher, Member List Table, Invitation Modal.
- **Navigation Source:** Sidebar "Workspaces".
- **Navigation Destination:** `/dashboard`.
- **Desktop Behavior:** Split view: workspace settings on left, member list on right.
- **Mobile Behavior:** Stacked view.
- **Loading State:** Table row skeletons.
- **Empty State:** "Single personal workspace active."
- **Error State:** "Permission denied" alert if non-owner attempts member deletion.
- **Potential Dead Ends:** None.

---

### Route 16: `/workflows` — WorkflowPage
- **Page Name:** `WorkflowPage.tsx`
- **Purpose:** Automated video processing pipelines (e.g. "Auto-clipping on new YouTube upload", Webhook triggers).
- **Authentication Requirement:** Protected.
- **Primary CTA:** "Create Automated Workflow".
- **Secondary CTAs:** Toggle active switch, "Run Now", "Configure Triggers".
- **Major Components:** Workflow Pipeline Cards, Trigger Builder, Execution History Log.
- **Navigation Source:** Sidebar "Workflows".
- **Navigation Destination:** `/workflows/new`.
- **Desktop Behavior:** Visual flow cards showing Trigger → Analysis → Generation → Publishing stages.
- **Mobile Behavior:** Stacked card list.
- **Loading State:** Pulse skeletons.
- **Empty State:** "No automated workflows configured. Set up your first auto-clipping rule."
- **Error State:** Webhook failure notification.
- **Potential Dead Ends:** None.

---

### Route 17: `/admin` — AdminPage
- **Page Name:** `AdminPage.tsx`
- **Purpose:** Internal operational console, system health metrics, active GPU workers, and processing queues.
- **Authentication Requirement:** Protected (Restricted to specific admin emails, e.g. `vertexdigitals07@gmail.com`).
- **Primary CTA:** "Refresh Telemetry".
- **Secondary CTAs:** "Drain Queue", "Inspect Worker Logs".
- **Major Components:** System Health Dashboard, Worker Gauge Meters, Processing Task Table.
- **Navigation Source:** Sidebar link (conditionally rendered for admin email).
- **Navigation Destination:** `/dashboard`.
- **Desktop Behavior:** High-density telemetry dashboard.
- **Mobile Behavior:** Stacked diagnostic meters.
- **Loading State:** Spinner while fetching backend health endpoints.
- **Empty State:** "Queue empty: 0 pending jobs."
- **Error State:** Red status indicator when database or R2 storage drops connection.
- **Potential Dead Ends:** Non-admin users navigating directly receive a clean permission denial or 404.

---

### Route 18: `/terms` — TermsPage
- **Page Name:** `TermsPage.tsx`
- **Purpose:** Legal terms of service, AI usage policies, intellectual property rights, and subscription terms.
- **Authentication Requirement:** Public.
- **Primary CTA:** "Back to Home".
- **Secondary CTAs:** Privacy policy link.
- **Major Components:** Legal Typography Container, Version Stamp.
- **Navigation Source:** Footer link, Signup terms checkbox link.
- **Navigation Destination:** `/`, `/privacy`.
- **Desktop Behavior:** Formatted document view.
- **Mobile Behavior:** Responsive readable column.
- **Loading State:** Instant render.
- **Empty State:** Not applicable.
- **Error State:** Not applicable.
- **Potential Dead Ends:** None.

---

### Route 19: `/privacy` — PrivacyPage
- **Page Name:** `PrivacyPage.tsx`
- **Purpose:** GDPR/CCPA privacy policy, data collection disclosure, and user data deletion instructions.
- **Authentication Requirement:** Public.
- **Primary CTA:** "Back to Home".
- **Secondary CTAs:** Terms link, contact email link.
- **Major Components:** Legal Typography Container.
- **Navigation Source:** Footer link, Signup link.
- **Navigation Destination:** `/`, `/terms`.
- **Desktop Behavior:** Formatted document view.
- **Mobile Behavior:** Responsive readable column.
- **Loading State:** Instant render.
- **Empty State:** Not applicable.
- **Error State:** Not applicable.
- **Potential Dead Ends:** None.

---

### Route 20: `*` — NotFoundPage
- **Page Name:** `NotFoundPage.tsx`
- **Purpose:** Catch-all 404 handler for invalid routes or deleted projects.
- **Authentication Requirement:** Public.
- **Primary CTA:** "Return to Dashboard" (if authenticated) or "Back to Home".
- **Secondary CTAs:** "Explore Features".
- **Major Components:** 404 Visual Illustration, Navigation Buttons.
- **Navigation Source:** Any broken link or mistyped URL.
- **Navigation Destination:** `/dashboard` or `/`.
- **Desktop Behavior:** Centered error card.
- **Mobile Behavior:** Responsive centered stack.
- **Loading State:** Instant render.
- **Empty State:** Not applicable.
- **Error State:** Self-contained error display.
- **Potential Dead Ends:** None (guaranteed return CTA).

---

## 3. Surface Architecture Insights & Disconnects

1. **Theme Incoherence Across Routes:**  
   - Marketing (`/`, `/terms`, `/privacy`) and Studio (`/clips/:clipId/edit`) use dark themes (`#0a0a0a`), while Core App (`/dashboard`, `/projects/new`, `/projects/:id`, `/brand`, `/analytics`, `/ab-testing`, `/publishing`, `/billing`, `/history`, `/settings`, `/workspaces`, `/workflows`) all use light cream (`#FBF8F3`) with Fraunces serif and terracotta clay buttons.
2. **Editor Isolation:**  
   - `/clips/:clipId/edit` is completely detached from the global dashboard navigation. While this creates a focused fullscreen experience, there are no breadcrumbs to return to the parent project without clicking a generic back arrow.
3. **Admin Visibility:**  
   - Hardcoded admin email checks (`user?.email === 'vertexdigitals07@gmail.com'`) in `DashboardLayout.tsx` and `AdminPage.tsx` should be migrated to role-based claims in the database rather than client-side email string matching.
