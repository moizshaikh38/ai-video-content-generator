/** Local edits and acknowledged saved revisions both invalidate a completed
 * export. Timestamps are only a compatibility fallback for legacy records. */
export function editorExportStale(input: {
  clip: {render_status?: string; rendered_editor_version?: number | null; rendered_editor_saved_at?: string | null; editor_project_sync_pending?: unknown} | null;
  project: {version?: number; updated_at?: string; created_at?: string};
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
}): boolean {
  const {clip, project, saveStatus} = input;
  if (!clip || clip.render_status !== 'ready') return false;
  if (saveStatus !== 'saved' || clip.editor_project_sync_pending) return true;
  const rendered = clip.rendered_editor_version;
  if (Number.isSafeInteger(rendered) && Number(rendered) > 0 &&
      Number.isSafeInteger(project.version) && Number(project.version) > 0) {
    return rendered !== project.version;
  }
  return Boolean(clip.rendered_editor_saved_at && project.updated_at &&
    project.updated_at !== project.created_at && project.updated_at > clip.rendered_editor_saved_at);
}
