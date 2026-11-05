import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareEncoderService, EncoderFlags } from '../services/hardwareEncoderService.js';

test('HardwareEncoderService Suite', async (t) => {
  await t.test('1. Probes hardware capabilities and returns structured status', async () => {
    HardwareEncoderService.clearCache();
    const caps = await HardwareEncoderService.getCapabilities();

    assert.ok(caps, 'Capabilities must not be null');
    assert.equal(typeof caps.preferredCodec, 'string');
    assert.equal(typeof caps.isHardwareAccelerated, 'boolean');
    assert.equal(typeof caps.qsvAvailable, 'boolean');
    assert.equal(typeof caps.nvencAvailable, 'boolean');
    assert.ok(caps.lastCheckedAt > 0, 'lastCheckedAt must be positive timestamp');

    // On Intel Arc 130T environment:
    assert.equal(caps.qsvAvailable, true, 'Intel Arc 130T must provide functional QSV');
    assert.equal(caps.nvencAvailable, false, 'NVIDIA NVENC must be absent');
    assert.equal(caps.preferredCodec, 'h264_qsv', 'Preferred codec must be h264_qsv on Intel Arc system');
    assert.equal(caps.isHardwareAccelerated, true);
  });

  await t.test('2. Caches capability results across multiple concurrent requests', async () => {
    const [c1, c2, c3] = await Promise.all([
      HardwareEncoderService.getCapabilities(),
      HardwareEncoderService.getCapabilities(),
      HardwareEncoderService.getCapabilities(),
    ]);

    assert.equal(c1.lastCheckedAt, c2.lastCheckedAt);
    assert.equal(c2.lastCheckedAt, c3.lastCheckedAt);
    assert.equal(c1.preferredCodec, c2.preferredCodec);
  });

  await t.test('3. Generates correct FFmpeg flags for software libx264', async () => {
    const flags = await HardwareEncoderService.getEncoderFlags('libx264');

    assert.equal(flags.codec, 'libx264');
    assert.equal(flags.isHardware, false);
    assert.deepEqual(flags.initArgs, []);
    assert.deepEqual(flags.videoCodecArgs, ['-c:v', 'libx264']);
    assert.ok(flags.qualityArgs.includes('-crf'));
  });

  await t.test('4. Generates correct FFmpeg flags for Intel QSV', async () => {
    const flags = await HardwareEncoderService.getEncoderFlags('h264_qsv');

    assert.equal(flags.codec, 'h264_qsv');
    assert.equal(flags.isHardware, true);
    assert.ok(flags.initArgs.includes('qsv=hw'), 'Must specify qsv=hw device');
    assert.deepEqual(flags.videoCodecArgs, ['-c:v', 'h264_qsv']);
    assert.ok(flags.qualityArgs.includes('-global_quality'));
  });

  await t.test('5. executeWithFallback executes primary hardware successfully', async () => {
    let callCount = 0;
    const result = await HardwareEncoderService.executeWithFallback(async (flags: EncoderFlags) => {
      callCount++;
      assert.equal(flags.codec, 'h264_qsv');
      return 'render_success';
    });

    assert.equal(result, 'render_success');
    assert.equal(callCount, 1);
  });

  await t.test('6. executeWithFallback catches hardware failure and seamlessly falls back to software libx264', async () => {
    let attempts = 0;
    const attemptedCodecs: string[] = [];

    const result = await HardwareEncoderService.executeWithFallback(async (flags: EncoderFlags) => {
      attempts++;
      attemptedCodecs.push(flags.codec);

      if (flags.isHardware) {
        throw new Error('Simulated GPU device context lost or busy');
      }

      return 'fallback_success';
    });

    assert.equal(result, 'fallback_success');
    assert.equal(attempts, 2, 'Must attempt hardware first then fallback');
    assert.deepEqual(attemptedCodecs, ['h264_qsv', 'libx264']);
  });

  await t.test('7. executeWithFallback propagates fatal error if software fallback also fails', async () => {
    await assert.rejects(
      async () => {
        await HardwareEncoderService.executeWithFallback(async (flags: EncoderFlags) => {
          throw new Error('Fatal error: disk full');
        });
      },
      /Fatal error: disk full/
    );
  });
});

