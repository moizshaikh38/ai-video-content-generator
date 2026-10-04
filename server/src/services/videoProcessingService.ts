import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';
import { extractAudioFromVideo } from './audioExtractionService.js';
import { getTranscriptionProvider } from './transcription/transcriptionProviderFactory.js';
import { TranscriptRecord } from '../types/index.js';
import { UsageService } from './usageService.js';

// In-memory set to guard against duplicate concurrent processing runs for the same project
const activeProcessingSet = new Set<string>();

export interface ProcessProjectResult {
  status: 'transcribed' | 'failed';
  transcript?: TranscriptRecord;
  error?: string;
}

/**
 * Checks if a project is currently being processed in memory
 */
export function isProjectProcessingActive(projectId: string): boolean {
  return activeProcessingSet.has(projectId);
}

/**
 * Executes the complete video processing and transcription pipeline:
 * 1. Concurrency guard (locks projectId)
 * 2. Updates project video_status -> 'processing'
 * 3. Downloads video from private Supabase Storage 'videos' bucket
 * 4. Extracts audio track using FFmpeg into temporary MP3 (with process timeout)
 * 5. Updates project video_status -> 'transcribing'
 * 6. Sends extracted audio to provider-agnostic Speech-to-Text API (Groq / OpenRouter)
 * 7. Upserts transcript into Supabase 'transcripts' table
 * 8. Updates project video_status -> 'transcribed'
 * 9. Settles usage reservation on success, or releases on failure
 * 10. Cleans up temporary audio files reliably
 */
export async function processProjectVideo(
  projectId: string,
  userId: string,
  sourceUrl: string,
  processingAttemptId?: string
): Promise<ProcessProjectResult> {
  if (!isServerSupabaseConfigured) {
    throw new Error('Supabase is not configured on the server.');
  }

  if (activeProcessingSet.has(projectId)) {
    throw new Error('Project processing is already in progress.');
  }

  activeProcessingSet.add(projectId);
  let cleanupAudio: (() => void) | null = null;

  try {
    // 1. Update status to 'processing'
    logger.info(`Starting video processing for project ${projectId}`, { projectId, userId });
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'processing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 2. Clean storage path and download video
    const storagePath = sourceUrl.replace(/^videos\//, '');
    logger.info(`Downloading private video from bucket 'videos', path: ${storagePath}`, {
      projectId,
      storagePath,
    });

    const { data: fileBlob, error: downloadError } = await supabaseAuthClient.storage
      .from('videos')
      .download(storagePath);

    if (downloadError || !fileBlob) {
      const errDetail = downloadError?.message || 'File blob not found';
      logger.error('Failed to download video from Supabase Storage', {
        projectId,
        storagePath,
        error: errDetail,
      });
      throw new Error(`Failed to retrieve video file from storage: ${errDetail}`);
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const videoBuffer = Buffer.from(arrayBuffer);
    const originalFileName = storagePath.split('/').pop() || 'video.mp4';

    logger.info(`Video retrieved (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB). Extracting audio via FFmpeg...`, {
      projectId,
      sizeBytes: videoBuffer.length,
    });

    // 3. Extract audio via FFmpeg
    const extractedAudio = await extractAudioFromVideo(videoBuffer, originalFileName);
    cleanupAudio = extractedAudio.cleanup;

    // 4. Update status to 'transcribing'
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'transcribing' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 5. Transcribe audio with configured provider (Groq default / OpenRouter)
    const provider = getTranscriptionProvider();
    logger.info(`Using transcription provider: ${provider.name}`, { projectId, provider: provider.name });
    const transcription = await provider.transcribeAudio(
      extractedAudio.audioBuffer,
      `${projectId}.mp3`,
      'audio/mp3'
    );

    // 6. Store transcript into Supabase transcripts table (upsert to avoid duplicates)
    const transcriptPayload: any = {
      project_id: projectId,
      user_id: userId,
      transcript_text: transcription.text,
      language: transcription.language,
      duration_seconds: transcription.durationSeconds,
      segments: transcription.segments,
      updated_at: new Date().toISOString(),
    };

    if (Array.isArray(transcription.words) && transcription.words.length > 0) {
      transcriptPayload.words = transcription.words;
    }

    logger.info(`Storing transcript for project ${projectId} into 'transcripts' table...`, {
      projectId,
      charCount: transcription.text.length,
      segmentCount: transcription.segments?.length || 0,
      wordCount: transcription.words?.length || 0,
    });

    let { data: savedTranscript, error: saveError } = await supabaseAuthClient
      .from('transcripts')
      .upsert(transcriptPayload, { onConflict: 'project_id' })
      .select()
      .single();

    // Fallback if 'words' column has not been migrated yet in Supabase
    if (saveError && saveError.message.includes('words') && transcriptPayload.words) {
      logger.warn('[VideoProcessing] "words" column not present in transcripts table yet. Retrying without words column.');
      delete transcriptPayload.words;
      const retry = await supabaseAuthClient
        .from('transcripts')
        .upsert(transcriptPayload, { onConflict: 'project_id' })
        .select()
        .single();
      savedTranscript = retry.data;
      saveError = retry.error;
    }

    if (saveError) {
      logger.error('Failed to save transcript to Supabase', {
        projectId,
        error: saveError.message,
      });
      throw new Error(`Failed to save transcript: ${saveError.message}`);
    }

    // 7. Update project status to 'transcribed'
    await supabaseAuthClient
      .from('projects')
      .update({ video_status: 'transcribed' })
      .eq('id', projectId)
      .eq('user_id', userId);

    // 8. Settle usage reservation atomically using measured audio duration
    if (processingAttemptId) {
      await UsageService.settleReservation(
        processingAttemptId,
        transcription.durationSeconds || 0,
        {
          provider: provider.name,
          language: transcription.language,
          segment_count: transcription.segments?.length || 0,
        }
      );
    }

    logger.info(`Project ${projectId} successfully transcribed via ${provider.name}!`, { projectId, provider: provider.name });

    return {
      status: 'transcribed',
      transcript: savedTranscript as TranscriptRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Video processing failed for project ${projectId}`, {
      projectId,
      userId,
      error: message,
    });

    // Safely release the usage quota reservation so failed jobs never consume quota
    if (processingAttemptId) {
      await UsageService.releaseReservation(processingAttemptId, message || 'Processing failed');
    }

    // Mark project status as 'failed' in database
    try {
      await supabaseAuthClient
        .from('projects')
        .update({ video_status: 'failed' })
        .eq('id', projectId)
        .eq('user_id', userId);
    } catch (updateErr) {
      logger.error('Failed to set video_status to failed', {
        projectId,
        error: updateErr instanceof Error ? updateErr.message : String(updateErr),
      });
    }

    return {
      status: 'failed',
      error: message || 'Video processing failed.',
    };
  } finally {
    if (cleanupAudio) {
      try {
        cleanupAudio();
      } catch {
        // Ignore cleanup errors
      }
    }
    activeProcessingSet.delete(projectId);
  }
}
