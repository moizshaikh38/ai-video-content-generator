import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  processProject,
  getProjectTranscript,
} from '../controllers/projectController.js';

const router = Router();

// All project routes require authentication
router.get('/projects', requireAuth, listProjects);
router.post('/projects', requireAuth, createProject);
router.get('/projects/:id', requireAuth, getProject);
router.delete('/projects/:id', requireAuth, deleteProject);
router.post('/projects/:id/process', requireAuth, processProject);
router.get('/projects/:id/transcript', requireAuth, getProjectTranscript);

export default router;
