import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/src/config/index.js';

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

async function verifyCaptionStudio() {
  console.log('================================================================');
  console.log('VIREOCLIP — CAPTION STUDIO REDESIGN BROWSER VERIFICATION');
  console.log('================================================================\n');

  const screenshotsDir = path.resolve('public/demo/caption_studio');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Generate auth session
  console.log('1. Generating session for audit_tester@gmail.com...');
  const { data: linkData, error: linkErr } = await supabaseAuthClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'audit_tester@gmail.com',
  });
  if (linkErr) throw linkErr;

  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
  const userClient = createClient(config.supabaseUrl, anonKey);
  const { data: verifyData, error: verifyErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyErr || !verifyData.session) throw new Error('Auth verification failed');
  const session = verifyData.session;
  console.log('✅ Generated session token for user:', session.user.id);

  // 2. Connect to existing Chrome or launch headless
  console.log('2. Connecting to Chrome on port 9222...');
  let chromeProcess: any = null;
  let versionData: any = null;
  try {
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    versionData = await versionRes.json();
    console.log('Connected to existing Chrome:', versionData.Browser);
  } catch {
    console.log('Launching headless Chrome on 9222...');
    chromeProcess = spawn(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      [
        '--headless=new',
        '--remote-debugging-port=9222',
        '--disable-gpu',
        '--no-sandbox',
        '--window-size=1440,900',
      ],
      { stdio: 'ignore' }
    );
    await new Promise((r) => setTimeout(r, 2000));
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    versionData = await versionRes.json();
  }

  try {
    const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();

    // Create page target
    const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://localhost:5173/' });
    const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t: any) => t.id === targetId);

    const pageCdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await pageCdp.connect();

    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('DOM.enable');

    await new Promise((r) => setTimeout(r, 1000));

    // Inject session into localStorage
    console.log('3. Injecting session into localStorage...');
    await pageCdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('vireo_supabase_auth', JSON.stringify(${JSON.stringify(session)}));`,
    });

    const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
    console.log(`4. Navigating to http://localhost:5173/clips/${clipId}/edit...`);
    await pageCdp.send('Page.navigate', { url: `http://localhost:5173/clips/${clipId}/edit` });

    // Wait for editor to load
    let editorReady = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await pageCdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('aside') && document.querySelector('#caption-tab-presets, #caption-tab-customize'))`,
        returnByValue: true,
      });
      if (res.result?.value) {
        editorReady = true;
        break;
      }
    }

    if (!editorReady) {
      console.log('Waiting for sidebar tab click if not default...');
      await pageCdp.send('Runtime.evaluate', {
        expression: `
          const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Captions'));
          if (btn) btn.click();
        `,
      });
      await new Promise((r) => setTimeout(r, 1500));
    }

    console.log('5. Verifying Tab 1: ✨ Presets...');
    // Ensure Presets tab is active
    await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#caption-tab-presets')?.click();`,
    });
    await new Promise((r) => setTimeout(r, 800));

    // Check presets elements
    const presetsVerification = await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const presetsTab = document.querySelector('#caption-tab-presets');
        const customizeTab = document.querySelector('#caption-tab-customize');
        const keepColorsBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Keep My Colors'));
        const presetCards = document.querySelectorAll('[role="radio"]');
        return {
          presetsTabExists: Boolean(presetsTab),
          customizeTabExists: Boolean(customizeTab),
          keepColorsExists: Boolean(keepColorsBtn),
          presetCardCount: presetCards.length,
        };
      })()`,
      returnByValue: true,
    });
    console.log('Presets Tab info:', presetsVerification.result.value);

    // Capture Presets Tab screenshot
    const presetsScreenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, '01_caption_presets_tab.png'), Buffer.from(presetsScreenshot.data, 'base64'));
    console.log('📸 Saved 01_caption_presets_tab.png');

    console.log('6. Verifying Tab 2: 🎨 Customize...');
    // Click Customize tab
    await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#caption-tab-customize')?.click();`,
    });
    await new Promise((r) => setTimeout(r, 800));

    // Verify Customize rows and the "VIRAL HOOKS THAT POP" preview stage box
    const customizeVerification = await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const previewStage = Array.from(document.querySelectorAll('span')).find(s => s.textContent && s.textContent.includes('VIRAL HOOKS THAT'));
        const popWord = Array.from(document.querySelectorAll('span')).find(s => s.textContent && s.textContent.trim() === 'POP');
        
        let previewStyles = null;
        if (previewStage) {
          const comp = window.getComputedStyle(previewStage.parentElement || previewStage);
          const popComp = popWord ? window.getComputedStyle(popWord) : null;
          previewStyles = {
            fontFamily: comp.fontFamily,
            fontWeight: comp.fontWeight,
            paintOrder: comp.paintOrder,
            webkitTextStroke: comp.webkitTextStroke,
            popColor: popComp?.color,
            popPaintOrder: popComp?.paintOrder,
          };
        }

        // Check rows
        const fontSelect = Boolean(document.querySelector('select'));
        const sizeInput = Boolean(document.querySelector('input[type="number"]'));
        const slider = Boolean(document.querySelector('input[type="range"]'));
        const colorButtons = document.querySelectorAll('button[style*="background-color"]');
        const nativeColorInput = Boolean(document.querySelector('input[type="color"]'));
        const casingButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && (b.textContent.includes('All Caps') || b.textContent.includes('Normal')));
        const linesButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && (b.textContent.includes('1 Line') || b.textContent.includes('2 Lines')));
        const alignButtons = Array.from(document.querySelectorAll('button[aria-label]')).filter(b => ['Left', 'Center', 'Right'].includes(b.getAttribute('aria-label') || ''));
        const zoneButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && ['Top', 'Mid', 'Bot'].includes(b.textContent.trim()));
        const popScaleButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && (b.textContent.includes('None') || b.textContent.includes('Subtle') || b.textContent.includes('Slam')));

        // Check scroll height vs client height of the panel container
        const inspectorPanel = document.querySelector('aside');
        const isZeroScroll = inspectorPanel ? inspectorPanel.scrollHeight <= inspectorPanel.clientHeight + 10 : null;

        return {
          previewFound: Boolean(previewStage),
          previewStyles,
          fontSelect,
          sizeInput,
          slider,
          curatedColorCount: colorButtons.length,
          nativeColorInput,
          casingButtonsCount: casingButtons.length,
          linesButtonsCount: linesButtons.length,
          alignButtonsCount: alignButtons.length,
          zoneButtonsCount: zoneButtons.length,
          popScaleButtonsCount: popScaleButtons.length,
          inspectorClientHeight: inspectorPanel?.clientHeight,
          inspectorScrollHeight: inspectorPanel?.scrollHeight,
          isZeroScroll,
        };
      })()`,
      returnByValue: true,
    });
    console.log('Customize Verification Details:\n', JSON.stringify(customizeVerification.result.value, null, 2));

    // Capture Customize Tab screenshot
    const customizeScreenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, '02_caption_customize_tab.png'), Buffer.from(customizeScreenshot.data, 'base64'));
    console.log('📸 Saved 02_caption_customize_tab.png');

    console.log('7. Verifying Tab: 🔤 Font...');
    await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#caption-tab-font')?.click();`,
    });
    await new Promise((r) => setTimeout(r, 600));
    const fontScreenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, '03_caption_font_tab.png'), Buffer.from(fontScreenshot.data, 'base64'));
    console.log('📸 Saved 03_caption_font_tab.png');

    console.log('8. Verifying Tab: 🎨 Effects...');
    await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('#caption-tab-effects')?.click();`,
    });
    await new Promise((r) => setTimeout(r, 600));
    const effectsScreenshot = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(screenshotsDir, '04_caption_effects_tab.png'), Buffer.from(effectsScreenshot.data, 'base64'));
    console.log('📸 Saved 04_caption_effects_tab.png');

    console.log('\n================================================================');
    console.log('VERIFICATION COMPLETE! All artifacts saved to public/demo/caption_studio/');
    console.log('================================================================');
  } finally {
    if (chromeProcess) chromeProcess.kill();
  }
}

verifyCaptionStudio().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
