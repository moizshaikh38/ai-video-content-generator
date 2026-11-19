import { AppError } from '../types/index.js';
export type StreamVideoSource = {
    provider: 'twitch';
    kind: 'clip' | 'vod';
    id: string;
    normalizedUrl: string;
} | {
    provider: 'kick';
    kind: 'clip' | 'vod';
    id: string;
    normalizedUrl: string;
};
/** Exact platform hosts and completed-source shapes, never channel/live pages. */
export function parseStreamVideoSource(url: URL): StreamVideoSource | null {
    const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
    const twitch = ['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'clips.twitch.tv'].includes(host), kick = ['kick.com', 'www.kick.com'].includes(host);
    if (!twitch && !kick)
        return null;
    if (url.username || url.password || url.port || url.protocol !== 'https:')
        throw new AppError('Use a standard HTTPS platform video link.', 400, 'INVALID_PLATFORM_URL');
    if (twitch) {
        const id = host === 'clips.twitch.tv' && parts.length === 1 ? parts[0] : parts.length === 3 && parts[1] === 'clip' ? parts[2] : null;
        if (id && /^[A-Za-z0-9_-]{1,200}$/.test(id))
            return { provider: 'twitch', kind: 'clip', id, normalizedUrl: 'https://clips.twitch.tv/' + id };
        if (parts.length === 2 && parts[0] === 'videos' && /^\d{1,30}$/.test(parts[1]))
            return { provider: 'twitch', kind: 'vod', id: parts[1], normalizedUrl: 'https://www.twitch.tv/videos/' + parts[1] };
    }
    else {
        const vod = parts.length === 3 && parts[1] === 'videos' && /^[a-f\d-]{16,64}$/i.test(parts[2]);
        const clip = url.searchParams.get('clip');
        if (vod)
            return { provider: 'kick', kind: 'vod', id: parts[2], normalizedUrl: 'https://kick.com/' + parts[0] + '/videos/' + parts[2] };
        if (parts.length === 1 && clip && /^[A-Za-z0-9_-]{1,200}$/.test(clip))
            return { provider: 'kick', kind: 'clip', id: clip, normalizedUrl: 'https://kick.com/' + parts[0] + '?clip=' + encodeURIComponent(clip) };
    }
    throw new AppError('Live streams and channel pages are not supported. Paste a completed video or clip link, or upload your own file.', 400, 'LIVE_SOURCE_NOT_SUPPORTED');
}
