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

async function run() {
  console.log('--- Starting Creative Tools Redesign Browser Verification ---');
  const screenshotsDir = path.resolve('public/demo/sidebar_creative_tools');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Generate auth session
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'audit_tester@gmail.com',
  });
  if (linkErr || !linkData.properties?.hashed_token) {
    throw new Error('Failed to generate session: ' + (linkErr?.message || 'no token'));
  }

  const { data: sessionData, error: sessionErr } = await supabaseAuthClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionErr || !sessionData.session) {
    throw new Error('Failed to verify OTP: ' + (sessionErr?.message || 'no session'));
  }

  const token = sessionData.session.access_token;
  const refreshToken = sessionData.session.refresh_token;

  // 2. Connect to Chrome CDP on 9222
  const versionResp = await fetch('http://127.0.0.1:9222/json/list');
  const pages: any = await versionResp.json();
  const page = pages.find((p: any) => p.type === 'page' && !p.url.startsWith('devtools://'));
  if (!page) throw new Error('No inspectable Chrome page found on 9222');

  const cdp = new SimpleCDP(page.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  // Inject auth tokens
  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('sb-fynwazlzeyvmnsblhchd-auth-token', JSON.stringify({
        access_token: "${token}",
        refresh_token: "${refreshToken}",
        expires_at: ${Math.floor(Date.now() / 1000) + 3600},
        user: ${JSON.stringify(sessionData.session.user)}
      }));
    `,
  });

  const targetClipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
  const targetUrl = `http://localhost:5173/clips/${targetClipId}/edit`;

  console.log(`Navigating to ${targetUrl}...`);
  await cdp.send('Page.navigate', { url: targetUrl });
  await new Promise((r) => setTimeout(r, 3500));

  // Helper to click sidebar tab by title
  const clickTab = async (title: string) => {
    return await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btn = Array.from(document.querySelectorAll('aside button')).find(b =>
            b.getAttribute('title')?.toLowerCase() === "${title.toLowerCase()}" ||
            b.textContent?.toLowerCase().includes("${title.toLowerCase()}")
          );
          if (btn) {
            btn.click();
            return { success: true, text: btn.getAttribute('title') || btn.textContent };
          }
          return { success: false };
        })()
      `,
      returnByValue: true,
    });
  };

  const takeScreenshot = async (filename: string) => {
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(screenshotsDir, filename);
    fs.writeFileSync(fullPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`Saved screenshot: ${fullPath}`);
  };

  // 1. Audio tab
  console.log('Clicking "Audio" tab...');
  await clickTab('Audio');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('01_audio_workspace.png');

  // Switch to SFX subsection in Audio
  await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Sound Effects') || b.textContent?.includes('SFX'));
        if (btn) btn.click();
      })()
    `,
  });
  await new Promise((r) => setTimeout(r, 400));
  await takeScreenshot('02_audio_sfx_workspace.png');

  // 2. Framing tab
  console.log('Clicking "Framing" tab...');
  await clickTab('Framing');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('03_framing_workspace.png');

  // 3. Aspect Ratio tab
  console.log('Clicking "Ratio" tab...');
  await clickTab('Ratio');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('04_aspect_ratio_workspace.png');

  // 4. Motion tab
  console.log('Clicking "Motion" tab...');
  await clickTab('Motion');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('05_motion_workspace.png');

  // 5. AI Tools tab
  console.log('Clicking "AI Tools" tab...');
  await clickTab('AI Tools');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('06_ai_tools_workspace.png');

  // 6. AI Copilot tab
  console.log('Clicking "AI Copilot" tab...');
  await clickTab('AI Copilot');
  await new Promise((r) => setTimeout(r, 600));
  await takeScreenshot('07_ai_copilot_workspace.png');

  console.log('--- All Screenshots Captured Successfully ---');
  cdp.close();
}

run().catch((err) => {
  console.error('Error running verification:', err);
  process.exit(1);
});
