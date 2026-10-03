import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Supabase bucket currently configured with 50 MB limit
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
export const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-msvideo',
  'video/x-matroska',
  'video/avi',
  'video/mkv',
];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface UploadOptions {
  file: File;
  userId: string;
  projectId: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  storagePath: string; // Object path without bucket name: {userId}/{projectId}/{fileName}
  fileName: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Validates file format and size against allowed limits.
 */
export function validateVideoFile(file: File | null | undefined): ValidationResult {
  if (!file) {
    return { valid: false, error: 'No video file provided.' };
  }

  // Check file size (50 MB limit configured in Supabase Storage)
  if (file.size > MAX_VIDEO_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed video size in Supabase Storage is 50 MB.`,
    };
  }

  if (file.size === 0) {
    return {
      valid: false,
      error: 'Selected file is empty (0 bytes). Please choose a valid video.',
    };
  }

  // Check extension
  const extensionMatch = file.name.match(/\.[^.]+$/);
  const ext = extensionMatch ? extensionMatch[0].toLowerCase() : '';
  const hasValidExt = ALLOWED_EXTENSIONS.includes(ext);

  // Check MIME type
  const isVideoMime =
    file.type.startsWith('video/') ||
    ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

  if (!hasValidExt && !isVideoMime) {
    return {
      valid: false,
      error: 'Unsupported file format. Supported formats are MP4, MOV, WEBM, AVI, and MKV.',
    };
  }

  return { valid: true };
}

/**
 * Uploads a video file directly to the private 'videos' Supabase Storage bucket.
 * 
 * Rules:
 * 1. Must use supabase.storage.from('videos').upload(objectPath, file, options)
 * 2. Bucket name must be exactly: videos
 * 3. objectPath MUST NOT contain the bucket name. Correct: ${userId}/${projectId}/${fileName}
 * 4. The authenticated user's real Supabase auth.uid() must match the first folder segment.
 * 5. Safe diagnostics only (no keys, tokens, or passwords).
 * 6. Never fake success or simulate upload.
 */
export async function uploadVideoFile({
  file,
  userId,
  projectId,
  onProgress,
  signal,
}: UploadOptions): Promise<UploadResult> {
  // Validate file
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid video file.');
  }

  if (signal?.aborted) {
    throw new DOMException('Upload cancelled by user', 'AbortError');
  }

  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase credentials are not configured. Please add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to .env.local.'
    );
  }

  // 1. Verify authenticated user in Supabase
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('Authentication required: You must be signed in with a valid Supabase account to upload.');
  }

  const authenticatedUserId = user.id;

  // 2. Validate user folder boundary matches auth.uid()
  if (userId && userId !== authenticatedUserId) {
    throw new Error('Security violation: Cannot upload into another user folder.');
  }

  // 3. Build sanitized object path: {userId}/{projectId}/{fileName}
  // IMPORTANT: MUST NOT contain bucket name 'videos/'
  const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `${authenticatedUserId}/${projectId}/${sanitizedFileName}`;

  // 4. Safe diagnostics logging (NO secrets, NO tokens, NO keys)
  console.info('[Supabase Storage Upload: Starting]', {
    bucket: 'videos',
    objectPath,
    fileName: file.name,
    fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB (${file.size} bytes)`,
    mimeType: file.type || 'video/mp4',
  });

  onProgress?.(15);

  // 5. Call real Supabase Storage upload
  const { data, error } = await supabase.storage
    .from('videos')
    .upload(objectPath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || 'video/mp4',
    });

  // 6. Inspect response
  if (error) {
    console.error('[Supabase Storage Upload: Error]', {
      bucket: 'videos',
      objectPath,
      errorMessage: error.message,
      errorName: error.name,
    });

    // Provide helpful human-readable errors
    if (error.message.includes('row-level security') || error.message.includes('policy')) {
      throw new Error(
        `Storage permission denied: Storage RLS policy rejected upload for path "${objectPath}". Ensure you are signed in.`
      );
    } else if (error.message.includes('Entity Too Large') || error.message.includes('413')) {
      throw new Error('Video exceeds Supabase Storage file size limit (50 MB).');
    } else if (error.message.includes('Bucket not found')) {
      throw new Error('Storage bucket "videos" does not exist in your Supabase project.');
    } else {
      throw new Error(`Supabase Storage upload failed: ${error.message}`);
    }
  }

  if (!data || !data.path) {
    throw new Error(
      'Supabase Storage upload did not return an object path. The upload cannot be confirmed.'
    );
  }

  onProgress?.(100);

  console.info('[Supabase Storage Upload: Success]', {
    bucket: 'videos',
    objectPath: data.path,
    fileName: file.name,
    fileSize: file.size,
  });

  return {
    storagePath: data.path, // Correct path: {userId}/{projectId}/{fileName}
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'video/mp4',
  };
}
