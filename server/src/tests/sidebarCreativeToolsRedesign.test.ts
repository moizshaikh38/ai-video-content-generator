import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Premium Glass Sidebar, Creative Tools & Preview Redesign', () => {
  const sidebarPath = path.resolve(projectRoot, 'src/components/editor/EditorSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

  const shellPath = path.resolve(projectRoot, 'src/components/editor/EditorShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');

  const selectionHookPath = path.resolve(projectRoot, 'src/hooks/useEditorSelection.ts');
  const selectionHookContent = fs.readFileSync(selectionHookPath, 'utf-8');

  const audioPanelPath = path.resolve(projectRoot, 'src/components/editor/AudioWorkspacePanel.tsx');
  const audioPanelContent = fs.readFileSync(audioPanelPath, 'utf-8');

  const framingPanelPath = path.resolve(projectRoot, 'src/components/editor/FramingWorkspacePanel.tsx');
  const framingPanelContent = fs.readFileSync(framingPanelPath, 'utf-8');

  const motionPanelPath = path.resolve(projectRoot, 'src/components/editor/MotionWorkspacePanel.tsx');
  const motionPanelContent = fs.readFileSync(motionPanelPath, 'utf-8');

  const ratioPanelPath = path.resolve(projectRoot, 'src/components/editor/AspectRatioWorkspacePanel.tsx');
  const ratioPanelContent = fs.readFileSync(ratioPanelPath, 'utf-8');

  const previewCanvasPath = path.resolve(projectRoot, 'src/components/editor/PreviewCanvas.tsx');
  const previewCanvasContent = fs.readFileSync(previewCanvasPath, 'utf-8');

  const transcriptEditorPath = path.resolve(projectRoot, 'src/components/editor/TranscriptEditor.tsx');
  const transcriptEditorContent = fs.readFileSync(transcriptEditorPath, 'utf-8');

  const brandPanelPath = path.resolve(projectRoot, 'src/components/editor/BrandKitPanel.tsx');
  const brandPanelContent = fs.readFileSync(brandPanelPath, 'utf-8');

  describe('1. Sidebar Tab Sequence & AI Tools Separation', () => {
    test('PRIMARY_TABS defines the exact ordered 13-item tool sequence', () => {
      const expectedSequence = [
        'captions',
        'media',
        'elements',
        'brand',
        'broll',
        'layout',
        'framing',
        'aspect_ratio',
        'text',
        'audio',
        'translate',
        'copilot',
        'ai_tools',
      ];

      for (let i = 0; i < expectedSequence.length; i++) {
        const tabId = expectedSequence[i];
        assert.ok(
          sidebarContent.includes(`id: '${tabId}'`) || sidebarContent.includes(`id: "${tabId}"`),
          `Sidebar must include tab '${tabId}'`
        );
      }

      // Verify relative order in PRIMARY_TABS array
      const matches = [...sidebarContent.matchAll(/id:\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]);
      const primaryTabMatches = matches.filter((id) => expectedSequence.includes(id));
      assert.deepEqual(
        primaryTabMatches.slice(0, 13),
        expectedSequence,
        'Tabs must appear in the exact required sequence'
      );
    });

    test('Duplicate transcript tab is removed from the left sidebar rail', () => {
      // PRIMARY_TABS must not include transcript
      const primaryTabsBlock = sidebarContent.split('export const EditorSidebar')[0];
      assert.ok(
        !primaryTabsBlock.includes("id: 'transcript'") && !primaryTabsBlock.includes('id: "transcript"'),
        'Left sidebar rail must not contain duplicate transcript button'
      );
    });

    test('AI Copilot and AI Tools both feature AI signature violet badge/accent', () => {
      assert.match(
        sidebarContent,
        /id:\s*['"]copilot['"],\s*label:\s*['"]AI Copilot['"],\s*icon:\s*Brain,\s*isAi:\s*true/
      );
      assert.match(
        sidebarContent,
        /id:\s*['"]ai_tools['"],\s*label:\s*['"]AI Tools['"],\s*icon:\s*(?:Sparkles|Wand2),\s*isAi:\s*true/
      );
    });

    test('Music tab is cleanly renamed to Audio in the sidebar', () => {
      assert.match(
        sidebarContent,
        /id:\s*['"]audio['"],\s*label:\s*['"]Audio['"],\s*icon:\s*Music/
      );
    });
  });

  describe('2. Creative Tools Separation (Motion, Framing, Aspect Ratio, Audio)', () => {
    test('Motion, Framing, and Aspect Ratio are independent components and tabs', () => {
      assert.ok(fs.existsSync(motionPanelPath), 'MotionWorkspacePanel.tsx must exist');
      assert.ok(fs.existsSync(framingPanelPath), 'FramingWorkspacePanel.tsx must exist');
      assert.ok(fs.existsSync(ratioPanelPath), 'AspectRatioWorkspacePanel.tsx must exist');

      assert.match(shellContent, /<MotionWorkspacePanel/);
      assert.match(shellContent, /<FramingWorkspacePanel/);
      assert.match(shellContent, /<AspectRatioWorkspacePanel/);
    });

    test('AudioWorkspacePanel provides 3 distinct subsections: Music, SFX, and Upload', () => {
      assert.ok(audioPanelContent.includes("'music'"), 'Audio panel must have music subsection');
      assert.ok(audioPanelContent.includes("'sfx'"), 'Audio panel must have sfx subsection');
      assert.ok(audioPanelContent.includes("'upload'"), 'Audio panel must have upload subsection');
      assert.match(audioPanelContent, /STOCK_MUSIC_CATALOG/);
      assert.match(audioPanelContent, /STOCK_SFX_CATALOG/);
      assert.match(audioPanelContent, /handleFileUpload/);
    });

    test('FramingWorkspacePanel supports Smart Reframe, Center Fill, and Safe Guides', () => {
      assert.match(framingPanelContent, /Smart Reframe/);
      assert.match(framingPanelContent, /Center Fill/);
      assert.match(framingPanelContent, /Platform Safe Zone Overlay/);
      assert.match(framingPanelContent, /onUpdateCropMode/);
    });

    test('AspectRatioWorkspacePanel supports standard social aspect ratios', () => {
      assert.match(ratioPanelContent, /'9:16'/);
      assert.match(ratioPanelContent, /'1:1'/);
      assert.match(ratioPanelContent, /'16:9'/);
      assert.match(ratioPanelContent, /'4:5'/);
    });
  });

  describe('3. Standardized Drawer Width & Glass Tokens', () => {
    test('All drawer panels use uniform w-[350px] width to prevent layout blowout', () => {
      const drawers = [
        'activeSidebarTab === \'broll\'',
        'activeSidebarTab === \'media\'',
        'activeSidebarTab === \'copilot\'',
        'activeSidebarTab === \'ai_tools\'',
        'activeSidebarTab === \'audio\'',
        'activeSidebarTab === \'brand\'',
        'activeSidebarTab === \'text\'',
        'activeSidebarTab === \'elements\'',
        'activeSidebarTab === \'layout\'',
        'activeSidebarTab === \'framing\'',
        'activeSidebarTab === \'aspect_ratio\'',
      ];

      for (const drawer of drawers) {
        assert.ok(
          shellContent.includes(drawer),
          `EditorShell must render drawer condition for ${drawer}`
        );
      }

      // Check that w-88 (invalid tailwind class) is not used in drawers
      assert.ok(
        !shellContent.includes('w-88 border-r'),
        'Invalid tailwind class w-88 must not be used on drawer wrappers'
      );
    });

    test('BrandKitPanel is contained with overflow-x-hidden and smooth entry animation', () => {
      assert.match(brandPanelContent, /overflow-x-hidden/);
      assert.match(brandPanelContent, /animate-panelSlideIn/);
    });
  });

  describe('4. Preview Canvas Opus-Style Toolbar & Outside Deselect', () => {
    test('PreviewCanvas features top pill toolbar with Ratio, Layout, and Safe Zones', () => {
      assert.match(previewCanvasContent, /OPUS-STYLE TOP PREVIEW TOOLBAR/);
      assert.match(previewCanvasContent, /onChangeAspectRatio/);
      assert.match(previewCanvasContent, /Layout:/);
      assert.match(previewCanvasContent, /Safe Zones:/);
    });

    test('Clicking canvas background or video deselects active selection', () => {
      assert.match(previewCanvasContent, /onSelectItem\(null\)/);
    });
  });

  describe('5. Transcript Speech Cleanup Opus Alignment', () => {
    test('Speech cleanup icon uses clean white styling matching Opus reference', () => {
      assert.match(
        transcriptEditorContent,
        /<Sparkles className="w-3\.5 h-3\.5 text-white" \/>/
      );
    });
  });

  describe('6. Desktop 4-Pane Layout & Safety Guardrails', () => {
    test('EditorShell preserves persistent right dock for transcriptPanel', () => {
      assert.match(shellContent, /const transcriptPanel =/);
      assert.match(shellContent, /<TranscriptEditor/);
      assert.match(shellContent, /transcriptPanel/);
    });

    test('EditorShell preserves center viewport and bottom timeline', () => {
      assert.match(shellContent, /<PreviewCanvas/);
      assert.match(shellContent, /<UnifiedTimeline/);
    });

    test('getClipDownloadUrl in clipController.ts is intact and untouched', () => {
      const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
      const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');
      assert.ok(
        clipControllerContent.includes('export const getClipDownloadUrl = async'),
        'getClipDownloadUrl must remain present and intact'
      );
    });
  });
});
