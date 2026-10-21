import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');
const pythonDir = path.join(serverDir, 'python');
const requirementsFile = path.join(pythonDir, 'requirements.txt');
const isWin = process.platform === 'win32';
const venvDir = path.join(pythonDir, '.venv');
const venvPython = isWin
  ? path.join(venvDir, 'Scripts', 'python.exe')
  : path.join(venvDir, 'bin', 'python');
const venvPip = isWin
  ? path.join(venvDir, 'Scripts', 'pip.exe')
  : path.join(venvDir, 'bin', 'pip');
const standaloneYtDlp = isWin
  ? path.join(serverDir, 'yt-dlp.exe')
  : path.join(serverDir, 'yt-dlp');

function run(cmd, options = {}) {
  try {
    return execSync(cmd, { stdio: 'inherit', ...options });
  } catch (err) {
    return null;
  }
}

function verifyYtDlp(executable, isPython = false) {
  try {
    const args = isPython ? ['-m', 'yt_dlp', '--version'] : ['--version'];
    const res = spawnSync(executable, args, { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      return res.stdout.trim();
    }
  } catch {}
  return null;
}

function findSystemPython() {
  const pythonCmds = ['python3', 'python'];
  for (const cmd of pythonCmds) {
    try {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
      if (res.status === 0) return cmd;
    } catch {}
  }
  return null;
}

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with status ${res.statusCode}`));
      }
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(destPath));
      });
      fileStream.on('error', (err) => {
        try { fs.unlinkSync(destPath); } catch {}
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('[Setup Python] Checking YouTube ingestion dependencies (yt-dlp)...');

  // 1. Check if venv already has working yt-dlp
  if (fs.existsSync(venvPython)) {
    const ver = verifyYtDlp(venvPython, true);
    if (ver) {
      console.log(`[Setup Python] Virtual environment already configured with yt-dlp v${ver}`);
      return;
    }
  }

  // 2. Check if standalone yt-dlp already exists
  if (fs.existsSync(standaloneYtDlp)) {
    const ver = verifyYtDlp(standaloneYtDlp, false);
    if (ver) {
      console.log(`[Setup Python] Standalone yt-dlp binary found (v${ver})`);
      return;
    }
  }

  const sysPython = findSystemPython();

  // 3. Try setting up python virtual environment
  if (sysPython) {
    console.log(`[Setup Python] Found system Python: ${sysPython}`);
    if (!fs.existsSync(venvDir)) {
      console.log('[Setup Python] Creating virtual environment at server/python/.venv ...');
      run(`${sysPython} -m venv "${venvDir}"`);
    }

    if (fs.existsSync(venvPip)) {
      console.log('[Setup Python] Installing requirements in virtual environment...');
      run(`"${venvPip}" install --upgrade pip`);
      if (fs.existsSync(requirementsFile)) {
        run(`"${venvPip}" install -r "${requirementsFile}"`);
      } else {
        run(`"${venvPip}" install yt-dlp`);
      }

      const ver = verifyYtDlp(venvPython, true);
      if (ver) {
        console.log(`[Setup Python] Successfully installed yt-dlp v${ver} in virtual environment!`);
        return;
      }
    }

    // 4. If venv pip failed, try direct pip with break-system-packages or user install
    console.log('[Setup Python] Trying system pip install for yt-dlp...');
    run(`${sysPython} -m pip install yt-dlp --break-system-packages || ${sysPython} -m pip install yt-dlp --user || pip install yt-dlp || pip3 install yt-dlp`);
    const sysVer = verifyYtDlp(sysPython, true);
    if (sysVer) {
      console.log(`[Setup Python] Successfully configured system Python with yt-dlp v${sysVer}`);
      return;
    }
  }

  // 5. Fallback: Download standalone yt-dlp binary (works on Linux/Darwin without Python pip)
  if (!isWin) {
    console.log('[Setup Python] Downloading standalone yt-dlp executable from GitHub releases...');
    const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
    try {
      await downloadFile(downloadUrl, standaloneYtDlp);
      fs.chmodSync(standaloneYtDlp, 0o755);
      const ver = verifyYtDlp(standaloneYtDlp, false);
      if (ver) {
        console.log(`[Setup Python] Standalone yt-dlp binary downloaded successfully (v${ver})`);
        return;
      }
    } catch (dlErr) {
      console.warn('[Setup Python] Could not download standalone yt-dlp binary:', dlErr.message);
    }
  }

  console.warn('[Setup Python] Warning: yt-dlp could not be automatically configured. Please ensure Python and yt-dlp are installed.');
}

main().catch((err) => {
  console.error('[Setup Python] Error during setup:', err);
  // Do not crash the entire build if network is restricted during offline dev builds
});
