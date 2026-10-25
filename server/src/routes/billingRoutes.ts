import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { webhookLimiter } from '../middleware/rateLimiter.js';
import {
  getPlans,
  getBillingContext,
  confirmCountry,
  getBillingUsage,
  getSubscription,
  createCheckout,
  cancelSubscription,
  createBillingPortalSession,
  getInvoices,
  handlePaddleWebhook,
  handleRazorpayWebhook,
} from '../controllers/billingController.js';

const router = Router();

// Public: View plans and available providers
router.get('/plans', asyncHandler(getPlans));

// Webhooks: Unauthenticated endpoints verified strictly via cryptographic signatures with dedicated webhook rate limiter
router.post('/webhooks/paddle', webhookLimiter, asyncHandler(handlePaddleWebhook));
router.post('/webhooks/razorpay', webhookLimiter, asyncHandler(handleRazorpayWebhook));

// Authenticated billing routes
router.get('/context', requireAuth, asyncHandler(getBillingContext));
router.post('/country', requireAuth, asyncHandler(confirmCountry));
router.get('/usage', requireAuth, asyncHandler(getBillingUsage));
router.get('/subscription', requireAuth, asyncHandler(getSubscription));
router.post('/checkout', requireAuth, asyncHandler(createCheckout));
router.post('/cancel', requireAuth, asyncHandler(cancelSubscription));
router.post('/portal', requireAuth, asyncHandler(createBillingPortalSession));
router.get('/invoices', requireAuth, asyncHandler(getInvoices));

export default router;
