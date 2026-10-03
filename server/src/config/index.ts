import dotenv from 'dotenv';
import path from 'path';

// Load .env and .env.local from workspace root or current directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || '',
  openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openrouterTextModel: process.env.OPENROUTER_TEXT_MODEL || 'openai/gpt-4o-mini',
  transcriptionModel: process.env.TRANSCRIPTION_MODEL || 'openai/whisper-large-v3-turbo',
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Processing configuration
  processingStaleMinutes: parseInt(process.env.PROCESSING_STALE_MINUTES || '15', 10),
  maxVideoBytes: 50 * 1024 * 1024, // 50 MB — must match Supabase bucket config
  // Timeouts (milliseconds)
  transcriptionTimeoutMs: parseInt(process.env.TRANSCRIPTION_TIMEOUT_MS || '120000', 10),
  contentGenerationTimeoutMs: parseInt(process.env.CONTENT_GENERATION_TIMEOUT_MS || '60000', 10),
  ffmpegTimeoutMs: parseInt(process.env.FFMPEG_TIMEOUT_MS || '180000', 10),
} as const;

/**
 * Validates that all critical environment variables are present.
 * Fails fast in production; warns in development.
 */
export function validateEnvironment(): void {
  const critical: Array<{ name: string; value: string; required: boolean }> = [
    { name: 'SUPABASE_URL', value: config.supabaseUrl, required: true },
    { name: 'SUPABASE_SECRET_KEY', value: config.supabaseSecretKey, required: true },
    { name: 'OPENROUTER_API_KEY', value: config.openrouterApiKey, required: false },
    { name: 'CORS_ORIGIN', value: config.corsOrigin, required: false },
  ];

  const missing = critical.filter((v) => v.required && !v.value);

  if (missing.length > 0) {
    const names = missing.map((v) => v.name).join(', ');
    if (config.isProduction) {
      console.error(`[FATAL] Missing required environment variables: ${names}`);
      process.exit(1);
    } else {
      console.warn(
        `[WARN] Missing environment variables: ${names}. ` +
          'Backend will operate in degraded mode. Add these to .env or .env.local.'
      );
    }
  }

  // Warn about optional but important vars
  const optional = critical.filter((v) => !v.required && !v.value);
  if (optional.length > 0) {
    const names = optional.map((v) => v.name).join(', ');
    console.warn(`[WARN] Optional environment variables not set: ${names}`);
  }
}
