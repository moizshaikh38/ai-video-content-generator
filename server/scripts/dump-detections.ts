import { SmartReframeService } from '../src/services/smartReframeService.js';
const [,, videoPath] = process.argv;
const cv = await SmartReframeService.runCvAnalyzer(videoPath, 4.0, 0, 0, 120000);
const all: any[] = [];
for (const s of cv.samples) for (const f of s.faces) all.push({ t: s.time, conf: f.confidence, w: f.width, h: f.height, cx: f.center_x, track: f.track_id });
all.sort((a, b) => a.conf - b.conf);
console.log('detections:', all.length);
for (const d of all) console.log(JSON.stringify(d));
