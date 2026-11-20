import { supabase } from './supabase';
import { getCurrentAuthOwner, ownerMismatch } from './authOwner';

export class AccountChangedError extends Error {
  constructor() { super('You are signed in as a different account now. Some changes may already have reached the previous account. Your edits for it are kept on this device.'); }
}
/**
 * Resolve an access token that is verified to belong to `owner` at resolution time, and return it for use as an explicit
 * per-request override (which also disables the 401 retry that would otherwise adopt whatever session is current).
 * Throws AccountChangedError when the live provider account or the resolved session is not `owner`.
 */
export async function tokenForOwner(owner: string): Promise<string> {
  if (ownerMismatch(owner, getCurrentAuthOwner())) throw new AccountChangedError();
  let { data: { session } } = await supabase.auth.getSession();
  if (session?.expires_at && session.expires_at - Math.floor(Date.now() / 1000) < 60) {
    try { const r = await supabase.auth.refreshSession(); if (!r.error && r.data?.session) session = r.data.session; } catch { /* keep current */ }
  }
  if (!session?.access_token) throw new Error('Please sign in again.');
  if (ownerMismatch(owner, session.user?.id) || ownerMismatch(owner, getCurrentAuthOwner())) throw new AccountChangedError();
  return session.access_token;
}
