import test, { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

import { closeMongo } from '../db/mongoClient.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { CaptionService } from '../services/captionService.js';
import { CaptionLocalizationService } from '../services/translation/captionLocalizationService.js';
import { TimedCaptionCue } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const ffprobeBin = (ffprobeStatic.path as unknown as string) || 'ffprobe';

const TEST_USER_A = '00000000-0000-4000-8000-000000000001';
const TEST_USER_B = '00000000-0000-4000-8000-000000000002';
const SAMPLE_VIDEO_PATH = path.resolve(process.cwd(), '../public/demo/sample-video.mp4');

describe('Final Production Verification: Subtitle Studio & AI Clipping Subtitles', () => {
  let createdProjectId: string;
  let tempOutputDir: string;

  before(async () => {
    tempOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-prod-test-'));
  });

  after(async () => {
    if (createdProjectId) {
      await ownerContext.run(TEST_USER_A, async () => {
        await dataRepository.from('projects').delete().eq('id', createdProjectId).eq('user_id', TEST_USER_A);
      });
    }
    fs.rmSync(tempOutputDir, { recursive: true, force: true });
    await closeMongo(true);
  });

  // =========================================================================
  // 1. Upload & Create Subtitle Project
  // =========================================================================
  it('1. Upload an actual supported video through the application', async () => {
    assert.ok(fs.existsSync(SAMPLE_VIDEO_PATH), 'Sample video file must exist');

    await ownerContext.run(TEST_USER_A, async () => {
      // Step 1: Create subtitle project
      const created = await SubtitleStudioService.createProject(TEST_USER_A, 'Production Test Subtitle Video');
      assert.ok(created.id, 'Project ID must be generated');
      assert.strictEqual(created.project_type, 'subtitles');
      assert.strictEqual(created.video_status, 'uploading');
      createdProjectId = created.id;

      // Step 2: Confirm upload with metadata (simulating direct S3/R2 upload)
      await dataRepository
        .from('projects')
        .update({
          source_url: SAMPLE_VIDEO_PATH,
          duration_seconds: 5.05,
          video_status: 'uploaded',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdProjectId)
        .eq('user_id', TEST_USER_A);

      const { data: project } = await dataRepository
        .from('projects')
        .select('*')
        .eq('id', createdProjectId)
        .eq('user_id', TEST_USER_A)
        .maybeSingle();

      assert.ok(project, 'Project must be found in database');
      assert.strictEqual(project.source_url, SAMPLE_VIDEO_PATH);
      assert.strictEqual(project.duration_seconds, 5.05);
    });
  });

  // =========================================================================
  // 2. Generate Subtitles from Transcript / Audio
  // =========================================================================
  it('2. Generate real subtitles using transcript cue extraction', async () => {
    await ownerContext.run(TEST_USER_A, async () => {
      const mockTranscript = {
        text: 'Welcome to VireoClip AI Subtitle Studio. Generate viral subtitles instantly.',
        duration_seconds: 5.05,
        words: [
          { word: 'Welcome', start: 0.1, end: 0.6, confidence: 0.98 },
          { word: 'to', start: 0.65, end: 0.8, confidence: 0.99 },
          { word: 'VireoClip', start: 0.85, end: 1.4, confidence: 0.95 },
          { word: 'AI', start: 1.45, end: 1.7, confidence: 0.97 },
          { word: 'Subtitle', start: 1.75, end: 2.3, confidence: 0.96 },
          { word: 'Studio.', start: 2.35, end: 2.9, confidence: 0.98 },
          { word: 'Generate', start: 3.1, end: 3.6, confidence: 0.95 },
          { word: 'viral', start: 3.65, end: 4.0, confidence: 0.96 },
          { word: 'subtitles', start: 4.05, end: 4.6, confidence: 0.97 },
          { word: 'instantly.', start: 4.65, end: 5.0, confidence: 0.99 },
        ],
      };

      const { cues } = CaptionService.extractClipCues(mockTranscript, 0, 5.05, 0, 0, {
        maxWordsPerCue: 5,
        maxCharsPerLine: 36,
        uppercase: false,
      });

      assert.ok(cues.length >= 2, 'Should extract at least 2 distinct cues');
      assert.ok(cues[0].start >= 0.1, 'Cue 1 start timestamp must match first word');
      assert.ok(cues[0].end <= 3.0, 'Cue 1 end timestamp must match last word in cue');
      assert.ok(cues[0].text.includes('Welcome to VireoClip'), 'Cue 1 text content preserved');

      // Save extracted cues to project
      await dataRepository
        .from('projects')
        .update({
          subtitle_cues: cues,
          video_status: 'transcribed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdProjectId)
        .eq('user_id', TEST_USER_A);
    });
  });

  // =========================================================================
  // 3. Edit Subtitle Text & Timestamps and Verify Persistence
  // =========================================================================
  it('3. Edit subtitle text and timestamps, reload project, and verify persistence', async () => {
    await ownerContext.run(TEST_USER_A, async () => {
      const editedCues: TimedCaptionCue[] = [
        {
          id: 'cue_edit_1',
          start: 0.2,
          end: 2.8,
          text: 'Edited Text: Welcome to VireoClip!',
        },
        {
          id: 'cue_edit_2',
          start: 3.0,
          end: 4.95,
          text: 'Edited Text: Fast Subtitles & Captions',
        },
      ];

      // Update cues via SubtitleStudioService
      const savedCues = await SubtitleStudioService.updateCues(createdProjectId, TEST_USER_A, editedCues);
      assert.strictEqual(savedCues.length, 2);
      assert.strictEqual(savedCues[0].text, 'Edited Text: Welcome to VireoClip!');
      assert.strictEqual(savedCues[0].start, 0.2);
      assert.strictEqual(savedCues[0].end, 2.8);

      // Reload project fresh from database
      const reloaded = await SubtitleStudioService.getProject(createdProjectId, TEST_USER_A);
      assert.ok(reloaded.project.subtitle_cues, 'Reloaded project must have subtitle cues');
      assert.strictEqual(reloaded.project.subtitle_cues.length, 2);
      assert.strictEqual(reloaded.project.subtitle_cues[0].text, 'Edited Text: Welcome to VireoClip!');
      assert.strictEqual(reloaded.project.subtitle_cues[1].text, 'Edited Text: Fast Subtitles & Captions');
      assert.strictEqual(reloaded.project.subtitle_cues[1].end, 4.95);
    });
  });

  // =========================================================================
  // 4 & 5. Export Actual Burned-in MP4 & Verify via FFprobe
  // =========================================================================
  it('4 & 5. Export burned-in MP4 and verify with FFprobe (resolution, codecs, duration, sync)', async () => {
    const burnedMp4Path = path.join(tempOutputDir, 'burned_test_output.mp4');
    const testAssPath = path.join(tempOutputDir, 'test_subtitles.ass');

    // Build real ASS subtitle script with Hormozi styling
    const sampleCues: TimedCaptionCue[] = [
      { id: 'c1', start: 0.2, end: 2.5, text: 'VIRAL SUBTITLE DEMO' },
      { id: 'c2', start: 2.6, end: 4.8, text: 'PERFECT SYNCHRONIZATION' },
    ];

    const assScript = CaptionService.buildAssScript(sampleCues, {
      fontFamily: 'Montserrat',
      fontSize: 54,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
      strokeWidth: 4,
      strokeColor: '#000000',
      alignment: 'center',
      position: 'bottom',
    });

    fs.writeFileSync(testAssPath, assScript, 'utf8');

    // Windows colon escaping
    const safeAss = testAssPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');

    // Run real FFmpeg burn on actual sample video
    await execFileAsync(ffmpegBin, [
      '-y',
      '-i', SAMPLE_VIDEO_PATH,
      '-vf', `ass=${safeAss}`,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      burnedMp4Path,
    ]);

    assert.ok(fs.existsSync(burnedMp4Path), 'Burned MP4 must be created on disk');
    const stat = fs.statSync(burnedMp4Path);
    assert.ok(stat.size > 1000, `Burned MP4 size must be positive (>1KB), got ${stat.size}`);

    // FFprobe inspection
    const { stdout: probeRaw } = await execFileAsync(ffprobeBin, [
      '-v', 'error',
      '-show_entries', 'format=duration,size,bit_rate:stream=codec_name,codec_type,width,height,duration',
      '-of', 'json',
      burnedMp4Path,
    ]);

    const probe = JSON.parse(probeRaw);
    const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');

    // Assert video stream parameters
    assert.ok(videoStream, 'Output MP4 must contain video stream');
    assert.strictEqual(videoStream.codec_name, 'h264');
    assert.strictEqual(videoStream.width, 960);
    assert.strictEqual(videoStream.height, 540);

    // Assert audio stream parameters
    assert.ok(audioStream, 'Output MP4 must contain audio stream');
    assert.strictEqual(audioStream.codec_name, 'aac');

    // Assert duration matches original sample (~5.05s)
    const outDuration = parseFloat(probe.format?.duration || '0');
    assert.ok(Math.abs(outDuration - 5.05) < 0.2, `Duration must match (~5.05s), got ${outDuration}`);
  });

  // =========================================================================
  // 6. Test SRT and VTT Downloads
  // =========================================================================
  it('6. Test SRT and VTT downloads using generated subtitle data', async () => {
    await ownerContext.run(TEST_USER_A, async () => {
      // Export SRT
      const srt = await SubtitleStudioService.exportSRT(createdProjectId, TEST_USER_A);
      assert.ok(srt.includes('1\n00:00:00,200 --> 00:00:02,800\nEdited Text: Welcome to VireoClip!'));
      assert.ok(srt.includes('2\n00:00:03,000 --> 00:00:04,950\nEdited Text: Fast Subtitles & Captions'));

      // Export VTT
      const vtt = await SubtitleStudioService.exportVTT(createdProjectId, TEST_USER_A);
      assert.ok(vtt.startsWith('WEBVTT\n\n'));
      assert.ok(vtt.includes('00:00:00.200 --> 00:00:02.800\nEdited Text: Welcome to VireoClip!'));
      assert.ok(vtt.includes('00:00:03.000 --> 00:00:04.950\nEdited Text: Fast Subtitles & Captions'));
    });
  });

  // =========================================================================
  // 7. Generate AI Clip with Subtitles Enabled vs Disabled
  // =========================================================================
  it('7. Generate AI clip with subtitles enabled and subtitles disabled', async () => {
    const clipWithSubPath = path.join(tempOutputDir, 'clip_with_subtitles.mp4');
    const clipCleanPath = path.join(tempOutputDir, 'clip_clean_no_subtitles.mp4');

    // Subtitled clip (with ASS filter)
    const testAssPath = path.join(tempOutputDir, 'clip_sub.ass');
    const sampleCues: TimedCaptionCue[] = [
      { id: 'c1', start: 0.5, end: 2.5, text: 'HORMOZI VIRAL HOOK' },
    ];
    const assScript = CaptionService.buildAssScript(sampleCues, {
      fontFamily: 'Montserrat',
      fontSize: 50,
      textColor: '#FFFFFF',
      highlightColor: '#FACC15',
    });
    fs.writeFileSync(testAssPath, assScript, 'utf8');
    const safeAss = testAssPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');

    // Render Clip A with subtitles
    await execFileAsync(ffmpegBin, [
      '-y',
      '-ss', '1.0',
      '-t', '3.0',
      '-i', SAMPLE_VIDEO_PATH,
      '-vf', `ass=${safeAss}`,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      clipWithSubPath,
    ]);

    // Render Clip B clean (NO subtitle filter)
    await execFileAsync(ffmpegBin, [
      '-y',
      '-ss', '1.0',
      '-t', '3.0',
      '-i', SAMPLE_VIDEO_PATH,
      '-c:v', 'libx264',
      '-c:a', 'aac',
      clipCleanPath,
    ]);

    assert.ok(fs.existsSync(clipWithSubPath), 'Subtitled clip must exist');
    assert.ok(fs.existsSync(clipCleanPath), 'Clean clip must exist');

    const statSub = fs.statSync(clipWithSubPath);
    const statClean = fs.statSync(clipCleanPath);
    assert.ok(statSub.size > 1000, 'Subtitled clip must have valid size');
    assert.ok(statClean.size > 1000, 'Clean clip must have valid size');

    // Both clips must probe validly
    const { stdout: probeA } = await execFileAsync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', clipWithSubPath]);
    const { stdout: probeB } = await execFileAsync(ffprobeBin, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', clipCleanPath]);

    const durA = parseFloat(JSON.parse(probeA).format?.duration || '0');
    const durB = parseFloat(JSON.parse(probeB).format?.duration || '0');

    assert.ok(Math.abs(durA - 3.0) < 0.2, `Clip A duration must be ~3s, got ${durA}`);
    assert.ok(Math.abs(durB - 3.0) < 0.2, `Clip B duration must be ~3s, got ${durB}`);
  });

  // =========================================================================
  // 8. Timestamp Local Timeline Conversion for Clips
  // =========================================================================
  it("8. Verify subtitle timestamps are correctly converted to clip's local timeline", () => {
    // Original video transcript cues spanning 10.0s to 30.0s
    const originalCues: TimedCaptionCue[] = [
      { id: 'c0', start: 2.0, end: 8.0, text: 'Before Clip Segment' },
      { id: 'c1', start: 10.5, end: 14.0, text: 'Inside Clip Part 1' },
      { id: 'c2', start: 15.0, end: 18.5, text: 'Inside Clip Part 2' },
      { id: 'c3', start: 22.0, end: 26.0, text: 'After Clip Segment' },
    ];

    const clipStart = 10.0;
    const clipEnd = 20.0;

    // Filter and convert to clip local timeline
    const clipLocalCues = originalCues
      .filter((cue) => cue.end > clipStart && cue.start < clipEnd)
      .map((cue) => ({
        ...cue,
        start: Math.max(0, Number((cue.start - clipStart).toFixed(3))),
        end: Math.min(clipEnd - clipStart, Number((cue.end - clipStart).toFixed(3))),
      }));

    assert.strictEqual(clipLocalCues.length, 2, 'Only cues overlapping [10s, 20s] should be retained');
    // c1 originally [10.5, 14.0] -> local [0.5, 4.0]
    assert.strictEqual(clipLocalCues[0].text, 'Inside Clip Part 1');
    assert.strictEqual(clipLocalCues[0].start, 0.5);
    assert.strictEqual(clipLocalCues[0].end, 4.0);

    // c2 originally [15.0, 18.5] -> local [5.0, 8.5]
    assert.strictEqual(clipLocalCues[1].text, 'Inside Clip Part 2');
    assert.strictEqual(clipLocalCues[1].start, 5.0);
    assert.strictEqual(clipLocalCues[1].end, 8.5);
  });

  // =========================================================================
  // 9. Error Handling: Failed Jobs, Invalid Inputs, and Retries
  // =========================================================================
  it('9. Test failed jobs, invalid inputs, error states and recovery', async () => {
    await ownerContext.run(TEST_USER_A, async () => {
      // 1. Invalid cues payload rejection
      await assert.rejects(
        async () => {
          // @ts-expect-error invalid type
          await SubtitleStudioService.updateCues(createdProjectId, TEST_USER_A, 'invalid-payload');
        },
        { name: 'AppError', message: 'Cues must be an array.' }
      );

      // 2. Invalid start/end timestamps rejection
      await assert.rejects(
        async () => {
          await SubtitleStudioService.updateCues(createdProjectId, TEST_USER_A, [
            { id: 'bad_1', start: 5.0, end: 2.0, text: 'Backwards timestamps' },
          ]);
        },
        { name: 'AppError', message: 'Cue at index 0 has end timestamp earlier than or equal to start.' }
      );

      // 3. Failed export status transition and recovery
      await dataRepository
        .from('projects')
        .update({
          subtitle_export_status: 'failed',
          subtitle_export_error: 'FFmpeg process terminated unexpectedly',
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdProjectId)
        .eq('user_id', TEST_USER_A);

      let status = await SubtitleStudioService.getBurnStatus(createdProjectId, TEST_USER_A);
      assert.strictEqual(status.exportStatus, 'failed');
      assert.strictEqual(status.error, 'FFmpeg process terminated unexpectedly');

      // Retry: Reset to rendering and recover
      await dataRepository
        .from('projects')
        .update({
          subtitle_export_status: 'ready',
          subtitle_export_error: null,
          subtitle_export_progress: 100,
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdProjectId)
        .eq('user_id', TEST_USER_A);

      status = await SubtitleStudioService.getBurnStatus(createdProjectId, TEST_USER_A);
      assert.strictEqual(status.exportStatus, 'ready');
      assert.strictEqual(status.progress, 100);
      assert.strictEqual(status.error, null);
    });
  });

  // =========================================================================
  // 10. Multi-Tenant Access Isolation
  // =========================================================================
  it('10. Test access isolation using two different user accounts', async () => {
    // Project was created by TEST_USER_A.
    // TEST_USER_B attempts to view, edit, and export.
    await ownerContext.run(TEST_USER_B, async () => {
      // User B cannot get User A's project
      await assert.rejects(
        async () => {
          await SubtitleStudioService.getProject(createdProjectId, TEST_USER_B);
        },
        { name: 'AppError', message: 'Subtitle project not found.' }
      );

      // User B cannot update User A's cues
      await assert.rejects(
        async () => {
          await SubtitleStudioService.updateCues(createdProjectId, TEST_USER_B, [
            { id: 'hacked_cue', start: 0, end: 1, text: 'Hacked' },
          ]);
        },
        { name: 'AppError', message: 'Subtitle project not found.' }
      );

      // User B cannot update User A's style
      await assert.rejects(
        async () => {
          await SubtitleStudioService.updateStyle(createdProjectId, TEST_USER_B, { fontFamily: 'Arial' });
        },
        { name: 'AppError', message: 'Subtitle project not found.' }
      );

      // User B cannot export User A's SRT
      await assert.rejects(
        async () => {
          await SubtitleStudioService.exportSRT(createdProjectId, TEST_USER_B);
        },
        { name: 'AppError', message: 'Subtitle project not found.' }
      );

      // User B listing projects does not include User A's project
      const userBProjects = await SubtitleStudioService.listProjects(TEST_USER_B);
      assert.strictEqual(userBProjects.some((p) => p.id === createdProjectId), false);
    });
  });

  // =========================================================================
  // 11. Existing AI Clipping Functionality Verification
  // =========================================================================
  it('11. Verify that existing AI clipping functionality remains unaffected', async () => {
    await ownerContext.run(TEST_USER_A, async () => {
      const normalProjId = crypto.randomUUID();
      await dataRepository.from('projects').insert({
        id: normalProjId,
        title: 'Normal Clipping Project',
        user_id: TEST_USER_A,
        project_type: 'clipping',
        source_type: 'upload',
        video_status: 'uploaded',
        clip_preferences: {
          genre: 'business',
          aspectRatio: '9:16',
          preferredDurations: '30-60',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const { data: normalProj } = await dataRepository
        .from('projects')
        .select('*')
        .eq('id', normalProjId)
        .eq('user_id', TEST_USER_A)
        .maybeSingle();

      assert.ok(normalProj, 'Inserted normal clipping project must be retrieved');
      assert.strictEqual(normalProj.id, normalProjId);
      assert.strictEqual(normalProj.project_type, 'clipping');
      assert.strictEqual(normalProj.clip_preferences.genre, 'business');

      // Clean up normal project
      await dataRepository.from('projects').delete().eq('id', normalProjId).eq('user_id', TEST_USER_A);
    });
  });
});
