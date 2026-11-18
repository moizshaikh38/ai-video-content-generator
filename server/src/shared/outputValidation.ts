import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
export interface OutputValidationOptions {
  expectAudio: boolean;
  expectDimensions?: { width: number; height: number };
}
export type OutputProbeRunner = (file: string, args: string[], options: { timeout: number; maxBuffer: number }) => Promise<{ stdout: string }>;

function invalid(message: string): Error & { code: string } {
  return Object.assign(new Error(`Rendered output failed validation: ${message}.`), { code: 'OUTPUT_VALIDATION_FAILED' });
}

/** No deliverable may be published when its actual streams cannot be verified. */
export async function validateOutputFile(
  filePath: string,
  expectedDurationSec: number,
  options: OutputValidationOptions,
  runProbe: OutputProbeRunner = async (file, args, limits) => execFileAsync(file, args, limits),
): Promise<{ width: number; height: number }> {
  if (!Number.isFinite(expectedDurationSec) || expectedDurationSec <= 0) throw invalid('invalid expected duration');
  const expected = options.expectDimensions;
  if (expected && (![expected.width, expected.height].every(n => Number.isSafeInteger(n) && n > 0))) {
    throw invalid('invalid expected frame size');
  }
  let probe: any;
  try {
    const { stdout } = await runProbe('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,width,height',
      '-show_entries', 'format=duration', '-of', 'json', filePath,
    ], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
    probe = JSON.parse(stdout);
  } catch {
    // Do not expose raw process stderr, paths or signed URLs to the user.
    throw invalid('output inspection unavailable; export was not published');
  }
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const video = streams.find((s: any) => s?.codec_type === 'video');
  const width = Number(video?.width), height = Number(video?.height);
  const duration = Number(probe?.format?.duration);
  const problems: string[] = [];
  if (!video) problems.push('no video stream');
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)) problems.push('unreadable frame size');
  else if (expected && (width !== expected.width || height !== expected.height)) {
    problems.push(`frame size ${width}x${height} differs from requested ${expected.width}x${expected.height}`);
  }
  if (options.expectAudio && !streams.some((s: any) => s?.codec_type === 'audio')) problems.push('missing audio stream');
  if (!Number.isFinite(duration) || duration <= 0) problems.push('unreadable duration');
  else if (Math.abs(duration - expectedDurationSec) > 0.5) problems.push(`duration ${duration.toFixed(2)}s differs from expected ${expectedDurationSec.toFixed(2)}s by more than 0.5s`);
  if (problems.length) throw invalid(problems.join('; '));
  return { width, height };
}
