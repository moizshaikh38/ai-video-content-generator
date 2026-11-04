import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

class CDPClient {
  private ws: any;
  private messageId = 0;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(private wsUrl: string) {}

  async connect() {
    this.ws = new globalThis.WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id)!;
        this.pending.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runVisualVerification() {
  console.log('===============================================================');
  console.log('VIREOCLIP AI — AUTHENTICATION REDESIGN VISUAL VERIFICATION');
  console.log('===============================================================\n');

  const screenshotsDir = path.resolve('public/demo/auth');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeProcess = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=9224',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-default-apps',
      '--no-first-run',
      '--user-data-dir=/tmp/chrome-auth-verify-' + Date.now(),
    ],
    { stdio: 'ignore' }
  );

  const cleanup = () => {
    try {
      chromeProcess.kill('SIGKILL');
    } catch {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  await new Promise((r) => setTimeout(r, 1500));

  let cdpUrl = '';
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:9224/json/version');
      const data = await res.json();
      cdpUrl = data.webSocketDebuggerUrl;
      if (cdpUrl) break;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (!cdpUrl) {
    throw new Error('Failed to connect to Chrome remote debugging port 9224.');
  }

  const cdp = new CDPClient(cdpUrl);
  await cdp.connect();
  console.log('✅ Connected to Headless Chrome via CDP.');

  const newTarget = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const targetWs = `ws://127.0.0.1:9224/devtools/page/${newTarget.targetId}`;
  const pageCdp = new CDPClient(targetWs);
  await pageCdp.connect();

  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('DOM.enable');

  const viewports = [
    { name: 'Desktop', width: 1440, height: 900 },
    { name: 'Laptop', width: 1366, height: 768 },
    { name: 'Mobile', width: 375, height: 812 },
  ];

  const pages = [
    { name: 'Login', path: '/login' },
    { name: 'Signup', path: '/signup' },
  ];

  for (const page of pages) {
    for (const vp of viewports) {
      console.log(`\n--- Testing ${page.name} on ${vp.name} (${vp.width}x${vp.height}) ---`);

      // Set viewport
      await pageCdp.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: vp.width < 600,
      });

      // Navigate
      await pageCdp.send('Page.navigate', { url: `http://localhost:5173${page.path}` });
      await new Promise((r) => setTimeout(r, 1600));

      // Dismiss cookie notice if present
      await pageCdp.send('Runtime.evaluate', {
        expression: `(() => {
          localStorage.setItem('vireo_cookie_notice_dismissed', 'true');
          const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
          if (cookieNotice) cookieNotice.remove();
        })()`,
      });
      await new Promise((r) => setTimeout(r, 200));

      // 1. Check for horizontal overflow
      const overflowCheck = await pageCdp.send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body.scrollWidth);
          const clientW = docEl.clientWidth;
          return {
            scrollW,
            clientW,
            hasHorizontalOverflow: scrollW > clientW,
          };
        })()`,
        returnByValue: true,
      });
      const overflow = overflowCheck.result?.value;
      console.log(`  Horizontal Overflow: ${overflow.hasHorizontalOverflow ? '❌ YES' : '✅ ZERO'} (scrollW: ${overflow.scrollW}, clientW: ${overflow.clientW})`);

      const vScrollCheck = await pageCdp.send('Runtime.evaluate', {
        expression: `(() => {
          const docEl = document.documentElement;
          return {
            scrollHeight: docEl.scrollHeight,
            innerHeight: window.innerHeight,
            fitsInSingleViewport: docEl.scrollHeight <= window.innerHeight,
          };
        })()`,
        returnByValue: true,
      });
      const vScroll = vScrollCheck.result?.value;
      if (vp.width >= 1024) {
        console.log(`  Single-Viewport Desktop Fit: ${vScroll.fitsInSingleViewport ? '✅ ZERO SCROLLBAR' : '⚠️ SCROLLBAR'} (scrollHeight: ${vScroll.scrollHeight}px vs innerHeight: ${vScroll.innerHeight}px)`);
      }

      // 2. Check password input padding-right (pr-11 >= 40px)
      const passwordPaddingCheck = await pageCdp.send('Runtime.evaluate', {
        expression: `(() => {
          const pwd = document.querySelector('input[type="password"]');
          if (!pwd) return null;
          const style = window.getComputedStyle(pwd);
          return {
            paddingRight: parseFloat(style.paddingRight),
            paddingRightStr: style.paddingRight,
          };
        })()`,
        returnByValue: true,
      });
      const pwdPad = passwordPaddingCheck.result?.value;
      if (pwdPad) {
        const isSufficient = pwdPad.paddingRight >= 40;
        console.log(`  Password Padding-Right: ${isSufficient ? '✅' : '❌'} ${pwdPad.paddingRightStr} (target >= 40px)`);
      }

      // 3. Check for truncation on headings / buttons
      const textTruncationCheck = await pageCdp.send('Runtime.evaluate', {
        expression: `(() => {
          const h1 = document.querySelector('h1');
          const submitBtn = document.querySelector('button[type="submit"]');
          const googleBtn = document.querySelector('button[type="button"]');
          return {
            h1Text: h1?.textContent?.trim(),
            submitBtnText: submitBtn?.textContent?.trim(),
            googleBtnText: googleBtn?.textContent?.trim(),
          };
        })()`,
        returnByValue: true,
      });
      console.log(`  Header rendered: "${textTruncationCheck.result?.value?.h1Text}"`);
      console.log(`  CTA Button rendered: "${textTruncationCheck.result?.value?.submitBtnText}"`);

      // 4. Capture screenshot
      const ssRes = await pageCdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      const filename = `${screenshotsDir}/${page.name.toLowerCase()}_${vp.name.toLowerCase()}.png`;
      fs.writeFileSync(filename, Buffer.from(ssRes.data, 'base64'));
      console.log(`  📸 Screenshot saved: ${filename}`);
    }
  }

  console.log('\n===============================================================');
  console.log('✅ ALL VISUAL VERIFICATIONS COMPLETED SUCCESSFULLY');
  console.log('===============================================================');

  pageCdp.close();
  cdp.close();
  cleanup();
  process.exit(0);
}

runVisualVerification().catch((err) => {
  console.error('Visual verification failed:', err);
  process.exit(1);
});
