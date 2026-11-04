import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'child_process';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { config } from '../server/src/config/index.js';

class SimpleCDP {
  private ws: any;
  private messageId = 0;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(private wsUrl: string) {}

  async connect() {
    this.ws = new (globalThis as any).WebSocket(this.wsUrl);
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
  console.log('--- Starting Elements & Presets Polish CDP Verification ---');
  const screenshotsDir = path.resolve('public/demo/elements_polish');
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

  console.log('✓ Editor loaded successfully.');

  // Step A: Inspect Elements sidebar tab
  const elementsTabInfo = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const elemBtn = btns.find(b => b.textContent?.includes('Elements'));
      if (!elemBtn) return null;
      const svg = elemBtn.querySelector('svg');
      return {
        label: elemBtn.textContent?.trim(),
        hasSvg: !!svg,
        svgClass: svg?.getAttribute('class') || '',
      };
    })()`,
    returnByValue: true,
  });

  console.log('Elements Sidebar Tab Info:', elementsTabInfo.result?.value);

  // Dismiss intro modal if open
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button svg.lucide-x')?.closest('button');
      if (closeBtn) closeBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  // Step B: Click Elements tab
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const elemBtn = btns.find(b => b.textContent?.includes('Elements'));
      if (elemBtn) elemBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1200));

  // Screenshot 1: Elements drawer open
  const snap1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '01_elements_drawer_open.png'), Buffer.from(snap1.data, 'base64'));
  console.log('✓ Screenshot 1: 01_elements_drawer_open.png');

  // Step C: Test Categories (Click Arrows)
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const chips = Array.from(document.querySelectorAll('button'));
      const arrowChip = chips.find(c => c.textContent?.trim() === 'Arrows');
      if (arrowChip) arrowChip.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1000));

  const snap2 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '02_elements_category_arrows.png'), Buffer.from(snap2.data, 'base64'));
  console.log('✓ Screenshot 2: 02_elements_category_arrows.png');

  // Step D: Add first element to canvas
  const added = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('div[title]')).filter(d => 
        d.classList.contains('aspect-square') && d.querySelector('img')
      );
      if (cards.length > 0) {
        cards[0].click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  console.log('Added element to canvas:', added.result?.value);

  await new Promise((r) => setTimeout(r, 1500));

  // Screenshot 3: Element selected on canvas with delete button
  const snap3 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '03_element_on_canvas_with_delete_btn.png'), Buffer.from(snap3.data, 'base64'));
  console.log('✓ Screenshot 3: 03_element_on_canvas_with_delete_btn.png');

  // Check delete button exists
  const deleteBtnCheck = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const delBtn = document.querySelector('button[aria-label="Remove element from video"]');
      return {
        exists: !!delBtn,
        title: delBtn?.getAttribute('title'),
        ariaLabel: delBtn?.getAttribute('aria-label'),
      };
    })()`,
    returnByValue: true,
  });
  console.log('Canvas Delete Button Status:', deleteBtnCheck.result?.value);

  // Step E: Click Delete button
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const delBtn = document.querySelector('button[aria-label="Remove element from video"]');
      if (delBtn) delBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1000));

  // Screenshot 4: Element removed
  const snap4 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '04_element_deleted_from_canvas.png'), Buffer.from(snap4.data, 'base64'));
  console.log('✓ Screenshot 4: 04_element_deleted_from_canvas.png');

  // Step F: Open Captions tab to check new presets
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('aside button'));
      const capBtn = btns.find(b => b.textContent?.includes('Captions'));
      if (capBtn) capBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1200));

  // Scroll preset gallery container to show new presets
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const containers = Array.from(document.querySelectorAll('div')).filter(d => 
        d.classList.contains('overflow-y-auto') && d.textContent?.includes('Preset')
      );
      if (containers.length > 0) {
        containers[0].scrollTop = 350;
      }
    })()`,
  });

  await new Promise((r) => setTimeout(r, 600));

  // Check Caption Presets in DOM
  const presetsInDOM = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(Boolean);
      return {
        hasEditorial: cards.some(c => c.includes('Editorial Classic') || c.includes('Editorial')),
        hasBoldHighlight: cards.some(c => c.includes('Bold Highlight')),
        hasSoftBackdrop: cards.some(c => c.includes('Soft Backdrop')),
        hasCompactCreator: cards.some(c => c.includes('Compact Creator')),
        hasDynamicDuo: cards.some(c => c.includes('Dynamic Duo')),
      };
    })()`,
    returnByValue: true,
  });
  console.log('Presets in DOM:', presetsInDOM.result?.value);

  // Screenshot 5: Caption Presets gallery with new presets
  const snap5 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '05_caption_presets_expanded.png'), Buffer.from(snap5.data, 'base64'));
  console.log('✓ Screenshot 5: 05_caption_presets_expanded.png');

  cdp.close();
  browserCdp.close();
  console.log('--- Verification Complete! ---');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
