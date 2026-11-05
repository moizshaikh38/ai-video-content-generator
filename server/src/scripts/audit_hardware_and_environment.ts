import { execSync } from 'child_process';
import os from 'os';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

console.log('========================================================================');
console.log('VIREOCLIP — PHASE 3.2 READ-ONLY HARDWARE & ENVIRONMENT AUDIT');
console.log('========================================================================\n');

// 1. Operating System & Compute
console.log('[1. OS & COMPUTE]');
console.log('Platform:', os.platform(), os.release(), os.arch());
console.log('CPUs:', os.cpus().length, 'cores, model:', os.cpus()[0]?.model);
console.log('Total Memory:', (os.totalmem() / 1024 / 1024 / 1024).toFixed(2), 'GB');
console.log('Free Memory:', (os.freemem() / 1024 / 1024 / 1024).toFixed(2), 'GB');
console.log('Node.js version:', process.version);
console.log('Process memory:', process.memoryUsage());

// 2. FFmpeg & Hardware Acceleration
console.log('\n[2. FFMPEG BINARY & HARDWARE ACCELERATION AUDIT]');
const ffPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.path;
const probePath = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
console.log('FFmpeg Path:', ffPath);
console.log('FFprobe Path:', probePath);

if (ffPath) {
  try {
    const versionOutput = execSync(`"${ffPath}" -version`).toString();
    console.log('FFmpeg Version info:', versionOutput.split('\n')[0]);
    console.log('Configuration flags snippet:', versionOutput.split('\n')[1]?.slice(0, 120) + '...');

    const hwaccels = execSync(`"${ffPath}" -hwaccels`).toString();
    console.log('\nSupported HW Accels:');
    console.log(hwaccels.trim());

    const encoders = execSync(`"${ffPath}" -encoders`).toString();
    console.log('\nHardware & Core Video Encoders Available in FFmpeg build:');
    encoders.split('\n').filter(line => /nvenc|qsv|amf|vaapi|d3d11va|libx264|libx265|hevc/i.test(line)).forEach(l => console.log(' ', l.trim()));
  } catch (err: any) {
    console.error('Error querying FFmpeg:', err.message);
  }
}

// 3. GPU Vendor Tooling Probe
console.log('\n[3. GPU VENDOR TOOL PROBING]');
try {
  const nvidiaSmi = execSync('nvidia-smi', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
  console.log('NVIDIA SMI detected:\n', nvidiaSmi.split('\n').slice(0, 8).join('\n'));
} catch (e: any) {
  console.log('nvidia-smi: NOT PRESENT (No NVIDIA GPU detected or driver tooling not in PATH)');
}

// 4. Check OpenVINO / DirectML / Intel GPU tooling
try {
  const dxdiagOutput = execSync('powershell -Command "Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, Status | Format-Table -AutoSize"').toString();
  console.log('Active Display Adapters:\n', dxdiagOutput.trim());
} catch (e: any) {
  console.log('Failed to query Win32_VideoController:', e.message);
}

