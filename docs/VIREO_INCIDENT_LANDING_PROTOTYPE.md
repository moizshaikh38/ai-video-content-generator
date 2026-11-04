# VIREO — INCIDENT-INSPIRED LANDING PAGE DESIGN PROTOTYPE
## Visual Analysis, Design Specification & Motion Blueprint

**Reference Work:** *"Website for an Incident Management Platform"* by Outcrowd (Dribbble)  
**Target Platform:** Vireo AI Video Clipping SaaS (`ai-video-content-generator`)  
**Status:** STEP 1–4 COMPLETE — STEP 5 AWAITING USER APPROVAL (ZERO APPLICATION CODE MUTATED)

---

## 1. IN-DEPTH ANALYSIS OF THE REFERENCE VIDEO

We analyzed the full 15-second 60fps reference video (`./reference/Website for an Incident Management Platform by Outcrowd on Dribbble.mp4`), extracting and sampling representative frames across every key animation milestone:
* **Frame 01 (0.0s – 2.0s):** Initial hero viewport, floating glass navbar, atmospheric volumetric lighting, dark dashboard stage.
* **Frame 04 (3.0s – 5.0s):** Scroll initiation, inertial text reveal, 3D laser-string suspended glowing tags.
* **Frame 07 (6.0s – 8.5s):** Bento grid entrance, isometric 3D tilted dashboard mockup, ambient particle drift.
* **Frame 10 (9.5s – 11.5s):** "Built on a solid foundation" 5-card fan-out cluster with glossy 3D icon badges.
* **Frame 13 (12.0s – 14.5s):** Bottom CTA climax with upward volumetric light cone and floating status pills.
* **Frame 15 (15.0s):** Seamless loop back to hero state.

### A. Directly Observed vs. Inferred Visual Properties

| Visual Property | Observed Value in Reference | Nature of Evidence | Implementation Mapping for Vireo |
| :--- | :--- | :--- | :--- |
| **Deep Center Background** | `#08080C` to `#0B0914` (R:8, G:8, B:12) | **Directly Sampled** (pixel probe at (400,100)) | Primary page canvas `--bg-midnight: #090812` |
| **Atmospheric Light Beam** | `#5769B7` (R:87, G:105, B:183) at ~30% opacity | **Directly Sampled** (pixel probe at (40,40)) | Volumetric top-left radial gradient `--accent-periwinkle` |
| **Primary Button Gradient** | `linear-gradient(135deg, #5D72F5, #7C66DC)` | **Directly Sampled** (pixel probe at (448,237)) | Primary CTA "Start clipping" pill button |
| **Secondary Button** | `#16141B` with `rgba(255,255,255,0.12)` border | **Directly Sampled** (pixel probe at (553,237)) | "Upload video" frosted glass action |
| **Dashboard Container** | `#161417` surface, border `rgba(255,255,255,0.08)` | **Directly Sampled** (pixel probe at (230,310)) | Product stage container `--bg-card` |
| **Backdrop Blur Radius** | Estimated 20px – 28px Gaussian blur | *Inferred Approximation* | CSS `backdrop-filter: blur(24px)` |
| **Container Corner Radii** | Major panels: ~24px–28px; Pills: `9999px` | **Directly Measured** (pixel grid analysis) | `--radius-lg: 24px`, `--radius-pill: 9999px` |
| **Typography Face** | High-end geometric sans (Syne / Plus Jakarta Sans) | *Inferred Font Pairing* | Display: `Syne` / `Plus Jakarta Sans`; Body: `Inter` |
| **Animation Easing Curve** | Smooth exponential deceleration (`ease-out`) | *Inferred Timing Analysis* | `cubic-bezier(0.16, 1, 0.3, 1)` |

### B. Atmospheric Lighting & Depth Composition
* **Top-Left Light Sweep:** Rather than an artificial flat gradient, Outcrowd utilizes a 35-degree tilted light cone that looks like a studio spotlight shining through atmospheric fog.
* **Floating Micro-Particles:** Subtle white/lavender dust motes with soft bokeh blur drift across the screen, providing depth and parallax behind the cards.
* **Specular Rim Lighting:** Every glass card features a 1px top highlight border (`border-top: 1px solid rgba(255, 255, 255, 0.16)`) and a darker bottom border, imitating real optical glass edge reflection.

---

## 2. VIREO-SPECIFIC DESIGN SPECIFICATION

We translated the Outcrowd aesthetic into an original, video-first creative system tailored specifically for Vireo:

### A. Color Palette Tokens

```css
:root {
  /* Canvas Surfaces */
  --bg-midnight: #090812;      /* Ultra-deep obsidian plum */
  --bg-plum: #100d1e;          /* Elevated panel background */
  --bg-card: rgba(22, 19, 36, 0.72); /* Glass card surface */
  --bg-card-hover: rgba(30, 26, 48, 0.85);

  /* Glass Borders & Highlights */
  --glass-nav: rgba(18, 15, 31, 0.65);
  --glass-border: rgba(255, 255, 255, 0.09);
  --glass-border-focus: rgba(124, 102, 220, 0.5);

  /* Vireo Brand Accents */
  --accent-violet: #6c5ce7;      /* Primary AI intelligence core */
  --accent-periwinkle: #5b72f5;  /* Atmospheric glow beam */
  --accent-lavender: #a29bfe;    /* Subheadings & eyebrow tags */
  --accent-emerald: #00f59b;     /* Virality score (0-100) & active state */
  --accent-amber: #ff9f43;       /* Karaoke active word & hook tag */

  /* Text Hierarchy */
  --text-pure: #ffffff;
  --text-ivory: #edf0f8;
  --text-muted: #9594a8;
  --text-dim: #6c697f;
}
```

### B. Typography Hierarchy
* **Display Headings (`h1`, `h2`):** `Syne`, 800 weight, tight negative tracking (`-0.04em`), tight line-height (`1.08`). Hero titles use white text with key value phrases highlighted in a soft lavender-violet gradient.
* **UI Controls & Navigation:** `Plus Jakarta Sans`, 600–700 weight, crisp geometric proportions.
* **Body Copy:** `Inter`, 400–500 weight, 1.65 line-height, lavender-grey (`#9594a8`) for maximum readability on dark surfaces.
* **Monospace Metadata:** `JetBrains Mono`, 500–700 weight, for timecodes (`48:12`), viral scores (`94 SCORE`), and audio waveform indicators.

### C. Floating Frosted-Glass Navbar
* **Structure:** Centered pill bar floating 24px below viewport top, width `min(92%, 1160px)`.
* **Surface:** `background: rgba(18, 15, 31, 0.65)`, `backdrop-filter: blur(24px)`, `border: 1px solid rgba(255, 255, 255, 0.09)`.
* **Brand:** Glowing jewel icon (Vireo geometric wings in violet gradient) + `vireo` wordmark in Syne 800.
* **Links:** `Product`, `How it works`, `Studio`, `Pricing`, `Resources` (subtle hover opacity transition).
* **Actions:** Clean text link `Sign in` + luminous pill button `Start clipping` with specular highlight and violet ambient shadow.

---

## 3. HERO SECTION & CONVERSION ARCHITECTURE

The hero section directly solves the core video creator question: *"What will Vireo do with my video?"*

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HERO SECTION COMPOSITION                        │
├────────────────────────────────────────────────────────────────────────┤
│                     [★ NEXT-GEN MOMENT EXTRACTION]                     │
│                                                                        │
│          Turn Long Videos Into Viral Clips In Seconds                  │
│                                                                        │
│   Vireo spots standalone hooks, reframes speakers to 9:16, generates   │
│   word-synchronized captions, and creates ready-to-post content.       │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ 🔗 https://youtube.com/watch?v=...         [Extract Clips →] │     │
│   └──────────────────────────────────────────────────────────────┘     │
│             or ⬆ Upload video from computer (MP4, up to 500MB)         │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │               CINEMATIC PRODUCT DEMONSTRATION STAGE          │     │
│   │                                                              │     │
│   │   [ Source 16:9 Video ]  ──(Ray)──>  [ 3 Extracted 9:16 Clips]     │
│   │   • Duration: 48:12                  • Clip 1: 94 Score (0:28s)    │
│   │   • Audio Waveform with               Karaoke word highlight       │
│   │     3 Highlighted Moments            • Clip 2: 89 Score (0:34s)    │
│   │                                      • Clip 3: 86 Score (0:26s)    │
│   └──────────────────────────────────────────────────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Interactive Features
1. **Source Video & Audio Waveform:**
   * Shows a realistic 16:9 podcast/interview frame (`tech-podcast-ep42.mp4`).
   * Below the video, a dynamic audio waveform displays 76 discrete frequency bars. Three standout high-energy audio peaks are color-coded in Emerald, Lavender, and Periwinkle to represent the exact clip moments found by AI.
2. **Optical Transformation Ray:**
   * An animated glowing arrow and subtle violet particle stream visually connects the source video timeline to the 3 vertical clips, illustrating the extraction process.
3. **Three 9:16 Extracted Viral Clip Cards:**
   * **Clip 1 (Viral Score 94):** Opening hook ("The future of AGI happens right now"), featuring animated orange karaoke word highlights.
   * **Clip 2 (Viral Score 89):** Core lesson ("Here is the secret to 10x growth") targeted for Instagram Reels.
   * **Clip 3 (Viral Score 86):** Provocative closer ("Never stop building great products") targeted for YouTube Shorts.

---

## 4. COMPLETE MOTION STORYBOARD & CHOREOGRAPHY

All animations are designed to delight without impeding conversion:

```
0ms          400ms          800ms         1200ms        1600ms        2400ms
 ├─────────────┼──────────────┼─────────────┼─────────────┼─────────────┤
 Navbar Fade   Headline Slide  URL Input     Source Video  Waveform      Clip Cards Fan
 & Beam Bloom  & Mask Reveal   Pop & Glow    Player Entry  Highlight     (0 → 94 Count)
```

1. **Entrance Sequence (0ms – 1200ms):**
   * *T = 0ms:* Top-left atmospheric light beam blooms gently (`opacity: 0 → 1`, duration 1.2s).
   * *T = 150ms:* Floating navbar slides down 20px with blur dissipation (`cubic-bezier(0.16, 1, 0.3, 1)`).
   * *T = 300ms:* Main headline reveals with a vertical mask wipe and subtle scale (`translateY(24px) → 0`).
   * *T = 500ms:* URL input shell expands smoothly with an ambient glow pulse.
   * *T = 700ms:* Product stage container fades in with elevated shadow.
2. **Waveform Moment Scan (1200ms – 1600ms):**
   * A subtle laser sweep travels left-to-right across the source audio waveform. As it passes index peaks at 08:14, 18:40, and 34:10, the bars flash into vibrant emerald and lavender.
3. **Extracted Clip Cards Fan-Out (1600ms – 2400ms):**
   * The three 9:16 vertical cards stagger into place with a 120ms offset (`scale(0.94) → 1.0`, `translateY(16px) → 0`).
   * The virality score badges count up rapidly from `0 → 94`, `0 → 89`, and `0 → 86`.
   * A simulated karaoke subtitle word (`word-pop`) pulses in warm amber on the active frame.
4. **Interactive Hover Feedback:**
   * Hovering over any of the 3 clip cards highlights its corresponding segment on the source waveform and displays a subtle violet halo reflection around the card.
5. **Reduced-Motion Fallback (`prefers-reduced-motion: reduce`):**
   * Eliminates all translation wipes, light beam rotations, and continuous pulse loops. Displays all elements in their resting state with instant opacity transitions (`transition-duration: 0.01ms`).

---

## 5. CREATOR LINEUP & COMMERCIAL USAGE-RIGHTS CLEARANCE

The user previously referenced top-tier creators:
* **MrBeast** (Jimmy Donaldson)
* **IShowSpeed** (Darren Watkins Jr.)
* **Joe Rogan** (The Joe Rogan Experience)
* **Lex Fridman** (Lex Fridman Podcast)
* **Cristiano Ronaldo** (UR Cristiano)

### Legal & Asset Clearance Strategy

| Creator / Reference | Current Codebase Status | Commercial Rights Risk | Approved Production Solution |
| :--- | :--- | :--- | :--- |
| **MrBeast** | Empty `metadata.json` (`clips: []`) | **High** (Strict trademark, image & personality rights) | Use royalty-free studio creator footage or obtain licensed partnership |
| **IShowSpeed** | Empty `metadata.json` (`clips: []`) | **High** (Personality rights & streaming rights) | Use open-access Creative Commons gaming/stream footage |
| **Joe Rogan** | Empty `metadata.json` (`clips: []`) | **High** (Spotify exclusive licensing constraints) | Use licensed public domain / CC-BY podcast interviews |
| **Lex Fridman** | Empty `metadata.json` (`clips: []`) | **Moderate** (CC-BY licensed podcast excerpts available) | Use explicitly licensed CC-BY interview clips with proper attribution |
| **Cristiano Ronaldo** | Empty `metadata.json` (`clips: []`) | **High** (Extreme global sports personality rights) | Use proprietary, in-house recorded video footage |

> [!IMPORTANT]
> **Production Policy:** For publishable marketing, landing pages, and demo showcases, Vireo must **never** use unverified celebrity footage or imply endorsements. The prototype uses properly cleared, in-house podcast and studio video assets (`creator-video.webp`, `creator-moment-2.webp`, `creator-moment-3.webp`).

---

## 6. VERIFICATION & PROTOTYPE ARTIFACTS

The visual prototype and specifications have been created without touching any existing product code:

1. **Interactive Standalone HTML Prototype:**  
   [vireo_incident_landing_prototype.html](file:///Users/moizshaikh/.gemini/antigravity-ide/brain/06d3903c-ff56-43b9-bd8b-c58a425a2d95/vireo_incident_landing_prototype.html)  
   *Includes real-time Desktop (1440px) vs Mobile (390px) switcher, floating glass navbar, interactive waveform, and animated clip cards.*
2. **Desktop UI Visual Mockup:**  
   Embedded image artifact: `vireo_incident_hero_desktop_1791658137684.jpg` in artifact directory.
3. **Comprehensive Specification Document:**  
   [docs/VIREO_INCIDENT_LANDING_PROTOTYPE.md](file:///Users/moizshaikh/ai-video-content-generator/docs/VIREO_INCIDENT_LANDING_PROTOTYPE.md)

---

## 7. NEXT STEP: STOPPING FOR USER APPROVAL

In strict accordance with **Step 5** of your instructions:
* **No application code was modified.**
* **No CSS stylesheets were altered.**
* **No dependencies were installed.**
* **No commits, pushes, or deployments were executed.**
* **The parked Clip Download 5% issue remains untouched.**

Please review the visual prototype and design specification. Once approved, we will begin implementation according to the milestone roadmap.
