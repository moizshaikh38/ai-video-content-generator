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
  console.log('--- Starting Focused Sidebar Navigation Verification ---');
  const screenshotsDir = path.resolve('public/demo/sidebar_cleanup');
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
  const session = sessionData.session;

  // 2. Query Chrome tabs
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const versionData = await versionRes.json();
  const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCdp.connect();

  const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://localhost:5173/' });
  const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
  const targets = (await targetsRes.json()) as any[];
  const pageTarget = targets.find((t) => t.id === targetId);
  if (!pageTarget) throw new Error('No Chrome page target found');

  const cdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Runtime.enable');

  await new Promise((r) => setTimeout(r, 1000));

  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('vireo_supabase_auth', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('sb-hljrqbhxrqkdbvuyybgm-auth-token', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('vireoclip_auth_token', '${session.access_token}');
    `,
  });

  const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
  console.log(`Navigating to /clips/${clipId}/edit...`);
  await cdp.send('Page.navigate', { url: `http://localhost:5173/clips/${clipId}/edit` });

  // Wait for editor to load
  let editorReady = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await cdp.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('aside') && document.querySelectorAll('aside button').length > 5)`,
      returnByValue: true,
    });
    if (res.result?.value) {
      editorReady = true;
      break;
    }
  }

  if (!editorReady) {
    throw new Error('Editor failed to load within timeout');
  }
  console.log('Editor loaded successfully!');

  // Screenshot helper
  const capture = async (name: string) => {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(shot.data, 'base64');
    const filePath = path.join(screenshotsDir, `${name}.png`);
    fs.writeFileSync(filePath, buffer);
    console.log(`Saved screenshot: ${filePath}`);
  };

  // Helper to click sidebar tab by title
  const clickSidebarTab = async (label: string) => {
    console.log(`Clicking sidebar tab "${label}"...`);
    const res = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const btns = Array.from(document.querySelectorAll('aside button'));
          const btn = btns.find(b => b.title === '${label}' || b.textContent.includes('${label}'));
          if (btn) {
            btn.click();
            return { success: true, text: btn.textContent };
          }
          return { success: false, available: btns.map(b => b.title || b.textContent) };
        })()
      `,
      returnByValue: true,
    });
    console.log('Click result:', res.result?.value);
    await new Promise((r) => setTimeout(r, 1200));
  };

  // 1. Click Library Tab
  await clickSidebarTab('Library');
  const libraryCheck = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        return {
          hasMediaLibrary: text.includes('Media Library'),
          hasUploadBtn: text.includes('Upload'),
          hasProjectSubtab: text.includes('Project'),
          hasUploadsSubtab: text.includes('Uploads'),
          hasClipsSubtab: text.includes('Clips'),
          hasBrandSubtab: text.includes('Brand'),
          hasNoThreeTabSwitcher: !document.querySelector('.grid-cols-3 button:has(svg)'),
          hasNoTranslateInMedia: !text.includes('Translate Studio'),
          hasNoBrollInMedia: !text.includes('B-Roll Studio')
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('Library panel verification:', libraryCheck.result?.value);
  await capture('01_library_drawer_focused');

  // 2. Click B-Roll Tab
  await clickSidebarTab('B-Roll');
  const brollCheck = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        return {
          hasBRollStudio: text.includes('B-Roll Studio'),
          hasAISuggestions: text.includes('AI Suggestions'),
          hasStockSearch: text.includes('Stock Search'),
          hasDetectPlan: text.includes('Detect & Plan B-Roll') || text.includes('Pacing Style'),
          hasNoUploadBtn: !Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Upload'),
          hasNoLibrarySubtabs: !text.includes('Project') && !text.includes('Uploads')
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('B-Roll panel verification:', brollCheck.result?.value);
  await capture('02_broll_drawer_focused');

  // 3. Click Translate Tab
  await clickSidebarTab('Translate');
  const translateCheck = await cdp.send('Runtime.evaluate', {
    expression: `
      (() => {
        const text = document.body.innerText;
        return {
          hasTranslateStudio: text.includes('Translate & Dubbing') || text.includes('Script Translation'),
          hasLanguageSelect: text.includes('Target Language') || text.includes('Translate Script'),
          hasNoMediaBin: !text.includes('Media Library') && !text.includes('B-Roll Studio')
        };
      })()
    `,
    returnByValue: true,
  });
  console.log('Translate panel verification:', translateCheck.result?.value);
  await capture('03_translate_drawer_focused');

  // Close created target
  await browserCdp.send('Target.closeTarget', { targetId });
  browserCdp.close();
  cdp.close();
  console.log('--- Verification Complete ---');
}

run().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
