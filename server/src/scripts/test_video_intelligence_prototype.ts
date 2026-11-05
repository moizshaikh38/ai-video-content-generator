import path from 'node:path';
import fs from 'node:fs';
import { VideoIntelligencePrototype, SharedVideoIntelligence } from '../prototypes/videoIntelligenceEngine.js';

async function runPrototypeTests() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 1.7 SHARED AI VIDEO INTELLIGENCE PROTOTYPE TEST RUNNER');
  console.log('========================================================================\n');

  const testCases = [
    {
      category: '1. Talking-Head Creator Video',
      path: path.resolve(process.cwd(), '../public/demo/creator-demo.mp4'),
      transcript: 'Welcome creators. In this quick video I am going to show you how VireoClip turns your long video into high performing viral clips in minutes.',
      visionModel: 'openai/gpt-4o-mini',
    },
    {
      category: '2. High-Res Screen Recording & Tutorial',
      path: path.resolve(process.cwd(), '../delete/2.mp4'),
      transcript: 'Let us take a look at the dashboard settings and navigate through the new media library and project options.',
      visionModel: 'openai/gpt-4o-mini',
    },
    {
      category: '3. Silent Video / B-Roll (Zero Speech)',
      path: path.resolve(process.cwd(), '../public/demo/showcase/v0.mp4'),
      transcript: '',
      visionModel: 'openai/gpt-4o-mini',
    },
  ];

  const results: any[] = [];

  for (const tc of testCases) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`TESTING CATEGORY: ${tc.category}`);
    console.log(`Video File: ${tc.path}`);
    if (!fs.existsSync(tc.path)) {
      console.log(`[SKIP] File not found: ${tc.path}`);
      continue;
    }

    const tStart = Date.now();
    try {
      const intelligence: SharedVideoIntelligence = await VideoIntelligencePrototype.analyzeVideo(
        tc.path,
        {
          existingTranscript: tc.transcript ? { text: tc.transcript } : undefined,
          maxKeyframes: 3, // Lightweight for fast prototype execution
          visionModel: tc.visionModel,
        }
      );

      const elapsedMs = Date.now() - tStart;
      console.log(`\n[SUCCESS] Analyzed in ${elapsedMs}ms`);
      console.log(`Source Hash: ${intelligence.sourceHash.slice(0, 16)}...`);
      console.log(`Metadata: ${intelligence.metadata.width}x${intelligence.metadata.height} (${intelligence.metadata.aspectRatio}), ${intelligence.metadata.durationSeconds.toFixed(1)}s, ${intelligence.metadata.fps} fps`);
      console.log(`Scene Cuts Detected: ${intelligence.visualIntelligence.sceneCuts.length}`);
      console.log(`Keyframes Sampled: ${intelligence.visualIntelligence.keyframeTimestamps.length}`);
      console.log(`Face Presence Ratio: ${(intelligence.visualIntelligence.facePresenceRatio * 100).toFixed(1)}%`);

      console.log(`\n--- DETECTED OBJECTS ---`);
      (intelligence.visualIntelligence.objects || []).forEach((o) => {
        console.log(`   - [${o.category}] ${o.label} (confidence: ${(o.confidence * 100).toFixed(0)}% at ${o.timestamp}s)`);
      });

      console.log(`\n--- DETECTED ACTIONS ---`);
      (intelligence.visualIntelligence.actions || []).forEach((a) => {
        console.log(`   - ${a.action}: "${a.description}" (${a.startTime}s–${a.endTime}s)`);
      });

      console.log(`\n--- OCR ON-SCREEN TEXT ---`);
      (intelligence.visualIntelligence.ocr || []).forEach((ocr) => {
        console.log(`   - "${ocr.text}" [${ocr.category || 'text'}] (conf: ${(ocr.confidence * 100).toFixed(0)}% at ${ocr.timestamp}s)`);
      });

      console.log(`\n--- MULTIMODAL PROVENANCE ---`);
      console.log(`   Spoken Facts:`, intelligence.multimodalReasoning.provenance.spokenFacts);
      console.log(`   Visual Facts:`, intelligence.multimodalReasoning.provenance.visualObservations);
      console.log(`   OCR Confirmed:`, intelligence.multimodalReasoning.provenance.ocrConfirmedText);
      console.log(`   AI Inferences:`, intelligence.multimodalReasoning.provenance.inferences);

      // Demonstrate Feature 1: AI Video Clipping Consumer
      console.log(`\n--- CONSUMER 1: AI VIDEO CLIPPING RECOMMENDATIONS ---`);
      const clipRecs = VideoIntelligencePrototype.generateClippingRecommendations(intelligence);
      if (clipRecs.length > 0) {
        clipRecs.forEach((r, idx) => console.log(`   Clip ${idx + 1}: ${r.title} (${r.start}s–${r.end}s) - Framing: ${r.framingSuitability}`));
      } else {
        console.log(`   (Video duration ${intelligence.metadata.durationSeconds.toFixed(1)}s is shorter than typical 10s highlight minimum)`);
      }

      // Demonstrate Feature 2: Subtitle Studio Visual Placement Consumer
      console.log(`\n--- CONSUMER 2: SUBTITLE STUDIO PLACEMENT INTELLIGENCE ---`);
      const subHandoff = VideoIntelligencePrototype.generateSubtitleStudioHandoff(intelligence);
      console.log(`   Recommended Placement: ${subHandoff.recommendedPosition.toUpperCase()}`);
      console.log(`   Safe Margin: ${subHandoff.safeMarginPercent}%`);
      console.log(`   Transcript Reused: ${subHandoff.transcriptReused}`);

      // Demonstrate Feature 3: AI Content Studio Expanded Claim Guard
      console.log(`\n--- CONSUMER 3: EXPANDED MULTI-SOURCE CLAIM GUARD ---`);
      const sampleClaims = [
        tc.transcript ? 'turns your long video into high performing viral clips' : 'non-spoken claim',
        intelligence.visualIntelligence.objects[0]?.label || 'person',
        'earns $50,000 every single day without any effort',
      ];

      for (const cl of sampleClaims) {
        const check = VideoIntelligencePrototype.verifyClaimAgainstAllEvidence(intelligence, cl);
        console.log(`   Claim: "${cl}"`);
        console.log(`      Status: ${check.status} (Source: ${check.evidenceSource || 'None'})`);
      }

      results.push({
        category: tc.category,
        success: true,
        duration: intelligence.metadata.durationSeconds,
        elapsedMs,
        objectsFound: intelligence.visualIntelligence.objects.length,
        ocrFound: intelligence.visualIntelligence.ocr.length,
        scenesFound: intelligence.visualIntelligence.scenes.length,
      });
    } catch (err: any) {
      console.error(`[FAIL] ${tc.category}:`, err.message);
      results.push({ category: tc.category, success: false, error: err.message });
    }
  }

  console.log('\n========================================================================');
  console.log('SUMMARY OF PROTOTYPE RESULTS ACROSS SAMPLE CATEGORIES:');
  console.log('========================================================================');
  console.table(results);
}

runPrototypeTests().catch(console.error);
