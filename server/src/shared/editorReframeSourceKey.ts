interface ReframeClipSource {
  id?: string;
  start_seconds?: number;
  end_seconds?: number;
  source_storage_path?: string;
}

interface ReframeProjectSource {
  canvas: { aspect_ratio?: string };
  tracks: Array<{
    type: string;
    hidden?: boolean;
    items: Array<{
      hidden?: boolean;
      source_path?: string | null;
      source_start?: number;
      source_end?: number;
      speed?: { speed?: number };
    }>;
  }>;
}

/** Source data that changes server-side reframe validity. Does not include
 * playhead, captions, color, volume or other unrelated edits. Compute only
 * from a loaded snapshot or the successfully persisted save response pair. */
export function editorReframeSourceKey(clip: ReframeClipSource, project: ReframeProjectSource): string {
  const videoSources = project.tracks
    .filter(track => track.type === 'VIDEO' && !track.hidden)
    .flatMap(track => track.items.filter(item => !item.hidden).map(item => [
      item.source_path, item.source_start, item.source_end, item.speed?.speed || 1,
    ]));
  return JSON.stringify([
    clip.id, clip.start_seconds, clip.end_seconds, clip.source_storage_path,
    project.canvas.aspect_ratio, videoSources,
  ]);
}
