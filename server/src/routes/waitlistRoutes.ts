import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { joinWaitlist, leaveWaitlist, leaveWaitlistPage } from '../controllers/waitlistController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

// Public capture endpoint: strict per-IP limit (defaults 10 joins+leaves per
// 10 minutes). Configurable for isolated qualification runs.
export function makeWaitlistLimiter(max = Number(process.env.WAITLIST_RATE_MAX) || 10, windowMs = Number(process.env.WAITLIST_RATE_WINDOW_MS) || 10 * 60 * 1000) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => ipKeyGenerator(req.ip || req.socket.remoteAddress || '127.0.0.1'),
    validate: { keyGeneratorIpFallback: false },
    standardHeaders: true,
    legacyHeaders: false,
    message: { status: 'error', code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
  });
}

const router = Router();

// POST /api/waitlist (public landing capture, no auth).
// /waitlist/leave requires the signed suppression token that the confirmation
// mail carries (utils/waitlistMail.verifySuppressionToken); bare email-only
// suppression is rejected with WAITLIST_INVALID_TOKEN.
router.post('/waitlist', makeWaitlistLimiter(), asyncHandler(joinWaitlist));
// GET is the scanner-safe landing page the confirmation mail links to; the
// actual suppression only ever happens through the POST below.
router.get('/waitlist/leave', makeWaitlistLimiter(), asyncHandler(leaveWaitlistPage));
router.post('/waitlist/leave', makeWaitlistLimiter(), asyncHandler(leaveWaitlist));

export default router;
