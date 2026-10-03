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
  groqApiKey: process.env.GROQ_API_KEY || '',
  transcriptionProvider: process.env.TRANSCRIPTION_PROVIDER || 'groq',
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Processing configuration
  processingStaleMinutes: parseInt(process.env.PROCESSING_STALE_MINUTES || '15', 10),
  maxVideoBytes: 50 * 1024 * 1024, // 50 MB — must match Supabase bucket config
  defaultMonthlyQuotaMinutes: parseInt(process.env.DEFAULT_MONTHLY_QUOTA_MINUTES || '15', 10),
  // Timeouts (milliseconds)
  transcriptionTimeoutMs: parseInt(process.env.TRANSCRIPTION_TIMEOUT_MS || '120000', 10),
  contentGenerationTimeoutMs: parseInt(process.env.CONTENT_GENERATION_TIMEOUT_MS || '60000', 10),
  ffmpegTimeoutMs: parseInt(process.env.FFMPEG_TIMEOUT_MS || '180000', 10),
  clipRenderTimeoutMs: parseInt(process.env.CLIP_RENDER_TIMEOUT_MS || '300000', 10),
} as const;

/**
 * Validates that all critical environment variables are present.
 * Fails fast in production; warns in development.
 */
export function validateEnvironment(): void {
  const critical: Array<{ name: string; value: string; required: boolean }> = [
    { name: 'SUPABASE_URL', value: config.supabaseUrl, required: true },
    { name: 'SUPABASE_SECRET_KEY', value: config.supabaseSecretKey, required: true },
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

  // Check transcription provider credentials
  const provider = (config.transcriptionProvider || 'groq').toLowerCase().trim();
  if (provider === 'groq' && !config.groqApiKey) {
    console.warn('[WARN] TRANSCRIPTION_PROVIDER is set to "groq" but GROQ_API_KEY is not configured.');
  } else if (provider === 'openrouter' && !config.openrouterApiKey) {
    console.warn('[WARN] TRANSCRIPTION_PROVIDER is set to "openrouter" but OPENROUTER_API_KEY is not configured.');
  }

  // Warn if text generation key is absent
  if (!config.openrouterApiKey) {
    console.warn('[WARN] OPENROUTER_API_KEY is not configured. AI content generation will fail until set.');
  }
}
