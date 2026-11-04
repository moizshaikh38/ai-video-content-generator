import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pageId = 'CEF3533F2B2AE60EFD874C7DE404A6C3';
  const ws = new (globalThis as any).WebSocket(`ws://127.0.0.1:9222/devtools/page/${pageId}`);
  await new Promise((r) => { ws.onopen = r; });
  let id = 1;
  const call = (method: string, params: any = {}): Promise<any> => new Promise((resolve, reject) => {
    const curId = id++;
    const handler = (msg: any) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  // Seek playhead to 8 seconds
  console.log('Seeking playhead to 8s...');
  await call('Runtime.evaluate', {
    expression: `(() => {
      // Click at ~8 seconds on the ruler
      const ruler = document.querySelector('[class*="h-7 border-b"]');
      if (ruler) {
        const rect = ruler.getBoundingClientRect();
        // 48px inset + 8s * 60px/s = 528px
        const clickX = rect.left + 48 + 8 * 60;
        const clickY = rect.top + 10;
        const evt = new MouseEvent('click', { clientX: clickX, clientY: clickY, bubbles: true });
        ruler.dispatchEvent(evt);
        return { clicked: true, clickX, clickY };
      }
      return { clicked: false };
    })()`,
  });

  await new Promise((r) => setTimeout(r, 600));

  const outDir = path.resolve('public/demo/timeline_redesign');
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  const shotPath = path.join(outDir, '02_opus_timeline_scrubbed_playhead.png');
  fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot to ${shotPath}`);

  ws.close();
}

main().catch(console.error);
