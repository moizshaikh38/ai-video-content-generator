import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip — Editor Navigation & Invalid-Clip Recovery Regression Tests', () => {
  const dashboardLayoutPath = path.join(projectRoot, 'src/layouts/DashboardLayout.tsx');
  const clipEditorPagePath = path.join(projectRoot, 'src/pages/ClipEditorPage.tsx');
  const appPath = path.join(projectRoot, 'src/App.tsx');
  const editorShellPath = path.join(projectRoot, 'src/components/editor/EditorShell.tsx');
  const unifiedTimelinePath = path.join(projectRoot, 'src/components/editor/UnifiedTimeline.tsx');
  const timelinePath = path.join(projectRoot, 'src/components/editor/Timeline.tsx');

  const dashboardLayoutSource = fs.readFileSync(dashboardLayoutPath, 'utf8');
  const clipEditorPageSource = fs.readFileSync(clipEditorPagePath, 'utf8');
  const appSource = fs.readFileSync(appPath, 'utf8');
  const editorShellSource = fs.readFileSync(editorShellPath, 'utf8');
  const unifiedTimelineSource = fs.readFileSync(unifiedTimelinePath, 'utf8');
  const timelineSource = fs.readFileSync(timelinePath, 'utf8');

  // Test 1: Video Editor sidebar destination is a valid route
  describe('1. Video Editor sidebar destination', () => {
    it('verifies dead /dashboard#editor navigation has been replaced in DashboardLayout', () => {
      assert.ok(
        !dashboardLayoutSource.includes("'/dashboard#editor'"),
        'DashboardLayout must not contain dead /dashboard#editor route link'
      );
      assert.ok(
        !dashboardLayoutSource.includes('"/dashboard#editor"'),
        'DashboardLayout must not contain dead /dashboard#editor route link'
      );
    });

    it('verifies Video Editor sidebar item points to the verified /history media library route', () => {
      // Find the Video Editor item definition
      const videoEditorMatch = dashboardLayoutSource.match(
        /\{\s*to:\s*['"]([^'"]+)['"],\s*label:\s*['"]Video Editor['"]/
      );
      assert.ok(videoEditorMatch, 'DashboardLayout must contain Video Editor nav item');
      const destination = videoEditorMatch[1];
      assert.equal(
        destination,
        '/history',
        'Video Editor sidebar destination must point to verified /history route'
      );
    });

    it('verifies the destination route exists in App.tsx route tree', () => {
      assert.ok(
        appSource.includes('path="/history"'),
        'App.tsx must register the /history route'
      );
      assert.ok(
        appSource.includes('element={<HistoryPage />}'),
        'App.tsx /history route must render HistoryPage'
      );
    });

    it('verifies sidebar structure and other navigation items remain intact', () => {
      assert.ok(dashboardLayoutSource.includes("label: 'Home'"), 'Sidebar must preserve Home');
      assert.ok(dashboardLayoutSource.includes("label: 'Create Clips'"), 'Sidebar must preserve Create Clips');
      assert.ok(dashboardLayoutSource.includes("label: 'Content Studio'"), 'Sidebar must preserve Content Studio');
      assert.ok(dashboardLayoutSource.includes("label: 'Media Library'"), 'Sidebar must preserve Media Library');
      assert.ok(dashboardLayoutSource.includes("label: 'Publishing'"), 'Sidebar must preserve Publishing');
      assert.ok(dashboardLayoutSource.includes("label: 'Analytics'"), 'Sidebar must preserve Analytics');
      assert.ok(dashboardLayoutSource.includes("label: 'A/B Testing'"), 'Sidebar must preserve A/B Testing');
      assert.ok(dashboardLayoutSource.includes("label: 'Brand Brain'"), 'Sidebar must preserve Brand Brain');
      assert.ok(dashboardLayoutSource.includes("label: 'Workspaces'"), 'Sidebar must preserve Workspaces');
      assert.ok(dashboardLayoutSource.includes("label: 'Workflows'"), 'Sidebar must preserve Workflows');
    });
  });

  // Test 2: Invalid-clip fallback offers a working navigation action
  describe('2. Invalid-clip recovery and navigation actions', () => {
    it('verifies ClipEditorPage guards against missing or failed clips via error boundary', () => {
      assert.ok(
        clipEditorPageSource.includes('if (error || !clip || !project)'),
        'ClipEditorPage must conditionally check for error, missing clip, or missing project'
      );
      assert.ok(
        clipEditorPageSource.includes('Failed to Load Clip'),
        'ClipEditorPage must render clear error heading'
      );
    });

    it('verifies error message does not leak private clip existence or authorization details', () => {
      assert.ok(
        clipEditorPageSource.includes("{error || 'The requested clip or editor project could not be found.'}"),
        'ClipEditorPage must use safe, non-leaking fallback error message'
      );
    });

    it('verifies Browse Available Clips action is present and routes to verified /history', () => {
      assert.ok(
        clipEditorPageSource.includes('Browse Available Clips'),
        'ClipEditorPage error boundary must provide Browse Available Clips action'
      );
      assert.ok(
        clipEditorPageSource.includes("navigate('/history')"),
        'Browse Available Clips action must navigate to /history'
      );
    });

    it('verifies Go Back action is preserved in error fallback', () => {
      assert.ok(
        clipEditorPageSource.includes('Go Back'),
        'ClipEditorPage error boundary must preserve Go Back action'
      );
      assert.ok(
        clipEditorPageSource.includes('navigate(-1)'),
        'Go Back action must invoke navigate(-1)'
      );
    });

    it('verifies Retry action is preserved in error fallback', () => {
      assert.ok(
        clipEditorPageSource.includes('Retry'),
        'ClipEditorPage error boundary must preserve Retry action'
      );
      assert.ok(
        clipEditorPageSource.includes('reloadProject()'),
        'Retry action must invoke reloadProject()'
      );
    });
  });

  // Test 3: Successfully loaded clip/project still mounts EditorShell
  describe('3. Successful editor mounting', () => {
    it('verifies EditorShell is only mounted after clip and project are successfully loaded', () => {
      // Find return statement of ClipEditorPage
      const returnIndex = clipEditorPageSource.indexOf('return (\n    <EditorShell');
      const errorIndex = clipEditorPageSource.indexOf('if (error || !clip || !project)');
      assert.ok(errorIndex > 0, 'Error guard must precede EditorShell mount');
      assert.ok(returnIndex > errorIndex, 'EditorShell must mount after error guard');
    });

    it('verifies EditorShell receives all required clip, project, and handler props', () => {
      assert.ok(clipEditorPageSource.includes('clip={clip}'), 'EditorShell must receive clip');
      assert.ok(clipEditorPageSource.includes('project={project}'), 'EditorShell must receive project');
      assert.ok(clipEditorPageSource.includes('cleanSourceUrl={cleanSourceUrl}'), 'EditorShell must receive cleanSourceUrl');
      assert.ok(clipEditorPageSource.includes('renderedPreviewUrl={renderedPreviewUrl}'), 'EditorShell must receive renderedPreviewUrl');
      assert.ok(clipEditorPageSource.includes('cues={cues}'), 'EditorShell must receive cues');
      assert.ok(clipEditorPageSource.includes('onUpdateProject={updateProject}'), 'EditorShell must receive onUpdateProject');
      assert.ok(clipEditorPageSource.includes('onSplitTrackItem={splitTrackItem}'), 'EditorShell must receive onSplitTrackItem');
      assert.ok(clipEditorPageSource.includes('onDeleteTrackItem={deleteTrackItem}'), 'EditorShell must receive onDeleteTrackItem');
      assert.ok(clipEditorPageSource.includes('onRippleDeleteTrackItem={rippleDeleteTrackItem}'), 'EditorShell must receive onRippleDeleteTrackItem');
      assert.ok(clipEditorPageSource.includes('onDuplicateTrackItem={duplicateTrackItem}'), 'EditorShell must receive onDuplicateTrackItem');
    });
  });

  // Test 4: Timeline toggle wiring and persistence remain unchanged
  describe('4. Timeline toggle wiring and persistence', () => {
    it('verifies EditorShell manages isTimelineCollapsed state with localStorage persistence', () => {
      assert.ok(
        editorShellSource.includes("localStorage.getItem('vireo_editor_timeline_collapsed')"),
        'EditorShell must read timeline collapse preference from localStorage'
      );
      assert.ok(
        editorShellSource.includes("localStorage.setItem('vireo_editor_timeline_collapsed', String(next))"),
        'EditorShell must persist timeline collapse preference to localStorage'
      );
      assert.ok(
        editorShellSource.includes('isCollapsed={isTimelineCollapsed}'),
        'EditorShell must pass isTimelineCollapsed as isCollapsed prop to UnifiedTimeline'
      );
      assert.ok(
        editorShellSource.includes('onToggleCollapse={handleToggleTimelineCollapse}'),
        'EditorShell must pass handleToggleTimelineCollapse as onToggleCollapse prop to UnifiedTimeline'
      );
    });

    it('verifies UnifiedTimeline toggles between compact 36px dock and expanded workspace', () => {
      // The timeline is user-resizable, so the expanded height classes apply only when no
      // explicit height has been dragged. Collapsed is still a fixed 36px dock.
      assert.match(
        unifiedTimelineSource,
        /isCollapsed \? 'h-9'/,
        'UnifiedTimeline must collapse to the h-9 dock'
      );
      assert.match(
        unifiedTimelineSource,
        /'h-60 sm:h-64 md:h-72'/,
        'UnifiedTimeline must keep its default expanded height classes'
      );
      // The expanded-state toggle lives in the Timeline toolbar; the collapsed dock keeps its
      // own Show button in UnifiedTimeline. Both must be labelled for screen readers.
      assert.ok(
        timelineSource.includes("aria-label={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}"),
        'Timeline toolbar toggle must dynamically set aria-label'
      );
      assert.ok(
        unifiedTimelineSource.includes('aria-label="Show Timeline"'),
        'UnifiedTimeline collapsed dock must label its Show Timeline button'
      );
      assert.ok(
        timelineSource.includes("title={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}"),
        'Timeline toolbar toggle must switch its tooltip with collapse state'
      );
    });

    it('verifies UnifiedTimeline preserves timeline playback, editing, and snapping handlers', () => {
      assert.ok(unifiedTimelineSource.includes('onSplit'), 'UnifiedTimeline must wire onSplit');
      assert.ok(unifiedTimelineSource.includes('onDuplicate'), 'UnifiedTimeline must wire onDuplicate');
      assert.ok(unifiedTimelineSource.includes('onRippleDelete'), 'UnifiedTimeline must wire onRippleDelete');
      assert.ok(unifiedTimelineSource.includes('onPlayheadChange'), 'UnifiedTimeline must wire onPlayheadChange');
      assert.ok(unifiedTimelineSource.includes('onTogglePlay'), 'UnifiedTimeline must wire onTogglePlay');
    });
  });
});
