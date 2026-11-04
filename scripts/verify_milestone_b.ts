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

async function runMilestoneBVerification() {
  console.log('===============================================================');
  console.log('VIREOCLIP AI — MILESTONE B VISUAL VERIFICATION');
  console.log('===============================================================\n');

  const outDir = path.resolve('public/demo/milestone_b');
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

  const waitForSelector = async (selector: string, timeoutMs = 12000) => {
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
    await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const cookieNotice = document.querySelector('aside[aria-label="Privacy and storage notice"]');
        if (cookieNotice) cookieNotice.remove();
      })()`,
    });
    await new Promise((r) => setTimeout(r, 800));
    const ss = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(outDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(ss.data, 'base64'));
    console.log(`📸 Saved screenshot: ${fullPath} (${Math.round((ss.data.length * 0.75) / 1024)} KB)`);
  };

  // Authenticate Session via Supabase
  console.log('\n--- Authenticating Session with Supabase ---');
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
  console.log('✅ Session injected into browser localStorage.');

  // 1. Dashboard Page
  console.log('\n--- 1. Capturing 01_dashboard_projects_workflow ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/dashboard' });
  await waitForSelector('aside nav', 12000);
  await new Promise((r) => setTimeout(r, 2000));
  await takeScreenshot('01_dashboard_projects_workflow.png');

  // 2. New Project Page (Upload mode)
  console.log('\n--- 2. Capturing 02_new_project_single_surface ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/projects/new' });
  await waitForSelector('input[placeholder*="Marketing Masterclass"], aside nav', 12000);
  await cdp.send('Runtime.evaluate', { expression: 'window.scrollTo(0, 0);' });
  await new Promise((r) => setTimeout(r, 1000));
  await takeScreenshot('02_new_project_single_surface.png');

  // 3. New Project Page (URL mode)
  console.log('\n--- 3. Capturing 03_new_project_url_mode ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const urlBtn = buttons.find(b => b.textContent && b.textContent.includes('Paste Video URL'));
      if (urlBtn) urlBtn.click();
      return Boolean(urlBtn);
    })()`,
  });
  await new Promise((r) => setTimeout(r, 800));
  await takeScreenshot('03_new_project_url_mode.png');

  // 4. History Page (Obsidian Table)
  console.log('\n--- 4. Capturing 04_history_obsidian_table ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/history' });
  await waitForSelector('aside nav', 12000);
  await new Promise((r) => setTimeout(r, 2000));
  await takeScreenshot('04_history_obsidian_table.png');

  cdp.close();
  console.log('\n===============================================================');
  console.log('✨ MILESTONE B VISUAL VERIFICATION COMPLETED');
  console.log('===============================================================');
}

runMilestoneBVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
