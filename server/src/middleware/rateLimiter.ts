import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request } from 'express';

/**
 * Rate-limit key. IP-based: the limiter runs BEFORE authentication, so keying
 * on an unverified JWT `sub` claim would let attackers mint random tokens and
 * get a fresh bucket per request (brute-force bypass). express derives req.ip
 * from the socket unless TRUST_PROXY is enabled and a proxy header is present.
 */
function resolveRateLimitKey(req: Request): string {
  return ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1');
}

/**
 * General API rate limiter: reasonable limit for normal read/write endpoints.
 * 300 requests per minute per user/IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  keyGenerator: resolveRateLimitKey,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again shortly.',
  },
});

/**
 * Expensive operations rate limiter: processing, transcription, content generation.
 * 15 requests per minute per user/IP for paid AI operations.
 */
export const expensiveLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  keyGenerator: resolveRateLimitKey,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many processing requests. Please wait before trying again.',
  },
});

/**
 * Auth-adjacent rate limiter: login/signup attempts.
 * 30 requests per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many authentication attempts. Please try again later.',
  },
});

/**
 * Webhook rate limiter: generous limits to avoid blocking legitimate payment provider retries
 * 120 requests per minute per IP.
 */
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many webhook requests.',
  },
});

/**
 * Admin rate limiter: scoped by admin user ID, safeguarding owner diagnostics
 * 120 requests per minute.
 */
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  keyGenerator: resolveRateLimitKey,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many admin console requests. Please wait a moment.',
  },
});

/**
 * AI support assistant limiter: generous enough for real troubleshooting,
 * tight enough to protect the LLM budget. 10 conversations/min per IP.
 */
export const supportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: resolveRateLimitKey,
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 'RATE_LIMITED',
    message: 'Too many support questions in a minute. Please wait a moment or email us.',
  },
});
