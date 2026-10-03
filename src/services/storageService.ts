import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
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
  storagePath: string;
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

  // Check file size (500 MB limit)
  if (file.size > MAX_VIDEO_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed video size is 500 MB.`,
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
 * Uploads a video file directly to Supabase Storage in the private 'videos' bucket.
 * Target path structure: {user_id}/{project_id}/{filename}
 * Supports real-time progress callbacks and cancellation via AbortSignal.
 */
export async function uploadVideoFile({
  file,
  userId,
  projectId,
  onProgress,
  signal,
}: UploadOptions): Promise<UploadResult> {
  const validation = validateVideoFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid video file.');
  }

  // Sanitize filename to avoid URL and storage key escaping issues
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${userId}/${projectId}/${sanitizedName}`;

  if (!isSupabaseConfigured) {
    // Graceful offline / demo simulation when live Supabase credentials are not populated
    return simulateLocalUpload(file, storagePath, onProgress, signal);
  }

  // Live Supabase Storage upload
  return new Promise<UploadResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled by user', 'AbortError'));
      return;
    }

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError || !session) {
        reject(new Error('Authentication session expired. Please log in again.'));
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
      const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';
      const uploadEndpoint = `${supabaseUrl}/storage/v1/object/videos/${storagePath}`;

      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadEndpoint, true);

      // Set headers for Supabase Storage API
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.setRequestHeader('apikey', supabasePublishableKey);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.setRequestHeader('x-upsert', 'true');

      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new DOMException('Upload cancelled by user', 'AbortError'));
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve({
            storagePath,
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type || 'video/mp4',
          });
        } else {
          let errorDetail = 'Upload failed';
          try {
            const parsed = JSON.parse(xhr.responseText);
            errorDetail = parsed.message || parsed.error || errorDetail;
          } catch {
            errorDetail = xhr.statusText || errorDetail;
          }

          if (xhr.status === 401 || xhr.status === 403) {
            reject(
              new Error('Storage permission denied. You can only upload files to your own folder.')
            );
          } else if (xhr.status === 413) {
            reject(new Error('File exceeds the Supabase storage file size limit (500 MB).'));
          } else {
            reject(new Error(`Storage error (${xhr.status}): ${errorDetail}`));
          }
        }
      };

      xhr.onerror = () => {
        reject(
          new Error('Network error occurred during video upload. Please check your connection and retry.')
        );
      };

      xhr.ontimeout = () => {
        reject(new Error('Upload timed out. Please check your connection and retry.'));
      };

      xhr.send(file);
    }).catch((err) => {
      reject(new Error(`Failed to initialize upload: ${err?.message || err}`));
    });
  });
}

/**
 * Offline / dev simulation when Supabase credentials are not yet populated.
 */
function simulateLocalUpload(
  file: File,
  storagePath: string,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    let currentPct = 10;
    onProgress?.(currentPct);

    const interval = setInterval(() => {
      if (signal?.aborted) {
        clearInterval(interval);
        reject(new DOMException('Upload cancelled by user', 'AbortError'));
        return;
      }

      currentPct += 20;
      if (currentPct >= 100) {
        clearInterval(interval);
        onProgress?.(100);
        resolve({
          storagePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'video/mp4',
        });
      } else {
        onProgress?.(currentPct);
      }
    }, 250);
  });
}
