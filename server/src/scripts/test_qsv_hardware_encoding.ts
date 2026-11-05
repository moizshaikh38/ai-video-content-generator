import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

const ffPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.path;
const sourceVideo = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
const outQsv = path.resolve(process.cwd(), '../delete/test_qsv_output.mp4');

console.log('Testing Intel QSV hardware encoding on Intel Arc 130T...');
console.log('Source:', sourceVideo);
console.log('Output:', outQsv);

if (fs.existsSync(outQsv)) fs.unlinkSync(outQsv);

// Test 1: Direct QSV encoder
try {
  console.log('\n--- Test 1: -c:v h264_qsv ---');
  const cmd = `"${ffPath}" -y -i "${sourceVideo}" -t 2 -c:v h264_qsv -b:v 2M "${outQsv}"`;
  console.log('Executing:', cmd);
  const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  console.log('SUCCESS! QSV Encoded output size:', fs.statSync(outQsv).size, 'bytes');
} catch (e: any) {
  console.log('Test 1 failed with error:\n', e.stderr ? e.stderr.toString() : e.message);
}

// Test 2: QSV with explicit hardware initialization (D3D11VA / QSV device)
if (!fs.existsSync(outQsv) || fs.statSync(outQsv).size === 0) {
  try {
    console.log('\n--- Test 2: -init_hw_device qsv=qsv -c:v h264_qsv ---');
    const cmd = `"${ffPath}" -y -init_hw_device qsv=hw -i "${sourceVideo}" -t 2 -c:v h264_qsv -b:v 2M "${outQsv}"`;
    console.log('Executing:', cmd);
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    console.log('SUCCESS! QSV Encoded output size:', fs.statSync(outQsv).size, 'bytes');
  } catch (e: any) {
    console.log('Test 2 failed with error:\n', e.stderr ? e.stderr.toString() : e.message);
  }
}

// Test 4: NVENC failure probe (expected to fail on Intel Arc without NVIDIA GPU)
try {
  console.log('\n--- Test 4: -c:v h264_nvenc (Expected failure on non-NVIDIA hardware) ---');
  const cmd = `"${ffPath}" -y -i "${sourceVideo}" -t 1 -c:v h264_nvenc "${path.resolve(process.cwd(), '../delete/test_nvenc.mp4')}"`;
  console.log('Executing:', cmd);
  execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] });
  console.log('UNEXPECTED: NVENC succeeded');
} catch (e: any) {
  const errOutput = e.stderr ? e.stderr.toString() : e.message;
  console.log('EXPECTED FAILURE: NVENC correctly threw hardware error:');
  errOutput.split('\n').filter((l: string) => /Cannot load|driver|nvenc|Error/i.test(l)).forEach((l: string) => console.log('  ', l.trim()));
}
