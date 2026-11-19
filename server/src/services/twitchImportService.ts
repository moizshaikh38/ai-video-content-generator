import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import { config } from '../config/index.js';
import { encryptToken, decryptToken } from '../utils/tokenEncryption.js';
import { AppError } from '../types/index.js';
const fail = (message: string, code = 'TWITCH_IMPORT_CONNECTION_REQUIRED', status = 409) => new AppError(message, status, code);
const scope = 'channel:manage:clips';
const hash = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
/** Import-only identity, separate from publishing. No shared server token,
 * automatic account linking, arbitrary callbacks, paid fallback or token logs. */
export class TwitchImportService {
    static settings() { return { clientId: config.twitchImportClientId, secret: config.twitchImportClientSecret, redirect: config.twitchImportRedirectUri }; }
    static configured() { const s = this.settings(); try {
        const u = new URL(s.redirect);
        return Boolean(s.clientId && s.secret && (u.protocol === 'https:' || (!config.isProduction && u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))));
    }
    catch {
        return false;
    } }
    static async db() { const db = await getMongoDb(); await db.collection('import_oauth_states').createIndex({ state_hash: 1 }, { unique: true }); await db.collection('import_oauth_states').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }); await db.collection('import_connections').createIndex({ user_id: 1, provider: 1 }, { unique: true }); return db; }
    static requireConfig() { if (!this.configured())
        throw fail('Twitch clip import is not configured. Upload your downloaded video file instead.', 'TWITCH_IMPORT_NOT_CONFIGURED', 409); }
    static async request(url: string, init: RequestInit = {}) {
        let response: Response;
        try {
            response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
        }
        catch {
            throw fail('Twitch is temporarily unavailable. Try again later.', 'TWITCH_IMPORT_UNAVAILABLE', 502);
        }
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 429)
                throw fail('Twitch rate limit reached. Try again later.', 'TWITCH_IMPORT_RATE_LIMITED', 429);
            if ([400, 401, 403].includes(response.status))
                throw fail('Reconnect Twitch with clip-management access for your channel.', 'TWITCH_IMPORT_AUTH_REQUIRED', 409);
            throw fail('Twitch could not provide this clip.', 'TWITCH_IMPORT_UNAVAILABLE', 502);
        }
        if (response.status === 204)
            return {};
        const reader = response.body?.getReader();
        if (!reader)
            throw fail('Twitch returned an unexpected response.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502);
        let size = 0;
        const chunks: Uint8Array[] = [];
        try {
            while (true) {
                const part = await reader.read();
                if (part.done)
                    break;
                size += part.value.byteLength;
                if (size > 1024 * 1024)
                    throw fail('Twitch returned an unexpected response.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502);
                chunks.push(part.value);
            }
        }
        finally {
            await reader.cancel();
        }
        const text = Buffer.concat(chunks).toString('utf8');
        try {
            return text.trim() ? JSON.parse(text) : {};
        }
        catch {
            throw fail('Twitch returned an unexpected response.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502);
        }
    }
    static async begin(userId: string) { this.requireConfig(); const db = await this.db(), state = crypto.randomBytes(32).toString('hex'), s = this.settings(); await db.collection('import_connections').updateOne({ user_id: userId, provider: 'twitch' }, { $set: { pending_state_hash: hash(state) }, $setOnInsert: { status: 'disconnected' } }, { upsert: true }); await db.collection('import_oauth_states').insertOne({ state_hash: hash(state), provider: 'twitch', user_id: userId, redirect_uri: s.redirect, expires_at: new Date(Date.now() + 600000), consumed_at: null }); const u = new URL('https://id.twitch.tv/oauth2/authorize'); u.search = new URLSearchParams({ client_id: s.clientId, redirect_uri: s.redirect, response_type: 'code', scope, state, force_verify: 'true' }).toString(); return { authorizationUrl: u.toString() }; }
    static async validate(token: string) { const data = await this.request('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: 'OAuth ' + token } }); if (data.client_id !== this.settings().clientId || !/^\d+$/.test(data.user_id) || !Array.isArray(data.scopes) || !data.scopes.includes(scope) || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
        throw fail('Reconnect Twitch with channel clip-management access.'); return data; }
    static async finish(state: string, code?: string, denied = false) { this.requireConfig(); if (!/^[a-f0-9]{64}$/.test(state))
        throw fail('Twitch sign-in expired. Start again.', 'IMPORT_OAUTH_STATE_REJECTED', 400); const db = await this.db(), row = await db.collection('import_oauth_states').findOneAndUpdate({ provider: 'twitch', state_hash: hash(state), consumed_at: null, expires_at: { $gt: new Date() } }, { $set: { consumed_at: new Date() } }, { returnDocument: 'after' }); if (!row)
        throw fail('Twitch sign-in expired or was already used. Start again.', 'IMPORT_OAUTH_STATE_REJECTED', 400); if (denied)
        throw fail('Twitch connection was not approved.', 'IMPORT_OAUTH_DENIED', 400); if (!code || code.length > 2048)
        throw fail('Missing Twitch authorization code.', 'IMPORT_OAUTH_CODE_REQUIRED', 400); const s = this.settings(), tokens = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: s.clientId, client_secret: s.secret, code, grant_type: 'authorization_code', redirect_uri: row.redirect_uri }).toString() }); if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string')
        throw fail('Twitch returned an incomplete connection.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502); const who = await this.validate(tokens.access_token); const stored = await db.collection('import_connections').updateOne({ user_id: row.user_id, provider: 'twitch', pending_state_hash: row.state_hash }, { $unset: { pending_state_hash: '' }, $set: { provider_account_id: who.user_id, login: String(who.login || ''), access_token: encryptToken(tokens.access_token), refresh_token: encryptToken(tokens.refresh_token), status: 'connected', expires_at: new Date(Date.now() + who.expires_in * 1000), updated_at: new Date() } }); if (stored.matchedCount !== 1) {
        try {
            await this.request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: s.clientId, token: tokens.access_token }).toString() });
        }
        catch { /* Rejected authorization is never stored locally. */ }
        throw fail('Twitch connection changed. Start again.', 'IMPORT_OAUTH_STATE_REJECTED', 409);
    } return { connected: true }; }
    static async status(userId: string) { const db = await this.db(), row = await db.collection('import_connections').findOne({ user_id: userId, provider: 'twitch' }); return { configured: this.configured(), connected: row?.status === 'connected', account: row?.status === 'connected' ? { id: row.provider_account_id, login: row.login } : null }; }
    static async disconnect(userId: string) { const db = await this.db(), row = await db.collection('import_connections').findOneAndUpdate({ user_id: userId, provider: 'twitch' }, { $set: { status: 'disconnected', updated_at: new Date() }, $unset: { pending_state_hash: '', access_token: '', refresh_token: '', expires_at: '', provider_account_id: '', login: '' } }, { returnDocument: 'before' }); await db.collection('import_oauth_states').deleteMany({ user_id: userId, provider: 'twitch' }); if (row?.access_token && this.configured()) {
        try {
            const s = this.settings();
            await this.request('https://id.twitch.tv/oauth2/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: s.clientId, token: decryptToken(row.access_token) }).toString() });
        }
        catch { /* Local unlink remains effective even if remote revocation is unavailable. */
            return { disconnected: true, remoteRevocationConfirmed: false };
        }
    } return { disconnected: true, remoteRevocationConfirmed: Boolean(row) }; }
    static async credentials(userId: string) { this.requireConfig(); const db = await this.db(), row = await db.collection('import_connections').findOne({ user_id: userId, provider: 'twitch', status: 'connected' }); if (!row)
        throw fail('Connect your Twitch channel to import its clips, or upload your downloaded file.'); let token = decryptToken(row.access_token); if (new Date(row.expires_at).getTime() <= Date.now() + 60000) {
        const s = this.settings(), tokens = await this.request('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: s.clientId, client_secret: s.secret, grant_type: 'refresh_token', refresh_token: decryptToken(row.refresh_token) }).toString() });
        if (typeof tokens.access_token !== 'string' || typeof tokens.refresh_token !== 'string')
            throw fail('Reconnect Twitch to import clips.');
        token = tokens.access_token;
        const who = await this.validate(token);
        if (who.user_id !== row.provider_account_id)
            throw fail('Twitch connection identity changed. Reconnect.');
        const updated = await db.collection('import_connections').updateOne({ _id: row._id, access_token: row.access_token, status: 'connected' }, { $set: { access_token: encryptToken(token), refresh_token: encryptToken(tokens.refresh_token), expires_at: new Date(Date.now() + who.expires_in * 1000), updated_at: new Date() } });
        if (updated.modifiedCount !== 1)
            throw fail('Twitch connection changed. Try again.');
    } const who = await this.validate(token); if (who.user_id !== row.provider_account_id)
        throw fail('Twitch connection identity changed. Reconnect.'); return { token, userId: who.user_id }; }
    static async clip(userId: string, id: string) { if (!/^[A-Za-z0-9_-]{1,200}$/.test(id))
        throw fail('Invalid Twitch clip link.', 'INVALID_PLATFORM_URL', 400); const auth = await this.credentials(userId), headers = { Authorization: 'Bearer ' + auth.token, 'Client-Id': this.settings().clientId }; const clips = await this.request('https://api.twitch.tv/helix/clips?' + new URLSearchParams({ id }), { headers }), clip = Array.isArray(clips.data) ? clips.data.find((c: any) => c.id === id) : null; if (!clip || clip.broadcaster_id !== auth.userId)
        throw fail('Import clips from your connected Twitch channel, or upload a file you are allowed to use.', 'TWITCH_IMPORT_NOT_OWNED', 403); if (!(typeof clip.duration === 'number' && clip.duration > 0 && clip.duration <= 7200))
        throw fail('Twitch clip duration is unavailable.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502); const files = await this.request('https://api.twitch.tv/helix/clips/downloads?' + new URLSearchParams({ editor_id: auth.userId, broadcaster_id: clip.broadcaster_id, clip_id: id }), { headers }); const file = Array.isArray(files.data) ? files.data.find((f: any) => f.clip_id === id) : null; const media = file?.landscape_download_url || file?.portrait_download_url; let u: URL; try {
        u = new URL(media);
    }
    catch {
        throw fail('Twitch could not provide a downloadable clip.', 'TWITCH_IMPORT_NO_MEDIA', 409);
    } if (u.protocol !== 'https:' || u.username || u.password || u.port || !(u.hostname === 'twitchcdn.net' || u.hostname.endsWith('.twitchcdn.net')))
        throw fail('Twitch returned an unexpected media address.', 'TWITCH_IMPORT_INVALID_RESPONSE', 502); return { url: u.toString(), title: String(clip.title || 'Twitch clip').slice(0, 255), duration: clip.duration, channel: String(clip.broadcaster_name || ''), thumbnail: typeof clip.thumbnail_url === 'string' ? clip.thumbnail_url : undefined }; }
}
