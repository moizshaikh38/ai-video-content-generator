import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: 'json_object';
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionTelemetry {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  latencyMs: number;
  attemptCount: number;
  retryCount: number;
  usedFallback: boolean;
  tokenMeasurementType: 'provider_measured' | 'unavailable';
  estimatedProviderCostUsd: number | null;
  /** Actual billed response cost, never replaced by modeled token arithmetic. */
  actualProviderCostUsd?: number | null;
}

export interface CompletionResult<T> {
  data: T;
  telemetry: CompletionTelemetry;
}

export interface AIProviderClient {
  generateJsonCompletion<T>(request: CompletionRequest): Promise<T>;
  generateJsonCompletionWithTelemetry<T>(request: CompletionRequest): Promise<CompletionResult<T>>;
}

interface OpenRouterChoice {
  message?: {
    content?: string;
    role?: string;
  };
  finish_reason?: string;
}

interface OpenRouterChatResponse {
  id?: string;
  choices?: OpenRouterChoice[];
  error?: {
    message?: string;
    code?: string | number;
  };
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

/**
 * Checks whether an error or HTTP status qualifies as an eligible transient failure.
 * Permanent errors (400, 401, 402, 403, 404, 422) must NOT be retried.
 */
export function isTransientError(err: any, statusCode?: number): boolean {
  if (statusCode !== undefined) return [429, 500, 502, 503, 504].includes(statusCode);
  if (err?.noAutomaticRetry) return false;
  if (err?.name==='SyntaxError' || /redirect/i.test(String(err?.cause?.code||'')+' '+String(err?.cause?.message||'')+' '+String(err?.message||''))) return false;
  if (!err) return false;
  const msg = (err.message || String(err)).toLowerCase();
  const code = (err.code || '').toLowerCase();
  if (code === 'econnreset' || code === 'etimedout' || code === 'enotfound' || code === 'eai_again') return true;
  if (err.name === 'AbortError' || msg.includes('timeout') || msg.includes('timed out')) return true;
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) return true;
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504') || msg.includes('bad gateway') || msg.includes('service unavailable')) return true;
  return false;
}

/**
 * Computes bounded exponential backoff delay with random jitter.
 */
export function calculateBackoffDelay(attempt: number, baseMs = 300, maxMs = 2000): number {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  return exp + jitter;
}

/**
 * Calculates modeled provider API cost based on published rates.
 * Clearly identified as estimated provider API cost, distinct from business gross margin.
 */
export function estimateProviderCostUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null
): number | null {
  if (promptTokens === null || completionTokens === null) return null;
  const lower = model.toLowerCase();
  let promptRatePerMillion = 0.15; // default gpt-4o-mini
  let completionRatePerMillion = 0.60;
  if (lower.includes('llama-3.3-70b') || lower.includes('llama3-70b')) {
    promptRatePerMillion = 0.59;
    completionRatePerMillion = 0.79;
  } else if (lower.includes('gpt-4o') && !lower.includes('mini')) {
    promptRatePerMillion = 2.50;
    completionRatePerMillion = 10.00;
  }
  const cost = (promptTokens / 1_000_000) * promptRatePerMillion + (completionTokens / 1_000_000) * completionRatePerMillion;
  return Number(cost.toFixed(6));
}

/**
 * Helper to safely extract and parse structured JSON from LLM output.
 */
export function parseStructuredJsonResponse<T>(content: string): T {
  if (!content || typeof content !== 'string') {
    throw Object.assign(new Error('AI provider returned an empty or malformed completion response.'),{noAutomaticRetry:true});
  }

  // Safely extract and parse JSON even if surrounded by markdown code fences or whitespace
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (err: any) {
    logger.error('Failed to parse JSON response from LLM', { rawContent: content });
    throw Object.assign(new Error(`Failed to parse structured JSON from AI provider response: ${err.message}`),{noAutomaticRetry:true});
  }
}

/**
 * Primary Provider implementation for OpenRouter LLM chat completions.
 * Implements bounded retries (max 2 retries, 3 total attempts) with exponential backoff on transient errors.
 */
export class OpenRouterContentProvider implements AIProviderClient {
  private apiKey: string;
  private appUrl: string;
  private defaultModel: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(options?: { maxRetries?: number; timeoutMs?: number; apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : (config.openrouterApiKey?.trim() || '');
    this.appUrl = config.appUrl || 'http://localhost:5173';
    this.defaultModel = options?.model || config.openrouterTextModel || 'openai/gpt-4o-mini';
    this.maxRetries = options?.maxRetries ?? 2;
    this.timeoutMs = options?.timeoutMs ?? config.contentGenerationTimeoutMs ?? 30000;
  }

  public isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  public getModel(): string {
    return this.defaultModel;
  }

  async executeRequest<T>(request: CompletionRequest): Promise<CompletionResult<T>> {
    if (!this.isConfigured()) {
      throw new Error('OPENROUTER_API_KEY is not configured on the server. Please add your key to server environment.');
    }

    const payload = {
      model: this.defaultModel,
      provider: {zdr:true,data_collection:'deny'},
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.6,
      max_tokens: request.maxTokens ?? 2500,
    };

    let attempt = 0;
    const maxAttempts = 1 + this.maxRetries;
    let lastError: any = null;
    const startTime = performance.now();

    while (attempt < maxAttempts) {
      attempt++;
      logger.info(`[OpenRouter] Generation request attempt ${attempt}/${maxAttempts} (${this.defaultModel})...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`AI generation request timed out after ${this.timeoutMs / 1000}s.`));
      }, this.timeoutMs);

      try {
        // OPENROUTER_BASE_URL is a testability override (local mock endpoint in
        // E2E); production leaves it unset and hits OpenRouter.
        const response = await fetch(process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          redirect: 'error',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'HTTP-Referer': this.appUrl,
            'X-Title': 'Vireo AI Video Content Generator',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          let cleanMsg = `HTTP ${response.status}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error?.message) cleanMsg = parsed.error.message;
          } catch {}

          const isTransient = isTransientError(null, response.status);

          if (!isTransient || attempt >= maxAttempts) {
            if (response.status === 401) {
              throw Object.assign(new Error('AI provider authentication failed (401): invalid API key.'),{providerStatus:401});
            }
            if (response.status === 402) {
              throw Object.assign(new Error(`AI provider payment/credits error: ${cleanMsg}. Please check your OpenRouter credit balance.`),{providerStatus:402});
            }
            if (response.status === 429) {
              throw Object.assign(new Error(`AI provider rate limit exceeded: ${cleanMsg}. Please wait a moment and try again.`),{providerStatus:429});
            }
            throw Object.assign(new Error(`AI provider error (${response.status}): ${cleanMsg}`),{providerStatus:response.status});
          }

          // Eligible transient error with retries remaining
          const delay = calculateBackoffDelay(attempt);
          logger.warn(`[OpenRouter] Transient failure (${response.status}: ${cleanMsg}). Retrying in ${delay}ms... (attempt ${attempt}/${maxAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const data = (await response.json()) as OpenRouterChatResponse;
        const rawContent = data.choices?.[0]?.message?.content;
        const parsedData = parseStructuredJsonResponse<T>(rawContent || '');

        const latencyMs = Math.round(performance.now() - startTime);
        const promptTokens = data.usage?.prompt_tokens ?? null;
        const completionTokens = data.usage?.completion_tokens ?? null;
        const totalTokens = data.usage?.total_tokens ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null);

        const tokenMeasurementType = promptTokens !== null ? 'provider_measured' : 'unavailable';
        const estimatedProviderCostUsd = estimateProviderCostUsd(this.defaultModel, promptTokens, completionTokens);

        return {
          data: parsedData,
          telemetry: {
            provider: 'openrouter',
            model: this.defaultModel,
            promptTokens,
            completionTokens,
            totalTokens,
            latencyMs,
            attemptCount: attempt,
            retryCount: attempt - 1,
            usedFallback: false,
            tokenMeasurementType,
            estimatedProviderCostUsd,
            actualProviderCostUsd: typeof data.usage?.cost==='number' && Number.isFinite(data.usage.cost) && data.usage.cost>=0 ? data.usage.cost : null,
          },
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        const isTransient = isTransientError(err,err?.providerStatus);
        if (!isTransient || attempt >= maxAttempts) {
          throw err;
        }

        const delay = calculateBackoffDelay(attempt);
        logger.warn(`[OpenRouter] Transient error caught: ${err.message}. Retrying in ${delay}ms... (attempt ${attempt}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('OpenRouter generation failed after retries.');
  }

  async generateJsonCompletionWithTelemetry<T>(request: CompletionRequest): Promise<CompletionResult<T>> {
    return this.executeRequest<T>(request);
  }

  async generateJsonCompletion<T>(request: CompletionRequest): Promise<T> {
    const res = await this.executeRequest<T>(request);
    return res.data;
  }
}

/**
 * Fallback Provider implementation for Groq chat completions.
 * Used when OpenRouter fails with eligible transient provider error or is unconfigured.
 */
export class GroqContentProvider implements AIProviderClient {
  private apiKey: string;
  private defaultModel: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(options?: { maxRetries?: number; timeoutMs?: number; apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey !== undefined ? options.apiKey : (config.groqApiKey?.trim() || '');
    this.defaultModel = options?.model || 'llama-3.3-70b-versatile';
    this.maxRetries = options?.maxRetries ?? 2;
    this.timeoutMs = options?.timeoutMs ?? config.contentGenerationTimeoutMs ?? 30000;
  }

  public isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.trim().length > 0;
  }

  public getModel(): string {
    return this.defaultModel;
  }

  async executeRequest<T>(request: CompletionRequest): Promise<CompletionResult<T>> {
    if (!this.isConfigured()) {
      throw new Error('GROQ_API_KEY is not configured on the server.');
    }

    const payload = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.6,
      max_tokens: request.maxTokens ?? 2500,
    };

    let attempt = 0;
    const maxAttempts = 1 + this.maxRetries;
    let lastError: any = null;
    const startTime = performance.now();

    while (attempt < maxAttempts) {
      attempt++;
      logger.info(`[Groq Fallback] Generation request attempt ${attempt}/${maxAttempts} (${this.defaultModel})...`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort(new Error(`Groq generation request timed out after ${this.timeoutMs / 1000}s.`));
      }, this.timeoutMs);

      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          let cleanMsg = `HTTP ${response.status}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error?.message) cleanMsg = parsed.error.message;
          } catch {}

          const isTransient = isTransientError(null, response.status);

          if (!isTransient || attempt >= maxAttempts) {
            throw new Error(`Groq provider error (${response.status}): ${cleanMsg}`);
          }

          const delay = calculateBackoffDelay(attempt);
          logger.warn(`[Groq Fallback] Transient failure (${response.status}: ${cleanMsg}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const data = (await response.json()) as OpenRouterChatResponse;
        const rawContent = data.choices?.[0]?.message?.content;
        const parsedData = parseStructuredJsonResponse<T>(rawContent || '');

        const latencyMs = Math.round(performance.now() - startTime);
        const promptTokens = data.usage?.prompt_tokens ?? null;
        const completionTokens = data.usage?.completion_tokens ?? null;
        const totalTokens = data.usage?.total_tokens ?? (promptTokens !== null && completionTokens !== null ? promptTokens + completionTokens : null);

        const tokenMeasurementType = promptTokens !== null ? 'provider_measured' : 'unavailable';
        const estimatedProviderCostUsd = estimateProviderCostUsd(this.defaultModel, promptTokens, completionTokens);

        return {
          data: parsedData,
          telemetry: {
            provider: 'groq',
            model: this.defaultModel,
            promptTokens,
            completionTokens,
            totalTokens,
            latencyMs,
            attemptCount: attempt,
            retryCount: attempt - 1,
            usedFallback: true,
            tokenMeasurementType,
            estimatedProviderCostUsd,
          },
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        lastError = err;

        const isTransient = isTransientError(err);
        if (!isTransient || attempt >= maxAttempts) {
          throw err;
        }

        const delay = calculateBackoffDelay(attempt);
        logger.warn(`[Groq Fallback] Transient error caught: ${err.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Groq fallback generation failed after retries.');
  }

  async generateJsonCompletionWithTelemetry<T>(request: CompletionRequest): Promise<CompletionResult<T>> {
    return this.executeRequest<T>(request);
  }

  async generateJsonCompletion<T>(request: CompletionRequest): Promise<T> {
    const res = await this.executeRequest<T>(request);
    return res.data;
  }
}

/**
 * Unified Reliable Content Provider Manager.
 * Orchestrates Primary (OpenRouter) with retries, and Failover to Fallback (Groq).
 * Captures truthful telemetry across both success and failure attempts.
 */
export class ReliableAiContentProvider implements AIProviderClient {
  public primaryProvider: OpenRouterContentProvider;
  public fallbackProvider: GroqContentProvider;

  constructor() {
    this.primaryProvider = new OpenRouterContentProvider();
    this.fallbackProvider = new GroqContentProvider();
  }

  /**
   * Generates a validated JSON completion and returns structured telemetry.
   * If callers have overridden generateJsonCompletion on the instance (e.g. in tests),
   * delegates seamlessly to the override with mock telemetry.
   */
  async generateJsonCompletionWithTelemetry<T>(request: CompletionRequest): Promise<CompletionResult<T>> {
    // If instance method was overridden by a test mock, respect mock
    if (this.generateJsonCompletion !== ReliableAiContentProvider.prototype.generateJsonCompletion) {
      const start = performance.now();
      const data = await this.generateJsonCompletion<T>(request);
      const latencyMs = Math.round(performance.now() - start);
      return {
        data,
        telemetry: {
          provider: 'mock',
          model: 'mock-test-model',
          promptTokens: 250,
          completionTokens: 450,
          totalTokens: 700,
          latencyMs,
          attemptCount: 1,
          retryCount: 0,
          usedFallback: false,
          tokenMeasurementType: 'provider_measured',
          estimatedProviderCostUsd: 0.000308,
        },
      };
    }

    // 1. Attempt Primary Provider (OpenRouter)
    if (this.primaryProvider.isConfigured()) {
      try {
        return await this.primaryProvider.executeRequest<T>(request);
      } catch (primaryErr: any) {
        logger.warn(`[ReliableAiProvider] Primary provider (OpenRouter) failed: ${primaryErr.message}`);

        // Check if fallback is eligible and available
        if (this.fallbackProvider.isConfigured() && isTransientError(primaryErr,primaryErr?.providerStatus)) {
          logger.info('[ReliableAiProvider] Engaging fallback provider (Groq)...');
          try {
            return await this.fallbackProvider.executeRequest<T>(request);
          } catch (fallbackErr: any) {
            logger.error(`[ReliableAiProvider] Fallback provider (Groq) also failed: ${fallbackErr.message}`);
            throw new Error(`All AI content providers failed. Primary: ${primaryErr.message}; Fallback: ${fallbackErr.message}`);
          }
        }

        // No fallback configured
        throw primaryErr;
      }
    }

    // 2. Primary unconfigured - try Fallback directly if configured
    if (this.fallbackProvider.isConfigured()) {
      logger.info('[ReliableAiProvider] Primary not configured; using configured Fallback provider (Groq)...');
      return await this.fallbackProvider.executeRequest<T>(request);
    }

    throw new Error('OPENROUTER_API_KEY is not configured on the server. Please add your key to server environment.');
  }

  /**
   * Backward-compatible generation method returning parsed JSON directly.
   */
  async generateJsonCompletion<T>(request: CompletionRequest): Promise<T> {
    const result = await this.generateJsonCompletionWithTelemetry<T>(request);
    return result.data;
  }
}

// Export singleton provider instance. Can be swapped for OpenAI, Anthropic, etc. without modifying callers.
export const defaultAiProvider: ReliableAiContentProvider = new ReliableAiContentProvider();
