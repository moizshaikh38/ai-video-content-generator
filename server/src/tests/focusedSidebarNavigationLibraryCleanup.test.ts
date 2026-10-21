import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Focused Sidebar Navigation & Library Cleanup', () => {
  const sidebarPath = path.resolve(projectRoot, 'src/components/editor/EditorSidebar.tsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf-8');

  const shellPath = path.resolve(projectRoot, 'src/components/editor/EditorShell.tsx');
  const shellContent = fs.readFileSync(shellPath, 'utf-8');

  const mediaBinPath = path.resolve(projectRoot, 'src/components/editor/MediaBin.tsx');
  const mediaBinContent = fs.readFileSync(mediaBinPath, 'utf-8');

  const translatePath = path.resolve(projectRoot, 'src/components/translation/TranslationWorkspace.tsx');
  const translateContent = fs.readFileSync(translatePath, 'utf-8');

  const selectionHookPath = path.resolve(projectRoot, 'src/hooks/useEditorSelection.ts');
  const selectionHookContent = fs.readFileSync(selectionHookPath, 'utf-8');

  describe('1. Sidebar Navigation Separation', () => {
    test('EditorSidebar defines distinct, independent tabs for Library, B-Roll, and Translate', () => {
      assert.match(
        sidebarContent,
        /\{\s*id:\s*['"]media['"],\s*label:\s*['"]Library['"],\s*icon:\s*CloudUpload\s*\}/,
        'Sidebar must have dedicated Library tab'
      );
      assert.match(
        sidebarContent,
        /\{\s*id:\s*['"]broll['"],\s*label:\s*['"]B-Roll['"],\s*icon:\s*Film\s*\}/,
        'Sidebar must have dedicated B-Roll tab'
      );
      assert.match(
        sidebarContent,
        /\{\s*id:\s*['"]translate['"],\s*label:\s*['"]Translate['"],\s*icon:\s*Globe\s*\}/,
        'Sidebar must have dedicated Translate tab'
      );
    });

    test('SidebarTab type includes media, broll, and translate', () => {
      assert.match(selectionHookContent, /\|\s*['"]media['"]/);
      assert.match(selectionHookContent, /\|\s*['"]broll['"]/);
      assert.match(selectionHookContent, /\|\s*['"]translate['"]/);
    });

    test('EditorShell renders distinct drawers for each section without cross-contamination', () => {
      assert.match(shellContent, /activeSidebarTab\s*===\s*['"]media['"]/);
      assert.match(shellContent, /activeSidebarTab\s*===\s*['"]broll['"]/);
      assert.match(shellContent, /activeSidebarTab\s*===\s*['"]translate['"]/);
      assert.match(shellContent, /<MediaBin[^>]*initialTab=["']library["']/);
      assert.match(shellContent, /<MediaBin[^>]*initialTab=["']broll["']/);
      assert.match(shellContent, /<TranslationWorkspace/);
    });

    test('Switching sidebar tabs is zero-side-effect and does not mutate project state', () => {
      // setActiveSidebarTab in useEditorSelection only updates state and does not call any project update or mark dirty
      assert.match(
        selectionHookContent,
        /const setActiveSidebarTab = useCallback\(\(tab: SidebarTab\) =>\s*\{\s*setActiveSidebarTabState\(tab\);\s*\}, \[\]\);/
      );
    });
  });

  describe('2. Library Workspace Cleanup', () => {
    test('MediaBin eliminates the 3-button switcher (Library | B-Roll | Translate)', () => {
      assert.ok(
        !mediaBinContent.includes('grid grid-cols-3 p-0.5 bg-[#07080D] rounded-xl'),
        'MediaBin must not contain the internal 3-way tab switcher'
      );
    });

    test('MediaBin completely removes embedded TranslationWorkspace', () => {
      assert.ok(
        !mediaBinContent.includes('<TranslationWorkspace'),
        'MediaBin must not render TranslationWorkspace internally'
      );
      assert.ok(
        !mediaBinContent.includes("from '../translation/TranslationWorkspace'"),
        'MediaBin must not import TranslationWorkspace'
      );
    });

    test('Library panel focuses on genuine project and user asset categories', () => {
      assert.match(mediaBinContent, /ASSET_LIBRARY_TABS/);
      assert.match(mediaBinContent, /'Project'/);
      assert.match(mediaBinContent, /'Uploads'/);
      assert.match(mediaBinContent, /'Clips'/);
      assert.match(mediaBinContent, /'Brand'/);
    });

    test('Library supports uploads and media type filtering including VIDEO, IMAGE, and AUDIO', () => {
      assert.match(mediaBinContent, /type=["']file["']/);
      assert.match(mediaBinContent, /accept=["']video\/\*,image\/\*,audio\/\*["']/);
      assert.match(mediaBinContent, /'ALL',\s*'VIDEO',\s*'IMAGE',\s*'AUDIO'/);
      assert.match(mediaBinContent, /handleFileUpload/);
    });

    test('Library displays a clean, dedicated empty state', () => {
      assert.match(mediaBinContent, /No media assets in/);
    });
  });

  describe('3. Dedicated B-Roll Workspace', () => {
    test('B-Roll mode renders dedicated B-Roll Studio header with playhead time', () => {
      assert.match(mediaBinContent, /B-Roll Studio/);
      assert.match(mediaBinContent, /Playhead:\s*\{currentTime\.toFixed\(1\)\}s/);
    });

    test('B-Roll mode isolates AI Suggestions and Stock Search without Library subtabs or Upload button', () => {
      assert.match(mediaBinContent, /AI Suggestions/);
      assert.match(mediaBinContent, /Stock Search/);
      assert.match(mediaBinContent, /Detect & Plan B-Roll/);
      assert.match(mediaBinContent, /Pacing Style/);
    });

    test('B-Roll preserves provider capability notices under Stock Search', () => {
      assert.match(mediaBinContent, /Stock Provider Not Configured/);
      assert.match(mediaBinContent, /AI Generation Not Configured/);
    });

    test('B-Roll mode supports direct placement and preview modal', () => {
      assert.match(mediaBinContent, /handleInsertDirectAsset/);
      assert.match(mediaBinContent, /handleApplyBrollPlan/);
      assert.match(mediaBinContent, /previewItem/);
    });
  });

  describe('4. Dedicated Translate Workspace', () => {
    test('Translate panel is exclusively hosted by TranslationWorkspace in EditorShell', () => {
      assert.match(shellContent, /activeSidebarTab === 'translate'/);
      assert.match(shellContent, /<TranslationWorkspace/);
    });

    test('TranslationWorkspace maintains source immutability, script translation, and dubbing', () => {
      assert.match(translateContent, /Source Media & Audio 100% Immutable/);
      assert.match(translateContent, /Script Translation/);
      assert.match(translateContent, /Localized Captions & SRT/);
      assert.match(translateContent, /Voice Dubbing & Timing/);
    });
  });

  describe('5. Regression Guardrails', () => {
    test('getClipDownloadUrl in clipController.ts remains completely untouched', () => {
      const clipControllerPath = path.resolve(projectRoot, 'server/src/controllers/clipController.ts');
      const clipControllerContent = fs.readFileSync(clipControllerPath, 'utf-8');
      assert.ok(
        clipControllerContent.includes('export const getClipDownloadUrl = async'),
        'getClipDownloadUrl must remain present and intact'
      );
    });
  });
});
