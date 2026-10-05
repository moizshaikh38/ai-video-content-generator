import { HealthCheckResponse } from '../types';
import { apiBase } from './backendClient';

export async function checkBackendHealth(): Promise<HealthCheckResponse> {
  try {
    const res = await fetch(`${apiBase}/health`);
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    console.error('Backend health check error:', error);
    return { status: 'error' };
  }
}
