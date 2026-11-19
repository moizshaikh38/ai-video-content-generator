import React, { useEffect, useRef, useState } from 'react';
import { backendRequest } from '../../services/backendClient';
type Status = {
    configured: boolean;
    connected: boolean;
    account: {
        id: string;
        login: string;
    } | null;
};
/** Import-only consent. Does not connect an account until the creator chooses it. */
export function TwitchImportConnection({ userId }: {
    userId?: string;
}) {
    const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const owner = useRef(userId);
    owner.current = userId;
    const lock = useRef(false);
    useEffect(() => { let cancelled = false; setStatus(null); setBusy(false); setError(''); if (userId)
        backendRequest<{
            data: Status;
        }>('/imports/twitch/status').then(r => { if (!cancelled)
            setStatus(r.data); }).catch(() => { if (!cancelled)
            setError('Twitch connection status is unavailable. Your file upload still works.'); }); return () => { cancelled = true; }; }, [userId]);
    async function act(disconnect = false) { if (lock.current || !userId)
        return; lock.current = true; setBusy(true); setError(''); const current = userId; try {
        if (disconnect) {
            const result=await backendRequest<{data:{remoteRevocationConfirmed?:boolean}}>('/imports/twitch/disconnect', { method: 'POST' });
            if (owner.current === current) {
                setStatus(s => s ? { ...s, connected: false, account: null } : s);
                if(result.data?.remoteRevocationConfirmed===false)setError('Twitch is disconnected here. Remote access revocation could not be confirmed. You can remove VireoClip in your Twitch connection settings.');
            }
        }
        else {
            const r = await backendRequest<{
                data: {
                    authorizationUrl: string;
                };
            }>('/imports/twitch/connect', { method: 'POST' });
            if (owner.current !== current)
                return;
            const u = new URL(r.data.authorizationUrl);
            if (u.origin !== 'https://id.twitch.tv' || u.pathname !== '/oauth2/authorize' || u.username || u.password)
                throw Error('Unexpected Twitch sign-in address.');
            window.location.assign(u.toString());
        }
    }
    catch (e: any) {
        if (owner.current === current)
            setError(e.message || 'Twitch connection could not be changed.');
    }
    finally {
        lock.current = false;
        if (owner.current === current)
            setBusy(false);
    } }
    return <section aria-label="Twitch clip import" className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-vc-text-primary">Twitch clips</p><p className="mt-1 text-xs leading-relaxed text-vc-text-secondary">{status?.connected ? `Connected: ${status.account?.login || 'your channel'}. Import clips from this channel.` : 'Connect your channel to import its completed clips. Twitch asks for channel clip-management access.'}</p></div>
  {status?.connected ? <button type="button" disabled={busy} onClick={() => act(true)} className="rounded-lg border border-white/20 px-3 py-2 text-xs text-vc-text-primary disabled:opacity-50">{busy ? 'Disconnecting...' : 'Disconnect Twitch'}</button> : <button type="button" disabled={busy || !status?.configured || !userId} onClick={() => act()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Opening Twitch...' : 'Connect Twitch'}</button>}</div>
  {status && !status.configured && <p className="mt-2 text-xs text-amber-300">Twitch connection is not configured on this server. Upload your downloaded file instead.</p>}
  <p className="mt-2 text-xs leading-relaxed text-vc-text-secondary">Twitch VOD and Kick link downloads are not available yet. Upload a file you are allowed to use. Live streams are not supported.</p>
  {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
 </section>;
}
