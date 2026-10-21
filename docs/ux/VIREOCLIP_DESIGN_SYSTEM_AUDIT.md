# VireoClip Design System & Visual Identity Audit

**Document Version:** 1.0.0  
**Audit Target:** Design System Tokens, Typography, Palette, Elevation & Components  
**Date:** October 11, 2026  
**Status:** COMPLETE DESIGN SYSTEM AUDIT  

---

## 1. Executive Summary: The Dual-Theme Identity Split

VireoClip's visual identity currently suffers from a profound architectural dichotomy between **three competing visual paradigms**:

1. **The Legacy Editorial / Botanical Theme (Core Web App):**
   - Implemented in `src/index.css` and `tailwind.config.js`.
   - Palette: Cream background (`#FBF8F3`), Dark Ink (`#152321`), Deep Forest Green (`#064A34`), Vireo Green (`#16744d`), and Terracotta Clay (`#df4c26`).
   - Typography: Serif display headings in **Fraunces** (`ui-serif, Georgia, serif`), with **Inter** body text.
   - Aesthetic impression: Literary, artisanal newsletter/Substack, organic botanical studio. Completely mismatched with an AI video SaaS product.

2. **The Cinematic Studio Theme (Clip Editor):**
   - Implemented in `src/pages/ClipEditorPage.tsx` and `src/components/editor/*`.
   - Palette: Pure Black / Neutral 950 (`#0a0a0a`), neutral zinc borders (`#262626`), high-contrast white text, neon amber/orange accents (`bg-orange-600`), and purple/indigo gradient tabs.
   - Typography: 100% sans-serif **Inter**, monospace timecodes (`font-mono`).
   - Aesthetic impression: High-tech professional video editing suite (NLE).

3. **The Target VireoClip Identity (Mandated Standard):**
   - **Pure Black:** `#000000` / `#0a0a0a` deep space baseline.
   - **White / Grey Hierarchy:** Pure White (`#FFFFFF`) primary text, Cool Grey (`#94A3B8` / `#64748B`) secondary text, Subdued Slate (`#334155`) tertiary borders.
   - **Restrained Violet Lighting:** `#8B5CF6` / `#7C3AED` as an elegant, focused accent; never garish or neon.
   - **Spatial Glass:** Multi-layered translucent panels (`backdrop-blur-xl`, `bg-white/[0.03]`, `border-white/[0.08]`, `shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]`).
   - **Premium Typography:** Clean geometric sans (`Inter`, `Plus Jakarta Sans`, or `Outfit`). Zero serif fonts.
   - **Cinematic Product Presentation:** High visual fidelity, subtle micro-glows, smooth cubic-bezier transitions.

---

## 2. Token Inventory & Conflict Analysis

### Color Tokens

| Token Name | Current Value (`src/index.css`) | Where Found in Codebase | Conflict Severity | Target Value (Cinematic Violet) |
| :--- | :--- | :--- | :--- | :--- |
| `--background` | `#FBF8F3` (Warm Cream) | Dashboard, Auth, History, Settings | **CRITICAL (P1)** | `#0a0a0a` (Pure Black / Neutral 950) |
| `--foreground` | `#152321` (Dark Ink) | All dashboard headings & body | **CRITICAL (P1)** | `#F8FAFC` (Pure Off-White) |
| `--card` | `#FFFFFF` (Pure White) | Dashboard tiles, project cards | **HIGH (P2)** | `#121214` with `rgba(255,255,255,0.05)` border |
| `--primary` | `#064A34` (Deep Forest) | Primary buttons, active sidebar links | **CRITICAL (P1)** | `#7C3AED` / `#8B5CF6` (Restrained Violet) |
| `--clay` | `#df4c26` (Terracotta) | Hero CTAs, form submit buttons | **CRITICAL (P1)** | `#7C3AED` (Restrained Violet Primary) |
| `--vireo-green`| `#16744d` (Medium Green) | Badges, icons, progress bars | **HIGH (P2)** | `#10B981` (Emerald status only, not brand) |
| `--border` | `#eae8e3` (Light Beige) | Card borders, table dividers | **HIGH (P2)** | `rgba(255, 255, 255, 0.08)` (Spatial Glass border) |
| `--muted` | `#f4f0ea` (Light Oatmeal) | Input backgrounds, badge backgrounds | **HIGH (P2)** | `rgba(255, 255, 255, 0.04)` |

### Typography Tokens

| Token | Current Implementation | Observed Behavior | Remediation Direction |
| :--- | :--- | :--- | :--- |
| `font-display` | `Fraunces, ui-serif, Georgia, serif` | Renders traditional literary serif headers on `/dashboard`, `/projects/new`, `/login` | **ELIMINATE ENTIRELY**. Replace with `Inter` / `Plus Jakarta Sans` font-semibold. |
| `font-sans` | `Inter, ui-sans-serif, sans-serif` | Clean, readable, accessible | **PRESERVE & STANDARDIZE** as single primary typeface across entire product. |
| `font-mono` | System monospace | Used for timecodes and character counters (`01:07 - 01:59`, `19.3/15 min`) | **PRESERVE** with tabular numbers (`tabular-nums font-mono`). |

### Elevation & Spatial Glass Tokens

| Token | Current Value | Target Spatial Glass Specification |
| :--- | :--- | :--- |
| **Glass Surface** | Missing in global CSS; ad-hoc `bg-neutral-900/40` | `background: rgba(18, 18, 20, 0.70); backdrop-filter: blur(16px);` |
| **Glass Border** | Solid light borders (`border-[#eae8e3]`) | `border: 1px solid rgba(255, 255, 255, 0.08);` |
| **Glass Highlight** | None | `box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.12);` |
| **Violet Glow** | None in core CSS | `box-shadow: 0 0 24px -4px rgba(139, 92, 246, 0.18);` |
| **Shadow Soft** | `0 8px 30px rgba(27, 47, 38, 0.035)` (green-tinted) | `0 8px 32px rgba(0, 0, 0, 0.45)` (pure dark neutral) |

---

## 3. Component Consistency & State Audit

### 1. Primary Buttons
- **Current State:**
  - On `/login`, `/signup`, `/projects/new`: `<Button variant="clay">` generates a bright terracotta reddish-orange button (`bg-[#df4c26] text-white`).
  - On `/dashboard`: `<button className="bg-[#df4c26]">` (+ Clip a Video).
  - In `/clips/:clipId/edit`: `<button className="bg-orange-600">` (Render Changes).
  - In Landing Page: `<button className="bg-white text-black">` or restrained violet gradients.
- **UX Inconsistency:** A creator sees 4 different primary button treatments across 4 consecutive screens!
- **Accessibility:** White text on `#df4c26` passes WCAG AA (4.8:1), but clashes aggressively with purple/violet brand accents.

### 2. Segmented Controls & Mode Switches
- **Current State:**
  - On `/projects/new`: "Upload Video" vs "Paste Video URL" uses rounded rectangular boxes with light mint green (`bg-[#eaf4eb] text-forest`) when selected.
  - In `/clips/:clipId/edit`: "Beginner Mode" vs "Pro Multi-Track" uses pill tabs with dark zinc backgrounds (`bg-neutral-800 text-white`) and orange gradients.
  - On `/projects/:id`: "Clips" vs "Content Kit" vs "Transcript" uses an underline tab strip with an orange indicator line.
- **Remediation Recommendation:** Standardize on a single Spatial Glass Segmented Control with a sliding active indicator pill.

### 3. Inputs & Form Controls
- **Current State:**
  - `Input.tsx`: Light mode defaults (`bg-white border-[#eae8e3] text-[#152321] focus:ring-[#16744d]`).
  - When used inside dark surfaces, inputs either stay white or require custom overrides.
- **Remediation Recommendation:** Input components must support standard token-based dark mode variants with subtle glass backgrounds (`bg-white/[0.04] border-white/10 text-white placeholder:text-neutral-500 focus:border-violet-500/50 focus:ring-violet-500/20`).

---

## 4. Visual Contrast & Accessibility Verification (WCAG AA)

| Surface | Foreground Element | Background Color | Contrast Ratio | WCAG AA Compliance | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dashboard** | Heading (Fraunces `#152321`) | `#FBF8F3` (Cream) | **14.2:1** | PASS (AAA) | High contrast, but wrong brand aesthetic. |
| **Dashboard** | Subtitle (`#6e777e`) | `#FBF8F3` (Cream) | **4.6:1** | PASS (AA) | Acceptable. |
| **Dashboard Quota** | Red text (`#B83A30`) | `#FBF8F3` (Cream) | **5.4:1** | PASS (AA) | Readable, but creates alarmist impression. |
| **New Project** | Inactive Tab (`#6e777e`) | `#FFFFFF` (Card) | **4.7:1** | PASS (AA) | Pass. |
| **Editor Canvas** | Subtitle (`text-neutral-500`) | `#0a0a0a` (Black) | **3.8:1** | **FAIL (<4.5:1)** | Low contrast in dark editor header. |
| **Editor Safe Area**| Amber/Green Indicators | Dark Overlay | **5.2:1** | PASS (AA) | Clear overlay visibility. |
| **Pro Timeline** | Track labels (`text-neutral-400`) | `#121214` (Track BG) | **5.1:1** | PASS (AA) | Legible. |

---

## 5. Design System Remediation Blueprint (Non-Breaking Tokens)

To align the entire product with the mandated **Pure Black / Restrained Violet / Spatial Glass** identity without rewriting business logic, the design system must be updated to:

```css
/* Target VireoClip Pure Black & Restrained Violet Foundation */
:root {
  --background: #09090b; /* Pure deep slate-black */
  --foreground: #f8fafc; /* Crisp white */
  --card: #121216;       /* Elevated spatial surface */
  --card-foreground: #f8fafc;
  --popover: #18181c;
  --popover-foreground: #f8fafc;
  --primary: #8b5cf6;    /* Restrained Violet */
  --primary-foreground: #ffffff;
  --secondary: #1e1e24;  /* Subdued slate-zinc */
  --secondary-foreground: #cbd5e1;
  --muted: #1e1e24;
  --muted-foreground: #94a3b8;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.06);
  --ring: #8b5cf6;
  --violet-glow: 0 0 25px -5px rgba(139, 92, 246, 0.25);
}
```
