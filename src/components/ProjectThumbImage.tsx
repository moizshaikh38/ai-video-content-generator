import React, { useEffect, useState } from 'react';
import { Project } from '../types';
import { backendRequest } from '../services/backendClient';
import { getProjectThumbnail, handleThumbnailError, handleThumbnailLoad } from '../lib/projectThumbnail';

/** One poster request per project per session; null means "none available". */
const posterRequests = new Map<string, Promise<string | null>>();

const fetchPoster = (projectId: string) => {
  let req = posterRequests.get(projectId);
  if (!req) {
    req = backendRequest<{ url: string }>(`/projects/${projectId}/poster`)
      .then((r) => r.url || null)
      .catch(() => null);
    posterRequests.set(projectId, req);
  }
  return req;
};

const READY_FOR_POSTER = ['uploaded', 'queued', 'processing', 'transcribing', 'analyzing', 'generating', 'transcribed', 'completed', 'complete'];

interface ProjectThumbImageProps {
  project: Project;
  className?: string;
  alt?: string;
  /** Rendered when the project has no thumbnail at all. */
  fallback?: React.ReactNode;
}

/**
 * Project thumbnail: YouTube HD frame for link projects, server HD poster for uploads.
 * Uploads without a poster yet ask the server once, which generates it on demand.
 */
export const ProjectThumbImage: React.FC<ProjectThumbImageProps> = ({ project, className, alt, fallback = null }) => {
  const direct = getProjectThumbnail(project);
  const [poster, setPoster] = useState<string | null>(null);
  const status = project.video_status || project.status;
  const wantsPoster = !direct && project.source_type === 'upload' && READY_FOR_POSTER.includes(status);

  useEffect(() => {
    if (!wantsPoster) return;
    let alive = true;
    fetchPoster(project.id).then((url) => alive && setPoster(url));
    return () => {
      alive = false;
    };
  }, [project.id, wantsPoster]);

  const src = direct || poster;
  if (!src) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={className}
      loading="lazy"
      decoding="async"
      onLoad={handleThumbnailLoad}
      onError={handleThumbnailError}
    />
  );
};
