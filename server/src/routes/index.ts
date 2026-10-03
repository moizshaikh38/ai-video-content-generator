import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import projectRoutes from './projectRoutes.js';
import billingRoutes from './billingRoutes.js';

const apiRouter = Router();

apiRouter.use('/', healthRoutes);
apiRouter.use('/', authRoutes);
apiRouter.use('/', projectRoutes);
apiRouter.use('/billing', billingRoutes);

export default apiRouter;
