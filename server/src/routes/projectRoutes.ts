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

const router = Router();

// All project routes require authentication
router.get('/projects', requireAuth, asyncHandler(listProjects));
router.post('/projects', requireAuth, asyncHandler(createProject));
router.get('/projects/:id', requireAuth, asyncHandler(getProject));
router.delete('/projects/:id', requireAuth, asyncHandler(deleteProject));
router.post('/projects/:id/process', requireAuth, expensiveLimiter, asyncHandler(processProject));
router.get('/projects/:id/transcript', requireAuth, asyncHandler(getProjectTranscript));

// Content Generation Routes
router.post('/projects/:id/generate-content', requireAuth, expensiveLimiter, asyncHandler(generateProjectContent));
router.get('/projects/:id/content', requireAuth, asyncHandler(getProjectContent));
router.patch('/projects/:id/content/:outputId', requireAuth, asyncHandler(updateProjectContent));

export default router;
