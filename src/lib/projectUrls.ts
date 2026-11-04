/**
 * URL helper for external-facing project references.
 * Uses `public_id` when available (short, opaque, no info leaked); falls back
 * to the internal UUID for existing records that predate the public-ID system.
 */

export function projectUrlId(project: { id: string; public_id?: string | null }): string {
  return project.public_id || project.id;
}

export function projectPath(project: { id: string; public_id?: string | null }): string {
  return `/projects/${projectUrlId(project)}`;
}
