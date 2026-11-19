import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parseStreamVideoSource as parse } from '../shared/streamVideoSource.js';
test('exact Twitch clip and VOD URLs normalize without arbitrary destinations', () => { assert.deepEqual(parse(new URL('https://www.twitch.tv/person/clip/SomeClip_1?t=3')), { provider: 'twitch', kind: 'clip', id: 'SomeClip_1', normalizedUrl: 'https://clips.twitch.tv/SomeClip_1' }); assert.equal(parse(new URL('https://clips.twitch.tv/Clip-1'))?.kind, 'clip'); assert.equal(parse(new URL('https://www.twitch.tv/videos/1234'))?.id, '1234'); assert.equal(parse(new URL('https://twitch.tv.attacker.invalid/clip')), null); for (const u of ['https://twitch.tv/channel', 'https://kick.com/channel', 'https://www.twitch.tv/directory', 'https://clips.twitch.tv/', 'https://kick.com/channel?clip=bad%2Fpath'])
    assert.throws(() => parse(new URL(u))); for (const u of ['http://clips.twitch.tv/Foo', 'https://user:pass@clips.twitch.tv/Foo', 'https://clips.twitch.tv:444/Foo'])
    assert.throws(() => parse(new URL(u))); });
test('Kick IDs stay classified but do not imply a download capability', () => { assert.equal(parse(new URL('https://kick.com/channel?clip=clip_abc'))?.kind, 'clip'); assert.equal(parse(new URL('https://kick.com/channel/videos/12345678-abcd-1234-abcd-123456789abc'))?.kind, 'vod'); });
test('local OAuth and official Twitch clip adapter enforce one-time state, encrypted per-user identity and signed-media constraints', {skip: !process.env.TWITCH_IMPORT_TEST_MONGODB_URI}, async () => {
    Object.assign(process.env, { NODE_ENV: 'test', MONGODB_URI: process.env.TWITCH_IMPORT_TEST_MONGODB_URI!, MONGODB_DB_NAME: 'vireo_twitch_import_test_' + crypto.randomUUID().replaceAll('-', ''), SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_SECRET_KEY: 'fixture' });
    const { config } = await import('../config/index.js');
    Object.assign(config, { twitchImportClientId: 'fixture-client', twitchImportClientSecret: 'fixture-secret', twitchImportRedirectUri: 'http://localhost:5000/api/imports/twitch/callback' });
    const { getMongoDb, closeMongo } = await import('../db/mongoClient.js'), { TwitchImportService: S } = await import('../services/twitchImportService.js'), { UrlIngestionService: I } = await import('../services/urlIngestionService.js');
    const db = await getMongoDb(), fetchOriginal = globalThis.fetch, user = crypto.randomUUID(), other = crypto.randomUUID();
    let calls: string[] = [], who = '123', broadcaster = '123', client = 'fixture-client', granted = true, status = 200, media = 'https://production.assets.clips.twitchcdn.net/fixture.mp4', refreshes = 0;
    globalThis.fetch = async (input: any, init: any) => { const u = new URL(String(input)); calls.push(u.origin + u.pathname); assert.equal(init.redirect, 'error'); assert(['id.twitch.tv', 'api.twitch.tv'].includes(u.hostname)); if (status !== 200)
        return new Response('{}', { status }); let data: any; if (u.pathname === '/oauth2/token') {
        const params = new URLSearchParams(init.body);
        assert.equal(params.get('client_secret'), 'fixture-secret');
        if (params.get('grant_type') === 'refresh_token')
            refreshes++;
        else
            assert.equal(params.get('redirect_uri'), config.twitchImportRedirectUri);
        data = { access_token: 'fixture-access-' + refreshes, refresh_token: 'fixture-refresh-' + refreshes };
    }
    else if (u.pathname === '/oauth2/validate') {
        data = { client_id: client, user_id: who, login: 'fixture-channel', scopes: granted ? ['channel:manage:clips'] : [], expires_in: 3600 };
    }
    else if (u.pathname === '/helix/clips') {
        assert.equal(u.searchParams.get('id'), 'FixtureClip');
        data = { data: [{ id: 'FixtureClip', broadcaster_id: broadcaster, title: 'Local API clip', duration: 4.3, broadcaster_name: 'Fixture', thumbnail_url: 'https://static-cdn.jtvnw.net/fixture.jpg' }] };
    }
    else if (u.pathname === '/helix/clips/downloads') {
        assert.equal(u.searchParams.get('editor_id'), '123');
        assert.equal(u.searchParams.get('broadcaster_id'), '123');
        data = { data: [{ clip_id: 'FixtureClip', landscape_download_url: media, portrait_download_url: null }] };
    }
    else if (u.pathname === '/oauth2/revoke')
        return new Response(null, { status: 204 });
    else
        throw Error('Unexpected mock request'); return Response.json(data); };
    try {
        assert.equal((await db.listCollections().toArray()).length, 0);
        assert.equal((await S.status(user)).connected, false);
        await assert.rejects(S.clip(other, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        assert.equal(calls.length, 0);
        const begin = await S.begin(user), auth = new URL(begin.authorizationUrl), state = auth.searchParams.get('state')!;
        assert.equal(auth.origin, 'https://id.twitch.tv');
        assert.equal(auth.searchParams.get('scope'), 'channel:manage:clips');
        const saved = await db.collection('import_oauth_states').findOne({ user_id: user });
        assert.notEqual(saved?.state_hash, state);
        await S.finish(state, 'fixture-code');
        await assert.rejects(S.finish(state, 'fixture-code'), { code: 'IMPORT_OAUTH_STATE_REJECTED' });
        const conn = await db.collection('import_connections').findOne({ user_id: user });
        assert(conn);
        assert(!conn.access_token.includes('fixture-access'));
        assert(!conn.refresh_token.includes('fixture-refresh'));
        assert.equal((await S.status(other)).connected, false);
        const safe = await S.status(user);
        assert.equal(safe.account?.id, '123');
        assert(!JSON.stringify(safe).includes('token'));
        const found = await S.clip(user, 'FixtureClip');
        assert.equal(found.url, media);
        assert.equal(found.title, 'Local API clip');
        await assert.rejects(S.clip(other, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        broadcaster = '456';
        const before = calls.filter(c => c.endsWith('/downloads')).length;
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_NOT_OWNED' });
        assert.equal(calls.filter(c => c.endsWith('/downloads')).length, before);
        broadcaster = '123';
        for (const bad of ['https://127.0.0.1/clip.mp4', 'https://twitchcdn.net.attacker.invalid/clip.mp4', 'http://production.assets.clips.twitchcdn.net/clip.mp4', 'https://user:pass@production.assets.clips.twitchcdn.net/clip.mp4']) {
            media = bad;
            await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_INVALID_RESPONSE' });
        }
        media = found.url;
        granted = false;
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        granted = true;
        client = 'wrong-app';
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        client = 'fixture-client';
        who = '456';
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        who = '123';
        await db.collection('import_connections').updateOne({ user_id: user }, { $set: { expires_at: new Date(0) } });
        await S.clip(user, 'FixtureClip');
        assert.equal(refreshes, 1);
        status = 429;
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_RATE_LIMITED' });
        status = 200;
        for (const u of ['https://www.twitch.tv/videos/123', 'https://kick.com/person?clip=clip_abc']) {
            const n = calls.length;
            await assert.rejects(I.probeUrlMetadata(u, 1000, user), { code: 'PLATFORM_IMPORT_UNAVAILABLE' });
            assert.equal(calls.length, n);
        }
        await assert.rejects(I.ingestUrlToProject({ userId: user, url: 'https://clips.twitch.tv/FixtureClip', startTimeSec: 1 }), { code: 'PLATFORM_IMPORT_RANGE_UNSUPPORTED' });
        const denied = await S.begin(other);
        await assert.rejects(S.finish(new URL(denied.authorizationUrl).searchParams.get('state')!, undefined, true), { code: 'IMPORT_OAUTH_DENIED' });
        await assert.rejects(S.finish(new URL(denied.authorizationUrl).searchParams.get('state')!, 'code'), { code: 'IMPORT_OAUTH_STATE_REJECTED' });
        const expired = await S.begin(other);
        await db.collection('import_oauth_states').updateMany({ user_id: other }, { $set: { expires_at: new Date(0) } });
        await assert.rejects(S.finish(new URL(expired.authorizationUrl).searchParams.get('state')!, 'code'), { code: 'IMPORT_OAUTH_STATE_REJECTED' });
        const race = await S.begin(user), raceState = new URL(race.authorizationUrl).searchParams.get('state')!;
        const request = S.request;
        let release!: () => void;
        let entered!: () => void;
        const paused = new Promise<void>(r => { entered = r; }), resume = new Promise<void>(r => { release = r; });
        S.request = async function (url: string, init: RequestInit = {}) { const result = await request.call(this, url, init); if (url.endsWith('/validate')) {
            entered();
            await resume;
        } return result; };
        try {
            const finishing = S.finish(raceState, 'fixture-race-code');
            await paused;
            await S.disconnect(user);
            release();
            await assert.rejects(finishing, { code: 'IMPORT_OAUTH_STATE_REJECTED' });
            assert.equal((await S.status(user)).connected, false);
            assert.equal(await db.collection('import_connections').countDocuments({ user_id: user, access_token: { $exists: true } }), 0);
        }
        finally {
            release();
            S.request = request;
        }
        const old = await S.begin(user), newer = await S.begin(user);
        await assert.rejects(S.finish(new URL(old.authorizationUrl).searchParams.get('state')!, 'old'), { code: 'IMPORT_OAUTH_STATE_REJECTED' });
        await S.finish(new URL(newer.authorizationUrl).searchParams.get('state')!, 'new');
        const dump = (I as any).dumpYouTubeJson;
        try {
            for (const live of [{ is_live: true }, { is_upcoming: true }, { live_status: 'post_live' }]) {
                (I as any).dumpYouTubeJson = async () => live;
                await assert.rejects(I.fetchYouTubeMetadata('https://youtube.com/watch?v=fixture'), { code: 'LIVE_SOURCE_NOT_SUPPORTED' });
            }
            (I as any).dumpYouTubeJson = async () => ({ title: 'Completed live replay', live_status: 'was_live', duration: 4 });
            assert.equal((await I.fetchYouTubeMetadata('https://youtube.com/watch?v=fixture')).title, 'Completed live replay');
        }
        finally {
            (I as any).dumpYouTubeJson = dump;
        }
        assert.equal((await S.disconnect(user)).remoteRevocationConfirmed, true);
        assert.equal((await S.status(user)).connected, false);
        await assert.rejects(S.clip(user, 'FixtureClip'), { code: 'TWITCH_IMPORT_CONNECTION_REQUIRED' });
        const express = (await import('express')).default, { default: routes } = await import('../routes/importRoutes.js'), { supabaseAuthClient } = await import('../utils/supabase.js');
        const verify = supabaseAuthClient.auth.getUser;
        supabaseAuthClient.auth.getUser = async () => ({ data: { user: { id: user } }, error: null }) as any;
        const app = express();
        app.use('/api/imports', routes);
        app.use((e: any, _req: any, res: any, _next: any) => res.status(e.statusCode || 500).json({ code: e.code }));
        const server = app.listen(0, '127.0.0.1');
        await new Promise<void>(r => server.once('listening', r));
        const port = (server.address() as any).port;
        const local = (path: string, options: RequestInit = {}) => fetchOriginal(`http://127.0.0.1:${port}/api/imports${path}`, { ...options, redirect: 'manual' });
        try {
            assert.equal((await local('/twitch/status')).status, 401);
            assert.equal((await local('/twitch/connect', { method: 'POST' })).status, 401);
            const h = { Authorization: 'Bearer local-fixture' };
            const statusResponse = await local('/twitch/status', { headers: h });
            assert.equal(statusResponse.status, 200);
            assert.equal(statusResponse.headers.get('cache-control'), 'no-store');
            const startResponse = await local('/twitch/connect', { method: 'POST', headers: h }), start = await startResponse.json() as any, routeState = new URL(start.data.authorizationUrl).searchParams.get('state');
            const callback = await local('/twitch/callback?state=' + routeState + '&code=fixture-route');
            assert.equal(callback.status, 302);
            assert.equal(new URL(callback.headers.get('location')!).pathname, '/dashboard');
            assert.equal(callback.headers.get('referrer-policy'), 'no-referrer');
            const replay = await local('/twitch/callback?state=' + routeState + '&code=fixture-route');
            assert.equal(replay.status, 400);
            assert(!(await replay.text()).includes('fixture-route'));
            const disconnected = await local('/twitch/disconnect', { method: 'POST', headers: h });
            assert.equal(disconnected.status, 200);
            assert.equal((await S.status(user)).connected, false);
        }
        finally {
            supabaseAuthClient.auth.getUser = verify;
            server.closeAllConnections();
            await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
        }
    }
    finally {
        globalThis.fetch = fetchOriginal;
        await db.dropDatabase();
        await closeMongo();
    }
});
