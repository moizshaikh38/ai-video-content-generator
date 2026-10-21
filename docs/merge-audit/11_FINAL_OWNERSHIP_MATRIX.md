# 11. Final Ownership Matrix

**Audit Date:** 2026-10-11  
**Scope:** Component-level and file-level ownership specification for future integration.

---

## 1. Ownership & Action Matrix

| Area / Subsystem | Local Version | Friend Version | Final Intended Owner | Integration Action | Conflict Level | Detailed Notes |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Hero Section (Root)** | `LandingHero.tsx` with `.vc-hero` layout | `LandingHero.tsx` with Spotlight/Particles | **LOCAL** | **KEEP LOCAL** | **CRITICAL** | User mandate: Local hero is the source of truth. |
| **Hero Background & Motion** | `cinematic-hero.css` ambient purple auras & texture | `ParticlesBackground.tsx` & `Spotlight.tsx` | **LOCAL** | **KEEP LOCAL** | **LOW** | Preserve local cinematic purple spotlight system. |
| **Hero Headline & Copy** | *"One video in. Your best clips out."* | *"Turn Long Videos Into Viral Shorts In Minutes"* | **LOCAL** | **KEEP LOCAL** | **LOW** | Preserve local headline, eyebrow, and value copy. |
| **Hero Creator Cards** | 6 Floating cards (`mrbeast`, `ishowspeed`, etc.) | Generic `CreatorShowcaseCard` | **LOCAL** | **KEEP LOCAL** | **LOW** | Preserve local spatial glass creator cards. |
| **Hero Ingestion Input & CTA** | URL input with URL validation & direct navigation | Direct URL form with client validation | **LOCAL** | **KEEP LOCAL** | **LOW** | Preserve local input form, URL parsing, and upload link. |
| **Animated Product Showcase** | `FeatureShowcase.tsx` (DOM engine) | `AiClippingPreview.tsx` (5-scene carousel) | **FRIEND** | **MANUAL PORT** | **MEDIUM** | Port `AiClippingPreview.tsx` into local hero's `<div className="vc-showcase-shell">`. |
| **Showcase Stylesheet** | `FeatureShowcase.css` | `feature-carousel.css` (2,044 lines) | **FRIEND** | **TAKE FRIEND** | **LOW** | Import `feature-carousel.css` into `index.css`. Scoped to `.vireo-showcase`. |
| **Navbar Component** | 77 lines, minimal, `<Logo size="sm" />` | 583 lines, 4 mega-dropdowns, PNG logo | **LOCAL (Base) / REVIEW** | **REVIEW / MERGE** | **HIGH** | Default recommendation: Keep local minimal navbar or adapt dropdowns using local `<Logo />`. |
| **Brand Logo (`Logo.tsx`)** | Vector SVGs, props: `symbolOnly`, `variant`, `size` | Raster PNGs, removed props, added scroll-to-top | **LOCAL (Base)** | **MERGE** | **HIGH** | Keep vector SVGs & all props; adopt friend's smooth scroll-to-top handler. |
| **Major Features Section** | *Not present* | `ExploreMajorFeatures.tsx` (12 interactive cards) | **FRIEND** | **TAKE FRIEND** | **LOW** | Mount directly below local hero as first post-hero section. |
| **The Transformation Section** | `TransformationVisual` | `TransformationVisual` | **FRIEND** | **TAKE FRIEND** | **LOW** | Same visual wrapped in updated dark container. |
| **Platform Strip** | Present | Present with dark styling | **FRIEND** | **TAKE FRIEND** | **LOW** | Seamless dark styling. |
| **Problem & Solution** | Present | Present with refined copy and dark cards | **FRIEND** | **TAKE FRIEND** | **LOW** | |
| **Product Showcase (3 Rows)** | Present | Enhanced with `TimelineEditorPreview` | **FRIEND** | **TAKE FRIEND** | **LOW** | Friend version includes timeline editor illustration. |
| **Platform Outputs (6 Tabs)** | Present | Present with refined copy | **FRIEND** | **TAKE FRIEND** | **LOW** | Interactive 6-channel switcher. |
| **Before / After Section** | *Not present* | Interactive Before vs After card | **FRIEND** | **TAKE FRIEND** | **LOW** | New section; clean addition. |
| **Feature Bento Section** | *Not present* | Fast clipping, multi-platform bento | **FRIEND** | **TAKE FRIEND** | **LOW** | New section; clean addition. |
| **Use Cases Section** | *Not present* | 4 Audience cards | **FRIEND** | **TAKE FRIEND** | **LOW** | New section; clean addition. |
| **How It Works Section** | *Not present* | 3-Step workflow illustration | **FRIEND** | **TAKE FRIEND** | **LOW** | New section; clean addition. |
| **Pricing Section** | Static prices | Interactive currency toggle (`CurrencyContext`) | **FRIEND** | **TAKE FRIEND** | **LOW** | Adopt verified USD and INR pricing toggle logic. |
| **FAQ Section** | `<details>` tags | Accessible `<button>` accordion with ARIA | **FRIEND** | **TAKE FRIEND** | **LOW** | Adopt accessible keyboard-navigable FAQ. |
| **Final CTA Section** | Present | Present with dark gradient styling | **FRIEND** | **TAKE FRIEND** | **LOW** | Clean addition. |
| **Footer Component** | Light green/clay footer | Dark 5-column marketing footer (`#080B12`) | **FRIEND** | **TAKE FRIEND** | **LOW** | User mandate: Use friend footer for bottom of page. |
| **Routing (`src/App.tsx`)** | Base routes | Added `/comparisons`, `/support`, `CurrencyProvider` | **LOCAL (Base)** | **MERGE** | **MEDIUM** | Wrap with `<CurrencyProvider>`, add `/comparisons` and `/support` routes. Keep all local routes. |
| **Global Styles (`index.css`)** | Base styles | Imports `cinematic-motion.css` & `feature-carousel.css` | **LOCAL (Base)** | **MERGE** | **LOW** | Add CSS imports for carousel and motion styles. |
| **Fonts (`index.html`)** | VireoClip title & OG meta | Fraunces & Inter Google Fonts | **LOCAL (Base)** | **MERGE** | **LOW** | Combine Google Fonts links with local OG tags and branding. |
| **Clip Editor Page** | Overhauled unified editor (116 lines) | Legacy beginner/pro editor (3,137 lines) | **LOCAL** | **KEEP LOCAL** | **ZERO** | Friend untouched at 9d8fce3. Keep 100% of local work. |
| **Editor Shell & Subcomponents**| 19 unified components/hooks | *Not present* | **LOCAL** | **KEEP LOCAL** | **ZERO** | Keep 100% of local work. |
| **Editor Services (Frontend)** | `clipRenderService`, `proEditorService` | Legacy versions at 9d8fce3 | **LOCAL** | **KEEP LOCAL** | **ZERO** | Keep 100% of local work. |
| **Autopilot Service** | Authenticated backend requests | Identical to 9d8fce3 | **LOCAL** | **KEEP LOCAL** | **ZERO** | No drift. |
| **Backend Services (`server/`)** | ASS subtitles, clean URLs, multi-track render | *Zero changes in friend repo* | **LOCAL** | **KEEP LOCAL** | **ZERO** | Keep 100% of local work. |
| **Shared Types (`types/`)** | Includes `copilot.ts` and updated docstrings | Identical to 9d8fce3 | **LOCAL** | **KEEP LOCAL** | **ZERO** | Keep 100% of local work. |
| **Assets (`public/`, `assets/`)** | Local demo videos, vector marks, posters | Creator portraits 1-6, demo thumbnails | **BOTH** | **MERGE (Additive)** | **LOW** | Zero path collisions. Copy friend assets into local folders. |
| **Auxiliary Pages** | Base versions | Added `ComparisonsPage.tsx`, `SupportPage.tsx` | **FRIEND** | **TAKE FRIEND** | **LOW** | Copy new pages to `src/pages/`. |

---

## 2. Summary of Strategic Direction

- **LOCAL WINS:**
  - Entire Hero Section (`LandingHero.tsx`, `cinematic-hero.css`, 6 creator portraits, ingestion form).
  - Entire Video Editor Subsystem (`ClipEditorPage.tsx`, `EditorShell.tsx`, all 19 editor components & hooks).
  - Entire Backend Subsystem (`server/` routes, controllers, services, tests).
  - Vector Brand Identity (`vireoclip-*` SVGs, OpenGraph meta).
- **FRIEND WINS:**
  - Animated Product Showcase (`AiClippingPreview.tsx` + `feature-carousel.css`).
  - All Post-Hero Landing Sections (`ExploreMajorFeatures`, `TransformationVisual`, `PlatformStrip`, `ProblemAndSolution`, `ProductShowcase`, `PlatformOutputs`, `BeforeAfter`, `FeatureBento`, `UseCases`, `HowItWorks`, `Pricing`, `FAQ`, `FinalCTA`).
  - Dark Marketing Footer (`Footer.tsx`).
  - Marketing Auxiliary Pages (`ComparisonsPage.tsx`, `SupportPage.tsx`, `CurrencyContext.tsx`).
