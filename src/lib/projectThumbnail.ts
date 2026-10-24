import type React from 'react';
import type { Project } from '../types';

export function getProjectThumbnail(p: Project): string | null {
  if ((p as any).thumbnail_url) return (p as any).thumbnail_url;
  // Server-generated HD poster (uploaded videos), signed by the project API.
  if (p.poster_url) return p.poster_url;
  if ((p as any).thumbnail) return (p as any).thumbnail;
  if ((p as any).cover_url) return (p as any).cover_url;

  // URL ingestion keeps the YouTube id and original thumbnail in metadata (source_url is
  // the stored object key, not the YouTube link). Prefer the HD frame.
  const meta = p.metadata;
  if (meta?.youtube_video_id) return `https://i.ytimg.com/vi/${meta.youtube_video_id}/maxresdefault.jpg`;
  if (typeof meta?.thumbnail === 'string' && meta.thumbnail) return meta.thumbnail;

  const url = p.source_url || (p as any).url || (p as any).source_path;
  if (url && typeof url === 'string') {
    // Regex covers:
    // - https://www.youtube.com/watch?v=VIDEO_ID
    // - https://youtu.be/VIDEO_ID
    // - https://www.youtube.com/shorts/VIDEO_ID
    // - https://www.youtube.com/embed/VIDEO_ID
    // - https://www.youtube.com/live/VIDEO_ID
    const ytMatch = url.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    if (ytMatch && ytMatch[1]) {
      return `https://i.ytimg.com/vi/${ytMatch[1]}/maxresdefault.jpg`;
    }
  }
  return null;
}

/**
 * <img onError> for project thumbnails: YouTube has no maxres frame for some videos, so
 * step down to hqdefault once; after that hide the broken image (the gradient shows).
 */
export function handleThumbnailError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src.includes('/maxresdefault.')) {
    img.src = img.src.replace(/maxresdefault\.(jpg|webp)/, 'hqdefault.jpg');
    return;
  }
  img.style.visibility = 'hidden';
}

/** YouTube serves a 120×90 grey placeholder (HTTP 200) instead of 404 when maxres is missing. */
export function handleThumbnailLoad(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.naturalWidth <= 120 && img.src.includes('/maxresdefault.')) {
    img.src = img.src.replace(/maxresdefault\.(jpg|webp)/, 'hqdefault.jpg');
  }
}
