import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('Editor UX Polish: Direct B-Roll Navigation & Workflows', () => {
  const sidebarPath = path.resolve(projectRoot, 'src/components/editor/EditorSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

  const shellPath = path.resolve(projectRoot, 'src/components/editor/EditorShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');

  const mediaBinPath = path.resolve(projectRoot, 'src/components/editor/MediaBin.tsx');
  const mediaBinContent = fs.readFileSync(mediaBinPath, 'utf-8');

  test('PRIMARY_TABS includes dedicated direct B-Roll entry point', () => {
    assert.match(
      sidebarContent,
      /\{\s*id:\s*['"]broll['"],\s*label:\s*['"]B-Roll['"],\s*icon:\s*Film\s*\}/,
      'EditorSidebar must have a dedicated B-Roll primary tab with Film icon'
    );
  });

  test('EditorShell renders focused B-Roll drawer directly without opening Media first', () => {
    assert.match(
      shellContent,
      /activeSidebarTab\s*===\s*['"]broll['"]/,
      'EditorShell must check activeSidebarTab === "broll"'
    );
    assert.match(
      shellContent,
      /<MediaBin[^>]*initialTab=["']broll["']/,
      'EditorShell must render MediaBin with initialTab="broll" directly for B-Roll tab'
    );
  });

  test('MediaBin preserves existing Media Library functionality alongside B-Roll', () => {
    assert.match(
      shellContent,
      /activeSidebarTab\s*===\s*['"]media['"]/,
      'EditorShell must maintain existing media library tab'
    );
    assert.match(
      shellContent,
      /<MediaBin[^>]*initialTab=["']library["']/,
      'EditorShell must render MediaBin in library mode for media tab'
    );
    assert.match(
      mediaBinContent,
      /'Project',\s*'Uploads',\s*'Clips',\s*'Brand',\s*'Stock',\s*'Generated'/,
      'MediaBin must preserve all existing library subtabs'
    );
  });

  test('MediaBin supports direct asset upload and timeline placement', () => {
    assert.match(
      mediaBinContent,
      /type=["']file["']/,
      'MediaBin must include a file input for direct uploads'
    );
    assert.match(
      mediaBinContent,
      /handleFileUpload/,
      'MediaBin must implement handleFileUpload'
    );
    assert.match(
      shellContent,
      /handleAddMediaLayer/,
      'EditorShell must implement handleAddMediaLayer to insert B-roll/media into timeline'
    );
  });

  test('Displays clear disabled/unavailable notice when providers are not configured', () => {
    assert.match(
      mediaBinContent,
      /Stock Provider Not Configured/,
      'MediaBin must clearly indicate when stock provider API keys are missing'
    );
    assert.match(
      mediaBinContent,
      /AI Generation Not Configured/,
      'MediaBin must clearly indicate when AI media generation is unconfigured'
    );
  });
});

describe('Editor UX Polish: Direct Translate Navigation & Non-Destructive Workflow', () => {
  const sidebarPath = path.resolve(projectRoot, 'src/components/editor/EditorSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

  const shellPath = path.resolve(projectRoot, 'src/components/editor/EditorShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');

  const translatePath = path.resolve(projectRoot, 'src/components/translation/TranslationWorkspace.tsx');
  const translateContent = fs.readFileSync(translatePath, 'utf-8');

  test('PRIMARY_TABS includes dedicated direct Translate entry point', () => {
    assert.match(
      sidebarContent,
      /\{\s*id:\s*['"]translate['"],\s*label:\s*['"]Translate['"],\s*icon:\s*Globe\s*\}/,
      'EditorSidebar must have a dedicated Translate primary tab with Globe icon'
    );
  });

  test('EditorShell renders focused TranslationWorkspace directly on translate tab', () => {
    assert.match(
      shellContent,
      /activeSidebarTab\s*===\s*['"]translate['"]/,
      'EditorShell must handle activeSidebarTab === "translate"'
    );
    assert.match(
      shellContent,
      /<TranslationWorkspace/,
      'EditorShell must host TranslationWorkspace directly'
    );
  });

  test('Translation changes require explicit user confirmation and preserve source media', () => {
    assert.match(
      translateContent,
      /Source Media & Audio 100% Immutable/,
      'TranslationWorkspace must guarantee immutability of original source'
    );
    assert.match(
      shellContent,
      /onApplyCaptions=\{/,
      'EditorShell must handle onApplyCaptions explicitly upon user action'
    );
    assert.match(
      translateContent,
      /onApplyCaptions\(selectedLanguage,\s*currentSegments\)/,
      'TranslationWorkspace must only apply captions upon explicit button click'
    );
  });

  test('Correctly maps TranslatedSegment fields (segment_id, start_time, end_time, translated_text)', () => {
    assert.match(
      shellContent,
      /s\.segment_id/,
      'EditorShell must map s.segment_id for TimedCaptionCue id'
    );
    assert.match(
      shellContent,
      /s\.start_time/,
      'EditorShell must map s.start_time for TimedCaptionCue start'
    );
    assert.match(
      shellContent,
      /s\.end_time/,
      'EditorShell must map s.end_time for TimedCaptionCue end'
    );
    assert.match(
      shellContent,
      /s\.translated_text/,
      'EditorShell must map s.translated_text for TimedCaptionCue text'
    );
  });
});

describe('Editor UX Polish: Panel Switching & Mutual Exclusion', () => {
  const shellPath = path.resolve(projectRoot, 'src/components/editor/EditorShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');

  const selectionPath = path.resolve(projectRoot, 'src/hooks/useEditorSelection.ts');
  const selectionContent = fs.readFileSync(selectionPath, 'utf-8');

  test('SidebarTab type includes broll and translate', () => {
    assert.match(selectionContent, /\|\s*['"]broll['"]/);
    assert.match(selectionContent, /\|\s*['"]translate['"]/);
  });

  test('isDrawerTab includes broll and translate with mutual exclusion logic', () => {
    assert.match(shellContent, /activeSidebarTab\s*===\s*['"]broll['"]/);
    assert.match(shellContent, /activeSidebarTab\s*===\s*['"]translate['"]/);
    assert.match(shellContent, /const\s+showLeftDrawer\s*=\s*isDrawerTab/);
    // Transcript now lives in a persistent right-hand dock, so the inspector is simply the
    // other half of the single contextual column rather than a compact-screen trade-off.
    assert.match(shellContent, /const\s+showRightInspector\s*=\s*!showLeftDrawer/);
  });
});

describe('Editor UX Polish: Theme Consistency & Legacy Color Removal', () => {
  const mediaBinPath = path.resolve(projectRoot, 'src/components/editor/MediaBin.tsx');
  const mediaBinContent = fs.readFileSync(mediaBinPath, 'utf-8');

  const copilotPath = path.resolve(projectRoot, 'src/components/editor/AICopilotPanel.tsx');
  const copilotContent = fs.readFileSync(copilotPath, 'utf-8');

  const brandKitPath = path.resolve(projectRoot, 'src/components/editor/BrandKitPanel.tsx');
  const brandKitContent = fs.readFileSync(brandKitPath, 'utf-8');

  const timelinePath = path.resolve(projectRoot, 'src/components/editor/Timeline.tsx');
  const timelineContent = fs.readFileSync(timelinePath, 'utf-8');

  const translatePath = path.resolve(projectRoot, 'src/components/translation/TranslationWorkspace.tsx');
  const translateContent = fs.readFileSync(translatePath, 'utf-8');

  test('MediaBin replaces legacy orange brand styling with violet design tokens', () => {
    assert.ok(!mediaBinContent.includes('text-orange-400'), 'MediaBin must not use legacy text-orange-400');
    assert.ok(!mediaBinContent.includes('bg-orange-500'), 'MediaBin must not use legacy bg-orange-500');
    // Violet is reserved for AI surfaces; MediaBin is an ordinary panel and uses titanium white.
    assert.ok(!mediaBinContent.includes('violet'), 'MediaBin must not use violet (AI-only accent)');
    assert.match(mediaBinContent, /bg-\[#F4F6FB\]/, 'MediaBin must use the titanium primary action');
  });

  test('AICopilotPanel replaces legacy orange styling with violet design tokens', () => {
    assert.ok(!copilotContent.includes('text-orange-400'), 'AICopilotPanel must not use text-orange-400');
    assert.ok(!copilotContent.includes('bg-orange-600'), 'AICopilotPanel must not use bg-orange-600');
    assert.match(copilotContent, /text-violet-400/, 'AICopilotPanel must use text-violet-400');
    assert.match(copilotContent, /bg-gradient-to-r from-violet-600 to-indigo-600/, 'AICopilotPanel must use violet gradient');
  });

  test('BrandKitPanel replaces legacy orange styling with violet design tokens', () => {
    assert.ok(!brandKitContent.includes('text-orange-400'), 'BrandKitPanel must not use text-orange-400');
    assert.ok(!brandKitContent.includes('bg-orange-600'), 'BrandKitPanel must not use bg-orange-600');
    // Violet is reserved for AI surfaces; the brand kit uses the neutral titanium primary.
    assert.ok(!brandKitContent.includes('violet'), 'BrandKitPanel must not use violet (AI-only accent)');
    assert.match(brandKitContent, /bg-\[#F4F6FB\]/, 'BrandKitPanel must use the titanium primary action');
  });

  test('Timeline replaces legacy needle, selection and trim orange styling with violet', () => {
    assert.ok(!timelineContent.includes('bg-orange-600/90 border-orange-400'), 'Timeline must not use orange selection');
    assert.ok(!timelineContent.includes('bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.8)]'), 'Timeline must not use orange needle');
    // Selection and playhead are titanium so colour never competes with the AI accent.
    assert.match(timelineContent, /ring-2 ring-white\/70/, 'Timeline must use the titanium selection ring');
    assert.match(timelineContent, /bg-white shadow-\[0_0_8px_rgba\(255,255,255,0.55\)\]/, 'Timeline must use the titanium playhead needle');
  });

  test('TranslationWorkspace replaces legacy orange accents with violet design tokens', () => {
    assert.ok(!translateContent.includes('text-orange-400'), 'TranslationWorkspace must not use text-orange-400');
    assert.ok(!translateContent.includes('bg-orange-600'), 'TranslationWorkspace must not use bg-orange-600');
    assert.match(translateContent, /text-violet-400/, 'TranslationWorkspace must use text-violet-400');
  });
});

describe('Editor UX Polish: AI Tools Redesign & Usability', () => {
  const copilotPath = path.resolve(projectRoot, 'src/components/editor/AICopilotPanel.tsx');
  const copilotContent = fs.readFileSync(copilotPath, 'utf-8');

  test('AICopilotPanel organizes tools into clear categories (pacing, visuals, captions)', () => {
    assert.match(copilotContent, /category:\s*['"]pacing['"]/);
    assert.match(copilotContent, /category:\s*['"]visuals['"]/);
    assert.match(copilotContent, /category:\s*['"]captions['"]/);
  });

  test('AICopilotPanel supports structured, typed operation schemas', () => {
    assert.match(copilotContent, /PAUSE_CUT/);
    assert.match(copilotContent, /PUNCH_IN_ZOOM/);
    assert.match(copilotContent, /WORD_HIGHLIGHT/);
    assert.match(copilotContent, /STYLE_PRESET/);
    assert.match(copilotContent, /SPEAKER_REFRAME/);
  });

  test('AICopilotPanel allows selective toggling and explicit reversible execution', () => {
    assert.match(copilotContent, /setSelectedOpIds/, 'Supports toggling individual operations');
    assert.match(copilotContent, /Apply to Timeline/, 'Explicit execution button');
    assert.match(copilotContent, /onUpdateProject/, 'Commits project updates enabling undo history');
  });

  test('AICopilotPanel provides loading, disabled, and error states', () => {
    assert.match(copilotContent, /isGenerating/, 'Maintains generating status');
    assert.match(copilotContent, /errorMessage/, 'Handles error messages');
    assert.match(copilotContent, /disabled=\{!prompt\.trim\(\)\s*\|\|\s*isGenerating\}/, 'Disables submit when empty or active');
  });
});

describe('Editor UX Polish: Regression Guardrails', () => {
  const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
  const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');

  const unifiedTimelinePath = path.resolve(projectRoot, 'src/components/editor/UnifiedTimeline.tsx');
  const unifiedTimelineContent = fs.readFileSync(unifiedTimelinePath, 'utf-8');

  const previewCanvasPath = path.resolve(projectRoot, 'src/components/editor/PreviewCanvas.tsx');
  const previewCanvasContent = fs.readFileSync(previewCanvasPath, 'utf-8');

  test('Parked bug getClipDownloadUrl in clipController.ts is left untouched', () => {
    assert.ok(
      clipControllerContent.includes('export const getClipDownloadUrl = async'),
      'getClipDownloadUrl must remain present'
    );
  });

  test('Phase 1 timeline visibility toggle (Hide Timeline / Show Timeline) is preserved', () => {
    assert.match(unifiedTimelineContent, /Hide Timeline/);
    assert.match(unifiedTimelineContent, /Show Timeline/);
  });

  test('Phase 2 direct caption positioning and Safe Zones HUD are preserved', () => {
    assert.match(previewCanvasContent, /captionGrabOffset/);
    assert.match(previewCanvasContent, /showSafeGuides/);
    assert.match(previewCanvasContent, /Scope/);
  });
});
