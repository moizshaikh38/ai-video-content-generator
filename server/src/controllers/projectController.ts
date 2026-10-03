import { Response } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';
import { logger } from '../utils/logger.js';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB Supabase Storage Free limit
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/mkv',
];

/**
 * GET /api/projects
 * List all projects belonging to the authenticated user
 */
export const listProjects = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(200).json({
      status: 'ok',
      projects: [],
    });
    return;
  }

  try {
    const { data, error } = await supabaseAuthClient
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list projects from Supabase:', error.message);
      res.status(500).json({ status: 'error', message: 'Failed to retrieve projects.' });
      return;
    }

    res.status(200).json({ status: 'ok', projects: data || [] });
  } catch (err) {
    logger.error('Unexpected error listing projects:', err);
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred.' });
  }
};

/**
 * GET /api/projects/:id
 * Retrieve a specific project owned by the authenticated user
 */
export const getProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  if (!projectId) {
    res.status(400).json({ status: 'error', message: 'Project ID is required.' });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(200).json({
      status: 'ok',
      project: {
        id: projectId,
        user_id: userId,
        title: 'Demo Video Project',
        source_type: 'upload',
        source_url: `${userId}/${projectId}/sample-video.mp4`,
        video_status: 'uploaded',
        notes: '',
        created_at: new Date().toISOString(),
      },
    });
    return;
  }

  try {
    const { data, error } = await supabaseAuthClient
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('Failed to fetch project from Supabase:', error.message);
      res.status(500).json({ status: 'error', message: 'Failed to fetch project.' });
      return;
    }

    if (!data) {
      res.status(404).json({ status: 'error', message: 'Project not found or access denied.' });
      return;
    }

    res.status(200).json({ status: 'ok', project: data });
  } catch (err) {
    logger.error('Unexpected error fetching project:', err);
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects
 * Create a new video project with strict validation
 */
export const createProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  const {
    id,
    title,
    source_type = 'upload',
    source_url,
    storage_path,
    file_size,
    mime_type,
    notes = '',
  } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    res.status(400).json({ status: 'error', message: 'Project title is required.' });
    return;
  }

  // Validate file size limit (50 MB)
  if (file_size && Number(file_size) > MAX_VIDEO_BYTES) {
    res.status(400).json({
      status: 'error',
      message: 'Video file exceeds the maximum allowed size of 50 MB.',
    });
    return;
  }

  // Validate MIME type if supplied
  if (mime_type && !mime_type.startsWith('video/') && !ALLOWED_MIME_TYPES.includes(mime_type.toLowerCase())) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid video file format. Supported formats are MP4, MOV, WEBM, AVI, and MKV.',
    });
    return;
  }

  // Validate storage path ownership: MUST start with {user_id}/ to prevent path traversal
  if (storage_path) {
    const normalized = String(storage_path).replace(/^videos\//, '');
    if (!normalized.startsWith(`${userId}/`)) {
      res.status(403).json({
        status: 'error',
        message: 'Security violation: storage path must belong to the authenticated user.',
      });
      return;
    }
  }

  const cleanStoragePath = storage_path ? String(storage_path).replace(/^videos\//, '') : null;
  const projectRecord = {
    id: id || crypto.randomUUID(),
    user_id: userId,
    title: title.trim(),
    source_type,
    source_url: cleanStoragePath || source_url || null,
    video_status: (cleanStoragePath || source_url) ? 'uploaded' : 'uploading',
    notes: String(notes || '').trim(),
  };

  if (!isServerSupabaseConfigured) {
    res.status(201).json({ status: 'ok', project: projectRecord });
    return;
  }

  try {
    const { data, error } = await supabaseAuthClient
      .from('projects')
      .insert(projectRecord)
      .select()
      .single();

    if (error) {
      logger.error('Failed to create project in Supabase:', error.message);
      res.status(500).json({ status: 'error', message: 'Failed to create project.' });
      return;
    }

    res.status(201).json({ status: 'ok', project: data });
  } catch (err) {
    logger.error('Unexpected error creating project:', err);
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred.' });
  }
};

/**
 * DELETE /api/projects/:id
 * Delete a project belonging to the authenticated user
 */
export const deleteProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  if (!isServerSupabaseConfigured) {
    res.status(200).json({ status: 'ok', message: 'Project deleted successfully.' });
    return;
  }

  try {
    const { error } = await supabaseAuthClient
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Failed to delete project from Supabase:', error.message);
      res.status(500).json({ status: 'error', message: 'Failed to delete project.' });
      return;
    }

    res.status(200).json({ status: 'ok', message: 'Project deleted successfully.' });
  } catch (err) {
    logger.error('Unexpected error deleting project:', err);
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred.' });
  }
};

/**
 * POST /api/projects/:id/process
 * Start video processing and transcription pipeline
 */
export const processProject = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  if (!projectId) {
    res.status(400).json({ status: 'error', message: 'Project ID is required.' });
    return;
  }

  try {
    // 1. Fetch project and verify ownership
    const { data: project, error: fetchError } = await supabaseAuthClient
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      logger.error(`Failed to fetch project ${projectId} for processing:`, fetchError.message);
      res.status(500).json({ status: 'error', message: 'Failed to access project.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', message: 'Project not found or access denied.' });
      return;
    }

    // 2. Validate source type & presence of source_url
    if (project.source_type !== 'upload') {
      res.status(400).json({
        status: 'error',
        message: 'Processing currently supports direct video uploads.',
      });
      return;
    }

    if (!project.source_url) {
      res.status(400).json({
        status: 'error',
        message: 'Project does not have an uploaded video file associated with it.',
      });
      return;
    }

    // 3. Initiate processing pipeline asynchronously and immediately return status: 'processing'
    // This allows the frontend to poll status updates smoothly without HTTP timeouts.
    const { processProjectVideo } = await import('../services/videoProcessingService.js');

    // Run pipeline in background
    processProjectVideo(projectId, userId, project.source_url)
      .then((result) => {
        if (result.status === 'transcribed') {
          logger.info(`Background pipeline completed for project ${projectId}`);
        } else {
          logger.warn(`Background pipeline failed for project ${projectId}:`, result.error);
        }
      })
      .catch((err) => {
        logger.error(`Background pipeline unexpected error for project ${projectId}:`, err);
      });

    res.status(202).json({
      status: 'ok',
      message: 'Video processing started.',
      projectId,
      video_status: 'processing',
    });
  } catch (err: any) {
    logger.error('Unexpected error initiating project processing:', err);
    res.status(500).json({
      status: 'error',
      message: err.message || 'An unexpected error occurred while initiating processing.',
    });
  }
};

/**
 * GET /api/projects/:id/transcript
 * Retrieve stored transcript for a project owned by the user
 */
export const getProjectTranscript = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const projectId = req.params.id;

  if (!userId) {
    res.status(401).json({ status: 'error', message: 'User not authenticated.' });
    return;
  }

  if (!projectId) {
    res.status(400).json({ status: 'error', message: 'Project ID is required.' });
    return;
  }

  try {
    // 1. Verify project ownership first
    const { data: project, error: projectError } = await supabaseAuthClient
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (projectError) {
      logger.error('Failed to verify project ownership:', projectError.message);
      res.status(500).json({ status: 'error', message: 'Failed to verify project access.' });
      return;
    }

    if (!project) {
      res.status(404).json({ status: 'error', message: 'Project not found or access denied.' });
      return;
    }

    // 2. Fetch transcript
    const { data: transcript, error: transcriptError } = await supabaseAuthClient
      .from('transcripts')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (transcriptError) {
      logger.error('Failed to fetch transcript:', transcriptError.message);
      res.status(500).json({ status: 'error', message: 'Failed to fetch transcript.' });
      return;
    }

    if (!transcript) {
      res.status(404).json({ status: 'error', message: 'Transcript not found for this project.' });
      return;
    }

    res.status(200).json({
      status: 'ok',
      transcript,
    });
  } catch (err: any) {
    logger.error('Unexpected error fetching transcript:', err);
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred.' });
  }
};

