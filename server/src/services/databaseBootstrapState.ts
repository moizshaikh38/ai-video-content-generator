export type DatabaseBootstrapState = 'pending' | 'ready' | 'failed';

// A reachable database is not enough: required collection/index setup must finish
// before this process advertises readiness to a deployment health check.
let state: DatabaseBootstrapState = 'pending';

export function setDatabaseBootstrapState(next: DatabaseBootstrapState): void {
  state = next;
}

export function isDatabaseBootstrapReady(): boolean {
  return state === 'ready';
}
