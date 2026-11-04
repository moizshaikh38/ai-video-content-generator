# VireoClip Brand Guidelines & Asset Specification

**Official Product Name:** VireoClip  
**Casing:** `VireoClip` (lowercase identifier only where strictly required: `vireoclip`)  
**Tagline:** *Long videos. Great clips.*  
**Product Category:** AI-Powered Video Clipping & Creation Studio

---

## 1. Brand Identity Overview

VireoClip transforms long-form video content into viral, high-performing short clips using multimodal artificial intelligence. The visual identity reflects speed, precision, and cinematic polish.

### Key Rules
- **Never** use "Vireo" as a standalone product name in user-facing surfaces.
- **Never** separate with space ("Vireo Clip") or uppercase all-caps ("VIREO CLIP") unless strictly required by technical casing constraints.
- Always use the official titlecase compound form: `VireoClip`.

---

## 2. Brand Colors & Gradients

| Color Token | Hex Code | Purpose |
| :--- | :--- | :--- |
| **Electric Violet** | `#6540F6` / `#6C48FF` | Primary Brand Accent / Glow |
| **Lavender Highlight** | `#9B86FF` / `#BFA7FF` | Light Ribbon Accent / "Clip" Wordmark |
| **Deep Velvet Violet** | `#3A18B8` / `#5223C9` | Shadow Fold / Depth Ribbon |
| **Midnight Surface** | `#0B0A14` / `#0D0C15` | Dark Background Surface |
| **Pure White** | `#FFFFFF` | "Vireo" Primary Wordmark (Dark Theme) |

---

## 3. Official Vector Logo Assets

All official vector logo assets are located in `src/assets/brand/`:

- **Primary Standalone Symbol:** `src/assets/brand/vireoclip-symbol.svg`
- **Monochrome Dark Symbol:** `src/assets/brand/vireoclip-symbol-dark.svg`
- **Monochrome White Symbol:** `src/assets/brand/vireoclip-symbol-white.svg`
- **Horizontal Logo (Dark Theme):** `src/assets/brand/vireoclip-logo-dark.svg`
  - Composed of the geometric ribbon symbol + vector outlined `VireoClip` wordmark (`Vireo` in pure white + `Clip` in lavender `#BFA7FF`).
- **Horizontal Logo (Light Theme):** `src/assets/brand/vireoclip-logo-light.svg`
  - Composed of the geometric ribbon symbol + vector outlined `VireoClip` wordmark (`Vireo` in deep midnight `#0B0A14` + `Clip` in electric violet `#6C48FF`).
- **Browser Favicons:**
  - `public/favicon.svg` (Clean, high-contrast standalone symbol)
  - `public/favicon.ico` (Multi-resolution crisp icon)

---

## 4. UI Component Usage

Use the shared React component `src/components/Logo.tsx`:

```tsx
import { Logo } from '@/components/Logo';

// Standard Navbar / Header Logo:
<Logo variant="dark" size="md" />

// Standalone Symbol:
<Logo symbolOnly size="sm" />

// Light Surface Variant:
<Logo variant="light" size="md" />
```
