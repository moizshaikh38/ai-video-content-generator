import fs from 'fs';
import path from 'path';
import { OpenRouterTranscriptionProvider } from '../services/transcription/openRouterTranscriptionProvider.js';
import { config } from '../config/index.js';

// Standard Levenshtein distance for token arrays or character sequences
function computeLevenshteinDistance<T>(ref: T[], hyp: T[]): {
  distance: number;
  substitutions: number;
  deletions: number;
  insertions: number;
} {
  const m = ref.length;
  const n = hyp.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // substitution
          dp[i - 1][j] + 1,     // deletion
          dp[i][j - 1] + 1      // insertion
        );
      }
    }
  }

  return {
    distance: dp[m][n],
    substitutions: 0, // aggregate distance is exact edit operations
    deletions: 0,
    insertions: 0,
  };
}

function normalizeTokens(str: string): string[] {
  return str
    .replace(/[।.,?!;:"'()\[\]{}—–-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function calculateWer(reference: string, hypothesis: string): number {
  const refTokens = normalizeTokens(reference.toLowerCase());
  const hypTokens = normalizeTokens(hypothesis.toLowerCase());
  if (refTokens.length === 0) return hypTokens.length === 0 ? 0 : 1;
  const { distance } = computeLevenshteinDistance(refTokens, hypTokens);
  return Number((distance / refTokens.length).toFixed(4));
}

function calculateCer(reference: string, hypothesis: string): number {
  const refChars = reference.replace(/\s+/g, '').split('');
  const hypChars = hypothesis.replace(/\s+/g, '').split('');
  if (refChars.length === 0) return hypChars.length === 0 ? 0 : 1;
  const { distance } = computeLevenshteinDistance(refChars, hypChars);
  return Number((distance / refChars.length).toFixed(4));
}

async function transcribeWithCustomPrompt(
  audioBuffer: Buffer,
  promptText?: string
): Promise<{ text: string; language: string }> {
  const apiKey = config.openrouterApiKey?.trim();
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
  formData.append('file', blob, 'audio.mp3');
  formData.append('model', 'openai/whisper-large-v3-turbo');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');
  formData.append('temperature', '0');
  if (promptText) {
    formData.append('prompt', promptText);
  }

  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': config.appUrl || 'http://localhost:5173',
      'X-Title': 'Vireo AI Video Content Generator',
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errText}`);
  }

  const data: any = await response.json();
  return {
    text: (data.text || '').trim(),
    language: data.language || 'en',
  };
}

async function runMultilingualBenchmark() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 3.2 MULTILINGUAL CODE-SWITCHING BENCHMARK');
  console.log('========================================================================\n');

  const manifestPath = path.resolve(process.cwd(), '../delete/multilingual_samples/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Multilingual manifest not found. Run generate_multilingual_test_assets.py first.');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baselineProvider = new OpenRouterTranscriptionProvider();

  const results: any[] = [];

  // Code-switching prompt context to evaluate prompt-assisted Whisper performance
  const primingPrompt = 'VireoClip Indian content creator video. Mixed Hindi, Marathi, and English Hinglish code-switching with technical terms: AI, clipping, video, subtitles, features, viral, highlights, social media, export, generate.';

  for (const item of manifest) {
    console.log(`\nEvaluating Scenario: [${item.id}] - ${item.description}`);
    console.log(`Ground Truth: "${item.groundTruth}"`);
    const audioBuffer = fs.readFileSync(item.filePath);

    // 1. Existing Model Baseline (No Prompt)
    console.log('  -> Running Baseline (Standard Whisper Large v3 Turbo, no prompt)...');
    let baselineResult = { text: '', language: 'unknown' };
    let baselineTime = 0;
    let baselineError: string | null = null;
    try {
      const baselineStart = Date.now();
      baselineResult = await baselineProvider.transcribeAudio(audioBuffer, `${item.id}.mp3`);
      baselineTime = Date.now() - baselineStart;
    } catch (e: any) {
      baselineError = e.message;
      console.log(`  Baseline Error: ${e.message}`);
    }

    const baselineWer = baselineResult.text ? calculateWer(item.groundTruth, baselineResult.text) : 1.0;
    const baselineCer = baselineResult.text ? calculateCer(item.groundTruth, baselineResult.text) : 1.0;

    console.log(`  Baseline Output:    "${baselineResult.text || '[FAILED: ' + baselineError + ']'}"`);
    console.log(`  Detected Language:  ${baselineResult.language}`);
    console.log(`  Baseline WER:       ${(baselineWer * 100).toFixed(2)}% | CER: ${(baselineCer * 100).toFixed(2)}% (${baselineTime}ms)`);

    // 2. Prompt-Assisted Model
    console.log('  -> Running Prompt-Assisted Whisper (with multilingual vocabulary priming)...');
    let assistedResult = { text: '', language: 'unknown' };
    let assistedTime = 0;
    let assistedError: string | null = null;
    try {
      const assistedStart = Date.now();
      assistedResult = await transcribeWithCustomPrompt(audioBuffer, primingPrompt);
      assistedTime = Date.now() - assistedStart;
    } catch (e: any) {
      assistedError = e.message;
      console.log(`  Assisted Error: ${e.message}`);
    }

    const assistedWer = assistedResult.text ? calculateWer(item.groundTruth, assistedResult.text) : 1.0;
    const assistedCer = assistedResult.text ? calculateCer(item.groundTruth, assistedResult.text) : 1.0;

    console.log(`  Assisted Output:    "${assistedResult.text || '[FAILED: ' + assistedError + ']'}"`);
    console.log(`  Detected Language:  ${assistedResult.language}`);
    console.log(`  Assisted WER:       ${(assistedWer * 100).toFixed(2)}% | CER: ${(assistedCer * 100).toFixed(2)}% (${assistedTime}ms)`);

    results.push({
      scenarioId: item.id,
      description: item.description,
      groundTruth: item.groundTruth,
      baseline: {
        transcript: baselineResult.text,
        language: baselineResult.language,
        wer: baselineWer,
        cer: baselineCer,
        latencyMs: baselineTime,
      },
      promptAssisted: {
        transcript: assistedResult.text,
        language: assistedResult.language,
        wer: assistedWer,
        cer: assistedCer,
        latencyMs: assistedTime,
      },
      werReductionPercent: Number((((baselineWer - assistedWer) / (baselineWer || 1)) * 100).toFixed(2)),
    });
  }

  const resultsPath = path.resolve(process.cwd(), '../delete/multilingual_benchmark_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n========================================================================`);
  console.log(`Saved multilingual benchmark results to ${resultsPath}`);
}

runMultilingualBenchmark().catch((err) => {
  console.error('Multilingual benchmark failed:', err);
  process.exit(1);
});
