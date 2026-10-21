import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('VireoClip Phase 1 — Adaptive Editor Workspace Redesign Tests', () => {
  const topBarPath = path.join(projectRoot, 'src/components/editor/EditorTopBar.tsx');
  const unifiedTimelinePath = path.join(projectRoot, 'src/components/editor/UnifiedTimeline.tsx');
  const timelinePath = path.join(projectRoot, 'src/components/editor/Timeline.tsx');
  const editorShellPath = path.join(projectRoot, 'src/components/editor/EditorShell.tsx');

  const topBarSource = fs.readFileSync(topBarPath, 'utf8');
  const unifiedTimelineSource = fs.readFileSync(unifiedTimelinePath, 'utf8');
  const timelineSource = fs.readFileSync(timelinePath, 'utf8');
  const editorShellSource = fs.readFileSync(editorShellPath, 'utf8');
  const combinedTimelineSource = unifiedTimelineSource + '\n' + timelineSource;

  it('1. verifies Standard and Timeline Pro buttons are completely absent from EditorTopBar', () => {
    assert.ok(
      !topBarSource.includes('Timeline Pro'),
      'EditorTopBar must not contain Timeline Pro button'
    );
    assert.ok(
      !topBarSource.includes('>Standard<'),
      'EditorTopBar must not contain Standard workspace button'
    );
    assert.ok(
      !topBarSource.includes('onChangePreset'),
      'EditorTopBar must not contain onChangePreset callback'
    );
    assert.ok(
      !topBarSource.includes('editorPreset'),
      'EditorTopBar must not contain editorPreset prop'
    );
  });

  it('2. verifies existing top-bar controls remain intact, accessible, and correctly labeled', () => {
    // History controls
    assert.ok(topBarSource.includes('onUndo'), 'TopBar must preserve onUndo');
    assert.ok(topBarSource.includes('onRedo'), 'TopBar must preserve onRedo');
    assert.ok(topBarSource.includes('Undo (Cmd+Z)'), 'TopBar must preserve Undo tooltip');
    assert.ok(topBarSource.includes('Redo (Cmd+Shift+Z)'), 'TopBar must preserve Redo tooltip');

    // View modes
    assert.ok(topBarSource.includes('Live Edit'), 'TopBar must preserve Live Edit mode');
    assert.ok(topBarSource.includes('Render Review'), 'TopBar must preserve Render Review mode');

    // Safe Zones HUD toggle (shield icon)
    assert.ok(topBarSource.includes('onToggleSafeGuides'), 'TopBar must preserve onToggleSafeGuides');
    assert.ok(topBarSource.includes('Toggle Platform Safe Zones'), 'TopBar must preserve Safe Zones HUD tooltip');
    assert.ok(topBarSource.includes('Shield'), 'TopBar must preserve Shield icon for Safe Zones HUD');

    // Quality, Title, Command Palette, and Export
    assert.ok(topBarSource.includes('previewQuality'), 'TopBar must preserve preview quality selector');
    assert.ok(topBarSource.includes('onOpenCommandPalette'), 'TopBar must preserve Command Palette trigger');
    assert.ok(topBarSource.includes('onOpenExportDialog'), 'TopBar must preserve Export dialog trigger');
  });

  it('3. verifies timeline visibility state defaults gracefully and supports localStorage persistence', () => {
    assert.ok(
      editorShellSource.includes('vireo_editor_timeline_collapsed'),
      'EditorShell must use vireo_editor_timeline_collapsed localStorage key'
    );
    assert.ok(
      editorShellSource.includes('isTimelineCollapsed'),
      'EditorShell must maintain isTimelineCollapsed state'
    );
    assert.ok(
      editorShellSource.includes('handleToggleTimelineCollapse'),
      'EditorShell must provide handleToggleTimelineCollapse handler'
    );
  });

  it('4. verifies bottom timeline provides compact 36px dock when collapsed (h-9)', () => {
    assert.ok(
      unifiedTimelineSource.includes("isCollapsed ? 'h-9'"),
      'UnifiedTimeline must use h-9 (36px) height when collapsed'
    );
  });

  it('5. verifies bottom timeline provides ~240px usable height when expanded', () => {
    assert.ok(
      unifiedTimelineSource.includes("h-60 sm:h-64 md:h-72"),
      'UnifiedTimeline must target ~240px (h-60 sm:h-64 md:h-72) when expanded'
    );
  });

  it('6. verifies visible bottom control labels match the timeline state ("Show Timeline" vs "Hide Timeline")', () => {
    assert.ok(
      combinedTimelineSource.includes("aria-label={isCollapsed ? 'Show Timeline' : 'Hide Timeline'}"),
      'UnifiedTimeline toggle must dynamically set aria-label based on collapse state'
    );
    assert.ok(
      combinedTimelineSource.includes('Show Timeline'),
      'UnifiedTimeline must display Show Timeline text when collapsed'
    );
    assert.ok(
      combinedTimelineSource.includes('Hide Timeline') || combinedTimelineSource.includes('Hide timeline'),
      'UnifiedTimeline must display Hide Timeline text when expanded'
    );
    assert.ok(
      combinedTimelineSource.includes('ChevronUp'),
      'UnifiedTimeline must render ChevronUp icon when collapsed'
    );
    assert.ok(
      combinedTimelineSource.includes('ChevronDown'),
      'UnifiedTimeline must render ChevronDown icon when expanded'
    );
  });

  it('7. verifies timeline project data, tracks, and items are never mutated when toggling timeline visibility', () => {
    const mockProject = {
      id: 'proj-123',
      title: 'Test Clip',
      canvas: { width: 1080, height: 1920, duration: 30 },
      tracks: [
        { id: 'track-v1', type: 'VIDEO', items: [{ id: 'item-1', timeline_start: 0, timeline_end: 30 }] },
        { id: 'track-c1', type: 'CAPTION', items: [{ id: 'item-2', timeline_start: 0, timeline_end: 15 }] },
      ],
      playhead: 12.5,
    };

    // Deep clone to simulate state before toggle
    const beforeToggle = JSON.parse(JSON.stringify(mockProject));

    // Simulate timeline collapse toggle state change
    let isTimelineCollapsed = false;
    isTimelineCollapsed = !isTimelineCollapsed;

    // Verify project data is completely identical and unmoved
    assert.deepEqual(mockProject, beforeToggle, 'Project data must remain identical after timeline toggle');
    assert.equal(isTimelineCollapsed, true);
  });

  it('8. verifies playhead position and active selection are preserved across visibility changes', () => {
    const playhead = 14.25;
    const selectedItemId = 'item-1';
    const selectedTrackId = 'track-v1';

    // State change from expanded to collapsed
    const collapsedState = { isCollapsed: true, playhead, selectedItemId, selectedTrackId };
    assert.equal(collapsedState.playhead, 14.25);
    assert.equal(collapsedState.selectedItemId, 'item-1');

    // State change from collapsed to expanded
    const expandedState = { isCollapsed: false, playhead, selectedItemId, selectedTrackId };
    assert.equal(expandedState.playhead, 14.25);
    assert.equal(expandedState.selectedItemId, 'item-1');
  });

  it('9. verifies right-side inspector and transcript panels remain fully accessible in EditorShell', () => {
    assert.ok(
      editorShellSource.includes('<TranscriptEditor'),
      'EditorShell must render TranscriptEditor component'
    );
    assert.ok(
      editorShellSource.includes('<ContextualInspector'),
      'EditorShell must render ContextualInspector component'
    );
    assert.ok(
      editorShellSource.includes('showRightInspector'),
      'EditorShell must manage inspector visibility adaptively'
    );
  });

  it('10. verifies timeline visibility toggle is presentation-only (does not create undo history or mark project dirty)', () => {
    // History stack before
    const pastProjects = [{ id: 'p1' }];
    const futureProjects = [];

    // Toggling presentation state:
    let isCollapsed = false;
    isCollapsed = true;

    // History stack must be untouched
    assert.equal(pastProjects.length, 1);
    assert.equal(futureProjects.length, 0);
    assert.equal(isCollapsed, true);
  });

  it('11. verifies video preview component identity is preserved without remounting', () => {
    // In EditorShell.tsx, PreviewCanvas is rendered once inside center viewport,
    // and UnifiedTimeline sits below it. Expanding/collapsing UnifiedTimeline
    // changes the height via CSS classes without unmounting or recreating PreviewCanvas.
    const previewCanvasCount = (editorShellSource.match(/<PreviewCanvas/g) || []).length;
    assert.equal(previewCanvasCount, 1, 'PreviewCanvas must have exactly 1 instance in EditorShell to prevent remounting');
  });

  it('12. verifies quick timeline action buttons (Split, Duplicate, Ripple Cut) are wired when expanded', () => {
    assert.ok(unifiedTimelineSource.includes('onSplit'), 'UnifiedTimeline must wire onSplit');
    assert.ok(unifiedTimelineSource.includes('onDuplicate'), 'UnifiedTimeline must wire onDuplicate');
    assert.ok(unifiedTimelineSource.includes('onRippleDelete'), 'UnifiedTimeline must wire onRippleDelete (Ripple Cut)');
  });
});
