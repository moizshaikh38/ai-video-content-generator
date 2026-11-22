import { supabase } from '../lib/supabase';
import { getCurrentAuthOwner } from '../lib/authOwner';

export const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const changedAccount = () => Object.assign(new Error('The signed-in account changed. Load this page again.'), {
  name: 'AuthContextChangedError', code: 'AUTH_CONTEXT_CHANGED',
});

/** Initial auth restoration may not have published a UI owner yet. Automatic
 * auth still binds to the session principal; explicit-token callers without a
 * known UI owner retain their existing startup behavior. */
function assertRequestOwner(initialOwner: string | undefined, principal?: string): void {
  const currentOwner = getCurrentAuthOwner();
  if ((initialOwner !== undefined && currentOwner !== initialOwner)
    || (principal !== undefined && currentOwner !== undefined && currentOwner !== principal)) {
    throw changedAccount();
  }
}

async function sessionAuth(): Promise<{ token: string; principal: string }> {
  const initialOwner = getCurrentAuthOwner();
  const { data: { session } } = await supabase.auth.getSession();
  assertRequestOwner(initialOwner);
  if (!session?.access_token || !session.user?.id) throw new Error('Please sign in again.');
  const principal = session.user.id;
  assertRequestOwner(initialOwner, principal);
  let token = session.access_token;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - nowInSeconds < 60) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      assertRequestOwner(initialOwner, principal);
      if (!error && refreshed?.session?.access_token) {
        if (refreshed.session.user?.id !== principal) throw changedAccount();
        token = refreshed.session.access_token;
      }
    } catch (error: any) {
      if (error?.code === 'AUTH_CONTEXT_CHANGED') throw error;
      assertRequestOwner(initialOwner, principal);
      // Same-account network failure retains the existing token fallback.
    }
  }
  assertRequestOwner(initialOwner, principal);
  return { token, principal };
}

export async function authToken(): Promise<string> {
  const initialOwner = getCurrentAuthOwner();
  const auth = await sessionAuth();
  assertRequestOwner(initialOwner, auth.principal);
  return auth.token;
}

export async function backendRequest<T>(path: string, options: RequestInit = {}, tokenOverride?: string): Promise<T> {
  const initialOwner = getCurrentAuthOwner();
  const auth = tokenOverride ? { token: tokenOverride, principal: initialOwner } : await sessionAuth();
  let token = auth.token;
  const verifyOwner = () => assertRequestOwner(initialOwner, auth.principal);
  verifyOwner();

  const makeFetch = async (bearerToken: string) => {
    verifyOwner();
    return fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  };

  let response = await makeFetch(token);
  verifyOwner();

  // Refresh may renew a token, never change the account of the original request.
  if (response.status === 401 && !tokenOverride) {
    try {
      const { data: refreshed, error } = await supabase.auth.refreshSession();
      verifyOwner();
      if (!error && refreshed?.session?.access_token) {
        if (refreshed.session.user?.id !== auth.principal) throw changedAccount();
        token = refreshed.session.access_token;
        response = await makeFetch(token);
        verifyOwner();
      }
    } catch (error: any) {
      if (error?.code === 'AUTH_CONTEXT_CHANGED') throw error;
      verifyOwner();
      // Let standard error handling handle the original same-account response.
    }
  }

  const data = await response.json().catch(() => ({}));
  verifyOwner();
  if (!response.ok) {
    const error = new Error(data.message || `Request failed (${response.status}).`) as Error & { code?: string; status?: number; retryAfter?: number };
    error.code = data.code || data.error_code;
    error.status = response.status;
    const retryHeader = response.headers.get('retry-after');
    if (retryHeader) error.retryAfter = parseInt(retryHeader, 10);
    Object.assign(error, data);
    throw error;
  }
  return data as T;
}
