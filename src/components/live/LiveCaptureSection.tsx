import React, { useCallback, useEffect, useRef, useState } from 'react';
import { backendRequest, authToken, apiBase } from '../../services/backendClient';

type Capabilities = {
  enabled: boolean;
  previewOnly: boolean;
  processLocal: boolean;
  maxDurationSeconds: number;
  providers: string[];
  formats: string;
  verifiedProviders: string[];
};

type LiveSession = {
  id: string;
  state: 'resolving' | 'capturing' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  seconds: number;
  bytes: number;
  title?: string;
  error?: { code: string; message: string };
  result?: { bytes: number; requestedSeconds: number; availableSeconds: number };
  downloadPath?: string;
};

const fmtBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export const LiveCaptureSection: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [capsError, setCapsError] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState('60');
  const [quality, setQuality] = useState('720');
  const [session, setSession] = useState<LiveSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || caps) return;
    backendRequest<Capabilities>('/live-captures/capabilities')
      .then(setCaps)
      .catch((e) => setCapsError(e?.message || 'Live capture is not available from this server.'));
  }, [open, caps]);

  const stopPoll = () => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };
  useEffect(() => stopPoll, []);

  const refresh = useCallback(async (id: string) => {
    try {
      const res = await backendRequest<{ session: LiveSession }>(`/live-captures/${id}`);
      setSession(res.session);
      if (res.session.state !== 'resolving' && res.session.state !== 'capturing') stopPoll();
    } catch (e: any) {
      stopPoll();
      setError(e?.message || 'Lost track of this capture session.');
    }
  }, []);

  const start = async () => {
    setError(null);
    const seconds = Number(duration);
    if (!url.trim()) { setError('Paste a live stream URL first.'); return; }
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > (caps?.maxDurationSeconds ?? 120)) {
      setError(`Choose an explicit duration between 5 and ${caps?.maxDurationSeconds ?? 120} seconds.`);
      return;
    }
    setBusy(true);
    try {
      const res = await backendRequest<{ session: LiveSession }>('/live-captures', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim(), start: 'now', durationSeconds: seconds, maxHeight: Number(quality) }),
      });
      setSession(res.session);
      stopPoll();
      pollRef.current = window.setInterval(() => refresh(res.session.id), 2000);
    } catch (e: any) {
      setError(e?.message || 'Capture could not be started.');
    } finally {
      setBusy(false);
    }
  };

  const stopCapture = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await backendRequest<{ session: LiveSession }>(`/live-captures/${session.id}/stop`, { method: 'POST' });
      setSession(res.session);
      stopPoll();
    } catch (e: any) {
      setError(e?.message || 'Could not stop the capture.');
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await backendRequest(`/live-captures/${session.id}`, { method: 'DELETE' });
      setSession(null);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Could not discard this capture.');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!session?.result) return;
    setBusy(true);
    try {
      const token = await authToken();
      if (!session.downloadPath) throw new Error('Completed live capture is not available.');
      const downloadPath = session.downloadPath.replace(/^\/api(?=\/)/, '');
      const res = await fetch(`${apiBase}${downloadPath}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Completed live capture is not available.');
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `live-capture-${session.id}.mp4`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e: any) {
      setError(e?.message || 'Download failed.');
    } finally {
      setBusy(false);
    }
  };

  const active = session && (session.state === 'resolving' || session.state === 'capturing');

  return (
    <section aria-label="Live capture preview" className="pt-1">
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-3 sm:px-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          <span>Record a live stream moment (local preview)</span>
          <span className="text-[11px] text-zinc-500">{open ? 'Hide' : 'Show'}</span>
        </button>
        {open && (
          <div className="mt-3 text-left space-y-3">
            {capsError && <p className="text-xs text-red-300">{capsError}</p>}
            {caps && !caps.enabled && (
              <p className="text-xs text-zinc-400">
                Live capture is not active on this server. It is available only in an explicitly enabled local preview, never in production.
              </p>
            )}
            {caps?.enabled && (
              <>
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  Captures only what the stream publishes after you press Start. No rewind, no automatic watching, no auto-transcription. Kick, YouTube and Twitch live links are experimental in this preview and a stream may fail to start. Status lives on this server only and does not survive a restart.
                </p>
                <div className="space-y-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Live stream URL (paste never starts a capture)"
                    className="w-full rounded-xl bg-zinc-950/60 border border-zinc-800 px-3 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      Duration (s)
                      <input
                        type="number"
                        min={5}
                        max={caps.maxDurationSeconds}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-20 rounded-lg bg-zinc-950/60 border border-zinc-800 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      />
                    </label>
                    <label className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      Quality
                      <select
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                        className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-2 py-1.5 text-xs text-white focus:outline-none focus:border-violet-500"
                      >
                        <option value="720">720p</option>
                        <option value="480">480p</option>
                        <option value="360">360p</option>
                      </select>
                    </label>
                    {!active && (
                      <button
                        type="button"
                        onClick={start}
                        disabled={busy}
                        className="ml-auto rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-4 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
                      >
                        Start capture
                      </button>
                    )}
                    {active && (
                      <button
                        type="button"
                        onClick={stopCapture}
                        disabled={busy}
                        className="ml-auto rounded-full bg-red-600/80 hover:bg-red-500 disabled:opacity-50 px-4 py-1.5 text-xs font-bold text-white transition-colors cursor-pointer"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
            {error && <p className="text-xs text-red-300">{error}</p>}
            {session && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 space-y-1.5">
                <p className="text-xs text-zinc-300">
                  Status: <span className="font-semibold text-white capitalize">{session.state}</span>
                  {session.title ? <span className="text-zinc-500"> · {session.title}</span> : null}
                </p>
                {(session.state === 'capturing' || session.state === 'resolving') && (
                  <p className="text-[11px] text-zinc-500">{session.seconds.toFixed(1)}s · {fmtBytes(session.bytes)} captured</p>
                )}
                {session.state === 'failed' && session.error && (
                  <p className="text-[11px] text-red-300">{session.error.message}</p>
                )}
                {session.state === 'cancelled' && (
                  <p className="text-[11px] text-zinc-500">Stopped. No partial video was kept.</p>
                )}
                {session.state === 'completed' && session.result && (
                  <p className="text-[11px] text-zinc-500">
                    {session.result.availableSeconds.toFixed(1)}s saved ({fmtBytes(session.result.bytes)}). Kept until you discard it.
                  </p>
                )}
                {session.state !== 'completed' && session.state !== 'cancelled' && session.state !== 'failed' && (
                  <p className="text-[11px] text-zinc-600">If left unfinished, this session expires 30 minutes after it started.</p>
                )}
                <div className="flex items-center gap-2 pt-1">
                  {session.state === 'completed' && session.result && (
                    <button
                      type="button"
                      onClick={download}
                      disabled={busy}
                      className="rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 px-3.5 py-1.5 text-[11px] font-bold text-white transition-colors cursor-pointer"
                    >
                      Download MP4
                    </button>
                  )}
                  {!active && (
                    <button
                      type="button"
                      onClick={discard}
                      disabled={busy}
                      className="rounded-full border border-zinc-700 hover:border-zinc-500 disabled:opacity-50 px-3.5 py-1.5 text-[11px] font-semibold text-zinc-300 transition-colors cursor-pointer"
                    >
                      Discard
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default LiveCaptureSection;
