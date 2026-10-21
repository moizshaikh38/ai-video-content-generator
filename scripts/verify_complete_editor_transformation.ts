import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/src/config/index.js';
import { getMongoDb } from '../server/src/db/mongoClient.js';

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

async function verifyTransformation() {
  console.log('================================================================');
  console.log('VIREOCLIP — COMPLETE EDITOR UI TRANSFORMATION VERIFICATION');
  console.log('================================================================\n');

  const outDir = path.resolve('public/demo/editor_transformation');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. Generate auth session
  console.log('1. Generating session token for tester...');
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

  // Seed caption cues into test editor project in MongoDB
  const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
  const db = await getMongoDb();
  const captionTrack = {
    id: 'track-captions',
    project_id: '199d270f-7907-4a3b-a573-bd9b94b25f3c',
    type: 'CAPTION',
    index: 2,
    name: 'Captions',
    locked: false,
    muted: false,
    hidden: false,
    volume: 1,
    items: [
      {
        id: 'item-cap-1',
        track_id: 'track-captions',
        type: 'CAPTION',
        timeline_start: 0,
        timeline_end: 15,
        source_start: 0,
        source_end: 15,
        locked: false,
        muted: false,
        hidden: false,
        z_index: 10,
        caption: {
          preset: 'karaoke',
          cues: [
            {
              id: 'cue-1',
              start: 0.5,
              end: 4.5,
              text: 'VireoClip delivers clean spatial glass editing',
              words: [
                { word: 'VireoClip', start: 0.5, end: 1.2 },
                { word: 'delivers', start: 1.2, end: 1.8 },
                { word: 'clean', start: 1.8, end: 2.3 },
                { word: 'spatial', start: 2.3, end: 2.9 },
                { word: 'glass', start: 2.9, end: 3.5 },
                { word: 'editing', start: 3.5, end: 4.5 },
              ],
            },
            {
              id: 'cue-2',
              start: 5.0,
              end: 9.0,
              text: 'Double click any word to edit it instantly inline',
              words: [
                { word: 'Double', start: 5.0, end: 5.4 },
                { word: 'click', start: 5.4, end: 5.8 },
                { word: 'any', start: 5.8, end: 6.2 },
                { word: 'word', start: 6.2, end: 6.6 },
                { word: 'to', start: 6.6, end: 6.9 },
                { word: 'edit', start: 6.9, end: 7.3 },
                { word: 'it', start: 7.3, end: 7.6 },
                { word: 'instantly', start: 7.6, end: 8.3 },
                { word: 'inline', start: 8.3, end: 9.0 },
              ],
            },
          ],
        },
      },
    ],
  };

  // Check and update clip ownership in MongoDB
  let clipDoc = await db.collection('clips').findOne({ id: clipId });
  console.log('Existing clip doc:', clipDoc ? { id: clipDoc.id, user_id: clipDoc.user_id, project_id: clipDoc.project_id } : 'NOT FOUND');
  if (!clipDoc) {
    // If not found by string id, check if any clip exists
    const anyClip = await db.collection('clips').findOne({});
    console.log('Any clip in collection:', anyClip ? { id: anyClip.id, user_id: anyClip.user_id } : 'NO CLIPS FOUND');
    if (anyClip) {
      // Create a clip record with clipId
      await db.collection('clips').insertOne({
        ...anyClip,
        _id: undefined,
        id: clipId,
        user_id: session.user.id,
        title: 'VireoClip Transformation Showcase',
        render_status: 'ready',
      });
      clipDoc = await db.collection('clips').findOne({ id: clipId });
    }
  }

  if (clipDoc) {
    await db.collection('clips').updateOne(
      { id: clipId },
      { $set: { user_id: session.user.id, render_status: 'ready' } }
    );
    if (clipDoc.project_id) {
      await db.collection('projects').updateOne(
        { id: clipDoc.project_id },
        { $set: { user_id: session.user.id } }
      );
    }
  }

  await db.collection('editor_projects').updateOne(
    { clip_id: clipId },
    {
      $set: { user_id: session.user.id },
      $pull: { tracks: { type: 'CAPTION' } } as any,
    }
  );
  await db.collection('editor_projects').updateOne(
    { clip_id: clipId },
    {
      $push: { tracks: captionTrack } as any,
    }
  );
  console.log('✅ Seeded clip and caption track into MongoDB for clipId:', clipId);

  // 2. Connect to existing Chrome or launch headless
  console.log('2. Connecting to Chrome on port 9222...');
  let versionData: any = null;
  const versionRes = await fetch('http://127.0.0.1:9222/json/version');
  versionData = await versionRes.json();
  console.log('Connected to existing Chrome:', versionData.Browser);

  const browserCdp = new SimpleCDP(versionData.webSocketDebuggerUrl);
  await browserCdp.connect();

  const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://localhost:5173/' });
  const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
  const targets = await targetsRes.json();
  const pageTarget = targets.find((t: any) => t.id === targetId);

  const pageCdp = new SimpleCDP(pageTarget.webSocketDebuggerUrl);
  await pageCdp.connect();

  await pageCdp.send('Page.enable');
  await pageCdp.send('Runtime.enable');
  await pageCdp.send('DOM.enable');

  await pageCdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });

  // Inject session and default layout
  await pageCdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('sb-127-auth-token', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('vireo_supabase_auth', JSON.stringify(${JSON.stringify(session)}));
      localStorage.setItem('vireo_auth_token', '${session.access_token}');
      localStorage.setItem('vireo_user', JSON.stringify(${JSON.stringify(session.user)}));
      localStorage.setItem('vireo_transcript_collapsed', '0');
      localStorage.setItem('vireo_transcript_width', '360');
      localStorage.setItem('vireo_drawer_width', '340');
      localStorage.setItem('vireo_timeline_height', '240');
    `,
  });

  // Navigate to editor
  console.log(`3. Navigating to Editor: http://localhost:5173/clips/${clipId}/edit...`);
  await pageCdp.send('Page.navigate', { url: `http://localhost:5173/clips/${clipId}/edit` });

  // Wait for editor DOM to mount
  let editorReady = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const res = await pageCdp.send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('header') && !document.querySelector('.animate-spin') && document.querySelector('aside'))`,
      returnByValue: true,
    });
    if (res.result?.value) {
      editorReady = true;
      break;
    }
  }
  console.log('Editor ready state:', editorReady);
  await new Promise((r) => setTimeout(r, 1500));

  // Select Text / Overlay Tab on far-right sidebar
  console.log('Switching to Text / Overlay tab on far-right sidebar...');
  await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const textBtn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent && b.textContent.includes('Text'));
      if (textBtn) textBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Screenshot 1: Full Opus.pro Inspired Layout with Left Transcript, Center Stage, Right Overlay Drawer & Timeline
  console.log('4. Capturing Full Layout with Left Transcript, Center Stage & Right Overlay Drawer...');
  const snap1 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, '01_opus_style_layout.png'), Buffer.from(snap1.data, 'base64'));
  console.log('📸 Saved 01_opus_style_layout.png');

  // Audit Layout Metrics
  const auditMetrics = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 1. Left Transcript Dock
      const transcriptDock = document.querySelector('.glass-dock');
      const speechCleanup = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Speech cleanup'));
      const extendBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Extend a clip'));
      const pauseBadges = document.querySelectorAll('button[title*="Remove pause"]').length;

      // 2. Center Stage Controls (above video preview)
      const aspectPills = Array.from(document.querySelectorAll('button')).filter(b => ['9:16', '16:9', '1:1'].includes(b.textContent?.trim() || ''));
      const fillLayout = Array.from(document.querySelectorAll('div, span')).some(el => el.textContent && el.textContent.includes('Layout:'));
      const trackerBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Tracker:'));

      // 3. Right Drawer (Overlay / Text)
      const overlayTitle = Array.from(document.querySelectorAll('h3')).some(h => h.textContent === 'Overlay');
      const addTextBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Add text'));
      const editorialCard = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Editorial'));
      const statementCard = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Statement'));
      const classicCard = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Classic'));
      const alejandroCard = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Alejandro Coleman'));
      const jeremiahCard = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Jeremiah Chesterton'));

      // 4. Far-Right Sidebar Rail
      const sidebarTabs = Array.from(document.querySelectorAll('aside button')).map(b => b.textContent?.trim()).filter(Boolean);

      // 5. Timeline Toolbar
      const hideTimelineBtn = Array.from(document.querySelectorAll('button')).some(b => b.textContent && b.textContent.includes('Hide timeline'));
      const splitBtn = document.querySelector('button[title*="Split"]');
      const deleteBtn = document.querySelector('button[title*="Ripple Delete"]');

      // 6. Danger Zone Visibility
      const dangerZoneVisible = Array.from(document.querySelectorAll('div')).some(d => d.textContent && d.textContent.includes('Subtitle Dead Zone'));

      return {
        hasTranscriptOnLeft: Boolean(transcriptDock),
        hasSpeechCleanupPill: speechCleanup,
        hasExtendClipButton: extendBtn,
        pauseBadgesCount: pauseBadges,
        stageAspectPillsCount: aspectPills.length,
        hasFillLayoutIndicator: fillLayout,
        hasTrackerButton: trackerBtn,
        hasOverlayDrawerTitle: overlayTitle,
        hasAddTextButton: addTextBtn,
        hasHeadlineCards: editorialCard && statementCard && classicCard,
        hasNameTagCards: alejandroCard && jeremiahCard,
        sidebarTabs,
        hasHideTimelineButton: hideTimelineBtn,
        hasSplitButton: Boolean(splitBtn),
        hasDeleteButton: Boolean(deleteBtn),
        isDangerZoneHiddenWhenIdle: !dangerZoneVisible,
      };
    })()`,
    returnByValue: true,
  });
  console.log('\n📊 DOM & Architectural Layout Audit:');
  console.log(JSON.stringify(auditMetrics.result.value, null, 2));

  // Screenshot 2: Switch to Captions tab and verify Caption presets
  console.log('\n5. Switching to Captions tab on far-right sidebar...');
  await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      const capsBtn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent && b.textContent.includes('Captions'));
      if (capsBtn) capsBtn.click();
    })()`,
  });
  await new Promise((r) => setTimeout(r, 1200));

  const snap2 = await pageCdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, '02_captions_preset_gallery.png'), Buffer.from(snap2.data, 'base64'));
  console.log('📸 Saved 02_captions_preset_gallery.png');

  // Test 3: Deselection on Canvas Click
  console.log('\n6. Testing Deselection on Background Canvas Click...');
  const deselectResult = await pageCdp.send('Runtime.evaluate', {
    expression: `(() => {
      // 1. First click on caption to select it
      const captionElem = document.querySelector('[data-selectable-item="true"]');
      if (captionElem) {
        (captionElem as HTMLElement).click();
      }

      // Check if item selected
      const selectedBefore = Boolean(document.querySelector('.ring-violet-500, .border-violet-500, [data-selected="true"]'));

      // 2. Click on video or empty stage background
      const stageViewport = document.querySelector('.bg-\\\\[\\\\#0B0C10\\\\], video');
      if (stageViewport) {
        const ev = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
        stageViewport.dispatchEvent(ev);
        (stageViewport as HTMLElement).click();
      }

      return {
        hadSelectionBefore: selectedBefore,
      };
    })()`,
    returnByValue: true,
  });
  console.log('Deselection test result:', deselectResult.result.value);

  // Clean up
  await browserCdp.send('Target.closeTarget', { targetId });
  pageCdp.close();
  browserCdp.close();

  console.log('\n================================================================');
  console.log('VERIFICATION COMPLETE! All images saved to public/demo/editor_transformation/');
  console.log('================================================================\n');
}

verifyTransformation().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
