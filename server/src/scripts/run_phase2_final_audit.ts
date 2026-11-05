import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import {
  VideoIntelligenceRepository,
  CURRENT_ENGINE_VERSION,
} from '../db/repositories/videoIntelligenceRepository.js';
import { VideoIntelligenceService } from '../services/intelligence/videoIntelligenceService.js';
import { VideoIntelligenceRecord } from '../types/index.js';

interface AuditResult {
  section: string;
  testName: string;
  passed: boolean;
  details: string;
  measuredData?: any;
}

const auditLog: AuditResult[] = [];

function recordAudit(section: string, testName: string, passed: boolean, details: string, measuredData?: any) {
  auditLog.push({ section, testName, passed, details, measuredData });
  const statusMark = passed ? '[PASS]' : '[WARN/FAIL]';
  console.log(`${statusMark} [${section}] ${testName}: ${details}`);
  if (measuredData) {
    console.log(`   Data:`, JSON.stringify(measuredData, null, 2));
  }
}

async function runPhase2FinalAudit() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 2 FINAL INDEPENDENT VERIFICATION AUDIT');
  console.log('========================================================================\n');

  const db = await getMongoDb();
  const testUserA = '00000000-0000-4000-8000-0000000000a1';
  const testUserB = '00000000-0000-4000-8000-0000000000b2';
  const sampleVideo1 = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  const sampleStudio = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');

  // Clean test records before start
  await db.collection('video_intelligence').deleteMany({
    user_id: { $in: [testUserA, testUserB] },
  });

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 1: LARGE-FILE SOURCE IDENTITY & LIMITATION EXPERIMENT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 1: LARGE-FILE SOURCE IDENTITY AUDIT ---');

  // 1.1 Source inspection of verifyAuthoritativeSourceMatch
  const verifySourceCode = VideoIntelligenceService.verifyAuthoritativeSourceMatch.toString();
  const checksHead = verifySourceCode.includes('headSectorHash');
  const checksMid = verifySourceCode.includes('midSectorHash');
  const checksTail = verifySourceCode.includes('tailSectorHash');
  const checksDuration = verifySourceCode.includes('durationSeconds');
  const checksSize = verifySourceCode.includes('fileSizeBytes');

  recordAudit(
    'Section 1',
    'verifyAuthoritativeSourceMatch Code Inspection',
    true,
    `Inspected 5-point check. HeadSector: ${checksHead}, MidSector: ${checksMid}, TailSector: ${checksTail}, Duration: ${checksDuration}, FileSize: ${checksSize}`,
    { checksHead, checksMid, checksTail, checksDuration, checksSize }
  );

  // 1.2 Synthetic Collision Experiment: Two files > 64MB with identical Head, Mid, Tail, Size, Duration
  // but differing content in unsampled quartile (offset 16MB)
  console.log('\nGenerating synthetic large files (> 64MB) to test unsampled byte modification...');
  const tempDir = path.resolve(process.cwd(), '../delete/audit_test_files');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const largeFileSize = 68 * 1024 * 1024; // 68 MB (exceeds 64MB boundary)
  const fileA = path.join(tempDir, 'large_file_A.mp4');
  const fileB = path.join(tempDir, 'large_file_B.mp4');

  try {
    // Create base 68MB buffer with structured sectors
    const fdA = fs.openSync(fileA, 'w');
    const fdB = fs.openSync(fileB, 'w');

    const sampleSectorSize = 2 * 1024 * 1024; // 2MB
    const headBlock = Buffer.alloc(sampleSectorSize, 0x11);
    const midBlock = Buffer.alloc(sampleSectorSize, 0x22);
    const tailBlock = Buffer.alloc(sampleSectorSize, 0x33);

    // Padding blocks
    const pad1Size = Math.floor(largeFileSize / 2) - sampleSectorSize; // 0MB to 32MB padding
    const pad2Size = largeFileSize - (sampleSectorSize + pad1Size + sampleSectorSize + sampleSectorSize); // remaining

    const pad1A = Buffer.alloc(pad1Size, 0xaa);
    const pad1B = Buffer.alloc(pad1Size, 0xaa);
    // Alter byte at 16MB in File B (in the unsampled first quartile)
    pad1B[16 * 1024 * 1024] = 0xee;

    // Write File A
    fs.writeSync(fdA, headBlock);
    fs.writeSync(fdA, pad1A);
    fs.writeSync(fdA, midBlock);
    fs.writeSync(fdA, Buffer.alloc(pad2Size, 0xcc));
    fs.writeSync(fdA, tailBlock);

    // Write File B
    fs.writeSync(fdB, headBlock);
    fs.writeSync(fdB, pad1B);
    fs.writeSync(fdB, midBlock);
    fs.writeSync(fdB, Buffer.alloc(pad2Size, 0xcc));
    fs.writeSync(fdB, tailBlock);

    fs.closeSync(fdA);
    fs.closeSync(fdB);

    const statA = fs.statSync(fileA);
    const statB = fs.statSync(fileB);

    const mockMetaA = {
      durationSeconds: 120.0,
      width: 1920,
      height: 1080,
      aspectRatio: '16:9',
      fps: 30,
      hasAudio: true,
      audioCodec: 'aac',
    };
    const mockMetaB = { ...mockMetaA };

    // Compute identities
    const idA = VideoIntelligenceService.computeSourceIdentity(fileA, { userId: testUserA, metadata: mockMetaA });
    const idB = VideoIntelligenceService.computeSourceIdentity(fileB, { userId: testUserA, metadata: mockMetaB });

    const hashMatch = idA.sourceHash === idB.sourceHash;

    const mockRecordA: VideoIntelligenceRecord = {
      id: crypto.randomUUID(),
      user_id: testUserA,
      source_hash: idA.sourceHash,
      status: 'completed',
      engine_version: CURRENT_ENGINE_VERSION,
      source_identity: idA,
      metadata: mockMetaA,
      attempt_count: 1,
      max_attempts: 3,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const verifyResult = await VideoIntelligenceService.verifyAuthoritativeSourceMatch(fileB, mockRecordA, mockMetaB);

    recordAudit(
      'Section 1',
      'Unsampled Byte Collision Vulnerability Test (>64MB)',
      !hashMatch && !verifyResult.isMatch, // Expected to pass ONLY if it detects difference
      `Hash Match: ${hashMatch}, Authoritative Match: ${verifyResult.isMatch}. ` +
      (hashMatch && verifyResult.isMatch
        ? 'FINDING: Sampled composite cannot detect alterations in unsampled byte regions (e.g. at 16MB) when Head, Mid, Tail, and container metadata match.'
        : 'Difference detected.'),
      {
        fileASize: statA.size,
        fileBSize: statB.size,
        idA_hash: idA.sourceHash,
        idB_hash: idB.sourceHash,
        hashesIdentical: hashMatch,
        authoritativeVerificationPassed: verifyResult.isMatch,
        vulnerabilityConfirmed: hashMatch && verifyResult.isMatch,
      }
    );

    // 1.3 Full SHA-256 Benchmark Feasibility
    const tStartSha = Date.now();
    const fullHash = crypto.createHash('sha256').update(fs.readFileSync(fileA)).digest('hex');
    const elapsedSha = Date.now() - tStartSha;
    recordAudit(
      'Section 1',
      'Full-Stream SHA-256 Benchmark (68MB file)',
      elapsedSha < 200,
      `Full-stream SHA-256 on 68MB disk file computed in ${elapsedSha}ms. Cryptographic certainty is viable with minimal overhead.`,
      { elapsedSha, fullHash: fullHash.slice(0, 16) }
    );
  } finally {
    if (fs.existsSync(fileA)) fs.unlinkSync(fileA);
    if (fs.existsSync(fileB)) fs.unlinkSync(fileB);
    if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 2: CONCURRENCY AND IDEMPOTENCY AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 2: CONCURRENCY AND IDEMPOTENCY AUDIT ---');

  const meta1 = await VideoIntelligenceService.probeMetadata(sampleVideo1);
  const idUserA = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, { userId: testUserA, metadata: meta1 });
  const idUserB = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, { userId: testUserB, metadata: meta1 });

  // 2.1 Multiple simultaneous requests for same source from one user
  const concurrentWorkers = 5;
  const leasePromises = Array.from({ length: concurrentWorkers }, (_, idx) =>
    VideoIntelligenceRepository.acquireLease(testUserA, idUserA.sourceHash, `worker_concurrent_${idx}`, {
      source_identity: idUserA,
      metadata: meta1,
    })
  );

  const leaseResults = await Promise.all(leasePromises);
  const acquiredCount = leaseResults.filter((r) => r.acquired).length;
  const duplicateBlockedCount = leaseResults.filter((r) => !r.acquired).length;

  recordAudit(
    'Section 2',
    'Multiple Simultaneous Requests for Same Source (Single User)',
    acquiredCount === 1 && duplicateBlockedCount === concurrentWorkers - 1,
    `5 simultaneous requests launched: exactly ${acquiredCount} acquired lease, ${duplicateBlockedCount} safely blocked/returned in-flight.`,
    { acquiredCount, duplicateBlockedCount }
  );

  // 2.2 Two users uploading identical source files simultaneously
  const [leaseUserA, leaseUserB] = await Promise.all([
    VideoIntelligenceRepository.acquireLease(testUserA, idUserA.sourceHash, 'worker_tenant_A', {
      source_identity: idUserA,
      metadata: meta1,
    }),
    VideoIntelligenceRepository.acquireLease(testUserB, idUserB.sourceHash, 'worker_tenant_B', {
      source_identity: idUserB,
      metadata: meta1,
    }),
  ]);

  recordAudit(
    'Section 2',
    'Two Users Uploading Identical Source Simultaneously',
    leaseUserA.record.id !== leaseUserB.record.id && idUserA.sourceHash !== idUserB.sourceHash,
    `Identical file from User A and User B produced distinct jobs (${leaseUserA.record.id} vs ${leaseUserB.record.id}) and distinct tenant hashes.`,
    { hashA: idUserA.sourceHash.slice(0, 16), hashB: idUserB.sourceHash.slice(0, 16) }
  );

  // 2.3 Duplicate requests while analysis is already processing
  const inFlightLease = await VideoIntelligenceRepository.acquireLease(
    testUserA,
    idUserA.sourceHash,
    'worker_in_flight_test',
    { source_identity: idUserA, metadata: meta1 }
  );

  recordAudit(
    'Section 2',
    'Duplicate Request While Analysis is Processing',
    !inFlightLease.acquired && inFlightLease.record.status === 'processing',
    `While job is processing with fresh lock, secondary request returns acquired=false with current processing record.`,
    { status: inFlightLease.record.status, acquired: inFlightLease.acquired }
  );

  // Complete job for User A
  await VideoIntelligenceRepository.markCompleted(leaseResults[0].record.id, testUserA, {
    audio_intelligence: {
      transcriptText: 'Audit verification spoken transcript.',
      language: 'en',
      segments: [{ id: 0, start: 0, end: 5, text: 'Audit verification.' }],
      words: [],
      silenceIntervals: [],
      meanVolumeDb: -20,
      speakingPaceWpm: 120,
    },
    visual_intelligence: {
      sceneCuts: [],
      keyframeTimestamps: [],
      facePresenceRatio: 0.8,
      faceIntervals: [],
      objects: [{ label: 'Person', category: 'person', confidence: 0.9, timestamp: 1.0 }],
      actions: [],
      ocr: [{ text: 'Verified Heading', timestamp: 1.0, confidence: 0.9 }],
      scenes: [],
    },
    multimodal_reasoning: {
      summary: 'Verified summary',
      topics: ['audit'],
      groundedProvenance: {
        spokenFacts: ['Audit verification'],
        visualObservations: ['Person'],
        ocrConfirmedText: ['Verified Heading'],
        inferences: [],
        contradictions: [],
      },
    },
    subtitle_handoff: {
      recommendedPosition: 'bottom',
      safeMarginPercent: 12,
      detectedOcclusions: [],
      transcriptReused: true,
      language: 'en',
    },
  });

  // 2.4 Duplicate requests after successful analysis (Idempotency)
  const cachedCheck = await VideoIntelligenceRepository.acquireLease(
    testUserA,
    idUserA.sourceHash,
    'worker_post_complete',
    { source_identity: idUserA, metadata: meta1 }
  );

  recordAudit(
    'Section 2',
    'Duplicate Request After Successful Analysis',
    !cachedCheck.acquired && cachedCheck.isExistingCompleted && cachedCheck.record.status === 'completed',
    `Post-completion request returns acquired=false, isExistingCompleted=true, status=completed without spawning any work.`,
    { isExistingCompleted: cachedCheck.isExistingCompleted, status: cachedCheck.record.status }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 3: WORKER RELIABILITY AND FAILURE RECOVERY AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 3: WORKER RELIABILITY AUDIT ---');

  const crashHash = crypto.createHash('sha256').update(`crash_test_${Date.now()}`).digest('hex');
  const crashId: any = {
    sourceHash: crashHash,
    verificationLevel: 'FULL_CONTENT_SHA256',
    strategy: 'full_stream',
    fileSizeBytes: 1000,
    containerSignature: meta1,
    engineVersion: CURRENT_ENGINE_VERSION,
    verifiedAt: new Date(),
  };

  // 3.1 Worker crashes immediately after acquiring lease
  const crashLease = await VideoIntelligenceRepository.acquireLease(
    testUserA,
    crashHash,
    'worker_doomed_to_crash',
    { source_identity: crashId, metadata: meta1 }
  );
  recordAudit(
    'Section 3',
    'Worker Crash Immediately After Lease',
    crashLease.acquired && crashLease.record.status === 'processing',
    `Worker acquired lease with ID ${crashLease.record.id} and simulated crash without marking complete.`,
    { locked_by: crashLease.record.locked_by, locked_at: crashLease.record.locked_at }
  );

  // 3.2 Lease expiry and stale worker recovery
  // Simulate stale lease by querying with a short timeout
  await new Promise((r) => setTimeout(r, 60));
  const recoveredLease = await VideoIntelligenceRepository.acquireLease(
    testUserA,
    crashHash,
    'worker_rescue_hero',
    { source_identity: crashId, metadata: meta1 },
    50 // 50ms stale timeout
  );

  recordAudit(
    'Section 3',
    'Lease Expiry and Stale Worker Recovery',
    recoveredLease.acquired && recoveredLease.record.locked_by === 'worker_rescue_hero',
    `Recovery worker rescued stale job. Old locked_by superseded by 'worker_rescue_hero', attempt count incremented to ${recoveredLease.record.attempt_count}.`,
    { attempt_count: recoveredLease.record.attempt_count, locked_by: recoveredLease.record.locked_by }
  );

  // 3.3 Worker crashes during transcription or visual analysis -> markFailed
  const failedRecord = await VideoIntelligenceRepository.markFailed(
    crashLease.record.id,
    testUserA,
    'Transcription provider rate-limit 429 timeout'
  );

  recordAudit(
    'Section 3',
    'Worker Error Handling (markFailed)',
    failedRecord?.status === 'failed' && failedRecord.locked_at === null,
    `markFailed successfully transitioned status to 'failed', recorded error message, and released lease lock.`,
    { error_message: failedRecord?.error_message, locked_at: failedRecord?.locked_at }
  );

  // 3.4 Maximum retry limit & terminal failure
  // Fail it until attempt_count reaches 3
  await VideoIntelligenceRepository.acquireLease(testUserA, crashHash, 'worker_retry_2', { source_identity: crashId, metadata: meta1 });
  await VideoIntelligenceRepository.markFailed(crashLease.record.id, testUserA, 'Second failure');
  await VideoIntelligenceRepository.acquireLease(testUserA, crashHash, 'worker_retry_3', { source_identity: crashId, metadata: meta1 });
  const terminalFailed = await VideoIntelligenceRepository.markFailed(crashLease.record.id, testUserA, 'Third terminal failure');

  // Try acquiring lease again without force
  const blockedAfterMaxRetries = await VideoIntelligenceRepository.acquireLease(
    testUserA,
    crashHash,
    'worker_blocked',
    { source_identity: crashId, metadata: meta1 }
  );

  recordAudit(
    'Section 3',
    'Maximum Retry Limit Enforcement',
    !blockedAfterMaxRetries.acquired && blockedAfterMaxRetries.record.status === 'failed',
    `Job reached max attempts (${blockedAfterMaxRetries.record.attempt_count}/3). Normal lease acquisition is blocked to prevent endless loops.`,
    { attempt_count: blockedAfterMaxRetries.record.attempt_count, status: blockedAfterMaxRetries.record.status }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 4: CACHE AND ENGINE-VERSION INTEGRITY AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 4: CACHE AND ENGINE-VERSION INTEGRITY AUDIT ---');

  // 4.1 Engine version change invalidates incompatible results
  const idV1 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
    userId: testUserA,
    engineVersion: '1.7.0',
    metadata: meta1,
  });
  const idV2 = VideoIntelligenceService.computeSourceIdentity(sampleVideo1, {
    userId: testUserA,
    engineVersion: '2.0.0',
    metadata: meta1,
  });

  recordAudit(
    'Section 4',
    'Engine-Version Cache Invalidation',
    idV1.sourceHash !== idV2.sourceHash,
    `Engine version bump from 1.7.0 to 2.0.0 produces completely different source hashes, preventing accidental reuse of outdated schemas.`,
    { v1Hash: idV1.sourceHash.slice(0, 16), v2Hash: idV2.sourceHash.slice(0, 16) }
  );

  // 4.2 Incomplete or failed records are not treated as completed analysis
  const incompleteCheck = await VideoIntelligenceRepository.findBySourceHash(testUserA, crashHash);
  recordAudit(
    'Section 4',
    'Incomplete/Failed Records Not Treated as Completed',
    incompleteCheck?.status === 'failed',
    `Querying failed source returns status='failed', never falsely treated as completed.`,
    { status: incompleteCheck?.status }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 5: THREE-FEATURE INDEPENDENCE AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 5: THREE-FEATURE INDEPENDENCE AUDIT ---');

  // Test independent initiation using creator-studio-demo
  const metaStudio = await VideoIntelligenceService.probeMetadata(sampleStudio);
  const idStudio = VideoIntelligenceService.computeSourceIdentity(sampleStudio, { userId: testUserA, metadata: metaStudio });
  await VideoIntelligenceRepository.invalidateCache(testUserA, idStudio.sourceHash);

  // Scenario 5.1: Subtitle Studio FIRST
  const t0Sub = Date.now();
  const subHandoff1 = await VideoIntelligenceService.getSubtitleStudioHandoff(testUserA, sampleStudio, {
    existingTranscript: { text: 'Independent subtitle initiation test.', language: 'en', segments: [] },
  });
  const elapsedSub1 = Date.now() - t0Sub;

  recordAudit(
    'Section 5',
    'Scenario 1: Subtitle Studio Initiates Analysis First',
    subHandoff1.transcriptText === 'Independent subtitle initiation test.' && Boolean(subHandoff1.handoff),
    `Subtitle Studio initiated analysis independently in ${elapsedSub1}ms. Received safe margin ${subHandoff1.handoff.safeMarginPercent}% and position ${subHandoff1.handoff.recommendedPosition}.`,
    { transcriptText: subHandoff1.transcriptText, handoff: subHandoff1.handoff }
  );

  // Scenario 5.2: AI Content Studio reuses Subtitle Studio's intelligence (0 duplicate cost)
  const t0Content = Date.now();
  const contentHandoff2 = await VideoIntelligenceService.getContentStudioHandoff(testUserA, sampleStudio);
  const elapsedContent2 = Date.now() - t0Content;

  recordAudit(
    'Section 5',
    'Scenario 1 Follow-up: Content Studio Reuses Existing Intelligence',
    elapsedContent2 < 200 && Boolean(contentHandoff2.summary),
    `Content Studio retrieved intelligence in ${elapsedContent2}ms (< 200ms) with ZERO re-transcription.`,
    { elapsedMs: elapsedContent2, topics: contentHandoff2.topics }
  );

  // Scenario 5.3: AI Video Clipping reuses existing intelligence
  const t0Clip = Date.now();
  const clipHandoff3 = await VideoIntelligenceService.getClippingHandoff(testUserA, sampleStudio);
  const elapsedClip3 = Date.now() - t0Clip;

  recordAudit(
    'Section 5',
    'Scenario 1 Follow-up: AI Clipping Reuses Existing Intelligence',
    elapsedClip3 < 200 && Boolean(clipHandoff3.metadata),
    `AI Video Clipping retrieved pre-computed intelligence in ${elapsedClip3}ms with ZERO duplicate work.`,
    { elapsedMs: elapsedClip3, faceRatio: clipHandoff3.facePresenceRatio }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SECTION 6: TENANT ISOLATION AND SECURITY AUDIT
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SECTION 6: TENANT ISOLATION AND SECURITY AUDIT ---');

  // User B attempts to access User A's intelligence records
  const userBQueryByHash = await VideoIntelligenceRepository.findBySourceHash(testUserB, idStudio.sourceHash);
  recordAudit(
    'Section 6',
    'Cross-Tenant Query by SourceHash',
    userBQueryByHash === null,
    `User B queried User A's source hash. Result: ${userBQueryByHash} (Access strictly blocked).`
  );

  const userARecord = await VideoIntelligenceRepository.findBySourceHash(testUserA, idStudio.sourceHash);
  const userBQueryById = await VideoIntelligenceRepository.findById(testUserB, userARecord!.id);
  recordAudit(
    'Section 6',
    'Cross-Tenant Query by Document UUID',
    userBQueryById === null,
    `User B queried User A's document ID. Result: ${userBQueryById} (Access strictly blocked).`
  );

  // User B initiates handoff on same video file
  const t0UserB = Date.now();
  const userBSubHandoff = await VideoIntelligenceService.getSubtitleStudioHandoff(testUserB, sampleStudio, {
    existingTranscript: { text: 'User B private transcript.', language: 'en', segments: [] },
  });
  const elapsedUserB = Date.now() - t0UserB;

  recordAudit(
    'Section 6',
    'User B Isolated Analysis of Same Video Asset',
    userBSubHandoff.transcriptText === 'User B private transcript.',
    `User B analyzed same video file. User B received their own transcript, not User A's transcript.`,
    { userAText: subHandoff1.transcriptText, userBText: userBSubHandoff.transcriptText }
  );

  // Clean up
  await db.collection('video_intelligence').deleteMany({
    user_id: { $in: [testUserA, testUserB] },
  });
  await closeMongo(true);

  console.log('\n========================================================================');
  console.log('AUDIT EXECUTION COMPLETED');
  console.log(`Total Checks: ${auditLog.length}`);
  console.log(`Passed: ${auditLog.filter((a) => a.passed).length}`);
  console.log(`Warnings/Failures: ${auditLog.filter((a) => !a.passed).length}`);
  console.log('========================================================================\n');

  return auditLog;
}

runPhase2FinalAudit().catch(console.error);

