import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../config/index.js';
import { getTranscriptionProviderWithFailover } from '../services/transcription/failoverTranscriptionProvider.js';
import { OpenRouterTranscriptionProvider } from '../services/transcription/openRouterTranscriptionProvider.js';
import { GroqTranscriptionProvider } from '../services/transcription/groqTranscriptionProvider.js';

test('explicit OpenRouter selection never invokes direct Groq on OpenRouter failure', async () => {
  const old = { provider: config.transcriptionProvider, groq: config.groqApiKey, openrouter: config.openrouterApiKey };
  const op = OpenRouterTranscriptionProvider.prototype.transcribeAudio;
  const gp = GroqTranscriptionProvider.prototype.transcribeAudio;
  const calls: string[] = [];
  try {
    config.transcriptionProvider = 'openrouter';
    config.groqApiKey = 'local-test-only';
    config.openrouterApiKey = 'local-test-only';
    OpenRouterTranscriptionProvider.prototype.transcribeAudio = async () => { calls.push('openrouter'); throw new Error('fixture timeout'); };
    GroqTranscriptionProvider.prototype.transcribeAudio = async () => { calls.push('groq'); throw new Error('must never be called'); };
    const p = getTranscriptionProviderWithFailover();
    assert.equal(p.name, 'openrouter');
    await assert.rejects(p.transcribeAudio(Buffer.from('fixture audio')), /fixture timeout/);
    assert.deepEqual(calls, ['openrouter']);
    config.transcriptionProvider = 'unsupported-typo';
    assert.throws(() => getTranscriptionProviderWithFailover(), /Unsupported transcription provider/);
    config.transcriptionProvider = 'groq';
    assert.match(getTranscriptionProviderWithFailover().name, /groq.*openrouter/);
  } finally {
    config.transcriptionProvider = old.provider;
    config.groqApiKey = old.groq;
    config.openrouterApiKey = old.openrouter;
    OpenRouterTranscriptionProvider.prototype.transcribeAudio = op;
    GroqTranscriptionProvider.prototype.transcribeAudio = gp;
  }
});
