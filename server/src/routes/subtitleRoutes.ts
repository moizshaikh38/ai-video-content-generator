import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { SubtitleController } from '../controllers/subtitleController.js';

const router = Router();

// Subtitle Studio Project Management
router.post('/projects', requireAuth, asyncHandler(SubtitleController.createProject));
router.get('/projects', requireAuth, asyncHandler(SubtitleController.listProjects));
router.get('/projects/:id', requireAuth, asyncHandler(SubtitleController.getProject));
router.get('/projects/:id/cost-estimate', requireAuth, asyncHandler(SubtitleController.estimateCost));

// Subtitle Transcription & Editing
router.post('/projects/:id/transcribe', requireAuth, expensiveLimiter, asyncHandler(SubtitleController.transcribeProject));
router.patch('/projects/:id/cues', requireAuth, asyncHandler(SubtitleController.updateCues));
router.patch('/projects/:id/style', requireAuth, asyncHandler(SubtitleController.updateStyle));

// Subtitle Exports
router.post('/projects/:id/export/burn', requireAuth, expensiveLimiter, asyncHandler(SubtitleController.exportBurn));
router.get('/projects/:id/export/burn-status', requireAuth, asyncHandler(SubtitleController.getBurnStatus));
router.get('/projects/:id/export/srt', requireAuth, asyncHandler(SubtitleController.exportSRT));
router.get('/projects/:id/export/vtt', requireAuth, asyncHandler(SubtitleController.exportVTT));

export default router;

