import React, { useEffect, useState } from 'react';
import { RenderedClip } from '../types';
import { backendRequest } from '../services/backendClient';

/** One poster request per clip per session; null means "none available". */
const posterRequests = new Map<string, Promise<string | null>>();

const fetchPoster = (clipId: string) => {
  let req = posterRequests.get(clipId);
  if (!req) {
    req = backendRequest<{ url: string }>(`/clips/${clipId}/poster`)
      .then((r) => r.url || null)
      .catch(() => null);
    posterRequests.set(clipId, req);
  }
  return req;
};

interface ClipThumbImageProps {
  clip: Pick<RenderedClip, 'id' | 'thumbnail_url'>;
  className?: string;
  alt?: string;
  /** Rendered while the poster loads and when the clip has none. */
  fallback?: React.ReactNode;
}

/**
 * Clip thumbnail: the signed poster from the clip list, or one generated on first view
 * (from the rendered 9:16 file, else the source window).
 */
export const ClipThumbImage: React.FC<ClipThumbImageProps> = ({ clip, className, alt, fallback = null }) => {
  const [poster, setPoster] = useState<string | null>(clip.thumbnail_url || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (clip.thumbnail_url) {
      setPoster(clip.thumbnail_url);
      return;
    }
    let alive = true;
    fetchPoster(clip.id).then((url) => alive && setPoster(url));
    return () => {
      alive = false;
    };
  }, [clip.id, clip.thumbnail_url]);

  if (!poster || failed) return <>{fallback}</>;
  return (
    <img
      src={poster}
      alt={alt ?? ''}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        // A signed URL from an old list response may have expired: ask for a fresh one once.
        posterRequests.delete(clip.id);
        if (poster === clip.thumbnail_url) fetchPoster(clip.id).then((url) => (url && url !== poster ? setPoster(url) : setFailed(true)));
        else setFailed(true);
      }}
    />
  );
};
