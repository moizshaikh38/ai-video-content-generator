import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { expensiveLimiter } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  processProject,
  getProjectTranscript,
  generateProjectContent,
  getProjectContent,
  updateProjectContent,
} from '../controllers/projectController.js';
import {
  analyzeProjectClips,
  getProjectClipCandidates,
  updateProjectClipCandidate,
} from '../controllers/clipController.js';

const router = Router();

// All project routes require authentication
router.get('/projects', requireAuth, asyncHandler(listProjects));
router.post('/projects', requireAuth, asyncHandler(createProject));
router.get('/projects/:id', requireAuth, asyncHandler(getProject));
router.delete('/projects/:id', requireAuth, asyncHandler(deleteProject));
router.post('/projects/:id/process', requireAuth, expensiveLimiter, asyncHandler(processProject));
router.get('/projects/:id/transcript', requireAuth, asyncHandler(getProjectTranscript));

// Phase 10: AI Auto Clip Finder Routes
router.post('/projects/:id/analyze-clips', requireAuth, expensiveLimiter, asyncHandler(analyzeProjectClips));
router.get('/projects/:id/clip-candidates', requireAuth, asyncHandler(getProjectClipCandidates));
router.patch('/projects/:id/clip-candidates/:candidateId', requireAuth, asyncHandler(updateProjectClipCandidate));

// Content Generation Routes
router.post('/projects/:id/generate-content', requireAuth, expensiveLimiter, asyncHandler(generateProjectContent));
router.get('/projects/:id/content', requireAuth, asyncHandler(getProjectContent));
router.patch('/projects/:id/content/:outputId', requireAuth, asyncHandler(updateProjectContent));

export default router;

