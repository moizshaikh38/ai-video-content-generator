import { Router } from 'express';
import healthRoutes from './healthRoutes.js';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);

export default apiRouter;
