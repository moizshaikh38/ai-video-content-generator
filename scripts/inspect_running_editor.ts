import fs from 'node:fs';
import path from 'node:path';

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
  console.log('=== Step 3: Inspecting Running Editor via CDP ===\n');

  const screenshotsDir = path.resolve('public/demo/timeline_investigation');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Connect to Chrome
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const versionData = await versionRes.json();
  const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCdp.connect();

  const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
  const url = `http://localhost:5173/clips/${clipId}/edit`;

  const { targetId } = await browserCdp.send('Target.createTarget', { url });
  const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
  const targets = (await targetsRes.json()) as any[];
  const pageTarget = targets.find((t) => t.id === targetId);
  if (!pageTarget) throw new Error('No page target created');

  const pageCdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await pageCdp.connect();

  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('DOM.enable');

  // Listen to console API messages
  const consoleErrors: string[] = [];
  pageCdp.send('Runtime.evaluate', {
    expression: `
      window.__consoleErrors = [];
      const origErr = console.error;
      console.error = (...args) => {
        window.__consoleErrors.push(args.map(a => String(a)).join(' '));
        origErr.apply(console, args);
      };
    `,
  });

  // Wait for editor to load
  console.log(`Navigating to ${url}...`);
  let editorLoaded = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const check = await pageCdp.send('Runtime.evaluate', {
      expression: `!!document.querySelector('aside button, [aria-label="Hide Timeline"], [aria-label="Show Timeline"]')`,
      returnByValue: true,
    });
    if (check.result?.value) {
      editorLoaded = true;
      break;
    }
  }

  console.log('Editor loaded:', editorLoaded);

  // A. Check TopBar buttons
  const topBarCheck = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const header = document.querySelector('header');
      const allText = header ? header.innerText : '';
      const buttons = header ? Array.from(header.querySelectorAll('button')).map(b => b.textContent?.trim() || b.title || b.getAttribute('aria-label') || '') : [];
      return {
        hasHeader: !!header,
        headerText: allText,
        buttons,
        hasStandard: allText.includes('Standard') || buttons.some(b => b.includes('Standard')),
        hasTimelinePro: allText.includes('Timeline Pro') || allText.includes('Pro Multi-Track') || buttons.some(b => b.includes('Timeline Pro')),
      };
    })()`,
    returnByValue: true,
  });
  console.log('TopBar Audit:', JSON.stringify(topBarCheck.result?.value, null, 2));

  // B. Check Timeline Toggle Button & Dimensions when expanded
  const initialTimelineState = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hideBtn = document.querySelector('[aria-label="Hide Timeline"]');
      const showBtn = document.querySelector('[aria-label="Show Timeline"]');
      const timelineEl = hideBtn ? hideBtn.closest('.bg-\\\\[\\\\#07080D\\\\].border-t') || hideBtn.closest('div[class*="border-t"]') : null;
      const rect = timelineEl ? timelineEl.getBoundingClientRect() : null;
      const storedPref = localStorage.getItem('vireo_editor_timeline_collapsed');
      return {
        hasHideBtn: !!hideBtn,
        hasShowBtn: !!showBtn,
        hideBtnText: hideBtn?.textContent?.trim(),
        showBtnText: showBtn?.textContent?.trim(),
        timelineClasses: timelineEl?.className,
        timelineHeight: rect ? rect.height : null,
        timelineBoundingRect: rect,
        storedPref,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Initial Timeline State (Expected Expanded):', JSON.stringify(initialTimelineState.result?.value, null, 2));

  // Capture Screenshot 1: Expanded state
  const snap1 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '01_timeline_expanded.png'), Buffer.from(snap1.data, 'base64'));
  console.log('Captured 01_timeline_expanded.png');

  // C. Click "Hide Timeline"
  console.log('Clicking "Hide Timeline" button...');
  const clickHideRes = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hideBtn = document.querySelector('[aria-label="Hide Timeline"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Hide Timeline'));
      if (hideBtn) {
        hideBtn.click();
        return true;
      }
      return false;
    })()`,
    returnByValue: true,
  });
  console.log('Hide button clicked:', clickHideRes.result?.value);

  await new Promise((r) => setTimeout(r, 600));

  // D. Inspect Collapsed State
  const collapsedState = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hideBtn = document.querySelector('[aria-label="Hide Timeline"]');
      const showBtn = document.querySelector('[aria-label="Show Timeline"]');
      const timelineEl = (showBtn || hideBtn)?.closest('div[class*="border-t"]');
      const rect = timelineEl ? timelineEl.getBoundingClientRect() : null;
      const storedPref = localStorage.getItem('vireo_editor_timeline_collapsed');
      return {
        hasHideBtn: !!hideBtn,
        hasShowBtn: !!showBtn,
        showBtnText: showBtn?.textContent?.trim(),
        timelineClasses: timelineEl?.className,
        timelineHeight: rect ? rect.height : null,
        storedPref,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Collapsed Timeline State:', JSON.stringify(collapsedState.result?.value, null, 2));

  // Capture Screenshot 2: Collapsed state
  const snap2 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '02_timeline_collapsed.png'), Buffer.from(snap2.data, 'base64'));
  console.log('Captured 02_timeline_collapsed.png');

  // E. Reload Page to test persistence
  console.log('Reloading page to test persistence of vireo_editor_timeline_collapsed=true...');
  await pageCdp.send('Page.reload');
  await new Promise((r) => setTimeout(r, 3000));

  const afterReloadState = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hideBtn = document.querySelector('[aria-label="Hide Timeline"]');
      const showBtn = document.querySelector('[aria-label="Show Timeline"]');
      const timelineEl = (showBtn || hideBtn)?.closest('div[class*="border-t"]');
      const rect = timelineEl ? timelineEl.getBoundingClientRect() : null;
      const storedPref = localStorage.getItem('vireo_editor_timeline_collapsed');
      return {
        hasHideBtn: !!hideBtn,
        hasShowBtn: !!showBtn,
        showBtnText: showBtn?.textContent?.trim(),
        timelineClasses: timelineEl?.className,
        timelineHeight: rect ? rect.height : null,
        storedPref,
      };
    })()`,
    returnByValue: true,
  });
  console.log('After Reload State (Expected Persisted Collapsed):', JSON.stringify(afterReloadState.result?.value, null, 2));

  // F. Click "Show Timeline" to restore
  console.log('Clicking "Show Timeline" to re-expand...');
  await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const showBtn = document.querySelector('[aria-label="Show Timeline"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Show Timeline'));
      if (showBtn) showBtn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 600));

  const reExpandedState = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const hideBtn = document.querySelector('[aria-label="Hide Timeline"]');
      const showBtn = document.querySelector('[aria-label="Show Timeline"]');
      const timelineEl = (showBtn || hideBtn)?.closest('div[class*="border-t"]');
      const rect = timelineEl ? timelineEl.getBoundingClientRect() : null;
      const storedPref = localStorage.getItem('vireo_editor_timeline_collapsed');
      return {
        hasHideBtn: !!hideBtn,
        hasShowBtn: !!showBtn,
        hideBtnText: hideBtn?.textContent?.trim(),
        timelineHeight: rect ? rect.height : null,
        storedPref,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Re-Expanded State:', JSON.stringify(reExpandedState.result?.value, null, 2));

  // Capture Screenshot 3: Re-expanded
  const snap3 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '03_timeline_re_expanded.png'), Buffer.from(snap3.data, 'base64'));
  console.log('Captured 03_timeline_re_expanded.png');

  // G. Check for any console errors or layout issues
  const errors = await pageCdp.send('Runtime.evaluate', {
    expression: `window.__consoleErrors || []`,
    returnByValue: true,
  });
  console.log('Console Errors:', errors.result?.value);

  // Close test page target
  await browserCdp.send('Target.closeTarget', { targetId });
  pageCdp.close();
  browserCdp.close();
  console.log('\n=== Investigation Complete ===');
}

run().catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
