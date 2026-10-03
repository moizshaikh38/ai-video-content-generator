import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
} from '../controllers/projectController.js';

const router = Router();

// All project routes require authentication
router.get('/projects', requireAuth, listProjects);
router.post('/projects', requireAuth, createProject);
router.get('/projects/:id', requireAuth, getProject);
router.delete('/projects/:id', requireAuth, deleteProject);

export default router;
