import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import { defaultAiProvider } from '../services/aiProviderClient.js';
import { VideoIntelligenceRecord } from '../types/videoIntelligence.js';
import { config } from '../config/index.js';

describe('Phase 4B.1 — Backend Multi-Source & Video Intelligence Integration (Hardened)', () => {
  const userId = crypto.randomUUID();
  const otherUserId = crypto.randomUUID();
  let projectId: string;
  let clipId: string;
  let videoIntelligenceId: string;
  let ocrOnlyViId: string;
  let visualOnlyViId: string;
  let tempSecDir: string;
  let authorizedTestRoot: string;

  // Mock AI Provider
  const originalGenerateJsonCompletion = defaultAiProvider.generateJsonCompletion;

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-test-key-for-content-pack';

    // Ping MongoDB
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    projectId = crypto.randomUUID();
    clipId = crypto.randomUUID();
    videoIntelligenceId = crypto.randomUUID();
    ocrOnlyViId = crypto.randomUUID();
    visualOnlyViId = crypto.randomUUID();

    // Setup temporary security sandbox for path tests
    tempSecDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p4b1-sec-'));
    authorizedTestRoot = path.join(tempSecDir, 'uploads', userId);
    fs.mkdirSync(authorizedTestRoot, { recursive: true });

    // Seed test Project, Clip, and Transcript inside ownerContext
    await ownerContext.run(userId, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userId,
        title: 'Architectural Deep Dive into High-Performance Video Repurposing',
        source_type: 'upload',
        source_storage_path: 'uploads/test-video.mp4',
        duration_seconds: 120,
        video_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: userId,
        project_id: projectId,
        title: 'High-Performance Video Repurposing Architecture',
        start_seconds: 10,
        end_seconds: 40,
        duration: 30,
        status: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: projectId,
        transcript_text:
          'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration. We achieve real-time 60fps throughput.',
        language: 'en',
        segments: [
          {
            start: 10,
            end: 25,
            text: 'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing.',
          },
          {
            start: 25,
            end: 40,
            text: 'Using Intel Arc GPU acceleration, we achieve real-time 60fps throughput.',
          },
          {
            start: 40,
            end: 80,
            text: 'Next, we look at the multi-platform content creation pipeline and claim guard verification.',
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    // Seed VideoIntelligenceRecords in MongoDB
    const db = await getMongoDb();

    // 1. Full multimodal record (Both OCR and visual objects)
    const mockViRecord: VideoIntelligenceRecord = {
      id: videoIntelligenceId,
      user_id: userId,
      source_hash: crypto.randomUUID(),
      engine_version: '1.7.0',
      source_identity: {
        sourceHash: crypto.randomUUID(),
        rawContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        verificationLevel: 'FULL_CONTENT_SHA256',
        strategy: 'full_stream',
        fileSizeBytes: 1024 * 1024 * 25,
        containerSignature: {
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
          fps: 60,
          hasAudio: true,
        },
        engineVersion: '1.7.0',
        verifiedAt: new Date(),
      },
      status: 'completed',
      attempt_count: 1,
      max_attempts: 3,
      metadata: {
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        fps: 60,
        hasAudio: true,
      },
      audio_intelligence: {
        transcriptText:
          'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration. We achieve real-time 60fps throughput.',
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [],
        meanVolumeDb: -18,
        speakingPaceWpm: 140,
      },
      visual_intelligence: {
        ocr: [
          { text: 'Intel Arc 130T Benchmark', confidence: 0.95, timestamp: 12 },
          { text: 'Throughput: 60 FPS', confidence: 0.98, timestamp: 24 },
        ],
        objects: [
          { label: 'laptop', category: 'device', confidence: 0.92, timestamp: 15 },
          { label: 'desk', category: 'furniture', confidence: 0.89, timestamp: 22 },
        ],
        shots: [],
        scenes: [],
        faces: [],
        cameraMotion: [],
      },
      multimodal_reasoning: {
        summary: 'Deep dive into Intel Arc GPU performance benchmarks and video repurposing pipelines.',
        topics: ['Intel Arc', 'Video Repurposing', 'GPU Benchmarks'],
        groundedProvenance: {
          spokenFacts: [],
          visualObservations: [],
          ocrConfirmedText: [],
          inferences: [],
          contradictions: [],
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection('video_intelligence').insertOne(mockViRecord);
    delete (mockViRecord as any)._id;

    // 2. OCR Only Record (no visual objects)
    const ocrOnlyRecord: VideoIntelligenceRecord = {
      ...mockViRecord,
      id: ocrOnlyViId,
      source_hash: crypto.randomUUID(),
      visual_intelligence: {
        ...mockViRecord.visual_intelligence,
        ocr: [{ text: 'Special Discount SAVE50', confidence: 0.99, timestamp: 10 }],
        objects: [], // strictly empty
      },
    };
    await db.collection('video_intelligence').insertOne(ocrOnlyRecord);
    delete (ocrOnlyRecord as any)._id;

    // 3. Visual Objects Only Record (no OCR)
    const visualOnlyRecord: VideoIntelligenceRecord = {
      ...mockViRecord,
      id: visualOnlyViId,
      source_hash: crypto.randomUUID(),
      visual_intelligence: {
        ...mockViRecord.visual_intelligence,
        ocr: [], // strictly empty
        objects: [{ label: 'standing desk', category: 'furniture', confidence: 0.95, timestamp: 5 }],
      },
    };
    await db.collection('video_intelligence').insertOne(visualOnlyRecord);

    // Mock AI completion returning grounded text
    defaultAiProvider.generateJsonCompletion = async () => {
      return {
        primary_title: 'High-Performance Video Repurposing on Intel Arc',
        alt_titles: [
          { text: 'How We Achieve 60fps Video Repurposing', category: 'BENEFIT' },
          { text: 'The Secret to Real-Time Video Clipping', category: 'CURIOSITY' },
        ],
        hooks: [
          'Want real-time 60fps video throughput?',
          'Here is how we built our GPU pipeline.',
        ],
        short_caption: 'Deep dive into high-performance video repurposing with Intel Arc GPU acceleration.',
        long_caption: 'Detailed architectural breakdown of real-time 60fps video repurposing.',
        short_description: 'An overview of high-speed video clipping and repurposing architecture.',
        long_description: 'Key takeaways from the video repurposing engineering pipeline.',
        cta_variants: ['Drop your questions below', 'Follow for more engineering insights'],
        hashtags: ['#VideoEngineering', '#IntelArc', '#VideoProcessing'],
        keywords: ['video repurposing', 'Intel Arc', '60fps'],
        thumbnail_direction: 'Creator working on a laptop at a desk with benchmark graphs',
        thumbnail_texts: ['60 FPS Live', 'GPU Power', 'Real-Time Clip'],
        alt_text: 'Creator working at a desk on a laptop with video editing timeline',
        pinned_comment: 'What GPU do you use for video encoding?',
        platform_packs: {
          youtube: {
            title: 'High-Performance Video Repurposing on Intel Arc',
            description: 'Full technical breakdown of 60fps throughput.',
          },
          linkedin: {
            post: 'Engineering lessons learned building a 60fps video pipeline.',
          },
        },
      } as any;
    };
  });

  after(async () => {
    defaultAiProvider.generateJsonCompletion = originalGenerateJsonCompletion;
    if (tempSecDir && fs.existsSync(tempSecDir)) {
      try {
        fs.rmSync(tempSecDir, { recursive: true, force: true });
      } catch {}
    }
    await closeMongo();
  });

  // ── Source Flexibility Tests ──────────────────────────────────────────

  it('1. Clip Source: Generates Content Pack from clipId and projectId (Backward Compatible)', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId,
      projectId,
      clipId,
      mode: 'BALANCED',
      template: 'Creator',
    });

    assert.ok(pack.id, 'Pack ID should be generated');
    assert.equal(pack.user_id, userId);
    assert.equal(pack.project_id, projectId);
    assert.equal(pack.clip_id, clipId);
    assert.equal(pack.source.source_type, 'clip');
    assert.equal(pack.source.clip_start, 10);
    assert.equal(pack.source.clip_end, 40);
    assert.ok(pack.items && pack.items.length > 0);
  });

  it('2. Project Source: Generates Content Pack from full project video (without clipId)', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId,
      sourceType: 'project',
      projectId,
      mode: 'BALANCED',
    });

    assert.ok(pack.id);
    assert.equal(pack.user_id, userId);
    assert.equal(pack.project_id, projectId);
    assert.equal(pack.clip_id, undefined, 'Project source should not require a clipId');
    assert.equal(pack.source.source_type, 'project');
    assert.equal(pack.source.duration, 120, 'Duration should resolve from project.duration_seconds');
    assert.ok(pack.items && pack.items.length > 0);
  });

  it('3. Transcript Source: Generates Content Pack from standalone text (without project/video)', async () => {
    const rawTranscript =
      'This is a pure standalone lecture transcript on distributed computing and consensus protocols. Raft provides a understandable way to manage replicated logs.';

    const pack = await ContentPackService.generateContentPack({
      userId,
      sourceType: 'transcript',
      transcriptText: rawTranscript,
      sourceTitle: 'Consensus Systems Lecture',
      mode: 'QUICK',
    });

    assert.ok(pack.id);
    assert.equal(pack.user_id, userId);
    assert.equal(pack.project_id, undefined, 'Transcript source has no projectId');
    assert.equal(pack.clip_id, undefined, 'Transcript source has no clipId');
    assert.equal(pack.source.source_type, 'transcript');
    assert.equal(pack.source.transcript_source, 'user_provided_transcript');
    assert.equal(pack.source.has_visual_intelligence, false);
    assert.equal(pack.source.ocr_headings_count, 0);
    assert.equal(pack.source.dominant_objects_count, 0);
  });

  it('4. Upload Source: Generates Content Pack from verified VideoIntelligenceRecord', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId,
      sourceType: 'upload',
      videoIntelligenceId,
      sourceTitle: 'Uploaded Product Walkthrough',
      mode: 'BALANCED',
    });

    assert.ok(pack.id);
    assert.equal(pack.user_id, userId);
    assert.equal(pack.source.source_type, 'upload');
    assert.equal(pack.source_sha256, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(pack.source.has_visual_intelligence, true);
    assert.equal(pack.source.ocr_headings_count, 2);
    assert.equal(pack.source.dominant_objects_count, 2);
  });

  // ── Provenance & Truthful Evidence Classification Tests ─────────────────

  it('5. Provenance 1 (Transcript-only source): Strictly NEVER fabricates visual or OCR evidence', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId,
      sourceType: 'transcript',
      transcriptText:
        'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration.',
      sourceTitle: 'Audio Lecture',
      mode: 'QUICK',
    });

    const items = pack.items || [];
    assert.ok(items.length > 0);

    // 1. Verify grounded text items are truthfully classified as TRANSCRIPT_EVIDENCE
    const titleItem = items.find((i) => i.type === 'PRIMARY_TITLE');
    assert.ok(titleItem, 'Should find primary title');
    assert.equal(titleItem.source_evidence[0].classification, 'TRANSCRIPT_EVIDENCE');
    assert.ok(titleItem.source_evidence[0].quote_snippet, 'Grounded transcript evidence must include matching quote snippet');

    const captionItem = items.find((i) => i.type === 'SHORT_CAPTION');
    assert.ok(captionItem, 'Should find short caption');
    assert.equal(captionItem.source_evidence[0].classification, 'TRANSCRIPT_EVIDENCE');

    // 2. Verify visual briefs remain UNVERIFIED_EVIDENCE without visual intelligence
    const thumbItem = items.find((i) => i.type === 'THUMBNAIL_DIRECTION');
    assert.ok(thumbItem, 'Should find thumbnail direction');
    assert.equal(thumbItem.source_evidence[0].classification, 'UNVERIFIED_EVIDENCE');

    // 3. Verify generic CTA without transcript overlap remains UNVERIFIED_EVIDENCE (not falsely assumed transcript)
    const ctaItem = items.find((i) => i.type === 'CTA');
    assert.ok(ctaItem, 'Should find CTA item');
    assert.equal(ctaItem.source_evidence[0].classification, 'UNVERIFIED_EVIDENCE');

    // 4. Strict zero-fabrication invariant across ALL items on transcript source
    for (const item of items) {
      assert.ok(item.source_evidence && item.source_evidence.length > 0);
      for (const ev of item.source_evidence) {
        assert.equal(ev.ocr_text, undefined, 'ocr_text must be strictly undefined on transcript source');
        assert.equal(ev.visual_objects, undefined, 'visual_objects must be strictly undefined on transcript source');
      }
    }
  });

  it('6. Provenance 2 (OCR present, no visual objects): Content matching on-screen text receives OCR_EVIDENCE', async () => {
    const ocrEvidence = ContentPackService.evaluateItemEvidence({
      text: 'Special Discount SAVE50 for all new VireoClip subscribers',
      type: 'PRIMARY_TITLE',
      effectiveSourceType: 'upload',
      boundedTranscript: 'Subscribe today and get discounts.',
      ocrHeadings: ['Special Discount SAVE50'],
      dominantObjects: [], // no visual objects
    });

    assert.ok(ocrEvidence.length > 0);
    const primaryEntry = ocrEvidence[0];
    assert.ok(
      primaryEntry.classification === 'OCR_EVIDENCE' || primaryEntry.classification === 'MIXED_EVIDENCE',
      'Should classify matching OCR text'
    );
    assert.equal(primaryEntry.ocr_text, 'Special Discount SAVE50');
    assert.equal(primaryEntry.visual_objects, undefined, 'Must NOT fabricate visual objects when none detected');

    // Visual item with no visual objects and no OCR text in its text remains UNVERIFIED_EVIDENCE
    const visualItemEvidence = ContentPackService.evaluateItemEvidence({
      text: 'Creative visual showing abstract blue waves',
      type: 'THUMBNAIL_DIRECTION',
      effectiveSourceType: 'upload',
      boundedTranscript: 'Subscribe today and get discounts.',
      ocrHeadings: ['Special Discount SAVE50'],
      dominantObjects: [], // no visual objects
    });

    assert.equal(visualItemEvidence[0].classification, 'UNVERIFIED_EVIDENCE');
    assert.equal(visualItemEvidence[0].visual_objects, undefined);
    assert.equal(visualItemEvidence[0].ocr_text, undefined);
  });

  it('7. Provenance 3 (Visual objects present, no OCR): Visual items receive VISUAL_OBJECT_EVIDENCE with real objects', async () => {
    const visualEvidence = ContentPackService.evaluateItemEvidence({
      text: 'Creator standing in front of a standing desk presenting workflow',
      type: 'THUMBNAIL_DIRECTION',
      effectiveSourceType: 'upload',
      boundedTranscript: 'Workflow presentation.',
      ocrHeadings: [], // no OCR
      dominantObjects: ['standing desk'],
    });

    assert.ok(visualEvidence.length > 0);
    const entry = visualEvidence[0];
    assert.equal(entry.classification, 'VISUAL_OBJECT_EVIDENCE');
    assert.ok(entry.visual_objects?.includes('standing desk'));
    assert.equal(entry.ocr_text, undefined, 'Must NOT fabricate OCR text when no OCR detected');
  });

  it('8. Provenance 4 (Mixed OCR, visual and transcript evidence): Multi-source items reference all sources', async () => {
    const mixedEvidence = ContentPackService.evaluateItemEvidence({
      text: 'High-performance video repurposing on Intel Arc 130T Benchmark using your laptop',
      type: 'PRIMARY_TITLE',
      effectiveSourceType: 'upload',
      boundedTranscript:
        'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration.',
      ocrHeadings: ['Intel Arc 130T Benchmark'],
      dominantObjects: ['laptop'],
    });

    assert.ok(mixedEvidence.length >= 2, 'Mixed evidence must return primary mixed entry plus granular entries');
    const primary = mixedEvidence[0];
    assert.equal(primary.classification, 'MIXED_EVIDENCE');
    assert.equal(primary.ocr_text, 'Intel Arc 130T Benchmark');
    assert.ok(primary.visual_objects?.includes('laptop'));
    assert.ok(primary.quote_snippet?.includes('high-performance video repurposing'));

    // Verify granular sub-entries exist
    assert.ok(mixedEvidence.some((e) => e.classification === 'TRANSCRIPT_EVIDENCE'));
    assert.ok(mixedEvidence.some((e) => e.classification === 'OCR_EVIDENCE'));
    assert.ok(mixedEvidence.some((e) => e.classification === 'VISUAL_OBJECT_EVIDENCE'));
  });

  it('9. Provenance 5 (Completely unverified claims): Unsupported claims remain strictly UNVERIFIED_EVIDENCE', async () => {
    const unverifiedEvidence = ContentPackService.evaluateItemEvidence({
      text: 'Make $50,000 per month guaranteed with 99.9% success rate and zero risk',
      type: 'HOOK',
      effectiveSourceType: 'upload',
      boundedTranscript: 'Welcome to VireoClip engineering. Today we discuss video repurposing.',
      ocrHeadings: ['Intel Arc 130T Benchmark'],
      dominantObjects: ['laptop'],
    });

    assert.equal(unverifiedEvidence.length, 1);
    assert.equal(unverifiedEvidence[0].classification, 'UNVERIFIED_EVIDENCE');
    assert.equal(unverifiedEvidence[0].quote_snippet, undefined);
    assert.equal(unverifiedEvidence[0].ocr_text, undefined);
    assert.equal(unverifiedEvidence[0].visual_objects, undefined);
  });

  // ── File Path Security & Negative Tests ─────────────────────────────────

  it('10. Path Security 1: Rejects relative path traversal attempts with 403 FORBIDDEN_STORAGE_PATH', () => {
    assert.throws(
      () => {
        ContentPackService.resolveAuthoritativeVideoPath(userId, '../../secret.mp4', [authorizedTestRoot]);
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_STORAGE_PATH');
        assert.ok(err.message.includes('Path traversal detected'));
        return true;
      }
    );
  });

  it('11. Path Security 2: Rejects arbitrary absolute paths outside user storage with 403 FORBIDDEN_STORAGE_PATH', () => {
    const maliciousAbsPath =
      process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/etc/shadow';

    assert.throws(
      () => {
        ContentPackService.resolveAuthoritativeVideoPath(userId, maliciousAbsPath, [authorizedTestRoot]);
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_STORAGE_PATH');
        assert.ok(err.message.includes('Unauthorized absolute path'));
        return true;
      }
    );
  });

  it('12. Path Security 3: Rejects cross-user storage access attempts with 403 FORBIDDEN_STORAGE_PATH', () => {
    const crossUserCandidate = `uploads/${otherUserId}/private_video.mp4`;

    assert.throws(
      () => {
        ContentPackService.resolveAuthoritativeVideoPath(userId, crossUserCandidate, [authorizedTestRoot]);
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_STORAGE_PATH');
        assert.ok(err.message.includes('Cross-user storage access denied'));
        return true;
      }
    );
  });

  it('13. Path Security 4: Rejects symlink/junction escapes pointing outside user storage with 403 FORBIDDEN_STORAGE_PATH', () => {
    const outsideSecretDir = path.join(tempSecDir, 'outside_system_files');
    fs.mkdirSync(outsideSecretDir, { recursive: true });
    const secretFile = path.join(outsideSecretDir, 'confidential.mp4');
    fs.writeFileSync(secretFile, 'sensitive video data');

    const escapedJunction = path.join(authorizedTestRoot, 'escaped_junction');
    fs.symlinkSync(outsideSecretDir, escapedJunction, 'junction');

    assert.throws(
      () => {
        ContentPackService.resolveAuthoritativeVideoPath(
          userId,
          'escaped_junction/confidential.mp4',
          [authorizedTestRoot]
        );
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_STORAGE_PATH');
        assert.ok(err.message.includes('Symlink escape detected'));
        return true;
      }
    );
  });

  it('14. Path Security 5: Canonical resolution accepts valid files strictly within authorized storage', () => {
    const validVideoFile = path.join(authorizedTestRoot, 'legitimate_creator_video.mp4');
    fs.writeFileSync(validVideoFile, 'valid video content');

    const resolved = ContentPackService.resolveAuthoritativeVideoPath(
      userId,
      'legitimate_creator_video.mp4',
      [authorizedTestRoot]
    );

    assert.ok(resolved, 'Should resolve valid path');
    assert.equal(fs.realpathSync(validVideoFile), resolved);
  });

  it('15. Path Security 6: generateContentPack rejects project record containing path traversal in source_storage_path', async () => {
    const maliciousProjectId = crypto.randomUUID();

    await ownerContext.run(userId, async () => {
      await dataRepository.from('projects').insert({
        id: maliciousProjectId,
        user_id: userId,
        title: 'Project with Injected Traversal Path',
        source_type: 'upload',
        source_storage_path: '../../../../etc/passwd',
        duration_seconds: 60,
        video_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          sourceType: 'project',
          projectId: maliciousProjectId,
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 403);
        assert.equal(err.code, 'FORBIDDEN_STORAGE_PATH');
        return true;
      }
    );
  });

  // ── Tenant Isolation & Input Validation Tests ──────────────────────────

  it('16. Tenant Isolation: Other user cannot generate Content Pack from another user project', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: otherUserId, // Different user
          sourceType: 'project',
          projectId, // Belongs to userId
        });
      },
      (err: any) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'PROJECT_NOT_FOUND');
        return true;
      }
    );
  });

  it('17. Tenant Isolation: Other user cannot access another user VideoIntelligenceRecord', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: otherUserId, // Different user
          sourceType: 'upload',
          videoIntelligenceId, // Belongs to userId
        });
      },
      (err: any) => {
        assert.equal(err.name, 'AppError');
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'INTELLIGENCE_RECORD_NOT_FOUND');
        return true;
      }
    );
  });

  it('18. Input Validation: Missing required source inputs is rejected with 400 INVALID_INPUT', async () => {
    // Missing clipId for clip source
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          sourceType: 'clip',
          projectId,
          // clipId missing
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_INPUT');
        return true;
      }
    );

    // Empty transcript text for transcript source
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          sourceType: 'transcript',
          transcriptText: '   ', // whitespace only
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_INPUT');
        return true;
      }
    );
  });

  // ── Listing & Query Endpoints ──────────────────────────────────────────

  it('19. Content Studio Querying: listPacksForProject and listRecentPacks return user content packs', async () => {
    const projectPacks = await ContentPackService.listPacksForProject(userId, projectId);
    assert.ok(Array.isArray(projectPacks));
    assert.ok(projectPacks.length >= 2, 'Should list clip and project packs created in earlier tests');
    for (const p of projectPacks) {
      assert.equal(p.project_id, projectId);
      assert.equal(p.user_id, userId);
    }

    const recentPacks = await ContentPackService.listRecentPacks(userId, 10);
    assert.ok(Array.isArray(recentPacks));
    assert.ok(recentPacks.length >= 3, 'Should list recent packs including transcript-only packs');
    assert.ok(recentPacks.some((p) => p.source_type === 'transcript'));
    assert.ok(recentPacks.some((p) => p.source_type === 'clip'));
  });
});
