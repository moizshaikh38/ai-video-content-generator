import * as fs from 'fs';
import * as path from 'path';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';

class SimpleCDP {
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

async function runMilestoneAVerification() {
  console.log('===============================================================');
  console.log('VIREOCLIP AI — MILESTONE A VISUAL VERIFICATION');
  console.log('===============================================================\n');

  const outDir = path.resolve('public/demo/milestone_a');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Connect to Chrome CDP on 9222
  const versionResp = await fetch('http://127.0.0.1:9222/json/list');
  const pages: any = await versionResp.json();
  const page = pages.find((p: any) => p.type === 'page' && !p.url.startsWith('devtools://'));
  if (!page) throw new Error('No inspectable Chrome page found on 9222');

  const cdp = new SimpleCDP(page.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('✅ Connected to Chrome CDP on port 9222.');

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Page.bringToFront');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });

  const waitForSelector = async (selector: string, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await cdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector("${selector}"))`,
        returnByValue: true,
      });
      if (res.result?.value) return true;
      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  };

  const takeScreenshot = async (filename: string) => {
    await cdp.send('Page.bringToFront');
    await new Promise((r) => setTimeout(r, 800));
    const ss = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(outDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(ss.data, 'base64'));
    console.log(`📸 Saved screenshot: ${fullPath} (${Math.round((ss.data.length * 0.75) / 1024)} KB)`);
  };

  // Clear existing session first to ensure clean unauthenticated state for Login/Signup
  console.log('\n--- Clearing session to test unauthenticated routes ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('vireo_cookie_notice_dismissed', 'true');
    })()`,
  });

  // 1. Verify Protected Login Page
  console.log('\n--- 1. Testing Protected Login Page ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/login' });
  await waitForSelector('input[type="email"]');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
      if (cookieNotice) cookieNotice.remove();
    })()`,
  });
  await takeScreenshot('01_protected_login.png');

  // 2. Verify Protected Signup Page
  console.log('\n--- 2. Testing Protected Signup Page ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/signup' });
  await waitForSelector('input#signup-email, input[type="email"]');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
      if (cookieNotice) cookieNotice.remove();
    })()`,
  });
  await takeScreenshot('02_protected_signup.png');

  // 3. Authenticate Session
  console.log('\n--- 3. Authenticating Session ---');
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'audit_tester@gmail.com',
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error('Failed to generate session link: ' + (linkErr?.message || 'no token'));
  }

  const { data: sessionData, error: sessionErr } = await supabaseAuthClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionErr || !sessionData?.session) {
    throw new Error('Failed to verify session: ' + (sessionErr?.message || 'no session'));
  }

  const token = sessionData.session.access_token;
  const refreshToken = sessionData.session.refresh_token;
  const user = sessionData.session.user;

  await cdp.send('Runtime.evaluate', {
    expression: `
      const sessionPayload = {
        access_token: "${token}",
        refresh_token: "${refreshToken}",
        expires_at: ${Math.floor(Date.now() / 1000) + 3600},
        user: ${JSON.stringify(user)}
      };
      localStorage.setItem('vireo_supabase_auth', JSON.stringify(sessionPayload));
      localStorage.setItem('vireo_demo_user', JSON.stringify(${JSON.stringify(user)}));
    `,
  });
  console.log('✅ Session injected into browser localStorage using vireo_supabase_auth and vireo_demo_user.');

  // 4. Authenticated Workspace Dashboard Layout
  console.log('\n--- 4. Testing Authenticated Workspace Dashboard ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/dashboard' });
  console.log('Waiting for Dashboard UI elements to render...');
  await waitForSelector('aside nav', 12000);
  await new Promise((r) => setTimeout(r, 2000));
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
      if (cookieNotice) cookieNotice.remove();
    })()`,
  });
  await takeScreenshot('03_workspace_dashboard.png');

  // 5. Authenticated New Project Page
  console.log('\n--- 5. Testing Authenticated New Project Page ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/projects/new' });
  console.log('Waiting for New Project UI elements to render...');
  await waitForSelector('input[placeholder*="Marketing Masterclass"], aside nav', 12000);
  await new Promise((r) => setTimeout(r, 2000));
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
      if (cookieNotice) cookieNotice.remove();
    })()`,
  });
  await takeScreenshot('04_workspace_new_project.png');

  console.log('\n===============================================================');
  console.log('✅ MILESTONE A VISUAL VERIFICATION COMPLETED');
  console.log('===============================================================');

  cdp.close();
  process.exit(0);
}

runMilestoneAVerification().catch((err) => {
  console.error('Milestone A verification failed:', err);
  process.exit(1);
});
