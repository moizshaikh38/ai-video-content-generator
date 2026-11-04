import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Milestone C: Creative Workspace Redesign', () => {
  const contextualInspectorPath = path.resolve(projectRoot, 'src/components/editor/ContextualInspector.tsx');
  const contextualInspectorContent = fs.readFileSync(contextualInspectorPath, 'utf-8');

  const previewCanvasPath = path.resolve(projectRoot, 'src/components/editor/PreviewCanvas.tsx');
  const previewCanvasContent = fs.readFileSync(previewCanvasPath, 'utf-8');

  const brandPagePath = path.resolve(projectRoot, 'src/pages/BrandPage.tsx');
  const brandPageContent = fs.readFileSync(brandPagePath, 'utf-8');

  const workflowPagePath = path.resolve(projectRoot, 'src/pages/WorkflowPage.tsx');
  const workflowPageContent = fs.readFileSync(workflowPagePath, 'utf-8');

  const abStudioWorkspacePath = path.resolve(projectRoot, 'src/components/abStudio/ABStudioWorkspace.tsx');
  const abStudioWorkspaceContent = fs.readFileSync(abStudioWorkspacePath, 'utf-8');

  const abStudioHistoryPagePath = path.resolve(projectRoot, 'src/pages/ABStudioHistoryPage.tsx');
  const abStudioHistoryPageContent = fs.readFileSync(abStudioHistoryPagePath, 'utf-8');

  const loginPagePath = path.resolve(projectRoot, 'src/pages/LoginPage.tsx');
  const loginPageContent = fs.readFileSync(loginPagePath, 'utf-8');

  const signupPagePath = path.resolve(projectRoot, 'src/pages/SignupPage.tsx');
  const signupPageContent = fs.readFileSync(signupPagePath, 'utf-8');

  const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
  const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');

  describe('1. Editor Workspace & Caption Studio Consolidation', () => {
    test('Caption Studio uses a single tab level: Styles / Typography / Effects', () => {
      assert.match(contextualInspectorContent, /id: 'styles', label: 'Styles'/);
      assert.match(contextualInspectorContent, /id: 'typography', label: 'Typography'/);
      assert.match(contextualInspectorContent, /id: 'effects', label: 'Effects'/);
      // Tab ids are derived from the registry, so the panels stay addressable.
      assert.match(contextualInspectorContent, /id=\{`caption-tab-\$\{t\.id\}`\}/);
    });

    test('Caption Studio no longer has a duplicated second navigation level', () => {
      // "All Controls" only re-rendered Typography + Effects together; collapsible sections
      // replaced it, so neither the tab nor its panel should exist any more.
      assert.ok(
        !/All Controls<\/span>/.test(contextualInspectorContent),
        'the All Controls tab must be gone'
      );
      assert.ok(
        !contextualInspectorContent.includes("id=\"caption-tab-customize\""),
        'the legacy customize tab shim must be gone'
      );
      assert.ok(
        !contextualInspectorContent.includes('Presets & Templates'),
        'the old two-group nav labels must be gone'
      );
    });

    test('Caption Studio remembers the active tab across remounts', () => {
      assert.match(contextualInspectorContent, /usePanelPref<CaptionStudioTab>\('captions\.tab'/);
    });

    test('PreviewCanvas replaces harsh orange borders with subtle glass Obsidian borders', () => {
      // Must NOT contain harsh legacy border-orange-500/30
      assert.ok(
        !previewCanvasContent.includes('border-orange-500/30'),
        'PreviewCanvas must eliminate harsh border-orange-500/30'
      );
      // Must contain subtle glass border
      assert.match(previewCanvasContent, /border-white\/20/);
    });
  });

  describe('2. Brand Page Architecture & Interactive 9:16 Live Preview', () => {
    test('BrandPage consolidates 11 flat tabs into 4 clear functional groups', () => {
      assert.match(brandPageContent, /Identity & Voice/);
      assert.match(brandPageContent, /Visual & Media Styling/);
      assert.match(brandPageContent, /Intelligence & Learnings/);
      assert.match(brandPageContent, /Tools & Versions/);
    });

    test('BrandPage contains interactive live 9:16 vertical brand preview component', () => {
      assert.match(brandPageContent, /const BrandVideoPreview916/);
      assert.match(brandPageContent, /aspect-\[9\/16\]/);
      assert.match(brandPageContent, /Live 9:16 Brand Preview/);
    });

    test('BrandPage formats evidence records cleanly without raw JSON dumps', () => {
      assert.match(brandPageContent, /const renderEvidenceValue =/);
      // Ensure raw JSON.stringify dump has been replaced
      assert.ok(
        !brandPageContent.includes('{JSON.stringify(ev.value)}'),
        'BrandPage must not dump raw JSON.stringify(ev.value)'
      );
    });

    test('BrandPage implements full controls for previously unrendered tabs', () => {
      // Hooks & CTA tab controls
      assert.match(brandPageContent, /Opening Hooks & Call-To-Action/);
      assert.match(brandPageContent, /Preferred Hook Length/);
      assert.match(brandPageContent, /Approved CTA Phrases/);

      // Captions DNA tab controls
      assert.match(brandPageContent, /Captions DNA & Formatting/);
      assert.match(brandPageContent, /Default Caption Style/);
      assert.match(brandPageContent, /Typography Case/);

      // Audio & Editing tab controls
      assert.match(brandPageContent, /Editing & Audio Dynamics/);
      assert.match(brandPageContent, /Pacing Style/);
      assert.match(brandPageContent, /Audio Cleanup Preset/);
    });

    test('BrandPage uses Obsidian dark theme tokens throughout', () => {
      assert.ok(!brandPageContent.includes('border-border'), 'BrandPage must not contain legacy border-border');
      assert.ok(!brandPageContent.includes('bg-cream'), 'BrandPage must not contain legacy bg-cream');
      // Black Glass: neutral token scale instead of navy / blue-white literals.
      assert.ok(!/#(0E1017|07080D|F4F6FB|9AA2B2)\b/i.test(brandPageContent), 'no navy / blue-grey literals');
      assert.match(brandPageContent, /bg-vc-surface1/);
      assert.match(brandPageContent, /text-vc-text-primary/);
    });
  });

  describe('3. Workflow Kanban Page Performance & Responsive Column Filters', () => {
    test('WorkflowPage implements debounced search query filtering', () => {
      assert.match(workflowPageContent, /setTimeout\(\(\)\s*=>\s*\{\s*fetchWorkflows\(\);?\s*\},\s*280\)/);
    });

    test('WorkflowPage hides empty non-filtered columns when a stage is selected', () => {
      assert.match(workflowPageContent, /selectedState === 'ALL'/);
      assert.match(workflowPageContent, /STATE_COLUMNS\.filter\(\(col\) => col\.id === selectedState\)/);
    });

    test('WorkflowPage slide-over drawer features Obsidian dark glass treatment', () => {
      // Black Glass: shared scrim + floating glass drawer.
      assert.match(workflowPageContent, /glass-scrim flex justify-end/);
      assert.match(workflowPageContent, /max-w-xl glass-float/);
    });
  });

  describe('4. A/B Studio Experiment Intelligence & Winner Badges', () => {
    test('Eradicates internal phase tags (Phase 27, Phase 32) from UI', () => {
      assert.ok(
        !abStudioWorkspaceContent.includes('Phase 27'),
        'ABStudioWorkspace must not leak Phase 27 tag'
      );
      assert.ok(
        !abStudioHistoryPageContent.includes('Phase 32'),
        'ABStudioHistoryPage must not leak Phase 32 tag'
      );
      assert.match(abStudioHistoryPageContent, /VireoClip Intelligence · Experiment History/);
    });

    test('Variant comparison cards feature explicit icon badges for winners and leaders', () => {
      // Winner icon & ribbon
      assert.match(abStudioWorkspaceContent, /Declared Winner/);
      assert.match(abStudioWorkspaceContent, /Trophy/);

      // Leader badge
      assert.match(abStudioWorkspaceContent, /LEADER/);
      assert.match(abStudioWorkspaceContent, /CheckCircle2/);

      // Underperforming badge
      assert.match(abStudioWorkspaceContent, /UNDERPERFORMING/);
      assert.match(abStudioWorkspaceContent, /AlertCircle/);
    });
  });

  describe('5. Critical Protected Scope Preservation', () => {
    test('LoginPage and SignupPage remain strictly untouched', () => {
      assert.ok(!loginPageContent.includes("from '../components/Button'"));
      assert.ok(!loginPageContent.includes("from '../components/Input'"));
      assert.ok(!signupPageContent.includes("from '../components/Button'"));
      assert.ok(!signupPageContent.includes("from '../components/Input'"));
    });

    test('clipController getClipDownloadUrl remains untouched', () => {
      assert.match(clipControllerContent, /export const getClipDownloadUrl\s*=/);
      assert.match(clipControllerContent, /getSignedDownloadUrl/);
    });
  });
});
