import { spawn } from 'child_process';
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
    this.ws.close();
  }
}

async function main() {
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

  console.log('2. Launching headless Chrome...');
  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    '--user-data-dir=/tmp/vireo_browser_stress_profile',
  ], { stdio: 'ignore' });

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await versionRes.json();
    const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();

    // Create page target
    const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://localhost:5173/' });
    console.log('Target created:', targetId);

    const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t: any) => t.id === targetId);

    const pageCdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
    await pageCdp.connect();

    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('DOM.enable');

    // Wait for initial load
    await new Promise((r) => setTimeout(r, 1000));

    // Inject session into localStorage
    console.log('3. Injecting session into localStorage...');
    await pageCdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('vireo_supabase_auth', JSON.stringify(${JSON.stringify(session)}));`,
    });

    // Navigate to clip editor
    const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
    console.log(`4. Navigating to /clips/${clipId}/edit...`);
    await pageCdp.send('Page.navigate', { url: `http://localhost:5173/clips/${clipId}/edit` });

    // Wait for page to load editor
    let editorReady = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await pageCdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('[data-timeline-item]'))`,
        returnByValue: true,
      });
      if (res.result?.value) {
        editorReady = true;
        break;
      }
    }

    console.log('Editor ready:', editorReady);
    const titleRes = await pageCdp.send('Runtime.evaluate', {
      expression: `document.title + ' | Body items: ' + document.querySelectorAll('[data-timeline-item]').length`,
      returnByValue: true,
    });
    console.log('Evaluation result:', titleRes.result?.value);

    pageCdp.close();
    browserCdp.close();
  } finally {
    chromeProcess.kill();
  }
}

main().catch(err => {
  console.error('Test browser auth failed:', err);
  process.exit(1);
});
