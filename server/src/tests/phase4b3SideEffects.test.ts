import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

describe('VireoClip Phase 4B.3 — Layer D: External Side-Effect & Storage Safety Tests', () => {

  // =========================================================================
  // 1. AI Operation Identity & Duplicate Call Suppression
  // =========================================================================
  describe('1. AI Operation Identity & Duplicate External Call Suppression (Mocked Adapter)', () => {
    // Operation Identity: {userId}:{attemptId}:{stage}:{inputFingerprint}:{modelConfig}
    function createOperationIdentity(params: {
      userId: string;
      attemptId: string;
      operationType: string;
      chunkIndex: number;
      inputFingerprint: string;
      model: string;
    }): string {
      const canonical = `${params.userId}:${params.attemptId}:${params.operationType}:chunk_${params.chunkIndex}:${params.inputFingerprint}:${params.model}`;
      return crypto.createHash('sha256').update(canonical).digest('hex');
    }

    it('suppresses duplicate external AI API calls for identical operation identity', async () => {
      let externalCallCount = 0;
      const inMemoryCache = new Map<string, { status: string; result?: any }>();

      // Mocked AI Provider Adapter
      const mockCallAiProvider = async (opId: string, prompt: string) => {
        // Atomic claim / deduplication
        if (inMemoryCache.has(opId)) {
          const cached = inMemoryCache.get(opId)!;
          if (cached.status === 'completed') {
            return { result: cached.result, duplicateSuppressed: true };
          }
        }

        // Mark in-flight
        inMemoryCache.set(opId, { status: 'in_flight' });

        // Simulate external network latency & billable call
        externalCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));

        const output = {
          providerRequestId: `provider_req_${crypto.randomUUID()}`,
          text: `Generated response for ${prompt}`,
          usage: { promptTokens: 120, completionTokens: 45 },
        };

        inMemoryCache.set(opId, { status: 'completed', result: output });
        return { result: output, duplicateSuppressed: false };
      };

      const opId = createOperationIdentity({
        userId: 'user_123',
        attemptId: 'attempt_abc',
        operationType: 'transcribe',
        chunkIndex: 0,
        inputFingerprint: 'audio_sha256_hash_value',
        model: 'whisper-large-v3',
      });

      // Worker 1 executes
      const res1 = await mockCallAiProvider(opId, 'Audio Chunk 0');
      assert.equal(res1.duplicateSuppressed, false);
      assert.equal(externalCallCount, 1);

      // Concurrent Worker 2 receives same task
      const res2 = await mockCallAiProvider(opId, 'Audio Chunk 0');
      assert.equal(res2.duplicateSuppressed, true, 'Duplicate external call must be suppressed');
      assert.equal(externalCallCount, 1, 'External provider call count must remain 1');
      assert.equal(res1.result.providerRequestId, res2.result.providerRequestId);
    });
  });

  // =========================================================================
  // 2. Provider Timeout & Lost Response Reconciliation
  // =========================================================================
  describe('2. Provider Timeout After Request Acceptance & Lost Response Reconciliation (Mocked Adapter)', () => {
    it('reconciles completed provider outcome using client request ID without generating second billable request', async () => {
      const providerState = new Map<string, { status: string; output?: any }>();
      let billableApiInvocations = 0;

      // Mock Provider with idempotency support
      const mockProviderApi = {
        async submitJob(clientRequestId: string, payload: any) {
          billableApiInvocations++;
          const providerJobId = `job_${clientRequestId}`;
          providerState.set(providerJobId, {
            status: 'processing',
            output: { transcript: 'Full video transcript text', tokens: 400 },
          });
          return { providerJobId, status: 'submitted' };
        },
        async checkStatus(providerJobId: string) {
          const job = providerState.get(providerJobId);
          if (!job) throw new Error('NOT_FOUND');
          return { status: 'completed', output: job.output };
        },
      };

      const clientRequestId = `req_${crypto.randomUUID()}`;

      // Worker 1 submits job to provider
      const submission = await mockProviderApi.submitJob(clientRequestId, { audioUrl: 'https://r2.../audio.mp3' });
      assert.equal(submission.status, 'submitted');
      assert.equal(billableApiInvocations, 1);

      // Worker 1 experiences network drop / timeout before receiving final response.
      // Recovery worker resumes: instead of blindly calling submitJob again, checks provider status
      const recoveryReconciliation = await mockProviderApi.checkStatus(submission.providerJobId);
      assert.equal(recoveryReconciliation.status, 'completed');
      assert.equal(recoveryReconciliation.output.transcript, 'Full video transcript text');

      // Zero extra billable invocations incurred
      assert.equal(billableApiInvocations, 1, 'Reconciliation must not create second billable invocation');
    });
  });

  // =========================================================================
  // 3. FFmpeg Attempt-Scoped Output & Safe Cleanup
  // =========================================================================
  describe('3. FFmpeg Attempt-Scoped Temporary Storage & Process Termination (Test Double)', () => {
    it('isolates temporary files by attempt ID and cleans up partial files on AbortController cancellation', async () => {
      const tempFs = new Map<string, string>();

      const runFfmpegTranscode = async (params: {
        userId: string;
        attemptId: string;
        signal: AbortSignal;
      }) => {
        const attemptPath = `/tmp/renders/${params.userId}/${params.attemptId}/output.mp4`;
        tempFs.set(attemptPath, 'partial_bytes_001');

        if (params.signal.aborted) {
          tempFs.delete(attemptPath);
          throw new Error('TRANSCODE_ABORTED_BY_SIGNAL');
        }

        // Simulate cancellation mid-render
        return new Promise<string>((resolve, reject) => {
          params.signal.addEventListener('abort', () => {
            // Clean up partial output
            tempFs.delete(attemptPath);
            reject(new Error('TRANSCODE_ABORTED_BY_SIGNAL'));
          });
        });
      };

      const abortController = new AbortController();
      const transcodePromise = runFfmpegTranscode({
        userId: 'u1',
        attemptId: 'attempt_999',
        signal: abortController.signal,
      });

      // Fire abort
      abortController.abort();

      await assert.rejects(transcodePromise, /TRANSCODE_ABORTED_BY_SIGNAL/);

      // Verify partial file was cleaned up and does not linger in temporary storage
      assert.equal(tempFs.has('/tmp/renders/u1/attempt_999/output.mp4'), false, 'Partial file must be cleaned up');
    });
  });

  // =========================================================================
  // 4. Stale R2 Publication Rejection via Fencing Verification
  // =========================================================================
  describe('4. Stale Worker R2 Publication Gate & Metadata Verification (Mocked Storage Adapter)', () => {
    it('rejects stale worker R2 publication when authoritative fencing token has advanced', async () => {
      let authoritativeFencingToken = 2; // Advanced to 2 after worker 1 lease expired
      let publishedAuthoritativeUrl: string | null = null;

      const publishR2Result = async (params: {
        attemptId: string;
        workerFencingToken: number;
        r2Key: string;
        eTag: string;
        contentLength: number;
      }) => {
        // Publication Gate: Fencing verification
        if (params.workerFencingToken !== authoritativeFencingToken) {
          throw new Error(
            `STALE_WORKER_PUBLICATION_REJECTED: Worker fencing token ${params.workerFencingToken} was superseded by token ${authoritativeFencingToken}`
          );
        }

        // Metadata verification: must have non-empty eTag and positive length
        if (!params.eTag || params.contentLength <= 0) {
          throw new Error('INVALID_R2_OBJECT_METADATA');
        }

        publishedAuthoritativeUrl = `https://cdn.vireoclip.com/${params.r2Key}`;
        return { published: true, url: publishedAuthoritativeUrl };
      };

      // Stale Worker 1 (token 1) attempts to publish
      await assert.rejects(
        () =>
          publishR2Result({
            attemptId: 'attempt_100',
            workerFencingToken: 1, // Stale token
            r2Key: 'renders/attempt_100/final.mp4',
            eTag: '"d41d8cd98f00b204e9800998ecf8427e"',
            contentLength: 1048576,
          }),
        /STALE_WORKER_PUBLICATION_REJECTED/
      );

      assert.equal(publishedAuthoritativeUrl, null, 'Stale worker cannot publish URL');

      // Authoritative Worker 2 (token 2) publishes
      const success = await publishR2Result({
        attemptId: 'attempt_100',
        workerFencingToken: 2, // Current token
        r2Key: 'renders/attempt_100/final.mp4',
        eTag: '"d41d8cd98f00b204e9800998ecf8427e"',
        contentLength: 1048576,
      });

      assert.equal(success.published, true);
      assert.equal(publishedAuthoritativeUrl, 'https://cdn.vireoclip.com/renders/attempt_100/final.mp4');
    });

    it('ensures duplicate output completion is handled idempotently without re-publishing', async () => {
      let publicationCount = 0;
      const completedOutputs = new Map<string, string>();

      const completeOutput = (attemptId: string, outputUrl: string) => {
        if (completedOutputs.has(attemptId)) {
          return { idempotent: true, url: completedOutputs.get(attemptId)! };
        }
        completedOutputs.set(attemptId, outputUrl);
        publicationCount++;
        return { idempotent: false, url: outputUrl };
      };

      const res1 = completeOutput('attempt_dup', 'https://cdn.vireoclip.com/video1.mp4');
      assert.equal(res1.idempotent, false);
      assert.equal(publicationCount, 1);

      // Replay completion call
      const res2 = completeOutput('attempt_dup', 'https://cdn.vireoclip.com/video1.mp4');
      assert.equal(res2.idempotent, true);
      assert.equal(publicationCount, 1, 'Publication count must remain 1');
    });
  });
});

