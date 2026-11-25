export type DatabaseBootstrapState = 'pending' | 'ready' | 'failed' | 'unconfigured';

// A reachable database is not enough: required collection/index setup must finish
// before this process advertises readiness to a deployment health check.
let state: DatabaseBootstrapState = 'pending';

export function setDatabaseBootstrapState(next: DatabaseBootstrapState): void {
  state = next;
}

export function getDatabaseBootstrapState(): DatabaseBootstrapState {
  return state;
}

export function isDatabaseBootstrapReady(): boolean {
  return state === 'ready';
}
