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

export async function backendRequest<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const token = tokenOverride || await authToken();
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
}
