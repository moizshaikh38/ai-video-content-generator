import { supabase } from '../lib/supabase';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      console.warn(
        '[Vireo API] VITE_API_URL is missing in environment variables! ' +
        'API calls are falling back to http://localhost:5000/api, which will fail from an HTTPS site. ' +
        'Please add VITE_API_URL in your Vercel Project Settings (e.g. https://your-backend.onrender.com/api).'
      );
    }
    return 'http://localhost:5000/api';
  }
  const clean = envUrl.replace(/\/+$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

export const apiBase = getApiBaseUrl();

export async function authToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in again.');
  return session.access_token;
}

let warmingTimer: ReturnType<typeof setTimeout> | null = null;
let activeRequestCount = 0;

function notifyWarming(warming: boolean): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vireo_server_warming', { detail: { warming } }));
  }
}

function startRequestTracker(): void {
  activeRequestCount++;
  if (activeRequestCount === 1) {
    warmingTimer = setTimeout(() => {
      notifyWarming(true);
    }, 2500);
  }
}

function stopRequestTracker(): void {
  activeRequestCount = Math.max(0, activeRequestCount - 1);
  if (activeRequestCount === 0) {
    if (warmingTimer) {
      clearTimeout(warmingTimer);
      warmingTimer = null;
    }
    notifyWarming(false);
  }
}

export async function backendRequest<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride || await authToken();
  startRequestTracker();
  try {
    const response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `Request failed (${response.status}).`) as Error & { code?: string; status?: number };
      error.code = data.code || data.error_code;
      error.status = response.status;
      Object.assign(error, data);
      throw error;
    }
    return data as T;
  } finally {
    stopRequestTracker();
  }
}
