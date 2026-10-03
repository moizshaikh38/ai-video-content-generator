import { supabaseAuthClient } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import { transcribeMedia } from './transcriptionService.js';
import { TranscriptRecord } from '../types/index.js';

// In-memory set to guard against duplicate concurrent processing runs for the same project
const activeProcessingSet = new Set<string>();

export interface ProcessProjectResult {
  status: 'transcribed' | 'failed';
  transcript?: TranscriptRecord;
  error?: string;
}

/**
 * Executes the complete video processing and transcription pipeline:
 * 1. Concurrency guard (locks projectId)
 * 2. Updates project video_status -> 'processing'
 * 3. Downloads video from private Supabase Storage 'videos' bucket
 * 4. Updates project video_status -> 'transcribing'
 * 5. Calls OpenAI Whisper API
 * 6. Upserts transcript into 'transcripts' table
 * 7. Updates project video_status -> 'transcribed'
 */
export async function processProjectVideo(
  projectId: string,
  userId: string,
  sourceUrl: string
): Promise<ProcessProjectResult> {
  if (activeProcessingSet.has(projectId)) {
    throw new Error('Project processing is already in progress.');
  }

  activeProcessingSet.add(projectId);

  try {
    // 1. Update status to 'processing'
    logger.info(`[Pipeline] Starting video processing for project ${projectId} (User: ${userId})`);
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'processing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 2. Clean storage path
    const storagePath = sourceUrl.replace(/^videos\//, '');
    logger.info(`[Pipeline] Downloading private video from bucket 'videos', path: ${storagePath}`);

    const { data: fileBlob, error: downloadError } = await supabaseAuthClient.storage
      .from('videos')
      .download(storagePath);

    if (downloadError || !fileBlob) {
      const errDetail = downloadError?.message || 'File blob not found';
      logger.error(`[Pipeline] Failed to download video from Supabase Storage: ${errDetail}`);
      throw new Error(`Failed to retrieve video file from storage: ${errDetail}`);
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const mediaBuffer = Buffer.from(arrayBuffer);
    const fileName = storagePath.split('/').pop() || 'video.mp4';
    const mimeType = fileBlob.type || 'video/mp4';

    logger.info(`[Pipeline] Video retrieved (${(mediaBuffer.length / (1024 * 1024)).toFixed(2)} MB). Updating status to 'transcribing'...`);

    // 3. Update status to 'transcribing'
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'transcribing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 4. Perform real transcription
    const transcription = await transcribeMedia(mediaBuffer, fileName, mimeType);

    // 5. Store transcript into Supabase transcripts table (upsert to prevent duplicate records)
    const transcriptPayload = {
      project_id: projectId,
      user_id: userId,
      transcript_text: transcription.text,
      language: transcription.language,
      duration_seconds: transcription.duration,
      segments: transcription.segments,
      updated_at: new Date().toISOString(),
    };

    logger.info(`[Pipeline] Storing transcript for project ${projectId} into 'transcripts' table...`);

    const { data: savedTranscript, error: saveError } = await supabaseAuthClient
      .from('transcripts')
      .upsert(transcriptPayload, { onConflict: 'project_id' })
      .select()
      .single();

    if (saveError) {
      logger.error(`[Pipeline] Failed to save transcript to Supabase: ${saveError.message}`);
      throw new Error(`Failed to save transcript: ${saveError.message}`);
    }

    // 6. Update project status to 'transcribed'
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'transcribed' })
      .eq('id', projectId)
      .eq('user_id', userId);

    logger.info(`[Pipeline] Project ${projectId} successfully transcribed!`);

    return {
      status: 'transcribed',
      transcript: savedTranscript as TranscriptRecord,
    };
  } catch (err: any) {
    logger.error(`[Pipeline] Video processing failed for project ${projectId}:`, err.message);

    // Revert/mark project status as 'failed' in database
    try {
      await supabaseAuthClient
        .from('projects')
        .update({ video_status: 'failed' })
        .eq('id', projectId)
        .eq('user_id', userId);
    } catch (updateErr: any) {
      logger.error(`[Pipeline] Failed to set video_status to 'failed':`, updateErr.message);
    }

    return {
      status: 'failed',
      error: err.message || 'Video processing failed.',
    };
  } finally {
    activeProcessingSet.delete(projectId);
  }
}
