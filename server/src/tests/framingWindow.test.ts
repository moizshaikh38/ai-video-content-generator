import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { validateFramingWindow, framingWindowRect, framingWindowConflicts, applyPlanSceneToProject, FramingWindowError, FRAMING_WINDOW_ERROR_CODE, type FramingWindow } from '../shared/framingWindow.js';
import { SmartReframeService as S } from '../services/smartReframeService.js';
import { ProEditorService as P } from '../services/proEditorService.js';
import { ClipRenderService } from '../services/clipRenderService.js';

const ffmpeg = ffmpegStatic as unknown as string;
const ID = { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 };
const fw = (over: any = {}): FramingWindow => ({
  version: 1, kind: 'context_window', origin: 'user_accepted_auto_plan', plan_version: 'v1', plan_status: 'solo',
  source_asset_id: 'a1', source_path: 'u/src.mp4', source_width: 854, source_height: 480, analyzed_trim_start: 0, canvas_aspect: '9:16',
  window: { w: 0.5, h: 0.6 }, keyframes: [{ time: 10, centerX: 0.4, centerY: 0.5 }, { time: 12, centerX: 0.6, centerY: 0.5 }], ...over,
});
const item = (over: any = {}): any => ({ id: 'v1', track_id: 't', type: 'VIDEO', source_asset_id: 'a1', source_path: 'u/src.mp4', timeline_start: 0, timeline_end: 10, source_start: 10, source_end: 20,
  transform: { ...ID }, keyframes: [], effects: [], speed: { speed: 1 }, ...over });
const proj = (items: any[], extra: any = {}): any => ({ canvas: { aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30, duration: 10 }, tracks: [{ id: 't', type: 'VIDEO', name: 'Main Video', items }, { id: 'a', type: 'AUDIO', name: 'Audio', items: [{ id: 'au', type: 'AUDIO', timeline_start: 0, timeline_end: 10 }] }], ...extra });
const shot = (over: any = {}) => ({ start: 2, end: 6, kind: 'solo' as const, windowW: 0.5, windowH: 0.6, keyframes: [{ time: 2, centerX: 0.4, centerY: 0.5 }, { time: 4, centerX: 0.6, centerY: 0.5 }], ...over });
const ctx = (over: any = {}) => ({ clipStartSec: 10, analyzedTrimStart: 0, currentTrimStart: 0, planVersion: 'v1', sourceWidth: 854, sourceHeight: 480, sourcePath: 'u/src.mp4', sourceAssetId: 'a1', ...over });

test('validator accepts a well-formed window and rejects adversarial input', () => {
  assert.equal(validateFramingWindow(fw(), { item: item(), canvasAspect: '9:16', decodedWidth: 854, decodedHeight: 480 }).ok, true);
  const bad: any[] = [null, [], 'x', 5, {}, fw({ version: 2 }), fw({ kind: 'fill' }), fw({ origin: 'auto' }), fw({ plan_status: 'unresolved-preserved' }), fw({ canvas_aspect: '16:9' }),
    fw({ window: { w: NaN, h: 0.5 } }), fw({ window: { w: 0.5, h: Infinity } }), fw({ window: { w: 0.1, h: 0.5 } }), fw({ window: { w: 1.5, h: 0.5 } }), fw({ window: { w: -1, h: 0.5 } }),
    fw({ source_width: 0 }), fw({ source_width: NaN }), fw({ source_height: 99999 }), fw({ analyzed_trim_start: -1 }), fw({ plan_version: '' }),
    fw({ keyframes: [] }), fw({ keyframes: 'x' }), fw({ keyframes: Array.from({ length: 41 }, (_, i) => ({ time: i, centerX: 0.5, centerY: 0.5 })) }),
    fw({ keyframes: [{ time: 2, centerX: 0.5, centerY: 0.5 }, { time: 1, centerX: 0.5, centerY: 0.5 }] }), fw({ keyframes: [{ time: 2, centerX: 0.5, centerY: 0.5 }, { time: 2, centerX: 0.5, centerY: 0.5 }] }),
    fw({ keyframes: [{ time: -1, centerX: 0.5, centerY: 0.5 }] }), fw({ keyframes: [{ time: NaN, centerX: 0.5, centerY: 0.5 }] }), fw({ keyframes: [{ time: 1, centerX: Infinity, centerY: 0.5 }] }),
    fw({ keyframes: [{ time: 1, centerX: 2, centerY: 0.5 }] }), fw({ keyframes: [{ time: 10, centerX: 0.05, centerY: 0.5 }] }) /* window leaves frame */,
    fw({ keyframes: [{ time: '1);drawtext=x' as any, centerX: 0.5, centerY: 0.5 }] }), fw({ keyframes: [{ time: 10, centerX: '0.5)' as any, centerY: 0.5 }] }),
    fw({ source_path: 5 }), fw({ source_asset_id: {} })];
  for (const b of bad) assert.equal(validateFramingWindow(b).ok, false, JSON.stringify(b)?.slice(0, 120));
  assert.equal(validateFramingWindow(fw(), { item: item() }).ok, true);
  assert.equal(validateFramingWindow(fw(), { decodedWidth: 1920, decodedHeight: 1080 }).ok, false); // decoded size mismatch
  assert.equal(validateFramingWindow(fw(), { decodedWidth: 854, decodedHeight: null as any }).ok, false);
  assert.equal(validateFramingWindow(fw(), { canvasAspect: '16:9' }).ok, false);
  assert.equal(validateFramingWindow(fw(), { item: item({ source_path: 'other.mp4' }) }).ok, false);
  assert.equal(validateFramingWindow(fw(), { item: item({ source_asset_id: 'zz' }) }).ok, false);
  assert.equal(validateFramingWindow(fw(), { item: item({ source_start: 5, source_end: 6 }) }).ok, false); // keyframes start after item start
  assert.equal(validateFramingWindow(fw(), { item: item({ type: 'AUDIO' }) }).ok, false);
  for (const o of [{ crop: { mode: 'blur' } }, { crop: { mode: 'fill', scale: 1.2 } }, { panels: { layout: 'three' } }, { tracker: { enabled: true } }, { transform: { ...ID, scale: 1.1 } }, { transform: { ...ID, position_x: 3 } },
    { keyframes: [{}] }, { effects: [{}] }, { speed: { speed: 2 } }, { speed: { speed: 1, speed_ramp: 'smooth' } }, { is_freeze: true }, { crop_config: { layout_mode: 'split', layout_mode_source: 'user' }, layout_mode: 'split' }])
    assert.equal(validateFramingWindow(fw(), { item: item(o) }).ok, false, JSON.stringify(o));
  // neutral state: identity transform, empty keyframes/effects, plain fill crop, non-user legacy layout
  assert.equal(validateFramingWindow(fw(), { item: item({ crop: { mode: 'fill' }, layout_mode: 'track', crop_config: { layout_mode_source: 'genre_recommendation' } }) }).ok, true);
  assert.deepEqual(framingWindowConflicts(item()), { replaceable: [], blocking: [] });
});

/** Evaluate an ffmpeg crop expression produced by buildGroupFitFilter (test-only). */
function evalExpr(expr: string, vars: Record<string, number>): number {
  const js = expr.replace(/\\,/g, ',').replace(/\bif\(/g, 'iff(').replace(/\b(in_w|in_h|out_w|out_h|t)\b/g, (m) => `V.${m}`);
  return new Function('V', 'min', 'max', 'lte', 'iff', `return ${js}`)(vars, Math.min, Math.max, (a: number, b: number) => (a <= b ? 1 : 0), (c: number, a: number, b: number) => (c ? a : b));
}
test('framingWindowRect matches what the compiled ffmpeg crop expression evaluates', () => {
  const w = fw({ keyframes: [{ time: 10, centerX: 0.3, centerY: 0.45 }, { time: 12.5, centerX: 0.7, centerY: 0.55 }, { time: 14, centerX: 0.5, centerY: 0.5 }] });
  const base = 10;
  const f = S.buildGroupFitFilter({ keyframes: w.keyframes.map((k) => ({ time: Number((k.time - base).toFixed(3)), centerX: k.centerX, centerY: k.centerY })), windowW: w.window.w, windowH: w.window.h, sourceWidth: 854, sourceHeight: 480, tag: 'x' });
  const m = f.match(/crop=(\d+):(\d+):'([^']*)':([^,\[]*?(?:\\,[^,\[]*?)*),scale=/)!;
  assert.ok(m, f);
  const [winW, winH] = [Number(m[1]), Number(m[2])];
  for (const t of [0, 0.4, 1, 2.5, 3.1, 4, 4.7, 9]) {
    const r = framingWindowRect(w, base, t);
    const vars = { in_w: 854, in_h: 480, out_w: winW, out_h: winH, t };
    assert.equal(r.w, winW); assert.equal(r.h, winH);
    assert.ok(Math.abs(r.x - evalExpr(m[3], vars)) < 1e-6, `x@${t}`); assert.ok(Math.abs(r.y - evalExpr(m[4], vars)) < 1e-6, `y@${t}`);
  }
});

test('apply: splits ONLY the selected scene, keeps other items/tracks, timeline math, window copied in source seconds', () => {
  const p = proj([item()]);
  const r = applyPlanSceneToProject(p, shot(), ctx(), );
  assert.ok(r.ok, JSON.stringify(r));
  if (!r.ok) return;
  const items = r.project.tracks[0].items;
  assert.equal(items.length, 3); assert.equal(r.split, true);
  assert.deepEqual(items.map((i: any) => [i.source_start, i.source_end, i.timeline_start, i.timeline_end]), [[10, 12, 0, 2], [12, 16, 2, 6], [16, 20, 6, 10]]);
  const mid = items[1];
  assert.equal(mid.id, r.itemId); assert.equal(items[0].framing_window, undefined); assert.equal(items[2].framing_window, undefined);
  assert.equal(mid.framing_window.keyframes[0].time, 12); assert.equal(mid.framing_window.keyframes[1].time, 14);
  assert.deepEqual(mid.framing_window.window, { w: 0.5, h: 0.6 });
  assert.equal(mid.framing_window.source_path, 'u/src.mp4'); assert.equal(mid.crop_config.layout_mode_source, 'user');
  assert.equal(new Set(items.map((i: any) => i.id)).size, 3);
  assert.deepEqual(r.project.tracks[1], p.tracks[1]); // audio track untouched
  assert.equal(validateFramingWindow(mid.framing_window, { item: mid }).ok, true);
  assert.equal(p.tracks[0].items.length, 1); // input not mutated
});
test('apply: matching bounds do not re-split; scene at an edge splits once', () => {
  const r = applyPlanSceneToProject(proj([item()]), shot({ start: 0, end: 10, keyframes: [{ time: 0, centerX: 0.5, centerY: 0.5 }] }), ctx());
  assert.ok(r.ok && !r.split && r.project.tracks[0].items.length === 1 && r.project.tracks[0].items[0].id === 'v1');
  const e = applyPlanSceneToProject(proj([item()]), shot({ start: 0, end: 4, keyframes: [{ time: 0, centerX: 0.5, centerY: 0.5 }] }), ctx());
  assert.ok(e.ok && e.project.tracks[0].items.length === 2);
});
test('apply: blocks unresolved, stale, tiny pieces, speed, overlap, multi-source, non-9:16, multi-item scenes, locked', () => {
  const bl = (r: any) => { assert.equal(r.ok, false, JSON.stringify(r)); return r.reasons.join(' '); };
  bl(applyPlanSceneToProject(proj([item()]), shot({ contextStatus: 'unresolved-review-required' }), ctx()));
  bl(applyPlanSceneToProject(proj([item()]), shot({ contextStatus: 'unresolved-preserved' }), ctx()));
  assert.match(bl(applyPlanSceneToProject(proj([item()]), shot(), ctx({ currentTrimStart: 0.5 }))), /stale/);
  bl(applyPlanSceneToProject(proj([item()]), shot({ start: 0.05, end: 6 }), ctx({ clipStartSec: 10.0 })).ok ? { ok: false, reasons: ['x'] } : { ok: false, reasons: ['ok-blocked'] });
  assert.match(bl(applyPlanSceneToProject(proj([item()]), shot({ start: 0.06, end: 9.95 }), ctx())), /shorter than 0.1/);
  bl(applyPlanSceneToProject(proj([item({ speed: { speed: 2 } })]), shot(), ctx()));
  bl(applyPlanSceneToProject(proj([item({ timeline_end: 6 }), item({ id: 'v2', timeline_start: 5, timeline_end: 10, source_start: 20, source_end: 25 })]), shot(), ctx()));
  bl(applyPlanSceneToProject(proj([item({ timeline_end: 5, source_end: 15 }), item({ id: 'v2', timeline_start: 5, timeline_end: 10, source_start: 15, source_end: 20, source_path: 'other.mp4' })]), shot(), ctx()));
  bl(applyPlanSceneToProject(proj([item()], { canvas: { aspect_ratio: '1:1' } }), shot(), ctx()));
  assert.match(bl(applyPlanSceneToProject(proj([item({ timeline_end: 4, source_end: 14 }), item({ id: 'v2', timeline_start: 4, timeline_end: 10, source_start: 14, source_end: 20 })]), shot({ start: 3, end: 6 }), ctx())), /No single video item/);
  const locked = proj([item()]); locked.tracks[0].locked = true; bl(applyPlanSceneToProject(locked, shot(), ctx()));
  bl(applyPlanSceneToProject(proj([item()]), shot({ start: NaN }), ctx()));
  bl(applyPlanSceneToProject(proj([item()]), shot({ keyframes: [] }), ctx()));
  bl(applyPlanSceneToProject(proj([item({ transform: { ...ID, scale: 1.2 } })]), shot(), ctx({ replaceConflicts: true }))); // non-replaceable even if confirmed
  bl(applyPlanSceneToProject(proj([item({ keyframes: [{}] })]), shot(), ctx({ replaceConflicts: true })));
  bl(applyPlanSceneToProject(proj([item({ caption: { cues: [{}] } })]), shot(), ctx()));
  bl(applyPlanSceneToProject(proj([item({ sourcePathX: 1, source_asset_id: 'other' })]), shot(), ctx()));
});
test('apply: existing crop/panels/tracker/user layout are NOT overwritten without explicit confirmation, and only the scene piece is cleared', () => {
  for (const o of [{ crop: { mode: 'blur', band: '4:3' } }, { panels: { layout: 'three', slots: [] } }, { tracker: { enabled: true, keyframes: [] } }, { crop_config: { layout_mode: 'split', layout_mode_source: 'user' }, layout_mode: 'split' }]) {
    const p = proj([item(o)]);
    const r = applyPlanSceneToProject(p, shot(), ctx());
    assert.equal(r.ok, false); assert.ok((r as any).needsReplaceConfirm?.length);
    const c = applyPlanSceneToProject(p, shot(), ctx({ replaceConflicts: true }));
    assert.ok(c.ok, JSON.stringify(c)); if (!c.ok) continue;
    const [l, m, rr] = c.project.tracks[0].items;
    assert.equal(m.crop, undefined); assert.equal(m.panels, undefined); assert.equal(m.tracker, undefined);
    assert.ok(Object.keys(o).some((k) => (l as any)[k] !== undefined)); // neighbours keep their own settings
    assert.ok(Object.keys(o).some((k) => (rr as any)[k] !== undefined));
  }
  // an earlier framing window also needs confirmation
  const again = applyPlanSceneToProject(proj([item({ framing_window: fw() })]), shot(), ctx());
  assert.equal(again.ok, false);
});

test('entrypoint 1 (save): malformed/conflicting framing_window is rejected 400 INVALID_FRAMING_WINDOW', () => {
  P.assertItemFramingWindow(item() as any, '9:16'); // absent: fine
  P.assertItemFramingWindow(item({ framing_window: fw() }) as any, '9:16');
  for (const bad of [item({ framing_window: { x: 1 } }), item({ framing_window: fw({ window: { w: NaN, h: 1 } }) }), item({ framing_window: fw(), crop: { mode: 'blur' } }), item({ framing_window: fw(), panels: {} }), item({ framing_window: fw() , tracker: { enabled: true } })]) {
    assert.throws(() => P.assertItemFramingWindow(bad as any, '9:16'), (e: any) => e.statusCode === 400 && e.code === FRAMING_WINDOW_ERROR_CODE);
  }
  assert.throws(() => P.assertItemFramingWindow(item({ framing_window: fw() }) as any, '1:1'), (e: any) => e.code === FRAMING_WINDOW_ERROR_CODE);
});
test('entrypoint 2 (render): ANY framing_window forces Pro, even malformed; invalid compile is a clear error, no fallback', () => {
  const only = (i: any) => ({ tracks: [{ type: 'VIDEO', items: [i] }] });
  const plain = item({ timeline_start: 0, source_start: 0 });
  assert.equal(ClipRenderService.hasCustomProEdits(only(plain), { start_seconds: 0, trim_start_offset: 0 }), false);
  for (const f of [fw(), { garbage: true }, null, 5]) assert.equal(ClipRenderService.hasCustomProEdits(only({ ...plain, framing_window: f }), { start_seconds: 0, trim_start_offset: 0 }), true);
  const reframe = (over: any = {}) => ({ mode: 'smart', aspectRatio: '9:16', clipStartSec: 10, layoutMode: 'track', track: null, sourceStoragePath: 'u/src.mp4', decodedSource: { width: 854, height: 480 }, ...over }) as any;
  const mk = (f: any, extra: any = {}) => proj([item({ framing_window: f, ...extra })]);
  assert.doesNotThrow(() => P.compileRenderGraph(mk(fw()), '/tmp/src.mp4', '/tmp/o.mp4', os.tmpdir(), reframe(), 'off'));
  const bad = (p: any, rf: any) => assert.throws(() => P.compileRenderGraph(p, '/tmp/src.mp4', '/tmp/o.mp4', os.tmpdir(), rf, 'off'), (e: any) => e instanceof FramingWindowError && e.code === FRAMING_WINDOW_ERROR_CODE);
  bad(mk({ junk: 1 }), reframe());
  bad(mk(fw({ keyframes: [{ time: NaN, centerX: 0.5, centerY: 0.5 }] })), reframe());
  bad(mk(fw()), reframe({ decodedSource: { width: 1920, height: 1080 } })); // decoded size mismatch
  bad(mk(fw()), reframe({ decodedSource: null })); // unknown decoded size: no guessing
  bad(mk(fw()), undefined);
  bad(mk(fw(), { crop: { mode: 'blur' } }), reframe());
  bad(mk(fw(), { panels: undefined, tracker: { enabled: true } }), reframe());
});
test('compiled graph executes in ffmpeg and produces a 9:16 frame (execution only, generated pixels)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fw-'));
  try {
    const source = path.join(dir, 's.mp4');
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=854x480:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', source]);
    const p = proj([item({ source_start: 1, source_end: 4, timeline_end: 3, framing_window: fw({ keyframes: [{ time: 1, centerX: 0.4, centerY: 0.5 }, { time: 3, centerX: 0.6, centerY: 0.5 }] }) })]);
    p.canvas.duration = 3;
    const g = P.compileRenderGraph(p, source, path.join(dir, 'o.mp4'), dir, { mode: 'smart', aspectRatio: '9:16', clipStartSec: 0, layoutMode: 'track', track: null, sourceStoragePath: 'u/src.mp4', decodedSource: { width: 854, height: 480 } } as any, 'off');
    const out = path.join(dir, 'f.mp4');
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-ss', '1', '-t', '3', ...g.inputArgs, '-filter_complex', g.filterComplex.join(';'), '-map', g.videoMap, '-map', g.audioMap, '-t', '1', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', out], { timeout: 60000 });
    const png = path.join(dir, 'f.png');
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', out, '-frames:v', '1', png]);
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', out, '-vf', 'scale=iw:ih', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', path.join(dir, 'raw.yuv')]);
    assert.equal(fs.statSync(path.join(dir, 'raw.yuv')).size, 1080 * 1920 * 3 / 2); // one 1080x1920 frame
    fs.copyFileSync(png, '/tmp/fw_frame.png');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

 test('integration hardening: identity, endpoint motion, explicit legacy choices and panel conflicts',()=>{
 assert.equal(validateFramingWindow(fw({source_path:null})).ok,false);
 assert.equal(applyPlanSceneToProject(proj([item()]),shot(),ctx({sourcePath:null})).ok,false);
 const endShot=shot({keyframes:[{time:2,centerX:.4,centerY:.5},{time:6,centerX:.6,centerY:.5}]});
 const applied=applyPlanSceneToProject(proj([item()]),endShot,ctx());assert.equal(applied.ok,true);
 if(applied.ok){const middle=applied.project.tracks[0].items.find((i:any)=>i.framing_window);assert.equal(middle.framing_window.keyframes.at(-1).time,16);assert.equal(middle.framing_window.keyframes.at(-1).centerX,.6);}
 for(const o of [{layout_mode:'track'},{layout_mode:'track',crop_config:{layout_mode_source:'user'}},{crop:{mode:'fill',focusX:.7,scale:1}}]){const r=applyPlanSceneToProject(proj([item(o)]),shot(),ctx());assert.equal(r.ok,false);if(!r.ok)assert.ok(r.needsReplaceConfirm?.length);}
 assert.equal(applyPlanSceneToProject(proj([item({locked:true})]),shot(),ctx()).ok,false);
 const both=proj([item({framing_window:fw(),panels:{layout:'three',slots:[]}})]);assert.throws(()=>P.compileRenderGraph(both,'/tmp/a.mp4','/tmp/o.mp4',os.tmpdir(),{mode:'manual',aspectRatio:'9:16',clipStartSec:0,track:null,decodedSource:{width:854,height:480},sourceStoragePath:'u/src.mp4'}as any,'off'),(e:any)=>e.code===FRAMING_WINDOW_ERROR_CODE);
 });
