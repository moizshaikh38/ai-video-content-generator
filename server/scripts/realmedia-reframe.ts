import { SmartReframeService } from '../src/services/smartReframeService.js';

const [,, videoPath, genre] = process.argv;
const cv = await SmartReframeService.runCvAnalyzer(videoPath, 4.0, 0, 0, 120000);
const withFaces = cv.samples.filter((s: any) => s.faces.length > 0).length;
console.log(JSON.stringify({
  source: `${cv.source_width}x${cv.source_height}@${cv.source_fps}`,
  sampleCount: cv.sample_count,
  samplesWithFaces: withFaces,
  coverage: cv.sample_count ? withFaces / cv.sample_count : 0,
  sceneCuts: cv.scene_cuts,
}, null, 1));
// Replicate the production chain: associate tracks -> dominant subject.
const { tracks, faceCount } = SmartReframeService.associateTracks(cv.samples);
const { dominantTrackId, score } = SmartReframeService.selectDominantTrack(tracks, cv.samples.length, {});
console.log(JSON.stringify({ faceCount, dominantTrackId, score }));
const { GenreIntelligenceService } = await import('../src/services/genreIntelligenceService.js');
const cfg = genre ? GenreIntelligenceService.getGenreProfile(genre as any).reframeConfig : {};
const kfs = SmartReframeService.smoothAndGenerateKeyframes({
  samples: cv.samples,
  dominantTrackId,
  duration: cv.duration,
  ...(cfg as any),
  sceneCuts: cv.scene_cuts || [],
  aspectRatio: '9:16',
  sourceWidth: cv.source_width,
  sourceHeight: cv.source_height,
});
console.log('keyframes:', JSON.stringify(kfs.slice(0, 20)));
const filter = SmartReframeService.buildSmartCropFilter(kfs, '9:16', cv.source_width, cv.source_height, cv.duration);
const fs = await import('node:fs');
fs.writeFileSync(process.env.FILTER_OUT || '/tmp/realmedia/filter.txt', filter, 'utf8');
console.log('filter written, length', filter.length);
