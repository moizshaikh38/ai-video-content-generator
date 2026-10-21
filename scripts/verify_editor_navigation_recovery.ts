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
  console.log('=== Live CDP Verification: Editor Navigation & Invalid-Clip Recovery ===\n');

  const screenshotsDir = path.resolve('public/demo/timeline_investigation');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 1. Connect to Chrome
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  const versionData = await versionRes.json();
  const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCdp.connect();

  const invalidClipUrl = 'http://localhost:5173/clips/non-existent-clip-12345/edit';
  console.log(`Navigating to invalid clip URL: ${invalidClipUrl}...`);
  const { targetId } = await browserCdp.send('Target.createTarget', { url: invalidClipUrl });
  const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
  const targets = (await targetsRes.json()) as any[];
  const pageTarget = targets.find((t) => t.id === targetId);
  if (!pageTarget) throw new Error('No page target created');

  const pageCdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await pageCdp.connect();

  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('DOM.enable');

  // Wait for error card to appear
  console.log('Waiting for error state to render...');
  let errorRendered = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 400));
    const check = await pageCdp.send('Runtime.evaluate', {
      expression: `!!document.querySelector('button, h3') && document.body.innerText.includes('Failed to Load Clip')`,
      returnByValue: true,
    });
    if (check.result?.value) {
      errorRendered = true;
      break;
    }
  }
  console.log('Error state rendered:', errorRendered);

  // Inspect error UI elements
  const errorUiCheck = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const heading = document.querySelector('h3')?.textContent?.trim();
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim());
      const hasBrowseBtn = buttons.some(t => t?.includes('Browse Available Clips'));
      const hasGoBack = buttons.some(t => t?.includes('Go Back'));
      const hasRetry = buttons.some(t => t?.includes('Retry'));
      return { heading, buttons, hasBrowseBtn, hasGoBack, hasRetry };
    })()`,
    returnByValue: true,
  });
  console.log('Error UI Check:', JSON.stringify(errorUiCheck.result?.value, null, 2));

  // Capture Screenshot 1: Invalid Clip Error Card with Browse Available Clips button
  const snap1 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '04_invalid_clip_recovery.png'), Buffer.from(snap1.data, 'base64'));
  console.log('Saved: 04_invalid_clip_recovery.png');

  // Click "Browse Available Clips"
  console.log('Clicking "Browse Available Clips"...');
  await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Browse Available Clips'));
      if (btn) btn.click();
    })()`,
  });

  await new Promise((r) => setTimeout(r, 1200));

  // Check URL after click
  const currentUrlCheck = await pageCdp.send('Runtime.evaluate', {
    expression: `window.location.pathname`,
    returnByValue: true,
  });
  console.log('Navigated URL pathname:', currentUrlCheck.result?.value);

  // Capture Screenshot 2: History / Media Library Page reached via Browse Available Clips
  const snap2 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '05_browse_clips_destination.png'), Buffer.from(snap2.data, 'base64'));
  console.log('Saved: 05_browse_clips_destination.png');

  // Inspect Sidebar Video Editor link
  const sidebarCheck = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const links = Array.from(document.querySelectorAll('aside a, nav a')).map(a => ({
        text: a.textContent?.trim(),
        href: a.getAttribute('href'),
      }));
      const videoEditorLink = links.find(l => l.text?.includes('Video Editor'));
      return { videoEditorLink, allLinks: links };
    })()`,
    returnByValue: true,
  });
  console.log('Sidebar Video Editor Link Check:', JSON.stringify(sidebarCheck.result?.value?.videoEditorLink, null, 2));

  // Capture Screenshot 3: Sidebar with Video Editor link
  const snap3 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '06_sidebar_video_editor_link.png'), Buffer.from(snap3.data, 'base64'));
  console.log('Saved: 06_sidebar_video_editor_link.png');

  // Navigate to valid clip to verify editor workspace still mounts and functions
  const validClipUrl = 'http://localhost:5173/clips/c830c056-2063-4ede-ba29-3ead45af7dac/edit';
  console.log(`Navigating to valid clip: ${validClipUrl}...`);
  await pageCdp.send('Page.navigate', { url: validClipUrl });

  let editorLoaded = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const check = await pageCdp.send('Runtime.evaluate', {
      expression: `!!document.querySelector('[aria-label="Hide Timeline"], [aria-label="Show Timeline"]')`,
      returnByValue: true,
    });
    if (check.result?.value) {
      editorLoaded = true;
      break;
    }
  }
  console.log('Editor successfully mounted for valid clip:', editorLoaded);

  const snap4 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(screenshotsDir, '07_verified_active_editor.png'), Buffer.from(snap4.data, 'base64'));
  console.log('Saved: 07_verified_active_editor.png');

  // Close target
  await browserCdp.send('Target.closeTarget', { targetId });
  pageCdp.close();
  browserCdp.close();
  console.log('\n=== Live CDP Verification Completed Successfully ===');
}

run().catch((err) => {
  console.error('CDP verification failed:', err);
  process.exit(1);
});
