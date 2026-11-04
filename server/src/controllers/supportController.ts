import { Request, Response } from 'express';
import { defaultAiProvider } from '../services/aiProviderClient.js';
import { logger } from '../utils/logger.js';

/**
 * AI support assistant (quality roadmap: dedicated support experience).
 *
 * Grounded product Q&A over the existing AI provider. Design constraints:
 *  - Stateless: the client sends a capped message window; nothing is persisted.
 *  - Grounded: the system prompt pins VireoClip product facts and forbids
 *    invented prices, legal advice, or off-topic answers.
 *  - Capped: message count/length limits, output token cap.
 *  - Honest: escalates to human support for account/billing/refund actions —
 *    the assistant cannot mutate accounts.
 */

const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 1500;
const TIMEOUT_MS = 30_000;

const SYSTEM_PROMPT = `You are Vira, the VireoClip AI support assistant. VireoClip is an AI video-clipping web app: users paste a YouTube/direct video URL or upload a file (MP4/MOV/WEBM/MKV, max 2 GB, max 2 hours), the service transcribes it (Whisper via Groq/OpenRouter), finds the strongest moments with AI clip analysis, reframes to 9:16/1:1/16:9, burns kinetic caption presets, and produces short clips plus social copy.

PRODUCT FACTS you may share:
- Plans: a Free tier (15 processing minutes/month) and paid tiers (Creator, Pro, Studio) billed monthly or yearly.
- Billing: India (billing country IN) pays via Razorpay in INR; other supported countries pay via Paddle in USD. Billing country is chosen/confirmed in Billing -> Country; an active subscription locks its provider.
- Processing minutes: consumed per video processed (transcription-based), reserved at start and settled with the measured duration; failed jobs release the reservation.
- Editor: multi-track timeline with split, ripple delete, duplicate, freeze frame, transitions (17 presets), playback speed, captions (23 styles), filler-word removal, and NLE export to Premiere Pro / Final Cut.
- Support email: vertexdigitals07@gmail.com (humans read this; the assistant cannot access accounts).

HARD RULES:
1. Answer ONLY questions about VireoClip, video clipping workflows, this app's features, and general troubleshooting of the product. For anything else, politely decline and steer back to VireoClip.
2. NEVER invent prices, discounts, plan limits, dates, or policies. If a specific number isn't in the facts above, point to the Pricing/Billing page or the support email.
3. NEVER give legal advice; for policy questions, refer to the Terms and Privacy pages.
4. For account changes, refunds, billing disputes, or data deletion: explain you cannot perform account actions and route to the support email.
5. Be concise (under 150 words unless steps are needed), friendly, and practical. Use short numbered steps for troubleshooting.
6. If a user reports a bug, gather: browser, what they clicked, what happened vs expected — then suggest the support email with those details.`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const supportChat = async (req: Request, res: Response): Promise<void> => {
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  // Sanitize + cap the conversation window
  const messages: ChatMessage[] = rawMessages
    .filter(
      (m: any) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-MAX_MESSAGES)
    .map((m: any) => ({
      role: m.role,
      content: String(m.content).slice(0, MAX_MESSAGE_CHARS),
    }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_CONVERSATION',
      message: 'A non-empty "messages" array ending with a user message is required.',
    });
    return;
  }

  const conversation = messages
    .map((m) => `${m.role === 'user' ? 'Customer' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  try {
    const completion = await Promise.race([
      defaultAiProvider.generateJsonCompletion<{ answer?: string }>({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Conversation so far:\n\n${conversation}\n\nRespond to the customer's latest message as the assistant. Reply with JSON: {"answer": "your reply"}.`,
        temperature: 0.3,
        maxTokens: 600,
        responseFormat: 'json_object',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Support assistant timed out.')), TIMEOUT_MS)
      ),
    ]);

    const answer = String(completion?.answer || '').trim();
    if (!answer) {
      throw new Error('Empty assistant reply.');
    }

    res.status(200).json({
      status: 'ok',
      data: {
        reply: answer.slice(0, 4000),
        escalated: /vertexdigitals07@gmail\.com/.test(answer),
      },
    });
  } catch (err: any) {
    logger.warn(`[SupportChat] Completion failed: ${err?.message || err}`);
    res.status(503).json({
      status: 'error',
      code: 'ASSISTANT_UNAVAILABLE',
      message:
        'The AI assistant is unavailable right now. Email vertexdigitals07@gmail.com and a human will help you.',
    });
  }
};
