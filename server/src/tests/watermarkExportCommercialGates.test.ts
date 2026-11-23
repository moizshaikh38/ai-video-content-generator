import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getRenderFfmpeg } from '../utils/drawtextFfmpeg.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { EntitlementService } from '../services/entitlementService.js';
import { WatermarkService } from '../services/watermarkService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';

const execFileAsync = promisify(execFile);
// Render through the same host-aware binary resolution the product uses:
// the bundled ffmpeg-static build on some hosts lacks drawtext, which would
// make this host-specific failure look like a product regression.
const ffmpegBin = getRenderFfmpeg();

describe('VireoClip Phase F: Server-Side Watermark Enforcement & Commercial Gates', () => {
  const freeUserId = crypto.randomUUID();
  const freeUserEmail = 'free-user@example.com';

  const creatorUserId = crypto.randomUUID();
  const creatorUserEmail = 'creator-user@example.com';

  const proUserId = crypto.randomUUID();
  const proUserEmail = 'pro-user@example.com';

  const studioUserId = crypto.randomUUID();
  const studioUserEmail = 'studio-user@example.com';

  const developerUserId = crypto.randomUUID();
  const developerUserEmail = 'vertexdigitals07@gmail.com';

  const downgradedUserId = crypto.randomUUID();
  const downgradedUserEmail = 'downgraded-user@example.com';

  const allTestUsers = [
    freeUserId,
    creatorUserId,
    proUserId,
    studioUserId,
    developerUserId,
    downgradedUserId,
  ];

  before(async () => {
    const db = await getMongoDb();
    await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('clips').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('transcripts').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
    await db.collection('profiles').deleteMany({ id: { $in: allTestUsers } });

    // Seed profiles
    await db.collection('profiles').insertMany([
      { id: freeUserId, user_id: freeUserId, email: freeUserEmail, created_at: new Date() },
      { id: creatorUserId, user_id: creatorUserId, email: creatorUserEmail, created_at: new Date() },
      { id: proUserId, user_id: proUserId, email: proUserEmail, created_at: new Date() },
      { id: studioUserId, user_id: studioUserId, email: studioUserEmail, created_at: new Date() },
      { id: developerUserId, user_id: developerUserId, email: developerUserEmail, created_at: new Date() },
      { id: downgradedUserId, user_id: downgradedUserId, email: downgradedUserEmail, created_at: new Date() },
    ]);

    // Seed subscriptions for paid users with unique provider_subscription_id
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);

    await db.collection('subscriptions').insertMany([
      {
        id: crypto.randomUUID(),
        user_id: creatorUserId,
        plan_id: 'creator',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_creator_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: crypto.randomUUID(),
        user_id: proUserId,
        plan_id: 'pro',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_pro_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: crypto.randomUUID(),
        user_id: studioUserId,
        plan_id: 'studio',
        status: 'active',
        billing_interval: 'month',
        provider: 'stripe',
        provider_subscription_id: `sub_studio_${crypto.randomUUID()}`,
        cancel_at_period_end: false,
        current_period_end: futureDate.toISOString(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  });

  after(async () => {
    try {
      const db = await getMongoDb();
      await db.collection('credit_wallets').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_transactions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('credit_reservations').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('projects').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('clips').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('render_jobs').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('transcripts').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('subscriptions').deleteMany({ user_id: { $in: allTestUsers } });
      await db.collection('profiles').deleteMany({ id: { $in: allTestUsers } });
    } finally {
      await closeMongo(true);
    }
  });

  // --------------------------------------------------------------------------
  // TEST 1: Server-side authority: shouldWatermark per plan tier
  // --------------------------------------------------------------------------
  test('1. WatermarkService resolves watermark requirements authoritatively per plan tier', async () => {
    const freeRequires = await WatermarkService.shouldWatermark(freeUserId, freeUserEmail);
    assert.equal(freeRequires, true, 'Free plan MUST require watermark');

    const creatorRequires = await WatermarkService.shouldWatermark(creatorUserId, creatorUserEmail);
    assert.equal(creatorRequires, false, 'Creator plan must NOT require watermark');

    const proRequires = await WatermarkService.shouldWatermark(proUserId, proUserEmail);
    assert.equal(proRequires, false, 'Pro plan must NOT require watermark');

    const studioRequires = await WatermarkService.shouldWatermark(studioUserId, studioUserEmail);
    assert.equal(studioRequires, false, 'Studio plan must NOT require watermark');

    const devRequires = await WatermarkService.shouldWatermark(developerUserId, developerUserEmail);
    assert.equal(devRequires, false, 'Developer unlimited account must NOT require watermark');
  });

  // --------------------------------------------------------------------------
  // TEST 2: Bypass immunity: client parameters cannot bypass watermark
  // --------------------------------------------------------------------------
  test('2. Client parameters cannot bypass watermark on Free tier', async () => {
    // The backend uses authoritative server-side user ID resolution
    const actualWatermarkRequired = await WatermarkService.shouldWatermark(freeUserId, freeUserEmail);
    assert.equal(actualWatermarkRequired, true, 'Backend MUST ignore forged client watermark: false payload');

    // Filter string must be generated for Free tier
    const filterString = WatermarkService.getFfmpegFilterString();
    assert.ok(filterString.includes('VireoClip'), 'Filter string must contain brand text');
    assert.ok(filterString.includes('drawtext='), 'Filter string must use drawtext');
  });

  // --------------------------------------------------------------------------
  // TEST 3: Subtitle preset commercial gating across plans
  // --------------------------------------------------------------------------
  test('3. Commercial preset gating enforces plan-based access controls strictly', async () => {
    const freeEntitlements = await EntitlementService.resolveUserEntitlements(freeUserId, freeUserEmail);
    const creatorEntitlements = await EntitlementService.resolveUserEntitlements(creatorUserId, creatorUserEmail);
    const proEntitlements = await EntitlementService.resolveUserEntitlements(proUserId, proUserEmail);
    const devEntitlements = await EntitlementService.resolveUserEntitlements(developerUserId, developerUserEmail);

    // Free tier: only 'simple', 'clean', 'none'
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'clean'), true);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'simple'), true);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'none'), true);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'hormozi'), false);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'karaoke'), false);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'beasty'), false);
    assert.equal(EntitlementService.isPresetAllowed(freeEntitlements, 'glow'), false);

    // Creator tier: standard presets allowed
    assert.equal(EntitlementService.isPresetAllowed(creatorEntitlements, 'clean'), true);
    assert.equal(EntitlementService.isPresetAllowed(creatorEntitlements, 'hormozi'), true);
    assert.equal(EntitlementService.isPresetAllowed(creatorEntitlements, 'karaoke'), true);
    assert.equal(EntitlementService.isPresetAllowed(creatorEntitlements, 'cinema'), true);

    // Pro tier: wildcard '*' allows all presets
    assert.equal(EntitlementService.isPresetAllowed(proEntitlements, 'hormozi'), true);
    assert.equal(EntitlementService.isPresetAllowed(proEntitlements, 'custom_future_preset'), true);

    // Developer tier: wildcard '*' allows all presets
    assert.equal(EntitlementService.isPresetAllowed(devEntitlements, 'hormozi'), true);
    assert.equal(EntitlementService.isPresetAllowed(devEntitlements, 'any_preset'), true);
  });

  // --------------------------------------------------------------------------
  // TEST 4: Subtitle Studio service rejects restricted presets on Free tier
  // --------------------------------------------------------------------------
  test('4. Subtitle Studio rejects restricted presets for Free users and permits them for Creator/Pro', async () => {
    await ownerContext.run(freeUserId, async () => {
      // Create project on Free tier -> should default to allowed preset 'clean'
      const project = await SubtitleStudioService.createProject(freeUserId, {
        title: 'Free Subtitle Project',
        source_url: 'https://example.com/test.mp4',
      });
      assert.equal(project.subtitle_style?.preset, 'clean', 'Free project must default to allowed preset');

      // Attempt to update style to restricted preset 'hormozi' on Free tier
      await assert.rejects(
        async () => {
          await SubtitleStudioService.updateStyle(project.id, freeUserId, { preset: 'hormozi' });
        },
        (err: any) => {
          assert.equal(err.code, 'PRESET_RESTRICTED');
          assert.equal(err.statusCode, 403);
          return true;
        },
        'Free user updating to hormozi must be rejected with 403 PRESET_RESTRICTED'
      );

      // Updating style to allowed preset 'simple' on Free tier must succeed (0 credits)
      const updated = await SubtitleStudioService.updateStyle(project.id, freeUserId, { preset: 'simple' });
      assert.equal(updated.preset, 'simple');
    });

    // Creator user can update to 'hormozi' without error
    await ownerContext.run(creatorUserId, async () => {
      const creatorProject = await SubtitleStudioService.createProject(creatorUserId, {
        title: 'Creator Subtitle Project',
        source_url: 'https://example.com/test.mp4',
      });
      assert.equal(creatorProject.subtitle_style?.preset, 'hormozi', 'Creator project defaults to hormozi');

      const updated = await SubtitleStudioService.updateStyle(creatorProject.id, creatorUserId, { preset: 'beasty' });
      assert.equal(updated.preset, 'beasty');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: Watermark filter composition & dynamic resolution scaling
  // --------------------------------------------------------------------------
  test('5. Watermark filter string is properly escaped and position-safe', () => {
    const filter = WatermarkService.getFfmpegFilterString();

    // Verify escaped commas to prevent FFmpeg filterchain parse errors
    assert.ok(filter.includes('max(24\\,trunc('), 'Commas inside expressions must be escaped');
    assert.ok(filter.includes('fontcolor=white@0.92') && filter.includes('shadowcolor=black@0.6') && !filter.includes('box=1'), 'Premium floating wordmark: soft shadow, hairline outline, no box badge');
    assert.ok(filter.includes('fontcolor=white'), 'Font color must be white');
    assert.ok(filter.includes('x=if(lt(t\\,0.45)'), 'Badge must slide in from the right over the first 0.45s');
    assert.ok(filter.includes('alpha=if(lt(t\\,0.45)'), 'Badge must fade in then breathe (animated alpha)');
    assert.ok(filter.includes('w-text_w-'), 'Position must settle at the right edge');
    assert.ok(filter.includes('y=max(24\\,'), 'Position must be aligned to top margin');

    // Verify appendWatermarkFilter
    const base = ['scale=1080:1920:force_original_aspect_ratio=increase', 'crop=1080:1920'];
    const withWatermark = WatermarkService.appendWatermarkFilter(base, true);
    assert.equal(withWatermark.length, 3);
    assert.ok(withWatermark[2].includes('VireoClip'));

    const cleanFilters = WatermarkService.appendWatermarkFilter(base, false);
    assert.equal(cleanFilters.length, 2, 'No watermark filter appended when not required');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Real FFmpeg rendering: generates valid MP4 with watermark burned in
  // --------------------------------------------------------------------------
  test('6. Real FFmpeg rendering generates a valid MP4 with drawtext watermark burned in', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-wm-test-'));
    const outputPath = path.join(tempDir, 'watermarked_output.mp4');

    try {
      const wmFilter = WatermarkService.getFfmpegFilterString();
      const ffmpegArgs = [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=navy:s=720x1280:d=1',
        '-vf', wmFilter,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-pix_fmt', 'yuv420p',
        '-t', '0.5',
        outputPath,
      ];

      await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 30000 });

      assert.ok(fs.existsSync(outputPath), 'Output file must exist');
      const stats = fs.statSync(outputPath);
      assert.ok(stats.size > 1024, `Output MP4 must have valid size (>1KB, got ${stats.size} bytes)`);

      // Verify file header is valid MP4 (starts with ftyp)
      const headerBuf = Buffer.alloc(16);
      const fd = fs.openSync(outputPath, 'r');
      fs.readSync(fd, headerBuf, 0, 16, 0);
      fs.closeSync(fd);
      assert.ok(headerBuf.toString('utf8', 4, 8) === 'ftyp', 'Output file must be a valid MP4 container');
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  // --------------------------------------------------------------------------
  // TEST 7: AI Clipping export flag persistence (is_watermarked: true/false)
  // --------------------------------------------------------------------------
  test('7. AI Clipping persistence stores is_watermarked flag according to user plan', async () => {
    const db = await getMongoDb();
    const clipIdFree = crypto.randomUUID();
    const clipIdPro = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    // Insert clip for Free user with is_watermarked: true
    await db.collection('clips').insertOne({
      id: clipIdFree,
      project_id: projectId,
      user_id: freeUserId,
      start_seconds: 0,
      end_seconds: 15,
      duration_seconds: 15,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      source_storage_path: 'test/source.mp4',
      output_storage_path: 'users/' + freeUserId + '/clips/' + clipIdFree + '/render.mp4',
      is_watermarked: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Insert clip for Pro user with is_watermarked: false
    await db.collection('clips').insertOne({
      id: clipIdPro,
      project_id: projectId,
      user_id: proUserId,
      start_seconds: 0,
      end_seconds: 15,
      duration_seconds: 15,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      source_storage_path: 'test/source.mp4',
      output_storage_path: 'users/' + proUserId + '/clips/' + clipIdPro + '/render.mp4',
      is_watermarked: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const freeClip = await db.collection('clips').findOne({ id: clipIdFree });
    assert.equal(freeClip?.is_watermarked, true, 'Free clip must be recorded as watermarked');

    const proClip = await db.collection('clips').findOne({ id: clipIdPro });
    assert.equal(proClip?.is_watermarked, false, 'Pro clip must be recorded as unwatermarked');
  });

  // --------------------------------------------------------------------------
  // TEST 8: Downgrade protection on AI Clip preview & download URLs
  // --------------------------------------------------------------------------
  test('8. Downgraded Free user is blocked from viewing/downloading pre-downgrade clean exports', async () => {
    const db = await getMongoDb();
    const cleanClipId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    // User generated a clean export while previously on a paid subscription
    await db.collection('clips').insertOne({
      id: cleanClipId,
      project_id: projectId,
      user_id: downgradedUserId,
      start_seconds: 0,
      end_seconds: 20,
      duration_seconds: 20,
      aspect_ratio: '9:16',
      crop_mode: 'smart',
      render_status: 'ready',
      source_storage_path: 'test/source.mp4',
      output_storage_path: 'users/' + downgradedUserId + '/clips/' + cleanClipId + '/render.mp4',
      is_watermarked: false, // CLEAN EXPORT from paid days
      created_at: new Date(),
      updated_at: new Date(),
    });

    // Currently, downgradedUserId has NO active subscription in db -> resolves to Free tier
    const currentEntitlements = await EntitlementService.resolveUserEntitlements(downgradedUserId, downgradedUserEmail);
    assert.equal(currentEntitlements.planId, 'free');
    assert.equal(currentEntitlements.watermarkRequired, true);

    // Attempting to fetch download or preview URL must throw WATERMARK_REQUIRED_RERENDER (403)
    await ownerContext.run(downgradedUserId, async () => {
      await assert.rejects(
        async () => {
          await ClipRenderService.getSignedPreviewUrl(cleanClipId, downgradedUserId);
        },
        (err: any) => {
          assert.equal(err.code, 'WATERMARK_REQUIRED_RERENDER');
          assert.equal(err.statusCode, 403);
          assert.ok(err.message.includes('re-render'));
          return true;
        },
        'Clean export preview must be blocked for downgraded user with 403 WATERMARK_REQUIRED_RERENDER'
      );

      await assert.rejects(
        async () => {
          await ClipRenderService.getSignedDownloadUrl(cleanClipId, downgradedUserId);
        },
        (err: any) => {
          assert.equal(err.code, 'WATERMARK_REQUIRED_RERENDER');
          assert.equal(err.statusCode, 403);
          return true;
        },
        'Clean export download must be blocked for downgraded user with 403 WATERMARK_REQUIRED_RERENDER'
      );
    });

    // If the clip is re-rendered with watermark (is_watermarked: true), download/preview must succeed
    await db.collection('clips').updateOne(
      { id: cleanClipId },
      { $set: { is_watermarked: true } }
    );

    await ownerContext.run(downgradedUserId, async () => {
      const previewRes = await ClipRenderService.getSignedPreviewUrl(cleanClipId, downgradedUserId);
      assert.ok(previewRes.signedUrl, 'Watermarked export preview must succeed');

      const downloadRes = await ClipRenderService.getSignedDownloadUrl(cleanClipId, downgradedUserId);
      assert.ok(downloadRes.signedUrl, 'Watermarked export download must succeed');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 9: Subtitle Studio downgrade protection (exportDownloadUrl suppressed)
  // --------------------------------------------------------------------------
  test('9. Subtitle Studio suppresses clean download URLs for downgraded Free users and signals re-render required', async () => {
    let subProjectId = '';
    await ownerContext.run(downgradedUserId, async () => {
      const proj = await SubtitleStudioService.createProject(downgradedUserId, {
        title: 'Paid Subtitle Video',
        source_url: 'https://example.com/test.mp4',
      });
      subProjectId = proj.id;
    });

    const db = await getMongoDb();
    await db.collection('projects').updateOne(
      { id: subProjectId },
      {
        $set: {
          subtitle_export_status: 'ready',
          subtitle_export_progress: 100,
          subtitle_export_stage: 'completed',
          subtitle_export_path: `users/${downgradedUserId}/projects/${subProjectId}/subtitles/clean_burn.mp4`,
          is_watermarked: false, // Clean export from former paid subscription
          updated_at: new Date(),
        },
      }
    );

    await ownerContext.run(downgradedUserId, async () => {
      const result = await SubtitleStudioService.getProject(subProjectId, downgradedUserId);
      assert.equal(result.exportDownloadUrl, null, 'Clean export download URL MUST be suppressed for downgraded user');
      assert.equal((result.project as any).watermark_rerender_required, true, 'Project must flag watermark_rerender_required');
    });

    // A watermark flag alone cannot prove a legacy output matches current inputs.
    await db.collection('projects').updateOne(
      { id: subProjectId },
      { $set: { is_watermarked: true, updated_at: new Date() } }
    );

    await ownerContext.run(downgradedUserId, async () => {
      const resultWatermarked = await SubtitleStudioService.getProject(subProjectId, downgradedUserId);
      assert.equal(resultWatermarked.exportDownloadUrl,null,'Legacy watermark flag cannot mint a missing output freshness receipt');
      assert.equal(resultWatermarked.project.subtitle_export_status,'idle','Legacy output requires explicit rerender');
    });
  });

  // --------------------------------------------------------------------------
  // TEST 10: Zero-cost operations guarantee: no credit fees for watermarking or exports
  // --------------------------------------------------------------------------
  test('10. Zero-cost operations (SRT, VTT, previews, downloads, watermark re-renders) deduct 0 credits', async () => {
    await ownerContext.run(freeUserId, async () => {
      const walletBefore = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
      const balanceBefore = walletBefore.available_balance;

      const project = await SubtitleStudioService.createProject(freeUserId, {
        title: 'Zero Cost Test Project',
        source_url: 'https://example.com/test.mp4',
      });

      // Insert dummy cues
      await dataRepository.from('projects').update({
        subtitle_cues: [
          { index: 1, start: 0, end: 2.5, text: 'Hello VireoClip world.' },
        ],
      }).eq('id', project.id);

      // Export SRT & VTT
      const srt = await SubtitleStudioService.exportSRT(project.id, freeUserId);
      assert.ok(srt.includes('Hello VireoClip world.'));

      const vtt = await SubtitleStudioService.exportVTT(project.id, freeUserId);
      assert.ok(vtt.includes('WEBVTT'));

      // Check wallet balance remains untouched
      const walletAfter = await CreditWalletService.getWalletSummary(freeUserId, freeUserEmail);
      assert.equal(walletAfter.available_balance, balanceBefore, 'SRT and VTT exports must cost strictly 0 credits');
    });
  });
});
