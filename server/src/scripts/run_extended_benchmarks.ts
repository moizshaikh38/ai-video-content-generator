import path from 'node:path';
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { VideoIntelligencePrototype, SharedVideoIntelligence } from '../prototypes/videoIntelligenceEngine.js';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
if (ffprobeStatic?.path) ffmpeg.setFfprobePath(ffprobeStatic.path);

async function runExtendedBenchmarks() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 1.7 EXPANDED EMPIRICAL BENCHMARKS (POINT 2 VERIFICATION)');
  console.log('========================================================================\n');

  const vStudio = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4');
  const vDemo = path.resolve(process.cwd(), '../public/demo/vireo-demo.mp4');
  const v4k = path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4');
  const vTutorial = path.resolve(process.cwd(), '../delete/2.mp4');

  // Build 108.3s multi-speaker concatenated video in delete folder if not already present
  const vMultiSpeaker = path.resolve(process.cwd(), '../delete/extended_multispeaker_108s.mp4');
  if (!fs.existsSync(vMultiSpeaker) && fs.existsSync(vStudio) && fs.existsSync(vDemo)) {
    console.log('[Setup] Generating 108.3s multi-speaker test video via FFmpeg concat...');
    const listFile = path.resolve(process.cwd(), '../delete/concat_list.txt');
    // Normalize to 1280x720 30fps for smooth concat
    const part1 = path.resolve(process.cwd(), '../delete/part1_norm.mp4');
    const part2 = path.resolve(process.cwd(), '../delete/part2_norm.mp4');

    await new Promise((res, rej) => {
      ffmpeg(vStudio)
        .size('1280x720')
        .fps(30)
        .audioCodec('aac')
        .audioChannels(2)
        .audioFrequency(44100)
        .output(part1)
        .on('end', () => res(null))
        .on('error', rej)
        .run();
    });

    await new Promise((res, rej) => {
      ffmpeg(vDemo)
        .size('1280x720')
        .fps(30)
        .audioCodec('aac')
        .audioChannels(2)
        .audioFrequency(44100)
        .output(part2)
        .on('end', () => res(null))
        .on('error', rej)
        .run();
    });

    fs.writeFileSync(listFile, `file '${part1.replace(/\\/g, '/')}'\nfile '${part2.replace(/\\/g, '/')}'\n`);

    await new Promise((res, rej) => {
      ffmpeg()
        .input(listFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy'])
        .output(vMultiSpeaker)
        .on('end', () => {
          console.log('[Setup] 108.3s multi-speaker test video created successfully.');
          res(null);
        })
        .on('error', rej)
        .run();
    });

    // Cleanup temp parts
    if (fs.existsSync(part1)) fs.unlinkSync(part1);
    if (fs.existsSync(part2)) fs.unlinkSync(part2);
    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  }

  const testSuite = [
    {
      category: '1. Full-Length Creator Tutorial (1080p Full HD)',
      path: vStudio,
      transcript: 'Welcome to the Vireo Studio demonstration. Today we will explore timeline editing, automatic caption generation, and multi-track video assembly.',
      visionModel: 'openai/gpt-4o-mini',
      maxKeyframes: 3,
    },
    {
      category: '2. Multi-Scene Platform Showcase (Fast Scene Cuts)',
      path: vDemo,
      transcript: 'Watch how Vireo transforms your content into engaging social clips. With automated hooks, dynamic captions, and instant aspect ratio framing.',
      visionModel: 'openai/gpt-4o-mini',
      maxKeyframes: 4,
    },
    {
      category: '3. 4K UHD High-Bitrate Visual Condition (3840x2160, 101MB)',
      path: v4k,
      transcript: 'Testing ultra high resolution 4K rendering and camera capture for professional video workflows.',
      visionModel: 'openai/gpt-4o-mini',
      maxKeyframes: 2,
    },
  ];

  if (fs.existsSync(vMultiSpeaker)) {
    testSuite.push({
      category: '4. Extended Multi-Speaker & Multi-Scene Case (102s, 1280x720)',
      path: vMultiSpeaker,
      transcript: 'Part 1: Creator studio interface and editing walkthrough. Part 2: Automated clip extraction, caption styling, and social publishing.',
      visionModel: 'openai/gpt-4o-mini',
      maxKeyframes: 4,
    });
  }

  const results: any[] = [];

  for (const tc of testSuite) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`TESTING CATEGORY: ${tc.category}`);
    console.log(`File: ${tc.path}`);
    if (!fs.existsSync(tc.path)) {
      console.log(`[SKIP] File not found: ${tc.path}`);
      continue;
    }

    const tStart = Date.now();
    try {
      const intelligence: SharedVideoIntelligence = await VideoIntelligencePrototype.analyzeVideo(
        tc.path,
        {
          userId: 'user_benchmark_exp',
          existingTranscript: tc.transcript ? { text: tc.transcript } : undefined,
          maxKeyframes: tc.maxKeyframes,
          visionModel: tc.visionModel,
        }
      );
      const elapsedMs = Date.now() - tStart;

      console.log(`\n[SUCCESS] Analyzed in ${elapsedMs}ms`);
      console.log(`Source Hash: ${intelligence.sourceHash.slice(0, 16)}...`);
      console.log(`Metadata: ${intelligence.metadata.width}x${intelligence.metadata.height} (${intelligence.metadata.aspectRatio}), ${intelligence.metadata.durationSeconds.toFixed(1)}s, ${intelligence.metadata.fps} fps`);
      console.log(`Scene Cuts Detected: ${intelligence.visualIntelligence.scenes.length}`);
      console.log(`Keyframes Sampled: ${intelligence.visualIntelligence.keyframeTimestamps.length}`);
      console.log(`Face Presence Ratio: ${(intelligence.visualIntelligence.facePresenceRatio * 100).toFixed(1)}%`);

      console.log(`\n--- DETECTED OBJECTS ---`);
      intelligence.visualIntelligence.objects.forEach((obj) => {
        console.log(`   - [${obj.category}] ${obj.label} (confidence: ${(obj.confidence * 100).toFixed(0)}% at ${obj.timestamp}s)`);
      });

      console.log(`\n--- DETECTED ACTIONS ---`);
      intelligence.visualIntelligence.actions.forEach((act) => {
        console.log(`   - ${act.action}: "${act.description}" (${act.startTime}s–${act.endTime}s)`);
      });

      console.log(`\n--- OCR ON-SCREEN TEXT ---`);
      intelligence.visualIntelligence.ocr.forEach((ocr) => {
        console.log(`   - "${ocr.text}" (conf: ${(ocr.confidence * 100).toFixed(0)}% at ${ocr.timestamp}s)`);
      });

      console.log(`\n--- MULTIMODAL PROVENANCE ---`);
      console.log(`   Spoken Facts:`, intelligence.multimodalReasoning.provenance.spokenFacts);
      console.log(`   Visual Facts:`, intelligence.multimodalReasoning.provenance.visualObservations);
      console.log(`   OCR Confirmed:`, intelligence.multimodalReasoning.provenance.ocrConfirmedText);
      console.log(`   AI Inferences:`, intelligence.multimodalReasoning.provenance.inferences);

      console.log(`\n--- CONSUMER 1: AI VIDEO CLIPPING RECOMMENDATIONS ---`);
      const clipRecs = VideoIntelligencePrototype.generateClippingRecommendations(intelligence);
      if (clipRecs.length > 0) {
        clipRecs.forEach((r, idx) => console.log(`   Clip ${idx + 1}: ${r.title} (${r.start.toFixed(1)}s–${r.end.toFixed(1)}s) - Framing: ${r.framingSuitability} (Score: ${r.hookScore})`));
      } else {
        console.log(`   (No clips found meeting 10-60s duration window)`);
      }

      console.log(`\n--- CONSUMER 2: SUBTITLE STUDIO PLACEMENT INTELLIGENCE ---`);
      const subHandoff = VideoIntelligencePrototype.generateSubtitleStudioHandoff(intelligence);
      console.log(`   Recommended Placement: ${subHandoff.recommendedPosition.toUpperCase()}`);
      console.log(`   Safe Margin: ${subHandoff.safeMarginPercent}%`);
      console.log(`   Transcript Reused: ${subHandoff.transcriptReused}`);

      console.log(`\n--- CONSUMER 3: EXPANDED MULTI-SOURCE CLAIM GUARD ---`);
      const sampleClaims = [
        tc.transcript ? 'timeline editing' : 'non-spoken claim',
        intelligence.visualIntelligence.objects[0]?.label || 'person',
        'guarantees $1,000,000 cash in 24 hours without any work',
      ];

      for (const cl of sampleClaims) {
        const check = VideoIntelligencePrototype.verifyClaimAgainstAllEvidence(intelligence, cl);
        console.log(`   Claim: "${cl}"`);
        console.log(`      Status: ${check.status} (Source: ${check.evidenceSource || 'None'})`);
      }

      results.push({
        category: tc.category,
        duration: intelligence.metadata.durationSeconds.toFixed(1) + 's',
        resolution: `${intelligence.metadata.width}x${intelligence.metadata.height}`,
        elapsedMs: `${elapsedMs}ms`,
        scenesDetected: intelligence.visualIntelligence.scenes.length,
        faceRatio: (intelligence.visualIntelligence.facePresenceRatio * 100).toFixed(0) + '%',
        objectsFound: intelligence.visualIntelligence.objects.length,
        ocrHeadings: intelligence.visualIntelligence.ocr.length,
        clipsRecommended: clipRecs.length,
      });
    } catch (err: any) {
      console.error(`[FAIL] ${tc.category}:`, err.message);
      results.push({ category: tc.category, error: err.message });
    }
  }

  console.log('\n========================================================================');
  console.log('SUMMARY OF EXPANDED EMPIRICAL BENCHMARK RESULTS:');
  console.log('========================================================================');
  console.table(results);
}

runExtendedBenchmarks().catch(console.error);
