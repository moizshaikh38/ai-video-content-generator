import { config } from '../config/index.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { TwitchImportService } from '../services/twitchImportService.js';
const router = Router();
router.use(generalLimiter);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); next(); });
router.get('/twitch/status', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => { res.json({ status: 'ok', data: await TwitchImportService.status(req.user!.id) }); }));
router.post('/twitch/connect', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => { res.json({ status: 'ok', data: await TwitchImportService.begin(req.user!.id) }); }));
router.post('/twitch/disconnect', requireAuth, asyncHandler(async (req: AuthenticatedRequest, res) => { res.json({ status: 'ok', data: await TwitchImportService.disconnect(req.user!.id) }); }));
// Callback returns no token, account identity or user-controlled redirect.
router.get('/twitch/callback', asyncHandler(async (req: AuthenticatedRequest, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
        await TwitchImportService.finish(typeof req.query.state === 'string' ? req.query.state : '', typeof req.query.code === 'string' ? req.query.code : undefined, typeof req.query.error === 'string');
        res.redirect(new URL('/dashboard?import_connection=twitch', config.appUrl).toString());
    }
    catch {
        res.status(400).type('text/plain').send('Twitch connection was not completed. Return to VireoClip and try again.');
    }
}));
export default router;
