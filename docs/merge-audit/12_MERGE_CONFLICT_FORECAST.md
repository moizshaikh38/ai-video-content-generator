# 12. Merge Conflict Forecast & Resolution Guide

**Audit Date:** 2026-10-11  
**Scope:** Conflict forecasting across all modified files to prevent data loss or regressions during future integration.

---

## 1. Conflict Severity Matrix

| Conflict Risk | Severity | Affected Files | Core Hazard | Recommended Resolution |
| :--- | :---: | :--- | :--- | :--- |
| **Hero Divergence** | **CRITICAL** | `src/components/landing/LandingHero.tsx` | Git 3-way merge would overwrite either the local cinematic hero or the friend's showcase. | **DO NOT GIT MERGE.** Keep local `LandingHero.tsx` as base; import friend's `<AiClippingPreview />` into `<div className="vc-showcase-shell">`. |
| **Logo Prop Removal** | **HIGH** | `src/components/Logo.tsx` | Friend removed `symbolOnly`, `variant`, `size` props, which will break 4 pages in the project. | Merge props: Keep local vector SVGs and all existing props while adding support for `compact` and friend's scroll-to-top onClick. |
| **Navbar Clutter / Logo Mismatch** | **HIGH** | `src/components/Navbar.tsx` | Friend expanded navbar to 583 lines with direct PNG logo import; local has clean 77-line navbar. | Decide during integration: Keep local minimal navbar, or adapt friend's dropdown menus while using local `<Logo />`. |
| **Landing Root Sections** | **HIGH** | `src/pages/LandingPage.tsx` | Divergent section lists below hero. | Adopt friend's section composition (`ExploreMajorFeatures` through `FinalCTA`) while rendering local `<LandingHero />` at top. |
| **Router & Context Wrapping** | **MEDIUM** | `src/App.tsx` | Friend added `CurrencyProvider` and 2 auxiliary routes (`/comparisons`, `/support`). | Keep all local routes; add `<CurrencyProvider>` and the 2 new routes. |
| **Stylesheet Namespace** | **LOW** | `index.css`, `landing-foundation.css` | Need to import new carousel and motion CSS files without breaking existing styles. | Add `@import './styles/cinematic-motion.css';` and `@import './styles/feature-carousel.css';` to `index.css`. Namespaces are disjoint (`.vc-` vs `.lv-` vs `.vireo-`). |
| **Font & Metadata** | **LOW** | `index.html` | Google Fonts preconnect vs OpenGraph tags and branding. | Combine both: Add Fraunces and Inter font imports; keep VireoClip branding and OG metadata. |
| **Editor Services** | **ZERO** | `server/*`, `src/services/*editor*`, `ClipEditorPage.tsx` | None. Friend touched 0 editor files and 0 server files. | Keep 100% of local work. |
| **Dependencies** | **ZERO** | `package.json`, `package-lock.json` | None. 100% byte-for-byte identical. | No action needed. |

---

## 2. Detailed Technical Resolution Specs

### Conflict 1: `src/components/landing/LandingHero.tsx` (CRITICAL)
- **The Problem:** Local `LandingHero.tsx` contains the entire cinematic visual orbit, ambient purple spotlights, and 6 floating creator portraits. Friend's `LandingHero.tsx` contains generic creator cards and mounts `AiClippingPreview`.
- **Resolution Strategy:**
  1. Open local `src/components/landing/LandingHero.tsx`.
  2. Replace line 5: `import { FeatureShowcase } from './FeatureShowcase';` with:
     ```tsx
     import { AiClippingPreview } from '../reactbits/AiClippingPreview';
     ```
  3. Replace line 102:
     ```tsx
     {/* Before */}
     <div className="vc-showcase-shell"><FeatureShowcase /></div>

     {/* After */}
     <div className="vc-showcase-shell">
       <AiClippingPreview
         onViewAllClips={() => navigate(creationPath(isAuthenticated, '/dashboard'))}
         onClipSelect={() => {}}
       />
     </div>
     ```
  4. Retain all local creator cards, background effects, and URL input form.

---

### Conflict 2: `src/components/Logo.tsx` (HIGH)
- **The Problem:** Friend's `Logo.tsx` stripped out `symbolOnly`, `variant`, and `size` props:
  ```ts
  // Friend's restrictive interface:
  export interface LogoProps {
    to?: string;
    className?: string;
    compact?: boolean;
    light?: boolean;
  }
  ```
  Adopting friend's version causes `tsc` compile errors in `DashboardLayout.tsx`, `AuthLayout.tsx`, and `NotFoundPage.tsx`.
- **Resolution Strategy:**
  Keep local interface and implementation, and add `compact` and scroll-to-top:
  ```tsx
  export interface LogoProps {
    to?: string;
    className?: string;
    symbolOnly?: boolean;
    variant?: "light" | "dark";
    size?: "sm" | "md" | "lg";
    compact?: boolean;
    light?: boolean;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }
  ```
  Ensure `compact` maps cleanly to symbol rendering and smooth scroll-to-top handler is supported.

---

### Conflict 3: `src/pages/LandingPage.tsx` (HIGH)
- **The Problem:** Local and friend mount different sections after the hero.
- **Resolution Strategy:**
  Use friend's `LandingPage.tsx` section layout, but ensure the `<LandingHero />` rendered at the top is the local hero component.
  Add friend's scroll restoration and hash navigation logic so deep links like `/#pricing` and `/#major-features` work smoothly.

---

### Conflict 4: `src/App.tsx` (MEDIUM)
- **The Problem:** Both branches configure frontend routing.
- **Resolution Strategy:**
  In local `src/App.tsx`:
  1. Wrap with `<CurrencyProvider>` from `./context/CurrencyContext`.
  2. Add lazy routes for `ComparisonsPage` and `SupportPage`:
     ```tsx
     <Route path="/comparisons" element={<ComparisonsPage />} />
     <Route path="/support" element={<SupportPage />} />
     <Route path="/contact" element={<Navigate to="/support" replace />} />
     ```
  3. Keep all existing editor routes (`/clips/:clipId/edit`) and protected routes.
