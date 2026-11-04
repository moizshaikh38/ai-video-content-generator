# 08 — Dashboard-Only Port Plan (Recommended Architecture)
**Phase:** Planning & Architecture Only — DO NOT EXECUTE YET  
**Scope:** Controlled, Reversible, Dashboard-Scoped Integration Plan  
**Safety Requirement:** ZERO MODIFICATIONS to Landing Page, Hero, or Video Editor  

---

## 1. Action Matrix for Every Dashboard Artifact

| Friend Source File | Local Target Path | Action Classification | Rationale & Exact Scope |
|---|---|---|---|
| `src/components/dashboard/HomeClippingWorkflow.tsx` | `src/components/dashboard/HomeClippingWorkflow.tsx` | **ADAPT** | Port the 1,866-line clipping workflow hero. Wire direct file upload to local `storageService`, URL ingestion to local `projectService`, and clip editing to local Pro Video Editor (`/clips/${clip.id}/edit`). Imports `creator-1.jpg` and `creator-2.jpg` (already present locally). |
| `src/pages/DashboardPage.tsx` | `src/pages/DashboardPage.tsx` | **ADAPT** | Replace current light-mode dashboard with friend's dark dashboard containing `<HomeClippingWorkflow />`, status filter tabs (`All`, `Processing`, `Completed`), and YouTube-aware `.vireo-dash-glass` project cards. Preserves local project click navigation. |
| `src/layouts/DashboardLayout.tsx` | `src/layouts/DashboardLayout.tsx` | **ADAPT** | Port dark SaaS layout (`bg-[#080B12]`), collapsible sidebar, workspace switcher, and header with quota badge + purple Create button. Preserve local vector SVG logo usage (`<Logo variant="light" compact={collapsed} />`). |
| `src/styles/cinematic-motion.css` | `src/styles/cinematic-motion.css` | **COPY** | Append the 6 dashboard design token classes (`.vireo-dash-glass`, `.vireo-dash-hero`, `.vireo-clipcard-left`, `.vireo-clipcard-right`, `.vireo-btn-purple`, `.vireo-nav-active`). Scoped classes with zero collision on landing page. |
| `src/types/index.ts` | `src/types/index.ts` | **COPY** | Add `description?: string | null;` to the `Project` interface. Pure type enhancement. |
| `index.html` | `index.html` | **COPY** | Add `Sora` and `DM Sans` Google Fonts to the font stylesheet link. Zero visual effect until explicitly referenced by class name. |
| `src/components/Logo.tsx` | `src/components/Logo.tsx` | **KEEP MINE** | **DO NOT REPLACE.** Friend replaced vector SVG with purple PNG and broke props interface. Local SVG version is crisp and supports `compact` mode natively. |
| `src/index.css` | `src/index.css` | **KEEP MINE** | **DO NOT OVERWRITE.** Friend replaced global `:root` variables with dark values, which would destroy the landing page theme. Dark dashboard styling is fully achieved through `DashboardLayout` and `cinematic-motion.css`. |
| `src/components/landing/*` | `src/components/landing/*` | **DO NOT COPY** | Protected local landing page and hero components. Out of scope. |
| `src/pages/landing*.css` | `src/pages/landing*.css` | **DO NOT COPY** | Protected local landing styling. Out of scope. |
| `src/components/Navbar.tsx` | `src/components/Navbar.tsx` | **DO NOT COPY** | Protected landing navigation. Out of scope. |
| `src/components/Footer.tsx` | `src/components/Footer.tsx` | **DO NOT COPY** | Protected landing footer. Out of scope. |

---

## 2. Step-by-Step Implementation Roadmap (For Future Phase)

The future implementation phase should execute in 5 strictly isolated steps:

### Phase A: Non-Destructive Foundations
1. **Google Fonts (`index.html`):** Add `Sora` and `DM Sans` to Google Fonts `<link>`.
2. **Types (`src/types/index.ts`):** Add `description?: string | null;` to `Project` interface.
3. **CSS Tokens (`src/styles/cinematic-motion.css`):** Append the 6 dashboard classes (`.vireo-dash-glass`, `.vireo-dash-hero`, `.vireo-clipcard-left`, `.vireo-clipcard-right`, `.vireo-btn-purple`, `.vireo-nav-active`) to the existing file.

### Phase B: Component Creation
4. **Create Dashboard Directory:** Ensure `src/components/dashboard/` exists.
5. **Port `HomeClippingWorkflow.tsx`:**  
   Copy `src/components/dashboard/HomeClippingWorkflow.tsx`.  
   Verify imports:
   - `creator-1.jpg` and `creator-2.jpg` from `src/assets/creators/` (already present).
   - `projectService`, `storageService`, `clipService`, `clipRenderService` (already present).
   - `PublishModal` from `src/components/PublishModal` (already present).

### Phase C: Page View Integration
6. **Port `src/pages/DashboardPage.tsx`:**  
   Mount `<HomeClippingWorkflow />`, wire project tabs, implement thumbnail parser and `.vireo-dash-glass` cards.

### Phase D: Layout Shell Integration
7. **Port `src/layouts/DashboardLayout.tsx`:**  
   Apply dark shell (`bg-[#080B12]`), collapsible sidebar, header with `Ctrl K` search, quota badge, and profile menu.  
   **Critical Adaptation:** Retain local vector `Logo`:
   ```tsx
   {/* In DashboardLayout.tsx */}
   <Logo to="/dashboard" variant="light" compact={collapsed} />
   ```

### Phase E: Verification & Verification Checks
8. Run `npm run test` (verify 641 tests continue to pass).
9. Run dev server, inspect `/` in browser (verify landing page, hero, creator cards, showcase remain 100% untouched).
10. Inspect `/dashboard` in browser across 1440px, 1024px, 768px, and 390px (verify dark theme, 3D cards, search, and project filters).

---

## 3. Reversibility & Rollback Guarantee

Because all proposed changes are dashboard-scoped:
- **Zero landing page files are modified.**
- Rolling back the dashboard is as simple as reverting `src/pages/DashboardPage.tsx`, `src/layouts/DashboardLayout.tsx`, and removing `src/components/dashboard/`.
- No database migrations or persistent storage changes are introduced.
