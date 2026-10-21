import fs from 'node:fs';

async function main() {
  const ws = new (globalThis as any).WebSocket('ws://127.0.0.1:9222/devtools/page/379D1BE79112C7C80A3DFBBB996762A3');
  await new Promise((r) => { ws.onopen = r; });
  let id = 1;
  const call = (method: string, params: any = {}): Promise<any> => new Promise((resolve) => {
    const curId = id++;
    const handler = (msg: any) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  // Open Transcript dock if collapsed
  const openRes = await call('Runtime.evaluate', {
    expression: `(() => {
      const showBtn = Array.from(document.querySelectorAll('button'))
        .find(b => b.getAttribute('aria-label') === 'Show transcript' || b.title === 'Show transcript');
      if (showBtn) {
        showBtn.click();
        return { clicked: true };
      }
      return { alreadyOpen: true };
    })()`,
    returnByValue: true
  });
  console.log('OPEN DOCK RESULT:', openRes.result?.value);

  await new Promise(r => setTimeout(r, 600));

  const outDir = 'public/demo/transcript_investigation';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${outDir}/transcript_dock_open.png`, Buffer.from(shot.data, 'base64'));
  console.log(`Saved screenshot to ${outDir}/transcript_dock_open.png`);
  ws.close();
}

main().catch(console.error);
