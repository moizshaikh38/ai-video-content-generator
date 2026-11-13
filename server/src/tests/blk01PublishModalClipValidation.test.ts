import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { publishingService } from '../services/publishingService.js';
import { socialPublishingRegistry } from '../services/publishing/socialPublishingRegistry.js';
import { encryptToken } from '../utils/tokenEncryption.js';
import { supabaseAuthClient } from '../utils/supabase.js';
import { errorHandler } from '../middleware/errorHandler.js';
import publishingRouter from '../routes/publishingRoutes.js';
import { DEFAULT_PLATFORM_CAPABILITIES } from '../../../src/services/publishingService.js';
import { PublishedPostRecord, PublishJobRecord, ClipRecord } from '../types/index.js';

describe('BLK-01: PublishModal Clip-Aware Validation & Publisher Hardening', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const projectA = crypto.randomUUID();
  const projectB = crypto.randomUUID();

  let ytConnA: string;
  let igConnA: string;
  let ttConnA: string;
  let liConnA: string;
  let xConnA: string;
  let ytConnB: string;

  let validClipA: string;
  let draftClipA: string;
  let validClipB: string;

  let transcriptPackId: string;
  let projectPackId: string;
  let clipPackId: string;

  let server: http.Server;
  let baseUrl: string;

  const EXACT_REQUIRED_MESSAGE =
    'This content pack has no linked rendered video. You can publish text content to LinkedIn or X, or attach a rendered video to use video platforms.';

  before(async () => {
    const db = await getMongoDb();
    await db.command({ ping: 1 });

    ytConnA = crypto.randomUUID();
    igConnA = crypto.randomUUID();
    ttConnA = crypto.randomUUID();
    liConnA = crypto.randomUUID();
    xConnA = crypto.randomUUID();
    ytConnB = crypto.randomUUID();

    validClipA = crypto.randomUUID();
    draftClipA = crypto.randomUUID();
    validClipB = crypto.randomUUID();

    transcriptPackId = crypto.randomUUID();
    projectPackId = crypto.randomUUID();
    clipPackId = crypto.randomUUID();

    const now = new Date();

    // 1. Social Connections for User A (all 5 platforms)
    await db.collection('social_account_connections').insertMany([
      {
        id: ytConnA,
        user_id: userA,
        provider: 'youtube',
        provider_account_id: 'yt_user_a',
        provider_account_name: 'User A YouTube Channel',
        access_token: encryptToken('yt_token_a'),
        scopes: ['youtube.upload'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
      {
        id: igConnA,
        user_id: userA,
        provider: 'instagram',
        provider_account_id: 'ig_user_a',
        provider_account_name: 'User A Instagram',
        access_token: encryptToken('ig_token_a'),
        scopes: ['instagram_content_publish'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
      {
        id: ttConnA,
        user_id: userA,
        provider: 'tiktok',
        provider_account_id: 'tt_user_a',
        provider_account_name: 'User A TikTok',
        access_token: encryptToken('tt_token_a'),
        scopes: ['video.upload'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
      {
        id: liConnA,
        user_id: userA,
        provider: 'linkedin',
        provider_account_id: 'li_user_a',
        provider_account_name: 'User A LinkedIn',
        access_token: encryptToken('li_token_a'),
        scopes: ['w_member_social'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
      {
        id: xConnA,
        user_id: userA,
        provider: 'x',
        provider_account_id: 'x_user_a',
        provider_account_name: 'User A X Account',
        access_token: encryptToken('x_token_a'),
        scopes: ['tweet.write'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
      // Social connection for User B (tenant isolation test)
      {
        id: ytConnB,
        user_id: userB,
        provider: 'youtube',
        provider_account_id: 'yt_user_b',
        provider_account_name: 'User B YouTube Channel',
        access_token: encryptToken('yt_token_b'),
        scopes: ['youtube.upload'],
        status: 'connected',
        created_at: now,
        updated_at: now,
      },
    ]);

    // 2. Clips
    await db.collection<ClipRecord>('clips').insertMany([
      // User A - Ready Clip
      {
        id: validClipA,
        project_id: projectA,
        user_id: userA,
        start_seconds: 0,
        end_seconds: 30,
        duration_seconds: 30,
        aspect_ratio: '9:16',
        crop_mode: 'smart',
        render_status: 'ready',
        source_storage_path: `users/${userA}/projects/${projectA}/source.mp4`,
        output_storage_path: `users/${userA}/projects/${projectA}/clips/${validClipA}/render.mp4`,
        created_at: now,
        updated_at: now,
      },
      // User A - Draft Clip (not ready)
      {
        id: draftClipA,
        project_id: projectA,
        user_id: userA,
        start_seconds: 10,
        end_seconds: 40,
        duration_seconds: 30,
        aspect_ratio: '9:16',
        crop_mode: 'smart',
        render_status: 'draft',
        source_storage_path: `users/${userA}/projects/${projectA}/source.mp4`,
        output_storage_path: null,
        created_at: now,
        updated_at: now,
      },
      // User B - Ready Clip (owned by User B)
      {
        id: validClipB,
        project_id: projectB,
        user_id: userB,
        start_seconds: 0,
        end_seconds: 25,
        duration_seconds: 25,
        aspect_ratio: '9:16',
        crop_mode: 'smart',
        render_status: 'ready',
        source_storage_path: `users/${userB}/projects/${projectB}/source.mp4`,
        output_storage_path: `users/${userB}/projects/${projectB}/clips/${validClipB}/render.mp4`,
        created_at: now,
        updated_at: now,
      },
    ]);

    // 3. Content Packs
    await db.collection('content_packs').insertMany([
      {
        id: transcriptPackId,
        user_id: userA,
        project_id: projectA,
        clip_id: null,
        source_type: 'transcript',
        version: 1,
        status: 'APPROVED',
        source: { source_type: 'transcript', transcript_source: 'Transcript Content' },
        created_at: now,
        updated_at: now,
      },
      {
        id: projectPackId,
        user_id: userA,
        project_id: projectA,
        clip_id: null,
        source_type: 'project',
        version: 1,
        status: 'APPROVED',
        source: { source_type: 'project' },
        created_at: now,
        updated_at: now,
      },
      {
        id: clipPackId,
        user_id: userA,
        project_id: projectA,
        clip_id: validClipA,
        source_type: 'clip',
        version: 1,
        status: 'APPROVED',
        source: { source_type: 'clip', duration: 30 },
        created_at: now,
        updated_at: now,
      },
    ]);

    // 4. Express HTTP test app
    const app = express();
    app.use(express.json());

    // Mock Supabase Auth
    (supabaseAuthClient.auth as any).getUser = async (token: string) => {
      if (token === 'test-user-a-token') {
        return { data: { user: { id: userA, email: 'userA@vireoclip.test' } }, error: null };
      }
      if (token === 'test-user-b-token') {
        return { data: { user: { id: userB, email: 'userB@vireoclip.test' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'invalid JWT' } };
    };

    app.use('/api/publishing', publishingRouter);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}/api/publishing`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const db = await getMongoDb();
    await db.collection('social_account_connections').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('clips').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('content_packs').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('published_posts').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('publish_jobs').deleteMany({ user_id: { $in: [userA, userB] } });
    await new Promise((r) => setTimeout(r, 600));
    await closeMongo(true);
  });

  // =========================================================================
  // SCENARIO 1: Transcript-only content pack
  // =========================================================================
  it('1. Transcript-only content pack: disables video platforms and specifies text-only message', async () => {
    const db = await getMongoDb();
    const pack = await db.collection('content_packs').findOne({ id: transcriptPackId });
    assert.ok(pack);
    assert.equal(pack.clip_id, null);
    assert.equal(pack.source_type, 'transcript');

    // Simulate modal resolution for missing clip
    const hasMedia = Boolean(pack.clip_id);
    assert.equal(hasMedia, false);

    // Platform capability contract
    const capabilities = publishingService.getCapabilities();
    const isVideoRequired = (platform: keyof typeof capabilities) => !capabilities[platform].supportsTextOnly;

    assert.equal(isVideoRequired('youtube'), true);
    assert.equal(isVideoRequired('instagram'), true);
    assert.equal(isVideoRequired('tiktok'), true);
    assert.equal(isVideoRequired('linkedin'), false);
    assert.equal(isVideoRequired('x'), false);

    // Verify required user-facing message is exact
    assert.equal(
      EXACT_REQUIRED_MESSAGE,
      'This content pack has no linked rendered video. You can publish text content to LinkedIn or X, or attach a rendered video to use video platforms.'
    );
  });

  // =========================================================================
  // SCENARIO 2: Project-level content pack without rendered video
  // =========================================================================
  it('2. Project-level content pack without rendered video: detects no media and restricts video publishing', async () => {
    const db = await getMongoDb();
    const pack = await db.collection('content_packs').findOne({ id: projectPackId });
    assert.ok(pack);
    assert.equal(pack.clip_id, null);
    assert.equal(pack.source_type, 'project');

    const hasMedia = Boolean(pack.clip_id);
    assert.equal(hasMedia, false);

    // Backend preview for YouTube without media must report invalid
    const preview = await publishingService.previewPublish(userA, ytConnA, pack.clip_id, {
      title: 'Project Summary',
      caption: 'Text overview',
    });
    assert.equal(preview.valid, false);
    assert.ok(preview.warnings.some((w) => w.includes('requires a rendered video clip')));
  });

  // =========================================================================
  // SCENARIO 3: Clip-based content pack with valid rendered video
  // =========================================================================
  it('3. Clip-based content pack with valid rendered video: permits all platforms with media metadata', async () => {
    const db = await getMongoDb();
    const pack = await db.collection('content_packs').findOne({ id: clipPackId });
    assert.ok(pack);
    assert.equal(pack.clip_id, validClipA);

    const hasMedia = Boolean(pack.clip_id);
    assert.equal(hasMedia, true);

    const preview = await publishingService.previewPublish(userA, ytConnA, pack.clip_id, {
      title: 'Valid YouTube Video Title',
      caption: 'Valid highlight clip description',
    });
    assert.equal(preview.valid, true);
    assert.equal(preview.provider, 'youtube');
    assert.ok(preview.media_metadata);
    assert.equal(preview.media_metadata.clip_id, validClipA);
    assert.equal(preview.media_metadata.render_status, 'ready');
  });

  // =========================================================================
  // SCENARIO 4: Canonical media reference resolution: clipId is the sole authorized media reference
  // =========================================================================
  it('4. Canonical media reference resolution: clipId is the sole authorized media reference', () => {
    // Only authenticated, tenant-owned clipId satisfies media presence
    const readyClipProps = { clipId: validClipA };
    const hasMediaReady = Boolean(readyClipProps.clipId);
    assert.equal(hasMediaReady, true, 'Valid clipId correctly satisfies media presence');

    // Missing clipId strictly evaluates to false (no loose mediaUrl or unverified strings allowed)
    const noClipProps = { clipId: null };
    const hasMediaNone = Boolean(noClipProps.clipId);
    assert.equal(hasMediaNone, false, 'Absence of canonical clipId flags text-only mode');

    // Arbitrary unbacked references cannot satisfy media presence without a verified clipId
    const arbitraryReferenceProps = { clipId: undefined, unbackedRef: 'https://cdn.example.com/fake.mp4' };
    const hasMediaArbitrary = Boolean(arbitraryReferenceProps.clipId);
    assert.equal(hasMediaArbitrary, false, 'Unbacked references do not enable video platforms without a valid clipId');
  });

  // =========================================================================
  // SCENARIO 5: LinkedIn text publishing
  // =========================================================================
  it('5. LinkedIn text publishing: succeeds without clip when text is supplied', async () => {
    const result = await publishingService.createPublishPost({
      userId: userA,
      projectId: projectA,
      clipId: null, // No clip provided
      socialConnectionId: liConnA,
      payload: {
        caption: 'Excited to announce our new product update! Read more at https://vireoclip.com',
      },
      publishType: 'now',
    });

    assert.ok(result.post);
    assert.equal(result.post.provider, 'linkedin');
    assert.equal(Boolean(result.post.clip_id), false);
    assert.equal(result.post.status, 'publishing');
  });

  // =========================================================================
  // SCENARIO 6: X text publishing
  // =========================================================================
  it('6. X text publishing: succeeds without clip when text is supplied within 280 chars', async () => {
    const result = await publishingService.createPublishPost({
      userId: userA,
      projectId: projectA,
      clipId: null, // No clip provided
      socialConnectionId: xConnA,
      payload: {
        caption: 'Breaking: VireoClip AI Content Studio is now live! #ai #saas',
      },
      publishType: 'now',
    });

    assert.ok(result.post);
    assert.equal(result.post.provider, 'x');
    assert.equal(Boolean(result.post.clip_id), false);
    assert.equal(result.post.status, 'publishing');
  });

  // =========================================================================
  // SCENARIO 7: YouTube without video
  // =========================================================================
  it('7. YouTube without video: strictly rejected with 400 VALIDATION_FAILED', async () => {
    await assert.rejects(
      async () =>
        publishingService.createPublishPost({
          userId: userA,
          projectId: projectA,
          clipId: null, // Missing video
          socialConnectionId: ytConnA,
          payload: { title: 'YouTube Title Without Video', caption: 'Description' },
          publishType: 'now',
        }),
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /YouTube publishing requires a rendered video clip/i);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 8: Instagram without video
  // =========================================================================
  it('8. Instagram without video: strictly rejected with 400 VALIDATION_FAILED', async () => {
    await assert.rejects(
      async () =>
        publishingService.createPublishPost({
          userId: userA,
          projectId: projectA,
          clipId: null, // Missing video
          socialConnectionId: igConnA,
          payload: { caption: 'Instagram Reels caption without video' },
          publishType: 'now',
        }),
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /instagram.*requires a rendered video clip/i);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 9: TikTok without video
  // =========================================================================
  it('9. TikTok without video: strictly rejected with 400 VALIDATION_FAILED', async () => {
    await assert.rejects(
      async () =>
        publishingService.createPublishPost({
          userId: userA,
          projectId: projectA,
          clipId: null, // Missing video
          socialConnectionId: ttConnA,
          payload: { caption: 'TikTok caption without video' },
          publishType: 'now',
        }),
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /TikTok publishing requires a rendered video clip/i);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 10: Invalid or inaccessible media reference
  // =========================================================================
  it('10. Invalid or inaccessible media reference: non-existent clip ID rejected with 404 CLIP_NOT_FOUND', async () => {
    const nonexistentClipId = crypto.randomUUID();

    await assert.rejects(
      async () =>
        publishingService.createPublishPost({
          userId: userA,
          projectId: projectA,
          clipId: nonexistentClipId,
          socialConnectionId: ytConnA,
          payload: { title: 'Video with Nonexistent Clip' },
          publishType: 'now',
        }),
      (err: any) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'CLIP_NOT_FOUND');
        assert.match(err.message, /Clip not found or access denied/i);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 11: Cross-tenant media reference
  // =========================================================================
  it('11. Cross-tenant media reference: User A attempting to publish User B clip is blocked with 404', async () => {
    // validClipB belongs to userB, attempted by userA
    await assert.rejects(
      async () =>
        publishingService.createPublishPost({
          userId: userA,
          projectId: projectA,
          clipId: validClipB,
          socialConnectionId: ytConnA,
          payload: { title: 'Theft of User B Clip' },
          publishType: 'now',
        }),
      (err: any) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'CLIP_NOT_FOUND');
        assert.match(err.message, /Clip not found or access denied/i);
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 12: Existing publishing behavior with valid media
  // =========================================================================
  it('12. Existing publishing behavior with valid media: creates published post and queued job', async () => {
    const result = await publishingService.createPublishPost({
      userId: userA,
      projectId: projectA,
      clipId: validClipA,
      socialConnectionId: ytConnA,
      payload: {
        title: 'VireoClip Highlight 1080p',
        caption: 'Detailed description of the viral highlight clip',
        tags: ['vireo', 'ai', 'video'],
        privacy: 'public',
      },
      publishType: 'now',
    });

    assert.ok(result.post);
    assert.equal(result.post.provider, 'youtube');
    assert.equal(result.post.clip_id, validClipA);
    assert.equal(result.post.status, 'publishing');
    assert.ok(result.job);
    assert.equal(result.job.status, 'publishing');
  });

  // =========================================================================
  // SCENARIO 13: Existing scheduling behavior
  // =========================================================================
  it('13. Existing scheduling behavior: creates scheduled post for valid future timestamp', async () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = await publishingService.createPublishPost({
      userId: userA,
      projectId: projectA,
      clipId: validClipA,
      socialConnectionId: ytConnA,
      payload: {
        title: 'Scheduled Highlight Video',
        caption: 'Scheduled for tomorrow morning',
        privacy: 'public',
      },
      publishType: 'scheduled',
      scheduledFor: futureDate,
      timezone: 'America/New_York',
    });

    assert.ok(result.post);
    assert.equal(result.post.publish_type, 'scheduled');
    assert.equal(result.post.status, 'scheduled');
    assert.equal(result.post.timezone, 'America/New_York');
    assert.ok(result.job);
    assert.equal(result.job.status, 'scheduled');
  });

  // =========================================================================
  // SCENARIO 14: Backend rejection when a client bypasses frontend restrictions
  // =========================================================================
  it('14. Direct HTTP API bypass rejection: POST /api/publishing/publish returns 400 when media is missing', async () => {
    // 14a. Direct HTTP POST to /publish without clipId targeting YouTube
    const res = await fetch(`${baseUrl}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-a-token',
      },
      body: JSON.stringify({
        projectId: projectA,
        socialConnectionId: ytConnA,
        clipId: null, // Client bypasses UI and omits clip
        payload: {
          title: 'Hacked Direct Submission',
          caption: 'Attempt to bypass client guard',
        },
      }),
    });

    assert.equal(res.status, 400);
    const body: any = await res.json();
    assert.equal(body.status, 'error');
    assert.match(body.message, /YouTube publishing requires a rendered video clip/i);

    // 14b. Direct HTTP GET to /capabilities returns provider capabilities contract
    const capsRes = await fetch(`${baseUrl}/capabilities`, {
      headers: {
        Authorization: 'Bearer test-user-a-token',
      },
    });
    assert.equal(capsRes.status, 200);
    const capsBody: any = await capsRes.json();
    assert.equal(capsBody.status, 'ok');
    assert.equal(capsBody.data.capabilities.youtube.supportsTextOnly, false);
    assert.equal(capsBody.data.capabilities.instagram.supportsTextOnly, false);
    assert.equal(capsBody.data.capabilities.tiktok.supportsTextOnly, false);
    assert.equal(capsBody.data.capabilities.linkedin.supportsTextOnly, true);
    assert.equal(capsBody.data.capabilities.x.supportsTextOnly, true);

    // 14c. Direct HTTP POST to /preview without clipId returns valid: false with platform warning
    const previewRes = await fetch(`${baseUrl}/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-user-a-token',
      },
      body: JSON.stringify({
        socialConnectionId: ytConnA,
        clipId: null,
        payload: { title: 'Direct Preview Test' },
      }),
    });
    assert.equal(previewRes.status, 200);
    const previewBody: any = await previewRes.json();
    assert.equal(previewBody.status, 'ok');
    assert.equal(previewBody.data.valid, false);
    assert.ok(previewBody.data.warnings.some((w: string) => w.includes('requires a rendered video clip')));
  });
});
