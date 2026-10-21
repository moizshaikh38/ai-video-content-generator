# 05 — Shared Component and Landing Page Risks
**Scope:** Landing Page Protection & Design System Collision Audit  
**Security Level:** CRITICAL — ZERO CONTAMINATION PERMITTED  
**Mode:** READ-ONLY Verification  

---

## 1. Protected Landing Page Surfaces

The user's local landing page is the authoritative source of truth. Under the project scope lock, the following files and surfaces are **strictly protected** and must not be touched, replaced, or modified:

1. `src/components/landing/LandingHero.tsx` (Local hero layout, headline, CTA button, copy)
2. `src/components/landing/cinematic-hero.css` (Local hero styling, spatial-glass, lighting)
3. Six local creator cards and images (`src/assets/creators/creator-1.jpg` .. `creator-6.jpg`)
4. Landing Navbar (`src/components/Navbar.tsx`) and spatial-glass treatment
5. Hero URL-ingest control and auto-paste interaction
6. Animated Feature Showcase (`ExploreMajorFeatures.tsx`, `FeatureShowcase.tsx`, `featureShowcaseEngine.*`)
7. Showcase choreography (AI Clipping, Captions, Reframe, B-roll)
8. Landing foundational styling (`src/pages/landing.css`, `src/pages/landing-foundation.css`)
9. Landing Page root component (`src/pages/LandingPage.tsx`)
10. Landing reference assets and SVGs (`src/assets/brand/vireoclip-*.svg`)

---

## 2. Shared Component Hazard Analysis

### 2.1 `src/components/Logo.tsx` — HAZARD LEVEL: HIGH
- **Classification:** **SHARED — DO NOT REPLACE BLINDLY**
- **Collision Details:**
  - In the friend repository (commit `0959d09`), the friend altered `Logo.tsx`:
    1. Replaced vector SVG imports (`vireoclip-logo-dark.svg`, `vireoclip-logo-light.svg`, `vireoclip-symbol.svg`) with raster PNGs (`vireo-logo-purple.png`, `vireo-mark-purple.png`).
    2. Stripped out supported props: removed `symbolOnly`, `variant`, `size`, and `light`.
  - In the local repository, `Logo.tsx` is heavily used by:
    - Landing Navbar (`<Logo size="md" variant="dark" />`)
    - Landing Hero
    - Public Footer
    - Auth pages (`LoginPage.tsx`, `SignupPage.tsx`)
- **Consequence of Copying:** Blindly copying friend's `Logo.tsx` would cause TypeScript compiler errors across the local landing page, break the vector SVG rendering, and force purple raster PNGs onto the landing navbar.
- **Porting Rule:** **KEEP LOCAL `Logo.tsx`.**  
  The friend's `DashboardLayout.tsx` calls:
  `<Logo to="/dashboard" compact={false} />` and `<Logo to="/dashboard" compact />`.
  The local `Logo.tsx` ALREADY supports `compact={true}`:
  ```typescript
  const showSymbol = symbolOnly || compact;
  const source = showSymbol ? symbol : resolvedVariant === "light" ? lightLogo : darkLogo;
  ```
  Passing `variant="light"` or using `compact` with local `Logo.tsx` renders crisp vector SVGs on the dark dashboard without altering a single line of `Logo.tsx`!

---

### 2.2 `src/index.css` — HAZARD LEVEL: CRITICAL
- **Classification:** **GLOBAL CSS / THEME COLLISION — DO NOT COPY**
- **Collision Details:**
  - In the friend repository, `src/index.css` overwrites `:root` global variables:
    ```css
    /* Friend index.css replaced light cream tokens with dark tokens */
    --background: #080B12;
    --foreground: #F4F6FC;
    --cream: #080B12;        /* Overwrites warm cream! */
    --clay: #6DE3A6;         /* Overwrites terracotta! */
    --vireo-green: #6DE3A6;  /* Overwrites forest green! */
    ```
- **Consequence of Copying:**
  Copying friend's `index.css` would completely invert the background of the landing page, destroy contrast across creator cards, turn terracotta buttons neon green, and invalidate all spatial-glass hero lighting.
- **Porting Rule:** **DO NOT TOUCH `src/index.css`.**  
  The friend's dashboard components (`DashboardLayout.tsx`, `DashboardPage.tsx`, `HomeClippingWorkflow.tsx`) do NOT rely on `:root` CSS variables. They use explicit Tailwind background and color classes (`bg-[#080B12]`, `bg-[#0B0F19]`, `text-[#F4F6FB]`, `text-[#8E9AB4]`, `.vireo-dash-glass`).  
  The dark dashboard theme is completely self-contained within `DashboardLayout.tsx`!

---

### 2.3 `src/styles/cinematic-motion.css` — HAZARD LEVEL: NONE (SAFE TO EXTEND)
- **Classification:** **GLOBAL CSS EXTENSION — SAFE**
- **Collision Details:**
  - The friend appended 6 classes to the bottom of `cinematic-motion.css`:
    - `.vireo-dash-glass`
    - `.vireo-dash-hero`
    - `.vireo-clipcard-left`
    - `.vireo-clipcard-right`
    - `.vireo-btn-purple`
    - `.vireo-nav-active`
- **Collision Check:**
  None of these classes exist on the landing page, hero, or editor. They are uniquely prefixed (`vireo-dash-*`, `vireo-clipcard-*`, `vireo-btn-purple`).
- **Porting Rule:** Append these 6 classes to `src/styles/cinematic-motion.css` (or create a dedicated `dashboard-cinematic.css`). Zero risk to landing page.

---

### 2.4 `index.html` (Google Font Links) — HAZARD LEVEL: NONE (SAFE TO EXTEND)
- **Classification:** **ASSET / FONT EXTENSION — SAFE**
- **Collision Details:**
  - Friend added `Sora` and `DM Sans` to Google Fonts link:
    ```html
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    ```
- **Collision Check:**
  Adding web fonts to the HTML `<head>` does NOT alter existing fonts unless CSS assigns them to `body` or `h1`. The friend assigns `font-['Sora',sans-serif]` explicitly via Tailwind utility classes.
- **Porting Rule:** Append `Sora` and `DM Sans` to the font link in `index.html`. Zero risk to landing typography.

---

## 3. Subpage Containment Matrix

The following table evaluates the impact on other dashboard routes when `DashboardLayout.tsx` adopts the dark theme:

| Subroute | Component | Current Background | Dark Shell Impact | Mitigation / Recommendation |
|---|---|---|---|---|
| `/dashboard` | `DashboardPage.tsx` | Will adopt friend dark UI | Intended primary target | Zero issues; 100% designed for dark shell. |
| `/history` | `HistoryPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark `#080B12` canvas | Compatible. Cards provide their own opaque background. |
| `/brand` | `BrandPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/analytics` | `AnalyticsPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/ab-testing`| `ABStudioHistoryPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/billing` | `BillingPage.tsx` | Dark spotlight cards (`SpotlightCard`) | Originally designed for dark mode | Enhanced aesthetic cohesion. |
| `/settings` | `SettingsPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/workflows`| `WorkflowPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/workspaces`| `WorkspacePage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |
| `/projects/new`| `NewProjectPage.tsx` | White cards (`bg-white border-border`) | Cards float cleanly on dark canvas | Compatible. |

**Key Finding:** Every subpage component encapsulates its own card backgrounds (`bg-white` or `bg-card`). Wrapping them inside the dark `#080B12` shell creates a sleek SaaS workspace without breaking layout or text contrast in subpages.
