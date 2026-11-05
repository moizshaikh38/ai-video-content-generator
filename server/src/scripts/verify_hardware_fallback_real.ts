import fs from 'fs';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { HardwareEncoderService, EncoderFlags } from '../services/hardwareEncoderService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const ffprobeBin = (ffprobeStatic as any)?.path || 'ffprobe';

async function probeFile(filePath: string) {
  const { stdout } = await execFileAsync(ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'stream=codec_type,codec_name,width,height,duration',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    filePath,
  ]);
  return JSON.parse(stdout);
}

async function runRealHardwareFallbackVerification() {
  console.log('========================================================================');
  console.log('VIREOCLIP — GENUINE HARDWARE FAILURE & CPU FALLBACK VERIFICATION');
  console.log('========================================================================\n');

  const sourceVideo = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  if (!fs.existsSync(sourceVideo)) {
    throw new Error(`Source video not found: ${sourceVideo}`);
  }

  const outputDir = path.resolve(process.cwd(), '../delete/fallback_verification');
  fs.mkdirSync(outputDir, { recursive: true });
  const finalOutput = path.join(outputDir, 'fallback_verified_output.mp4');
  if (fs.existsSync(finalOutput)) {
    fs.unlinkSync(finalOutput);
  }

  // 1. Initial Capability Check
  console.log('[Step 1] Probing active hardware capabilities...');
  HardwareEncoderService.clearCache();
  const caps = await HardwareEncoderService.getCapabilities();
  console.log('  -> Hardware Capabilities:', JSON.stringify(caps, null, 2));

  // 2. Real Hardware Render Simulation vs Software Fallback
  console.log('\n[Step 2] Executing real FFmpeg transcode with simulated GPU driver failure...');

  let hardwareAttempted = false;
  let hardwareFailed = false;
  let fallbackExecuted = false;
  let rawHardwareError = '';

  const startTime = Date.now();

  try {
    // We invoke executeWithFallback, but simulate a real FFmpeg process failure on the hardware branch
    await HardwareEncoderService.executeWithFallback(async (flags: EncoderFlags) => {
      if (flags.isHardware) {
        hardwareAttempted = true;
        console.log(`  -> [Primary Attempt] Trying hardware encoder: ${flags.codec}`);
        // Inject invalid hardware child device type to force real FFmpeg -22 hardware device context failure
        const badHwArgs = [
          '-y',
          '-init_hw_device', 'qsv=hw,child_device_type=d3d12va',
          '-ss', '0',
          '-t', '5',
          '-i', sourceVideo,
          ...flags.videoCodecArgs,
          ...flags.qualityArgs,
          '-c:a', 'aac',
          '-b:a', '128k',
          finalOutput,
        ];
        try {
          await execFileAsync(ffmpegBin, badHwArgs, { timeout: 15000 });
        } catch (err: any) {
          hardwareFailed = true;
          rawHardwareError = err.stderr || err.message;
          console.log('  -> [Primary Hardware Execution FAILED as expected]');
          console.log(`     Error summary: ${rawHardwareError.trim().split('\n').slice(-2).join(' ')}`);
          throw err;
        }
      } else {
        fallbackExecuted = true;
        console.log(`  -> [Fallback Attempt] Executing genuine CPU encoder: ${flags.codec}`);
        const cpuArgs = [
          '-y',
          '-ss', '0',
          '-t', '5',
          '-i', sourceVideo,
          ...flags.videoCodecArgs,
          ...flags.qualityArgs,
          '-c:a', 'aac',
          '-b:a', '128k',
          finalOutput,
        ];
        const { stderr } = await execFileAsync(ffmpegBin, cpuArgs, { timeout: 30000 });
        console.log('  -> [Fallback CPU Execution SUCCEEDED cleanly]');
      }
    });
  } catch (err: any) {
    console.error('Fatal execution error:', err.message);
    process.exit(1);
  }

  const totalDurationMs = Date.now() - startTime;

  // 3. Output Integrity Verification
  console.log('\n[Step 3] Verifying output integrity of software fallback MP4...');
  if (!fs.existsSync(finalOutput)) {
    throw new Error(`Output file was not generated: ${finalOutput}`);
  }

  const stat = fs.statSync(finalOutput);
  console.log(`  -> File exists on disk: ${finalOutput} (${stat.size} bytes / ${(stat.size / 1024).toFixed(1)} KB)`);

  const probe = await probeFile(finalOutput);
  const videoStream = probe.streams?.find((s: any) => s.codec_type === 'video');
  const audioStream = probe.streams?.find((s: any) => s.codec_type === 'audio');

  console.log('  -> Video Stream:', {
    codec: videoStream?.codec_name,
    width: videoStream?.width,
    height: videoStream?.height,
    duration: videoStream?.duration,
  });
  console.log('  -> Audio Stream:', {
    codec: audioStream?.codec_name,
    duration: audioStream?.duration,
  });

  const isValid = stat.size > 10000 && videoStream?.codec_name === 'h264' && audioStream?.codec_name === 'aac';
  console.log(`  -> Output Validity: ${isValid ? 'VERIFIED_VALID' : 'INVALID'}`);

  // 4. Safe Cleanup Verification
  console.log('\n[Step 4] Verifying cleanup of temporary artifacts...');
  fs.unlinkSync(finalOutput);
  const cleanedUp = !fs.existsSync(finalOutput);
  console.log(`  -> Output file unlinked successfully: ${cleanedUp}`);

  console.log('\n========================================================================');
  console.log('SUMMARY OF REAL HARDWARE FALLBACK VERIFICATION:');
  console.log(`- Primary Hardware Attempted: ${hardwareAttempted}`);
  console.log(`- Hardware Failure Captured:  ${hardwareFailed}`);
  console.log(`- Software Fallback Run:      ${fallbackExecuted}`);
  console.log(`- Final MP4 Integrity:        ${isValid ? 'PASSED' : 'FAILED'}`);
  console.log(`- Total Recovery Latency:     ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`- Cleanup Verified:           ${cleanedUp ? 'PASSED' : 'FAILED'}`);
  console.log('========================================================================\n');
}

runRealHardwareFallbackVerification().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

