import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateRecord } from '../db/schemaValidation.js';
import { ownerContext, dataRepository } from '../db/repositories/dataRepository.js';

describe('Video Clipping & Schema Validation Fix Verification', () => {
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();

  it('validates transcript record with string text property without throwing Invalid text error', () => {
    const transcriptPayload = {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      transcript_text: 'This is the spoken audio transcript.',
      text: 'This is the spoken audio transcript.',
      language: 'en',
      duration_seconds: 45.2,
      segments: [
        { start: 0, end: 2.5, text: 'This is the spoken' },
        { start: 2.5, end: 5.0, text: 'audio transcript.' },
      ],
      words: [
        { text: 'This', start: 0, end: 0.5 },
        { text: 'is', start: 0.5, end: 0.8 },
      ],
    };

    assert.doesNotThrow(() => {
      validateRecord('transcripts', transcriptPayload);
    }, 'validateRecord must accept transcript records with string text property');
  });

  it('validates content_pack_items and hook_candidates with string text property', () => {
    const hookPayload = {
      id: crypto.randomUUID(),
      project_id: projectId,
      user_id: userId,
      hook_type: 'DIRECT',
      delivery_mode: 'SPOKEN_REWRITE',
      status: 'GENERATED',
      text: 'Here is why this matters.',
    };

    assert.doesNotThrow(() => {
      validateRecord('hook_candidates', hookPayload);
    });

    const itemPayload = {
      id: crypto.randomUUID(),
      content_pack_id: crypto.randomUUID(),
      user_id: userId,
      type: 'HOOK',
      status: 'GENERATED',
      text: 'Viral Hook Line',
    };

    assert.doesNotThrow(() => {
      validateRecord('content_pack_items', itemPayload);
    });
  });

  it('validates project record with error_message string property', () => {
    const projectPayload = {
      id: projectId,
      user_id: userId,
      title: 'Test Project',
      source_type: 'url',
      video_status: 'failed',
      error_message: 'Detailed failure reason for user review',
    };

    assert.doesNotThrow(() => {
      validateRecord('projects', projectPayload);
    }, 'validateRecord must accept error_message on projects');
  });

  it('ownerContext preserves userId across asynchronous operations', async () => {
    const storedUserId = await ownerContext.run(userId, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ownerContext.getStore();
    });

    assert.equal(storedUserId, userId, 'ownerContext must maintain userId across async await');
  });
});
