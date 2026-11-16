/** Staged policy only. No reader, job or renderer may delete or lock from this metadata. */
export interface ProjectRetentionPolicy {
  version: 1;
  enforcement: 'disabled';
  planAtCreation: string;
  createdAt: string;
  /** Proposed Free deadline, not an active deletion schedule. Never backfill legacy projects. */
  proposedExpiresAt: string | null;
}
export const FREE_PROJECT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;

export function createProjectRetention(planAtCreation: string, createdAt: string): ProjectRetentionPolicy {
  const ms = Date.parse(createdAt);
  if (!Number.isFinite(ms)) throw new Error('Project retention requires a valid creation time');
  return {
    version: 1,
    enforcement: 'disabled',
    planAtCreation,
    createdAt: new Date(ms).toISOString(),
    proposedExpiresAt: planAtCreation === 'free'
      ? new Date(ms + FREE_PROJECT_RETENTION_MS).toISOString() : null,
  };
}

/** Intentionally does not infer current billing, downgrade grace, access or deletion. */
export function projectRetentionNotice(policy?: ProjectRetentionPolicy | null, nowMs = Date.now()): string | null {
  if (!policy || policy.version !== 1 || policy.enforcement !== 'disabled' || policy.planAtCreation !== 'free') return null;
  const deadline = Date.parse(policy.proposedExpiresAt || '');
  if (!Number.isFinite(deadline)) return null;
  return deadline <= nowMs
    ? 'Planned Free retention window ended. Automatic removal is not enabled; this project remains available.'
    : 'Planned Free retention: 3 days from creation. Automatic removal is not enabled.';
}
