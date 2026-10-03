import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  responseFormat?: 'json_object';
  maxTokens?: number;
  temperature?: number;
}

export interface AIProviderClient {
  generateJsonCompletion<T>(request: CompletionRequest): Promise<T>;
}

/**
 * Provider implementation for OpenRouter LLM chat completions.
 * Default model: openai/gpt-4o-mini (cost-effective, high instruction adherence for JSON output).
 * Configurable via OPENROUTER_MODEL env var or default fallback.
 */
export class OpenRouterContentProvider implements AIProviderClient {
  private apiKey: string;
  private appUrl: string;
  private defaultModel: string;

  constructor() {
    this.apiKey = config.openrouterApiKey?.trim() || '';
    this.appUrl = config.appUrl || 'http://localhost:5173';
    this.defaultModel = process.env.OPENROUTER_TEXT_MODEL || 'openai/gpt-4o-mini';
  }

  /**
   * Generates a validated JSON completion from OpenRouter.
   */
  async generateJsonCompletion<T>(request: CompletionRequest): Promise<T> {
    if (!this.apiKey) {
      throw new Error(
        'OPENROUTER_API_KEY is not configured on the server. Please add your key to .env.local.'
      );
    }

    const payload = {
      model: this.defaultModel,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
    };

    logger.info(`[AI Provider] Sending content generation request to OpenRouter (${this.defaultModel})...`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': this.appUrl,
        'X-Title': 'Vireo AI Video Content Generator',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error(`[AI Provider] OpenRouter API error (${response.status}):`, errText);

      let cleanMsg = 'AI content generation provider returned an error.';
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) {
          cleanMsg = parsed.error.message;
        }
      } catch {
        // fallback
      }

      if (response.status === 401) {
        throw new Error('AI provider authentication failed: invalid API key.');
      }
      if (response.status === 402) {
        throw new Error(`AI provider payment/credits error: ${cleanMsg}`);
      }
      if (response.status === 429) {
        throw new Error(`AI provider rate limit exceeded: ${cleanMsg}`);
      }

      throw new Error(`AI provider error (${response.status}): ${cleanMsg}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('AI provider returned an empty or malformed completion response.');
    }

    // Safely extract and parse JSON even if surrounded by whitespace or fences
    const cleaned = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

    try {
      const parsed = JSON.parse(cleaned) as T;
      return parsed;
    } catch (parseErr: any) {
      logger.error('[AI Provider] Failed to parse JSON response from LLM:', content);
      throw new Error('Failed to parse structured JSON from AI provider response.');
    }
  }
}

// Export singleton provider instance. Can be swapped for OpenAI, Anthropic, etc. without modifying callers.
export const defaultAiProvider: AIProviderClient = new OpenRouterContentProvider();
