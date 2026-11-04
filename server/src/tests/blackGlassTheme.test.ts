import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Run from the repo root (component paths resolve relative to cwd).
const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

/**
 * Files already migrated to Black Glass. Each rollout phase appends its files here so
 * the gate only ever tightens.
 */
const MIGRATED_FILES = [
  'src/index.css',
  'src/lib/buttonStyles.ts',
  'src/components/Button.tsx',
  'src/components/Card.tsx',
  'src/components/Input.tsx',
  'src/components/Textarea.tsx',
  'src/components/Select.tsx',
  'src/components/StatusBadge.tsx',
  'src/components/EmptyState.tsx',
  'src/components/ErrorState.tsx',
  'src/components/LoadingState.tsx',
  'src/components/editor/panelKit/panelTokens.ts',
  // Phase 1 — app chrome
  'src/layouts/DashboardLayout.tsx',
  // Phase 2 — core flow pages
  'src/pages/DashboardPage.tsx',
  'src/components/dashboard/HomeClippingWorkflow.tsx',
  'src/pages/NewProjectPage.tsx',
  'src/components/newProject/LivePreviewPanel.tsx',
  'src/components/clips/ClipPreferencesControl.tsx',
  'src/pages/ProjectDetailPage.tsx',
  'src/components/clips/ClipWorkspace.tsx',
  'src/components/clips/WhyThisClipSection.tsx',
  'src/pages/HistoryPage.tsx',
  // Phase 3 — tool and secondary pages
  'src/components/abStudio/ABCsvImportModal.tsx',
  'src/components/abStudio/ABExperimentHistory.tsx',
  'src/components/abStudio/ABStudioWorkspace.tsx',
  'src/components/autopilot/AutopilotWorkspace.tsx',
  'src/components/contentPack/ContentPackWorkspace.tsx',
  'src/components/hookLab/HookLabWorkspace.tsx',
  'src/components/producer/ProducerPanel.tsx',
  'src/components/thumbnailLab/ThumbnailLabWorkspace.tsx',
  'src/components/translation/TranslationWorkspace.tsx',
  'src/components/react-bits/ShinyButton.tsx',
  'src/pages/ABStudioHistoryPage.tsx',
  'src/pages/AdminPage.tsx',
  'src/pages/AnalyticsPage.tsx',
  'src/pages/BillingPage.tsx',
  'src/pages/BrandPage.tsx',
  'src/pages/PublishingHistoryPage.tsx',
  'src/pages/SettingsPage.tsx',
  'src/pages/WorkflowPage.tsx',
  'src/pages/WorkspacePage.tsx',
  // Phase 4 — editor
  'src/components/editor/AICopilotPanel.tsx',
  'src/components/editor/AiToolsPanel.tsx',
  'src/components/editor/AspectRatioWorkspacePanel.tsx',
  'src/components/editor/AudioClipControls.tsx',
  'src/components/editor/AudioWorkspacePanel.tsx',
  'src/components/editor/BrandKitPanel.tsx',
  'src/components/editor/CaptionPresetGallery.tsx',
  'src/components/editor/CaptionPresetRenderer.tsx',
  'src/components/editor/CaptionStyleCustomizer.tsx',
  'src/components/editor/CommandPalette.tsx',
  'src/components/editor/ContextualInspector.tsx',
  'src/components/editor/EditorShell.tsx',
  'src/components/editor/EditorSidebar.tsx',
  'src/components/editor/EditorTopBar.tsx',
  'src/components/editor/ElementsWorkspacePanel.tsx',
  'src/components/editor/ExportDialog.tsx',
  'src/components/editor/FilmstripClip.tsx',
  'src/components/editor/FramingWorkspacePanel.tsx',
  'src/components/editor/MediaBin.tsx',
  'src/components/editor/MotionWorkspacePanel.tsx',
  'src/components/editor/PlaybackController.tsx',
  'src/components/editor/PreviewCanvas.tsx',
  'src/components/editor/SpeechCleanupTool.tsx',
  'src/components/editor/TextWorkspacePanel.tsx',
  'src/components/editor/Timeline.tsx',
  'src/components/editor/TranscriptEditor.tsx',
  'src/components/editor/UnifiedTimeline.tsx',
  'src/components/editor/WaveformClip.tsx',
  'src/components/editor/WordMicroToolbar.tsx',
  'src/components/editor/panelKit/PanelCard.tsx',
  'src/components/editor/panelKit/PanelControls.tsx',
  'src/components/editor/panelKit/PanelSection.tsx',
  'src/components/editor/panelKit/PanelShell.tsx',
  'src/components/editor/panelKit/PanelStates.tsx',
  'src/pages/ClipEditorPage.tsx',
];

const PHASE2_FILES = MIGRATED_FILES.slice(
  MIGRATED_FILES.indexOf('src/pages/DashboardPage.tsx'),
  MIGRATED_FILES.indexOf('src/components/abStudio/ABCsvImportModal.tsx'),
);
const PHASE3_FILES = MIGRATED_FILES.slice(
  MIGRATED_FILES.indexOf('src/components/abStudio/ABCsvImportModal.tsx'),
  MIGRATED_FILES.indexOf('src/components/editor/AICopilotPanel.tsx'),
);
const EDITOR_FILES = MIGRATED_FILES.slice(MIGRATED_FILES.indexOf('src/components/editor/AICopilotPanel.tsx'));

/** Every full-screen modal / drawer in the app (Phase 1). */
const MODAL_FILES = [
  'src/components/PublishModal.tsx',
  'src/components/QuotaExceededModal.tsx',
  'src/components/abStudio/ABCsvImportModal.tsx',
  'src/components/abStudio/ABExperimentHistory.tsx',
  'src/components/abStudio/ABStudioWorkspace.tsx',
  'src/components/clips/ClipWorkspace.tsx',
  'src/components/dashboard/HomeClippingWorkflow.tsx',
  'src/components/editor/CommandPalette.tsx',
  'src/components/editor/EditorShell.tsx',
  'src/components/editor/ExportDialog.tsx',
  'src/components/editor/MediaBin.tsx',
  'src/components/hookLab/HookLabWorkspace.tsx',
  'src/components/producer/ProducerPanel.tsx',
  'src/pages/BrandPage.tsx',
  'src/pages/HistoryPage.tsx',
  'src/pages/NewProjectPage.tsx',
  'src/pages/WorkflowPage.tsx',
  'src/pages/WorkspacePage.tsx',
];

/** Public pages keep their own `--lp-*` look and must not pick up the app recipes. */
const PUBLIC_FILES = [
  'src/pages/LandingPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/SignupPage.tsx',
  'src/pages/TermsPage.tsx',
  'src/pages/PrivacyPage.tsx',
];

const NAVY_HEX = /#(080B12|0F1420|151C2C|1B2438|1C253B|0E1017)\b/i;
const NAVY_RGBA = /rgba\(\s*(8,\s*11,\s*18|15,\s*20,\s*32)\s*,/;
const BLUE_TINTED_GREY = /\b(?:bg|text|border|ring|from|via|to|placeholder:text|divide)-slate-\d{2,3}\b/;

describe('Black Glass theme', () => {
  it('migrated files contain no navy hexes, navy rgba or slate greys', () => {
    for (const file of MIGRATED_FILES) {
      const src = read(file);
      assert.ok(!NAVY_HEX.test(src), `${file}: navy hex ${src.match(NAVY_HEX)?.[0]}`);
      assert.ok(!NAVY_RGBA.test(src), `${file}: navy rgba ${src.match(NAVY_RGBA)?.[0]}`);
      assert.ok(!BLUE_TINTED_GREY.test(src), `${file}: slate class ${src.match(BLUE_TINTED_GREY)?.[0]}`);
    }
  });

  it('migrated files avoid gradient text and coloured glows', () => {
    for (const file of MIGRATED_FILES) {
      const src = read(file);
      assert.ok(!/\bbg-clip-text\b/.test(src), `${file}: gradient text`);
      assert.ok(!/shadow-\[0_0_/.test(src), `${file}: glow shadow`);
    }
  });

  it('defines every glass recipe with a reduced-transparency fallback', () => {
    const css = read('src/index.css');
    for (const cls of ['glass-chrome', 'glass-float', 'glass-overlay', 'glass-scrim', 'glass-dock', 'glass-panel', 'glass-rail']) {
      assert.match(css, new RegExp(`\\.${cls}\\b`), `missing .${cls}`);
    }
    const fallback = css.slice(css.indexOf('prefers-reduced-transparency'));
    for (const cls of ['glass-chrome', 'glass-float', 'glass-overlay', 'glass-scrim']) {
      assert.ok(fallback.includes(`.${cls}`), `.${cls} has no reduced-transparency fallback`);
    }
    assert.match(css, /@supports not \(\(backdrop-filter/);
  });

  it('button recipes are pills/xl, gradient-free and never set size or spacing', () => {
    const src = read('src/lib/buttonStyles.ts');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(code, /BTN_PILL_PRIMARY =[\s\S]*?rounded-full/);
    assert.match(code, /BTN_TOOL =[\s\S]*?rounded-xl/);
    assert.ok(!/bg-gradient-to/.test(code), 'no gradients in button recipes');
    // Pressed states go darker, never to white.
    assert.match(code, /BTN_PILL_BRAND =[^;]*hover:bg-vc-ai [^;]*active:bg-violet-700/);
    // Every primary action is the violet brand pill (with its soft violet halo).
    assert.match(code, /BTN_PILL_PRIMARY = BTN_PILL_BRAND;/);
    assert.match(code, /BTN_PILL_BRAND =[^;]*0_6px_16px_-6px_rgba\(124,58,237,0\.55\)/);
    assert.match(code, /BTN_PILL_AI = BTN_PILL_BRAND;/);
    // Recipes must be layout-neutral so adopting one never moves anything.
    const layout = /(?:^|[\s'`])(?:h|w|size|min-h|min-w|p|px|py|pt|pb|pl|pr|m|mx|my|gap|space-x|space-y)-[\w.[\]/]+/;
    assert.ok(!layout.test(code), `layout utility in recipes: ${code.match(layout)?.[0]}`);
  });

  it('Button keeps its variants and sizes and defaults text buttons to pills', () => {
    const src = read('src/components/Button.tsx');
    for (const v of ['default', 'primary', 'ai', 'violet', 'studio', 'sage', 'clay', 'outline', 'secondary', 'ghost', 'destructive', 'link']) {
      assert.match(src, new RegExp(`\\b${v}:`), `variant ${v} missing`);
    }
    assert.match(src, /default: 'h-10 px-5 text-sm'/);
    assert.match(src, /sm: 'h-9 px-3 text-xs'/);
    assert.match(src, /lg: 'h-12 px-7 text-base'/);
    assert.match(src, /icon: 'h-10 w-10 p-0'/);
    assert.match(src, /shape \?\? \(size === 'icon' \? 'rounded' : 'pill'\)/);
  });

  it('public pages stay on their own styling', () => {
    for (const file of PUBLIC_FILES) {
      const src = read(file);
      assert.ok(!src.includes('buttonStyles'), `${file} must not import the app button recipes`);
      assert.ok(!/glass-(chrome|float|overlay|scrim)/.test(src), `${file} must not use app glass recipes`);
    }
  });

  it('app chrome is glass: sidebar, sticky header and account menu', () => {
    const src = read('src/layouts/DashboardLayout.tsx');
    assert.match(src, /glass-chrome border-r/, 'sidebar must use glass-chrome');
    assert.match(src, /glass-chrome border-b/, 'header must use glass-chrome');
    assert.match(src, /glass-float/, 'account menu must float on glass');
    assert.match(src, /glass-scrim fixed inset-0/, 'mobile drawer scrim');
    assert.ok(!/vireo-btn-purple/.test(src), 'no legacy gradient button class');
    // Option A colour roles: Upgrade and Create are brand-violet moments.
    assert.match(src, /font-semibold \$\{BTN_PILL_BRAND\}`\}\s*>\s*Upgrade Plan/, 'sidebar Upgrade Plan is the violet brand pill');
    assert.match(src, /\$\{BTN_PILL_BRAND_SOFT\}`\}\s*>\s*Upgrade\s*</, 'header Upgrade is the soft violet pill');
    assert.match(src, /shrink-0 \$\{BTN_PILL_BRAND\}`\}\s*>\s*<Plus/, 'header Create is the violet brand pill');
    assert.ok(!/#(8E9AB4|9AA6BF|C9D2E6|E4E9F5|22D3EE)\b/i.test(src), 'no blue-grey / cyan literals');
  });

  it('every full-screen overlay uses glass-scrim with a glass-float panel', () => {
    for (const file of MODAL_FILES) {
      const src = read(file);
      const overlays = src.match(/className="[^"]*fixed inset-0[^"]*"/g) ?? [];
      assert.ok(overlays.length > 0, `${file}: expected an overlay`);
      for (const cls of overlays) {
        assert.ok(cls.includes('glass-scrim'), `${file}: overlay without glass-scrim → ${cls}`);
        assert.ok(!/bg-black\/\d+|backdrop-blur/.test(cls), `${file}: overlay keeps its own scrim → ${cls}`);
      }
    }
    // Lightboxes and drop zones hold media, not a panel; everything else is a floating panel.
    const panelless = new Set(['src/components/clips/ClipWorkspace.tsx', 'src/pages/NewProjectPage.tsx']);
    for (const file of MODAL_FILES.filter((f) => !panelless.has(f))) {
      assert.match(read(file), /glass-float/, `${file}: modal panel must be glass-float`);
    }
  });

  it('no modal renders a light-mode white panel', () => {
    for (const file of MODAL_FILES) {
      assert.ok(!/rounded-xl bg-white p-6/.test(read(file)), `${file}: white modal panel`);
    }
  });

  it('core flow pages drop cyan, blue-grey literals and violet gradients', () => {
    for (const file of PHASE2_FILES) {
      const src = read(file);
      assert.ok(!/#(22D3EE|8E9AB4|C9D2E6|E4E9F5|0F1B2D)\b/i.test(src), `${file}: cyan / blue-grey literal`);
      assert.ok(!/\b(?:text|border|bg)-cyan-\d/.test(src), `${file}: cyan class`);
      assert.ok(!/from-violet-600 to-purple-600/.test(src), `${file}: violet gradient button`);
      assert.ok(!/vireo-btn-purple/.test(src), `${file}: legacy gradient button class`);
    }
  });

  it('core flow CTAs follow option A roles', () => {
    const hcw = read('src/components/dashboard/HomeClippingWorkflow.tsx');
    assert.match(hcw, /\$\{BTN_PILL_BRAND\}`\}[\s\S]{0,400}Generate Clips/, 'Generate Clips is the brand pill');
    assert.match(hcw, /\$\{BTN_PILL_PRIMARY\}`\}[\s\S]{0,200}Export \(/, 'batch Export is a white confirm');
    const np = read('src/pages/NewProjectPage.tsx');
    assert.match(np, /variant="brand"[\s\S]{0,400}Generate clips/, 'New Project Generate clips is the brand pill');
    const cw = read('src/components/clips/ClipWorkspace.tsx');
    assert.match(cw, /variant="brand"[\s\S]{0,300}Analyze & Find Viral Clips/);
    const hist = read('src/pages/HistoryPage.tsx');
    assert.match(hist, /\$\{BTN_PILL_BRAND\}`\}[\s\S]{0,200}New Clip Project/);
  });

  it('tool and secondary pages have no light-mode leftovers or off-palette accents', () => {
    const light = /(?<![\w:/-])bg-white(?=[\s"'`])|\bbg-(?:emerald|amber|rose|red|blue|purple|zinc|gray)-(?:50|100)\b|\btext-(?:emerald|amber|rose|red|blue|purple)-(?:700|800|900)\b/;
    const legacy = /\b(?:bg|text|border|ring)-(?:cream|sage|clay|forest|ink)\b/;
    const offPalette = /\b(?:bg|text|border|ring)-(?:orange|teal|purple)-\d/;
    for (const file of PHASE3_FILES) {
      const src = read(file);
      assert.ok(!light.test(src), `${file}: light-mode class ${src.match(light)?.[0]}`);
      assert.ok(!legacy.test(src), `${file}: legacy token ${src.match(legacy)?.[0]}`);
      // Chart series (`color: 'bg-…'`) keep distinct hues — data needs them.
      const accents = src.split('\n').filter((l) => !/\bcolor: 'bg-/.test(l)).join('\n');
      assert.ok(!offPalette.test(accents), `${file}: off-palette accent ${accents.match(offPalette)?.[0]}`);
      assert.ok(!/from-(?:violet|purple)-600 (?:via-\w+-600 )?to-(?:indigo|blue|purple)-600/.test(src), `${file}: gradient CTA`);
    }
  });

  it('upgrade and save CTAs are both brand violet', () => {
    const shiny = read('src/components/react-bits/ShinyButton.tsx');
    assert.match(shiny, /clay: '[^']*bg-vc-ai-hover[^']*active:bg-violet-700/);
    assert.match(shiny, /ink: '[^']*bg-vc-ai-hover[^']*active:bg-violet-700/);
    assert.match(read('src/pages/BillingPage.tsx'), /<Button variant="brand"[^>]*onClick=\{\(\) => startCheckout\(plan\)\}/);
    assert.match(read('src/pages/SettingsPage.tsx'), /type="submit"\s+variant="ink"/);
  });

  it('editor UI has no blue-tinted literals; floating chrome is glass', () => {
    for (const file of EDITOR_FILES) {
      const src = read(file);
      for (const hx of src.match(/\[#([0-9A-Fa-f]{6})\]/g) ?? []) {
        const [r, g, b] = [1, 3, 5].map((i) => parseInt(hx.slice(i + 1, i + 3), 16));
        assert.ok(!(b > r + 2 && Math.max(r, g, b) < 0x50), `${file}: blue-tinted dark literal ${hx}`);
      }
    }
    assert.match(read('src/components/editor/EditorTopBar.tsx'), /<header className="h-14 glass-chrome/);
    assert.match(read('src/components/editor/EditorSidebar.tsx'), /<aside className="[^"]*glass-chrome/);
    assert.match(read('src/components/editor/PlaybackController.tsx'), /rounded-2xl glass-float/);
    assert.match(read('src/components/editor/WordMicroToolbar.tsx'), /fixed z-50 glass-float/);
    assert.match(read('src/components/editor/PreviewCanvas.tsx'), /glass-overlay/);
  });

  it('editor CTAs are violet pills: Export, Start Render, Copilot apply', () => {
    assert.match(read('src/components/editor/EditorTopBar.tsx'), /rounded-full bg-vc-ai-hover/);
    assert.match(read('src/components/editor/ExportDialog.tsx'), /rounded-full bg-vc-ai-hover[^"]*"[^>]*>[\s\S]{0,200}Start Render/);
    assert.match(read('src/components/editor/AICopilotPanel.tsx'), /rounded-full bg-vc-ai-hover/);
  });

  it('repo-wide: no app file reintroduces navy, slate, glows or gradient CTAs', () => {
    // Public marketing/auth pages keep their own --lp-* look; EditorCanvas is unused (no imports).
    const outOfScope = new RegExp(
      [
        'src/pages/(Landing|Login|Signup|Terms|Privacy|NotFound)Page\\.tsx',
        'src/pages/landing',
        'src/components/landing/',
        'src/components/(Navbar|Footer|AuthLayout|CookieNotice|CurrencyToggle)\\.tsx',
        'src/layouts/(AuthLayout|RootLayout)\\.tsx',
        // react-bits pieces only the public pages use; the app ones (ShinyButton, SpotlightCard, …) stay in scope
        'src/components/react-bits/(AnimatedTabs|BlurText)\\.tsx',
        'src/components/reactbits/',
        'src/components/ui/(card-fan-carousel|tilted-grid-hero)\\.tsx',
        'src/styles/(cinematic-motion|feature-carousel)\\.css',
        'src/components/editor/EditorCanvas\\.tsx',
      ].join('|'),
    );
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(tsx|ts|css)$/.test(e.name) ? [path.join(dir, e.name)] : [],
      );
    const banned: Array<[RegExp, string]> = [
      [NAVY_HEX, 'navy hex'],
      [/#(F4F6FB|8E9AB4|9AA2B2|22D3EE)\b/i, 'blue-white / blue-grey / cyan literal'],
      [BLUE_TINTED_GREY, 'slate grey'],
      [/\b(?:bg|text|border|ring)-gray-\d/, 'blue-tinted gray'],
      [/shadow-\[0_0_/, 'glow shadow'],
      [/drop-shadow-\[0_0_/, 'glow drop-shadow'],
      [/\bbg-clip-text\b/, 'gradient text'],
      [/vireo-btn-purple/, 'legacy gradient button'],
      [/\b(?:bg|text|border|ring)-(?:cream|sage|clay|forest)\b/, 'legacy palette token'],
      [/from-(?:violet|purple)-600 (?:via-\w+-600 )?to-(?:indigo|blue|purple)-600/, 'gradient CTA'],
    ];
    const offenders: string[] = [];
    for (const file of walk('src').map((f) => f.split(path.sep).join('/'))) {
      if (outOfScope.test(file)) continue;
      // The legacy --vc-accent-secondary alias still feeds the public 404 page.
      const src = read(file).replace(/^\s*--vc-accent-secondary:.*$/m, '');
      for (const [re, what] of banned) {
        const m = src.match(re);
        if (m) offenders.push(`${file}: ${what} (${m[0]})`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  it('theme colours accept opacity modifiers (no silently empty classes)', () => {
    const cfg = read('tailwind.config.js');
    assert.match(cfg, /const withAlpha = \(variable\) =>/);
    for (const name of ['background', 'foreground', 'border', 'destructive', 'muted', 'card']) {
      assert.match(cfg, new RegExp(`withAlpha\\('--${name}'\\)`), `${name} must support /opacity`);
    }
    assert.match(cfg, /surface2: 'rgb\(var\(--vc-surface-2-rgb\) \/ <alpha-value>\)'/);
  });
});
