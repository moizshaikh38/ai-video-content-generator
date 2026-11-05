import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  getWalletBalance,
  estimateOperationCost,
  getTransactionHistory,
  getUserEntitlements,
  getAllPlanEntitlements,
} from '../controllers/creditController.js';

const router = Router();

// All credit endpoints require user authentication
router.get('/balance', requireAuth, getWalletBalance);
router.get('/estimate', requireAuth, estimateOperationCost);
router.get('/transactions', requireAuth, getTransactionHistory);
router.get('/entitlements', requireAuth, getUserEntitlements);
router.get('/plans', requireAuth, getAllPlanEntitlements);

export default router;
