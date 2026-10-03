import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
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
router.get('/projects', requireAuth, listProjects);
router.post('/projects', requireAuth, createProject);
router.get('/projects/:id', requireAuth, getProject);
router.delete('/projects/:id', requireAuth, deleteProject);
router.post('/projects/:id/process', requireAuth, processProject);
router.get('/projects/:id/transcript', requireAuth, getProjectTranscript);

// Content Generation Routes
router.post('/projects/:id/generate-content', requireAuth, generateProjectContent);
router.get('/projects/:id/content', requireAuth, getProjectContent);
router.patch('/projects/:id/content/:outputId', requireAuth, updateProjectContent);

export default router;
