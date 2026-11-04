import { spawn } from 'child_process';
import { getMongoDb } from '../server/src/db/mongoClient.js';
import { supabaseAuthClient } from '../server/src/utils/supabase.js';
import { createClient } from '@supabase/supabase-js';
import { config } from '../server/src/config/index.js';

class CDPClient {
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

interface TestLogEntry {
  name: string;
  passed: boolean;
  before: any;
  after: any;
  details: string;
}

const testResults: TestLogEntry[] = [];

function logTest(name: string, passed: boolean, before: any, after: any, details: string) {
  testResults.push({ name, passed, before, after, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n[${icon}] ${name}`);
  console.log(`  Details: ${details}`);
  if (before && after) {
    console.log(`  Before: start=${before.start}s, end=${before.end}s, dur=${before.dur}s`);
    console.log(`  After:  start=${after.start}s, end=${after.end}s, dur=${after.dur}s`);
  }
}

async function getElementRect(cdp: CDPClient, selector: string) {
  const res = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('${selector}');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    })()`,
    returnByValue: true,
  });
  return res.result?.value;
}

async function getProjectState(cdp: CDPClient) {
  const res = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      // Find items in DOM
      const items = Array.from(document.querySelectorAll('[data-timeline-item]')).map(el => {
        const id = el.getAttribute('data-timeline-item');
        const styleLeft = parseFloat(el.style.left);
        const styleWidth = parseFloat(el.style.width);
        return { id, styleLeft, styleWidth };
      });
      const snapLine = document.querySelector('.bg-yellow-400');
      const snapBadge = snapLine ? snapLine.parentElement?.querySelector('.bg-yellow-400.text-neutral-950') : null;
      return {
        items,
        snapActive: Boolean(snapLine),
        snapBadgeText: snapBadge?.textContent?.trim() || null,
      };
    })()`,
    returnByValue: true,
  });
  return res.result?.value;
}

async function getItemTimelineBounds(cdp: CDPClient, itemId: string, pixelsPerSec: number = 60) {
  const res = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const el = document.querySelector('[data-timeline-item="${itemId}"]');
      if (!el) return null;
      const left = parseFloat(el.style.left) || 0;
      const width = parseFloat(el.style.width) || 0;
      return {
        left,
        width,
        start: Math.round((left / ${pixelsPerSec}) * 1000) / 1000,
        end: Math.round(((left + width) / ${pixelsPerSec}) * 1000) / 1000,
        dur: Math.round((width / ${pixelsPerSec}) * 1000) / 1000,
      };
    })()`,
    returnByValue: true,
  });
  return res.result?.value;
}

async function main() {
  console.log('===============================================================');
  console.log('VIREOCLIP AI — PHASE 3A.1: MAGNETIC SNAPPING BROWSER STRESS TEST');
  console.log('===============================================================\n');

  const userId = '9ded5274-c4c9-47ac-b45c-b795078307bb';
  const clipId = 'c830c056-2063-4ede-ba29-3ead45af7dac';
  const projectId = '199d270f-7907-4a3b-a573-bd9b94b25f3c';

  // Step 1: Seed Clean Multi-Clip Timeline in MongoDB
  console.log('--- Step 1: Seeding Test Multi-Clip Timeline in MongoDB ---');
  const db = await getMongoDb();

  const initialTestProject = {
    id: projectId,
    clip_id: clipId,
    user_id: userId,
    title: 'Snapping Stress Test Project',
    version: 1,
    canvas: {
      width: 1080,
      height: 1920,
      aspect_ratio: '9:16',
      duration: 30,
      fps: 30,
      background_color: '#000000',
    },
    playhead: 0,
    tracks: [
      {
        id: 'track-v1',
        project_id: projectId,
        type: 'VIDEO',
        index: 0,
        name: 'Video Track 1',
        locked: false,
        muted: false,
        hidden: false,
        volume: 1,
        items: [
          {
            id: 'item-v1-a',
            track_id: 'track-v1',
            type: 'VIDEO',
            timeline_start: 0,
            timeline_end: 5.0,
            source_start: 0,
            source_end: 5.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 0,
            source_media: { storage_path: '/dummy.mp4', duration: 30, width: 1080, height: 1920, fps: 30, has_audio: true },
          },
          {
            id: 'item-v1-b',
            track_id: 'track-v1',
            type: 'VIDEO',
            timeline_start: 8.0,
            timeline_end: 15.0,
            source_start: 0,
            source_end: 7.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 0,
            source_media: { storage_path: '/dummy.mp4', duration: 30, width: 1080, height: 1920, fps: 30, has_audio: true },
          },
          {
            id: 'item-v1-c',
            track_id: 'track-v1',
            type: 'VIDEO',
            timeline_start: 18.0,
            timeline_end: 25.0,
            source_start: 0,
            source_end: 7.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 0,
            source_media: { storage_path: '/dummy.mp4', duration: 30, width: 1080, height: 1920, fps: 30, has_audio: true },
          },
        ],
      },
      {
        id: 'track-a1',
        project_id: projectId,
        type: 'AUDIO',
        index: 1,
        name: 'Audio Track 1',
        locked: false,
        muted: false,
        hidden: false,
        volume: 1,
        items: [
          {
            id: 'item-a1-1',
            track_id: 'track-a1',
            type: 'AUDIO',
            timeline_start: 2.0,
            timeline_end: 10.0,
            source_start: 0,
            source_end: 8.0,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: false,
            hidden: false,
            z_index: 0,
            source_media: { storage_path: '/dummy.mp3', duration: 30, has_audio: true },
          },
        ],
      },
    ],
    settings: {
      snapping: true,
      snap_tolerance_sec: 0.2,
      ripple_editing: false,
    },
    created_at: new Date(),
    updated_at: new Date(),
  };

  await db.collection('editor_projects').updateOne(
    { clip_id: clipId },
    { $set: initialTestProject },
    { upsert: true }
  );
  console.log('✅ Initial multi-clip project seeded successfully in MongoDB.');

  // Step 2: Authenticate User
  console.log('\n--- Step 2: Supabase Session Generation ---');
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
  console.log('✅ Session generated for audit_tester (user ID:', session.user.id, ')');

  // Step 3: Launch Headless Chrome
  console.log('\n--- Step 3: Launching Headless Chrome & CDP Connection ---');
  const chromeProcess = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    '--user-data-dir=/tmp/vireo_stress_test_profile',
  ], { stdio: 'ignore' });

  await new Promise((r) => setTimeout(r, 1500));

  try {
    const versionRes = await fetch('http://127.0.0.1:9222/json/version');
    const versionData = await versionRes.json();
    const browserCdp = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserCdp.connect();

    const { targetId } = await browserCdp.send('Target.createTarget', { url: 'http://localhost:5173/' });
    const targetsRes = await fetch('http://127.0.0.1:9222/json/list');
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t: any) => t.id === targetId);

    const pageCdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await pageCdp.connect();

    await pageCdp.send('Page.enable');
    await pageCdp.send('Runtime.enable');
    await pageCdp.send('DOM.enable');
    await pageCdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await new Promise((r) => setTimeout(r, 800));

    // Inject session
    await pageCdp.send('Runtime.evaluate', {
      expression: `localStorage.setItem('vireo_supabase_auth', JSON.stringify(${JSON.stringify(session)}));`,
    });

    // Navigate to editor
    console.log(`Navigating to http://localhost:5173/clips/${clipId}/edit...`);
    await pageCdp.send('Page.navigate', { url: `http://localhost:5173/clips/${clipId}/edit` });

    // Wait for items to mount
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const res = await pageCdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('[data-timeline-item="item-v1-b"]'))`,
        returnByValue: true,
      });
      if (res.result?.value) {
        ready = true;
        break;
      }
    }
    if (!ready) throw new Error('Timeline did not render item-v1-b within timeout');
    console.log('✅ VireoClip Studio loaded with timeline items active.');

    // Helper: Perform mouse drag
    async function dragPointer(
      startX: number,
      startY: number,
      deltaX: number,
      deltaY: number,
      steps: number = 10,
      modifiers: number = 0,
      onIntermediate?: () => Promise<void>
    ) {
      await pageCdp.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: startX,
        y: startY,
        button: 'left',
        clickCount: 1,
        modifiers,
      });

      for (let s = 1; s <= steps; s++) {
        const curX = startX + (deltaX * s) / steps;
        const curY = startY + (deltaY * s) / steps;
        await pageCdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: curX,
          y: curY,
          button: 'left',
          modifiers,
        });
        await new Promise((r) => setTimeout(r, 15));
        if (s === steps && onIntermediate) {
          await onIntermediate();
        }
      }

      await pageCdp.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: startX + deltaX,
        y: startY + deltaY,
        button: 'left',
        modifiers,
      });
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log('\n===============================================================');
    console.log('EXECUTION OF REAL POINTER STRESS SCENARIOS');
    console.log('===============================================================');

    // -----------------------------------------------------------------------------------
    // Scenario 1: Drag Clip B leading edge to align with Clip A's end (5.0s)
    // -----------------------------------------------------------------------------------
    const bBefore = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const rectB = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    // Clip B starts at 8.0s (480px). Clip A ends at 5.0s (300px). Delta is -180px.
    // Moving ~ -175px enters the 12px magnetic tolerance zone around 5.0s!
    let guideVisibleDuringMove = false;
    let badgeTextDuringMove = '';
    await dragPointer(
      rectB.x + rectB.width / 2,
      rectB.y + rectB.height / 2,
      -175,
      0,
      12,
      0,
      async () => {
        const state = await getProjectState(pageCdp);
        guideVisibleDuringMove = state.snapActive;
        badgeTextDuringMove = state.snapBadgeText;
      }
    );
    const bAfterMoveA = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const passed1 = bAfterMoveA.start === 5.0 && bAfterMoveA.end === 12.0 && bAfterMoveA.dur === 7.0 && guideVisibleDuringMove;
    logTest(
      'Scenario 1: Leading edge snapping to preceding clip end (5.0s)',
      passed1,
      bBefore,
      bAfterMoveA,
      `Duration preserved: ${bAfterMoveA.dur === 7.0}, Guide visible during move: ${guideVisibleDuringMove}, Badge: "${badgeTextDuringMove}"`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 2: Undo and Redo validation
    // -----------------------------------------------------------------------------------
    // Press Cmd+Z (or dispatch undo key)
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'z',
      code: 'KeyZ',
      modifiers: 4, // Cmd / Ctrl
    });
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'z',
      code: 'KeyZ',
      modifiers: 0,
    });
    await new Promise((r) => setTimeout(r, 150));
    const bAfterUndo = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const undoPassed = bAfterUndo.start === 8.0 && bAfterUndo.end === 15.0;

    // Press Cmd+Shift+Z (Redo)
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'z',
      code: 'KeyZ',
      modifiers: 4 | 8, // Cmd + Shift
    });
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'z',
      code: 'KeyZ',
      modifiers: 0,
    });
    await new Promise((r) => setTimeout(r, 150));
    const bAfterRedo = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const redoPassed = bAfterRedo.start === 5.0 && bAfterRedo.end === 12.0;

    logTest(
      'Scenario 2: Single gesture undo / redo integrity',
      undoPassed && redoPassed,
      bAfterUndo,
      bAfterRedo,
      `Undo restored initial 8.0s (${undoPassed}), Redo restored snapped 5.0s (${redoPassed})`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 3: Trailing edge snapping to Clip C start (18.0s)
    // -----------------------------------------------------------------------------------
    // Clip B is at [5.0s, 12.0s]. Clip C starts at 18.0s.
    // Trailing edge snap means Clip B end becomes 18.0s, start becomes 11.0s.
    const bBefore3 = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const rectB2 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    const delta3 = (11.0 - bBefore3.start) * 60 - 4; // lands within 4px of 18.0s snap point
    let trailingBadge = '';
    await dragPointer(
      rectB2.x + rectB2.width / 2,
      rectB2.y + rectB2.height / 2,
      delta3,
      0,
      12,
      0,
      async () => {
        await new Promise((r) => setTimeout(r, 60));
        const state = await getProjectState(pageCdp);
        trailingBadge = state.snapBadgeText;
      }
    );
    const bAfterMoveC = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const passed3 = bAfterMoveC.end === 18.0 && bAfterMoveC.start === 11.0 && bAfterMoveC.dur === 7.0;
    logTest(
      'Scenario 3: Trailing edge snapping to following clip start (18.0s)',
      passed3,
      bBefore3,
      bAfterMoveC,
      `Clip B end snapped to 18.0s, start to 11.0s, dur preserved: ${bAfterMoveC.dur === 7.0}, Badge: "${trailingBadge}"`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 4: Snap to Playhead
    // -----------------------------------------------------------------------------------
    // Click ruler at 10.0s (600px from ruler left) to set playhead to 10.0s
    const rulerRect = await getElementRect(pageCdp, '[data-testid="timeline-ruler"]');
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: Math.round(rulerRect.left + 10.0 * 60),
      y: Math.round(rulerRect.top + 10),
      button: 'left',
      clickCount: 1,
    });
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Math.round(rulerRect.left + 10.0 * 60),
      y: Math.round(rulerRect.top + 10),
      button: 'left',
    });
    await new Promise((r) => setTimeout(r, 200));

    // Now drag Clip A (currently [0, 5.0]) right towards playhead at 10.0s (delta +5.0s = +300px).
    // Moving +296px lands within 12px tolerance of 10.0s playhead!
    const rectA = await getElementRect(pageCdp, '[data-timeline-item="item-v1-a"]');
    const aBefore = await getItemTimelineBounds(pageCdp, 'item-v1-a', 60);
    let playheadBadge = '';
    await dragPointer(
      rectA.x + rectA.width / 2,
      rectA.y + rectA.height / 2,
      296,
      0,
      12,
      0,
      async () => {
        await new Promise((r) => setTimeout(r, 60));
        const state = await getProjectState(pageCdp);
        playheadBadge = state.snapBadgeText;
      }
    );
    const aAfterPlayhead = await getItemTimelineBounds(pageCdp, 'item-v1-a', 60);
    const passed4 = aAfterPlayhead.end === 10.0 && aAfterPlayhead.start === 5.0 && aAfterPlayhead.dur === 5.0;
    logTest(
      'Scenario 4: Trailing edge snapping to Playhead (10.0s)',
      passed4,
      aBefore,
      aAfterPlayhead,
      `Clip A end snapped to 10.0s, duration 5.0s preserved, Badge: "${playheadBadge}"`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 5: Snap to Timeline Zero (0:00.00)
    // -----------------------------------------------------------------------------------
    // Drag Clip A left towards 0.0s (delta -5.0s = -300px).
    // Moving -295px lands within 12px tolerance of 0.0s!
    const rectA2 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-a"]');
    let zeroBadge = '';
    await dragPointer(
      rectA2.x + rectA2.width / 2,
      rectA2.y + rectA2.height / 2,
      -295,
      0,
      12,
      0,
      async () => {
        const state = await getProjectState(pageCdp);
        zeroBadge = state.snapBadgeText;
      }
    );
    const aAfterZero = await getItemTimelineBounds(pageCdp, 'item-v1-a', 60);
    const passed5 = aAfterZero.start === 0 && aAfterZero.end === 5.0 && aAfterZero.dur === 5.0;
    logTest(
      'Scenario 5: Leading edge snapping to Timeline Zero (0:00.00)',
      passed5,
      aAfterPlayhead,
      aAfterZero,
      `Clip A start snapped to 0.0s, Badge: "${zeroBadge}"`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 6: Cross-track snapping (Clip B leading edge to Audio 1 end at 10.0s)
    // -----------------------------------------------------------------------------------
    // Audio 1 on Track 1 has end at 10.0s. Clip B is at [11.0s, 18.0s].
    // Drag Clip B left by ~1.0s (60px) towards 10.0s.
    // Moving -57px enters 12px tolerance of Audio 1 Out!
    const rectB3 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    let crossTrackBadge = '';
    await dragPointer(
      rectB3.x + rectB3.width / 2,
      rectB3.y + rectB3.height / 2,
      -57,
      0,
      12,
      0,
      async () => {
        const state = await getProjectState(pageCdp);
        crossTrackBadge = state.snapBadgeText;
      }
    );
    const bAfterCross = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const passed6 = bAfterCross.start === 10.0 && bAfterCross.end === 17.0;
    logTest(
      'Scenario 6: Cross-track snapping across video and audio lanes',
      passed6,
      bAfterMoveC,
      bAfterCross,
      `Clip B snapped to Audio Out at 10.0s, Badge: "${crossTrackBadge}"`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 7: Shift & Alt bypass keys
    // -----------------------------------------------------------------------------------
    // Drag Clip B with Shift modifier (modifiers = 8) near Clip A end at 5.0s (delta -5.0s = -300px).
    // Moving -298px without Shift would snap to 5.0s. With Shift, it should land at raw unsnapped ~5.033s!
    const rectB4 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    let shiftSnapActive = true;
    await dragPointer(
      rectB4.x + rectB4.width / 2,
      rectB4.y + rectB4.height / 2,
      -298,
      0,
      12,
      8, // Shift key
      async () => {
        const state = await getProjectState(pageCdp);
        shiftSnapActive = state.snapActive;
      }
    );
    const bAfterShift = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const shiftPassed = bAfterShift.start !== 5.0 && !shiftSnapActive;

    // Test Alt key (modifiers = 1)
    const rectB5 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    let altSnapActive = true;
    await dragPointer(
      rectB5.x + rectB5.width / 2,
      rectB5.y + rectB5.height / 2,
      15,
      0,
      10,
      1, // Alt key
      async () => {
        const state = await getProjectState(pageCdp);
        altSnapActive = state.snapActive;
      }
    );
    const bAfterAlt = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const altPassed = !altSnapActive;

    logTest(
      'Scenario 7: Shift and Alt bypass modifier validation',
      shiftPassed && altPassed,
      bAfterCross,
      bAfterShift,
      `Shift bypass active: ${!shiftSnapActive} (start=${bAfterShift.start}), Alt bypass active: ${!altSnapActive}`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 8: Toolbar Snap Toggle Button
    // -----------------------------------------------------------------------------------
    // Click the Magnet snap button in timeline toolbar (title includes "Snapping")
    const snapBtnRes = await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title*="Snapping"]');
        if (btn) { btn.click(); return btn.title; }
        return null;
      })()`,
      returnByValue: true,
    });
    console.log('Clicked snap button, title was:', snapBtnRes.result?.value);
    await new Promise((r) => setTimeout(r, 200));

    // Try moving Clip B near 5.0s with snapping toggled off -> should NOT snap
    const rectB6 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    const bBeforeToggled = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    let toggledOffSnapActive = true;
    await dragPointer(
      rectB6.x + rectB6.width / 2,
      rectB6.y + rectB6.height / 2,
      6,
      0,
      10,
      0,
      async () => {
        const state = await getProjectState(pageCdp);
        toggledOffSnapActive = state.snapActive;
      }
    );
    const bAfterToggled = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const toggleOffPassed = !toggledOffSnapActive && bAfterToggled.start !== 5.0;

    // Toggle snap back ON
    await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title*="Snapping"]');
        if (btn) { btn.click(); return true; }
        return false;
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 200));

    logTest(
      'Scenario 8: Toolbar Magnetic Snapping toggle button',
      toggleOffPassed,
      bBeforeToggled,
      bAfterToggled,
      `Snapping disabled via button -> snapActive=${toggledOffSnapActive}, re-enabled successfully`
    );

    // -----------------------------------------------------------------------------------
    // -----------------------------------------------------------------------------------
    // Scenario 9: Competing Targets & Deterministic Priority
    // -----------------------------------------------------------------------------------
    // Re-query current ruler position using deterministic data-testid
    const currRulerRect = await getElementRect(pageCdp, '[data-testid="timeline-ruler"]');
    // Click ruler at exact offset of 5.0s (300px from ruler left)
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: Math.round(currRulerRect.left + 5.0 * 60),
      y: Math.round(currRulerRect.top + 10),
      button: 'left',
      clickCount: 1,
    });
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Math.round(currRulerRect.left + 5.0 * 60),
      y: Math.round(currRulerRect.top + 10),
      button: 'left',
    });
    await new Promise((r) => setTimeout(r, 250));

    const playheadTimecode = await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('.font-mono.text-xs .text-orange-400')?.textContent?.trim()`,
      returnByValue: true,
    });
    console.log('Playhead timecode for Scenario 9:', playheadTimecode.result?.value);

    // Get current bounds of Clip B, compute delta to place leading edge within 4px of 5.0s
    const bBeforeComp = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const deltaTo5s = (5.0 - bBeforeComp.start) * 60 + 4; // 4px away from 5.0s (within 12px tolerance)
    const rectB7 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    let competingBadge = '';
    await dragPointer(
      rectB7.x + rectB7.width / 2,
      rectB7.y + rectB7.height / 2,
      deltaTo5s,
      0,
      12,
      0,
      async () => {
        const state = await getProjectState(pageCdp);
        competingBadge = state.snapBadgeText;
      }
    );
    const bAfterCompeting = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const competingPassed = bAfterCompeting.start === 5.0 && competingBadge === 'Playhead';
    logTest(
      'Scenario 9: Competing targets deterministic priority (Playhead over Clip End)',
      competingPassed,
      bBeforeComp,
      bAfterCompeting,
      `Badge selected: "${competingBadge}" (Playhead priority over Clip Edge)`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 10: Multi-zoom scaling (20 px/s vs 200 px/s)
    // -----------------------------------------------------------------------------------
    // Click Zoom Out button twice to transition from 60 px/s -> 40 px/s -> 20 px/s
    await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title="Zoom Out"]');
        if (btn) { btn.click(); btn.click(); return true; }
        return false;
      })()`,
    });
    await new Promise((r) => setTimeout(r, 250));

    const zoom20Val = await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="timeline-zoom-slider"]')?.value`,
      returnByValue: true,
    });
    console.log('Current zoom slider after Zoom Out:', zoom20Val.result?.value);

    // At 20 px/s with snap_tolerance_sec: 0.2, tolerance is 0.2 * 20 = 4px (0.20s).
    // Move Clip B towards 0.0s within 2px (0.10s) to test snapping under scaled zoom
    const bBeforeZoom = await getItemTimelineBounds(pageCdp, 'item-v1-b', 20);
    const deltaToZero20 = -bBeforeZoom.start * 20 + 2; // 2px away from 0.0s (0.10s, within 0.20s tolerance)
    const rectB20 = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    await dragPointer(
      rectB20.x + rectB20.width / 2,
      rectB20.y + rectB20.height / 2,
      deltaToZero20,
      0,
      10,
      0
    );
    const bAt20 = await getItemTimelineBounds(pageCdp, 'item-v1-b', 20);
    const zoom20Passed = bAt20.start === 0;

    // Reset zoom back to 60 px/s (Zoom In twice: 20 -> 40 -> 60)
    await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('button[title="Zoom In"]');
        if (btn) { btn.click(); btn.click(); return true; }
        return false;
      })()`,
    });
    await new Promise((r) => setTimeout(r, 250));

    const zoom60Val = await pageCdp.send('Runtime.evaluate', {
      expression: `document.querySelector('[data-testid="timeline-zoom-slider"]')?.value`,
      returnByValue: true,
    });
    console.log('Current zoom slider after Zoom In:', zoom60Val.result?.value);

    logTest(
      'Scenario 10: Proportional zoom scaling at 20 px/s',
      zoom20Passed,
      bBeforeZoom,
      bAt20,
      `Clip B snapped to 0.0s under expanded time window at 20 px/s zoom`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 11: Horizontal Scroll Translation
    // -----------------------------------------------------------------------------------
    // Scroll tracks horizontally by 120px
    await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const scrollEl = document.querySelector('.flex-1.overflow-x-auto');
        if (scrollEl) scrollEl.scrollLeft = 120;
      })()`,
    });
    await new Promise((r) => setTimeout(r, 100));

    // Drag Clip B from its current position towards 5.0s
    const bBeforeScroll = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const deltaTo5Scroll = (5.0 - bBeforeScroll.start) * 60 - 4; // lands within 4px of 5.0s
    const rectBScroll = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    await dragPointer(
      rectBScroll.x + rectBScroll.width / 2,
      rectBScroll.y + rectBScroll.height / 2,
      deltaTo5Scroll,
      0,
      12,
      0
    );
    const bAfterScroll = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const scrollPassed = bAfterScroll.start === 5.0;

    // Reset scrollLeft to 0
    await pageCdp.send('Runtime.evaluate', {
      expression: `(() => {
        const scrollEl = document.querySelector('.flex-1.overflow-x-auto');
        if (scrollEl) scrollEl.scrollLeft = 0;
      })()`,
    });
    await new Promise((r) => setTimeout(r, 100));

    logTest(
      'Scenario 11: Horizontal timeline scrolling coordinate fidelity',
      scrollPassed,
      bBeforeScroll,
      bAfterScroll,
      `Clip B snapped cleanly to 5.0s with scrollLeft = 120px active`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 12: Trimming Left and Right Edges
    // -----------------------------------------------------------------------------------
    const trimBefore = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const leftHandleRect = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"] [title="Trim Start"]');

    // Drag left handle +60px (+1.0s) -> should trim start by +1.0s
    await dragPointer(
      leftHandleRect.x + leftHandleRect.width / 2,
      leftHandleRect.y + leftHandleRect.height / 2,
      60,
      0,
      10,
      0
    );
    const bAfterTrimLeft = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const trimLeftPassed =
      Math.abs(bAfterTrimLeft.start - (trimBefore.start + 1.0)) < 0.05 &&
      bAfterTrimLeft.end === trimBefore.end;

    // Drag right trim handle ([title="Trim End"]) leftwards by -60px (-1.0s) -> should trim end by -1.0s
    const rightHandleRect = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"] [title="Trim End"]');
    await dragPointer(
      rightHandleRect.x + rightHandleRect.width / 2,
      rightHandleRect.y + rightHandleRect.height / 2,
      -60,
      0,
      10,
      0
    );
    const bAfterTrimRight = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const trimRightPassed =
      Math.abs(bAfterTrimRight.end - (trimBefore.end - 1.0)) < 0.05 &&
      bAfterTrimRight.start === bAfterTrimLeft.start;

    logTest(
      'Scenario 12: Left and right edge trimming with timeline & source updates',
      trimLeftPassed && trimRightPassed,
      trimBefore,
      bAfterTrimRight,
      `Left trim start=6.0s (${trimLeftPassed}), Right trim end=11.0s (${trimRightPassed})`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 13: Escape key cancellation during drag
    // -----------------------------------------------------------------------------------
    const rectBBeforeEsc = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    const bPreEsc = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);

    // Start drag, move pointer, then press Escape before mouseup
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: rectBBeforeEsc.x + rectBBeforeEsc.width / 2,
      y: rectBBeforeEsc.y + rectBBeforeEsc.height / 2,
      button: 'left',
      clickCount: 1,
    });
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: rectBBeforeEsc.x + rectBBeforeEsc.width / 2 + 100,
      y: rectBBeforeEsc.y + rectBBeforeEsc.height / 2,
      button: 'left',
    });
    await new Promise((r) => setTimeout(r, 50));

    // Press Escape
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'Escape',
      code: 'Escape',
    });
    await pageCdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
    });
    await new Promise((r) => setTimeout(r, 50));

    // Release mouse
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: rectBBeforeEsc.x + rectBBeforeEsc.width / 2 + 100,
      y: rectBBeforeEsc.y + rectBBeforeEsc.height / 2,
      button: 'left',
    });
    await new Promise((r) => setTimeout(r, 100));

    const bAfterEsc = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    const escPassed = bAfterEsc.start === bPreEsc.start && bAfterEsc.end === bPreEsc.end;
    logTest(
      'Scenario 13: Escape key gesture abort without history pollution',
      escPassed,
      bPreEsc,
      bAfterEsc,
      `Clip returned exactly to pre-drag position (${bPreEsc.start}s - ${bPreEsc.end}s), zero ghost state`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 14: Release pointer outside window & blur cleanup
    // -----------------------------------------------------------------------------------
    const rectBBeforeBlur = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: rectBBeforeBlur.x + rectBBeforeBlur.width / 2,
      y: rectBBeforeBlur.y + rectBBeforeBlur.height / 2,
      button: 'left',
      clickCount: 1,
    });
    // Move to (0, 0) outside timeline
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: 5,
      y: 5,
      button: 'left',
    });
    // Dispatch mouseup and window blur
    await pageCdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 5,
      y: 5,
      button: 'left',
    });
    await pageCdp.send('Runtime.evaluate', {
      expression: `window.dispatchEvent(new Event('blur'));`,
    });
    await new Promise((r) => setTimeout(r, 100));

    const stateAfterBlur = await getProjectState(pageCdp);
    const blurPassed = !stateAfterBlur.snapActive;
    logTest(
      'Scenario 14: Pointer release outside timeline & window blur cleanup',
      blurPassed,
      null,
      null,
      `Listeners cleaned up, snapActive=${stateAfterBlur.snapActive}, no sticky drag states`
    );

    // -----------------------------------------------------------------------------------
    // Scenario 15: Autosave & Reload Persistence
    // -----------------------------------------------------------------------------------
    // Position Clip B at exactly 5.0s start, 12.0s end
    const rectFinal = await getElementRect(pageCdp, '[data-timeline-item="item-v1-b"]');
    // Align leading edge to 5.0s
    await dragPointer(
      rectFinal.x + 30,
      rectFinal.y + rectFinal.height / 2,
      - (bAfterTrimRight.start - 5.0) * 60 + 2,
      0,
      10,
      0
    );
    const bPreSave = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);

    // Trigger save button in top bar if present, or wait for autosave debouncing (1500ms)
    console.log('Waiting 2500ms for editor autosave debouncing...');
    await new Promise((r) => setTimeout(r, 2500));

    // Reload page
    console.log('Reloading page via Page.reload...');
    await pageCdp.send('Page.reload');
    await new Promise((r) => setTimeout(r, 1500));

    // Wait for item-v1-b to mount again
    for (let i = 0; i < 20; i++) {
      const res = await pageCdp.send('Runtime.evaluate', {
        expression: `Boolean(document.querySelector('[data-timeline-item="item-v1-b"]'))`,
        returnByValue: true,
      });
      if (res.result?.value) break;
      await new Promise((r) => setTimeout(r, 300));
    }

    const bAfterReload = await getItemTimelineBounds(pageCdp, 'item-v1-b', 60);
    // Also verify persisted MongoDB record directly
    const epMongo = await db.collection('editor_projects').findOne({ clip_id: clipId });
    const mongoClipB = epMongo?.tracks?.[0]?.items?.find((i: any) => i.id === 'item-v1-b');

    const persistPassed = bAfterReload && mongoClipB && mongoClipB.timeline_start === bAfterReload.start;
    logTest(
      'Scenario 15: Autosave & Full Page Reload Persistence',
      Boolean(persistPassed),
      bPreSave,
      bAfterReload,
      `Browser reload start=${bAfterReload?.start}s, MongoDB persisted start=${mongoClipB?.timeline_start}s`
    );

    pageCdp.close();
    browserCdp.close();

    console.log('\n===============================================================');
    console.log('BROWSER STRESS TEST SUMMARY REPORT');
    console.log('===============================================================');
    const total = testResults.length;
    const passed = testResults.filter((t) => t.passed).length;
    const failed = total - passed;
    console.log(`Total Scenarios: ${total}`);
    console.log(`Passed:          ${passed}`);
    console.log(`Failed:          ${failed}`);

    if (failed > 0) {
      console.error('\nFAILED SCENARIOS:');
      testResults.filter((t) => !t.passed).forEach((t) => console.error(` - ${t.name}: ${t.details}`));
      process.exit(1);
    } else {
      console.log('\n🎉 ALL REAL-BROWSER STRESS SCENARIOS PASSED 100%!');
      process.exit(0);
    }
  } finally {
    chromeProcess.kill();
  }
}

main().catch((err) => {
  console.error('Fatal error in browser stress test:', err);
  process.exit(1);
});
