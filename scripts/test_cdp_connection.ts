import { spawn } from 'child_process';
import http from 'http';

async function main() {
  console.log('Launching headless Chrome on port 9222...');
  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--user-data-dir=/tmp/vireo_cdp_test',
  ], { stdio: 'ignore' });

  // Wait 1 second for Chrome to open port 9222
  await new Promise((resolve) => setTimeout(resolve, 1500));

  try {
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await versionRes.json();
    console.log('CDP Version Response:');
    console.log('  Browser:', versionData.Browser);
    console.log('  Protocol-Version:', versionData['Protocol-Version']);
    console.log('  webSocketDebuggerUrl:', versionData.webSocketDebuggerUrl);

    // Test WebSocket connection
    const ws = new globalThis.WebSocket(versionData.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log('✅ CDP WebSocket connection open!');
        ws.close();
        resolve(null);
      };
      ws.onerror = (e) => reject(e);
    });
  } finally {
    chromeProcess.kill();
    console.log('Chrome process terminated.');
  }
}

main().catch(err => {
  console.error('Error in CDP test:', err);
  process.exit(1);
});
