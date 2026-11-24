import { usesAutomaticSourceClock } from '../shared/automaticSourceClock.js';
import { captionCompositionWindows } from '../shared/sceneCaptionPlacement.js';
import { previewShotOwnedElsewhere } from '../shared/automaticPreviewFallback.js';
import { automaticShotPreviewTime } from '../shared/shotFrameClock.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ProEditorService as P } from '../services/proEditorService.js';
import { snapshotAutomaticScenePlan } from '../shared/automaticScenePlan.js';
const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-threads', '1', '-filter_threads', '1', '-filter_complex_threads', '1', ...args], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
test('actual fractional25fps source, Auto .5/1/2x two-item graphs preserve picture clock and exact output length', () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-clock-')); try {
    for (const timestampOffset of [0, .04, 2]) {
        const source = path.join(dir, `source${timestampOffset}.mp4`);
        ff(['-f', 'lavfi', '-i', "color=red:s=160x90:r=25:d=12,drawbox=color=blue:t=fill:enable='gte(t,8.88)'", '-f', 'lavfi', '-i', "aevalsrc=if(lt(t\\,8.88)\\,0\\,0.3*sin(2*PI*440*t)):s=48000:d=12", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '0', '-c:a', 'aac', '-output_ts_offset', String(timestampOffset), '-y', source]);
        const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=start_time', '-of', 'json', source], { encoding: 'utf8' }));
        assert(Math.abs(Number(probe.format.start_time) - timestampOffset) < .03);
        for (const speed of [.5, 1, 2])
            for (const itemCount of [1, 2]) {
                const cfg = { mode: 'smart', layout_mode_source: 'auto', layout_mode: 'track', layoutPolicy: null };
                const track: any = { status: 'ready', sourceObjectVerified: true, isStale: false, source_width: 160, source_height: 90, analyzed_aspect_ratio: '9:16', smoothed_keyframes: [{ time: 0, centerX: .5, centerY: .5 }], raw_samples: [{ time: 0, faces: [] }], metadata: { analyzed_source_sha256: 'a'.repeat(64), analyzed_source_start: 5.169, analyzed_source_end: 11.169, clip_duration: 6 } };
                const plan: any = [{ start: 0, end: 3.711, kind: 'group', windowW: 1, windowH: 1, keyframes: [{ time: 0, centerX: .5, centerY: .5 }], split: { speaker1X: .25, speaker2X: .75, dividerX: .5 } }, { start: 3.711, end: 6, kind: 'fit', windowW: 1, windowH: 1, keyframes: [{ time: 3.711, centerX: .5, centerY: .5 }] }];
                track.metadata.automatic_scene_plan = snapshotAutomaticScenePlan(track, cfg, 6, plan);
                assert(track.metadata.automatic_scene_plan);
                const duration = 3 / speed;
                const item: any = { id: 'one', source_start: 7.169, source_end: 10.169, timeline_start: 0, timeline_end: duration, speed: { speed }, crop_config: cfg, keyframes: [] };
                const project: any = { canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: itemCount * duration }, tracks: [{ type: 'VIDEO', name: 'main', items: itemCount === 1 ? [item] : [item, { ...item, id: 'two', timeline_start: duration, timeline_end: 2 * duration }] }] };
                const context: any = { mode: 'smart', layoutMode: 'track', track, clipStartSec: 5.169, cropConfig: cfg, aspectRatio: '9:16', canvasScale: 1 / 3, sourceHasAudio: true };
                const g = P.compileRenderGraph(project, source, path.join(dir, 'out.mp4'), dir, context, 'off'), filter = path.join(dir, 'graph.txt');
                fs.writeFileSync(filter, g.filterComplex.join(';'));
                const output = path.join(dir, 'out.mp4');
                ff([...(itemCount === 1 ? ['-ss', '7.169', '-t', '3'] : []), ...g.inputArgs, '-filter_complex_script', filter, '-map', g.videoMap, '-map', g.audioMap!, '-t', String(g.duration), '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-crf', '0', '-c:a', 'aac', '-y', output]);
                const audio = ff(['-i', output, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-']);
                const samples = new Float32Array(audio.buffer, audio.byteOffset, audio.length / 4);
                for (const start of itemCount === 1 ? [0] : [0, duration]) {
                    let onset = -1;
                    for (let t = start + .5; t < start + duration; t += .01) {
                        const lo = Math.floor(t * 48000), hi = Math.min(samples.length, lo + 480);
                        let energy = 0;
                        for (let n = lo; n < hi; n++)
                            energy += samples[n] * samples[n];
                        if (energy / 480 > .005) {
                            onset = t - start;
                            break;
                        }
                    }
                    assert(Math.abs(onset - 1.711 / speed) < .08, `audio speed${speed} onset${onset}`);
                }
                const pixels = ff(['-i', output, '-vf', 'format=rgb24,crop=1:1:180:200', '-vsync', '0', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-']);
                assert.equal(pixels.length / 3, Math.round(itemCount * duration * 30));
                const cut = Math.round((Math.round(1.711 * 30) / 30) / speed * 30);
                for (const start of itemCount === 1 ? [0] : [0, Math.round(duration * 30)]) {
                    const first = Array.from({ length: Math.round(duration * 30) }, (_, i) => i).find(i => pixels[(start + i) * 3 + 2] > 150);
                    assert(first !== undefined);
                    assert(Math.abs(first - cut) === 0, `speed${speed}: actual${first} expected${cut}`);
                }
                const windows = P.captionSceneWindows(project, context);
                const split = windows.filter(w => w.layout === 'split');
                assert.equal(split.length, itemCount);
                for (const itemStart of itemCount === 1 ? [0] : [0, duration]) {
                    for (const n of [cut - 1, cut]) {
                        const time = itemStart + n / 30;
                        const relative = automaticShotPreviewTime(plan, 7.169 + (time - itemStart) * speed, 7.169, itemStart, time, speed, 5.169, 30);
                        assert.equal(relative >= 3.711, n === cut);
                    }
                }
                assert(Math.abs(split[0].end - cut / 30) < .011);
            }
    }
}
finally {
    fs.rmSync(dir, { recursive: true, force: true });
} });
test('pre-analysis source time is preserved instead of seeking analysis start', () => { assert.equal(automaticShotPreviewTime([{ start: 0, end: 2 }], 9, 8, 0, 1, 1, 10), -1); });
test('source-clock truth table preserves Auto, old candidate, tracker and manual ownership', () => { for (const [cfg, candidate, tracker, expectedClock, expectedWindows] of [[{ layout_mode_source: 'auto' }, false, false, true, true], [{}, true, false, true, true], [{ layout_mode_source: 'user' }, false, false, false, false], [{ layout_mode_source: 'auto' }, false, true, true, false]] as const) {
    const item: any = { id: 'v', source_start: 0, source_end: 2, timeline_start: 0, timeline_end: 2, crop_config: cfg, ...(tracker ? { tracker: { enabled: true, keyframes: [{ time: 0, centerX: .5, centerY: .5 }, { time: 2, centerX: .5, centerY: .5 }] } } : {}) };
    assert.equal(usesAutomaticSourceClock(item, candidate), expectedClock);
    const windows = captionCompositionWindows({ canvas: { aspect_ratio: '9:16', fps: 30 }, tracks: [{ type: 'VIDEO', items: [item] }] }, [{ start: 0, end: 2, windowW: 1, windowH: 1 }], 0, 160, 90, undefined, candidate);
    assert.equal(windows.length > 0, expectedWindows);
    assert.equal(previewShotOwnedElsewhere(item), !expectedWindows);
} });

test('actual playback slice lookup preserves crop stamp and manual/tracker fields by identity',async()=>{const{playbackSliceAt}=await import('../../../src/lib/editorPlaybackTime.js');for(const patch of[{crop_config:{layout_mode_source:'auto'}},{crop_config:{layout_mode_source:'user'}},{crop_config:{layout_mode_source:'auto'},tracker:{enabled:true}}]){const item:any={timeline_start:0,timeline_end:2,source_start:0,source_end:2,...patch};assert.equal(playbackSliceAt([item],1),item);assert.equal(usesAutomaticSourceClock(playbackSliceAt([item],1)as any,false),patch.crop_config.layout_mode_source==='auto');}});

test('60fps source odd30fps shot cut survives half-frame speed quantization',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'auto-half-frame-'));try{const source=path.join(dir,'source.mp4');ff(['-f','lavfi','-i',"color=red:s=160x90:r=60:d=4,drawbox=color=blue:t=fill:enable='gte(n,146)'",'-c:v','libx264','-preset','ultrafast','-crf','0','-y',source]);const cfg={mode:'smart',layout_mode_source:'auto',layout_mode:'track',layoutPolicy:null};const track:any={status:'ready',sourceObjectVerified:true,isStale:false,source_width:160,source_height:90,analyzed_aspect_ratio:'9:16',smoothed_keyframes:[{time:0,centerX:.5,centerY:.5}],raw_samples:[{time:0,faces:[]}],metadata:{analyzed_source_sha256:'a'.repeat(64),analyzed_source_start:0,analyzed_source_end:4,clip_duration:4}};const plan:any=[{start:0,end:73/30,kind:'fit',windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]},{start:73/30,end:4,kind:'fit',windowW:1,windowH:1,keyframes:[{time:73/30,centerX:.5,centerY:.5}]}];track.metadata.automatic_scene_plan=snapshotAutomaticScenePlan(track,cfg,4,plan);for(const speed of[.5,2])for(const count of[1,2]){const duration=4/speed,item:any={id:'one',source_start:0,source_end:4,timeline_start:0,timeline_end:duration,speed:{speed},crop_config:cfg,keyframes:[]};const project:any={canvas:{width:1080,height:1920,aspect_ratio:'9:16',fps:30,duration:duration*count},tracks:[{type:'VIDEO',name:'Video',items:count===1?[item]:[item,{...item,id:'two',timeline_start:duration,timeline_end:duration*2}]}]};const context:any={mode:'smart',layoutMode:'track',track,clipStartSec:0,cropConfig:cfg,canvasScale:1/3,sourceHasAudio:false};const g=P.compileRenderGraph(project,source,path.join(dir,'out.mp4'),dir,context,'off');fs.writeFileSync(path.join(dir,'filter'),g.filterComplex.join(';')+';'+g.videoMap+'format=rgb24,crop=1:1:180:200[probe]');const pixels=ff([...g.inputArgs,'-filter_complex_script',path.join(dir,'filter'),'-map',g.audioMap!,'-t',String(g.duration),'-f','null','/dev/null','-map','[probe]','-an','-t',String(g.duration),'-f','rawvideo','-pix_fmt','rgb24','-']);assert.equal(pixels.length/3,Math.round(duration*count*30));const cut=Math.round(73/speed);for(let n=0;n<count;n++){const base=Math.round(n*duration*30);assert(pixels[(base+cut-1)*3]>150);assert(pixels[(base+cut)*3+2]>150);const before=automaticShotPreviewTime(plan,(cut-1)/30*speed,0,0,(cut-1)/30,speed,0);const after=automaticShotPreviewTime(plan,cut/30*speed,0,0,cut/30,speed,0);assert(before<73/30&&after>=73/30);}}}finally{fs.rmSync(dir,{recursive:true,force:true})}});
