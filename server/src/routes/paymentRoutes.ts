import { Router } from 'express';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * Razorpay Standard Web Checkout Endpoints
 * 
 * 1. POST /api/create-order
 *    Initiates an order with Razorpay API (amount in paise, min 100 paise)
 * 
 * 2. POST /api/verify-payment
 *    Verifies Razorpay HMAC-SHA256 signature against RAZORPAY_KEY_SECRET
 */
// Signed-in users only. These verify a one-off Razorpay order signature and never grant a plan —
// subscriptions are activated exclusively by verified webhooks (billingController).
router.post('/create-order', requireAuth, asyncHandler(createOrder));
router.post('/verify-payment', requireAuth, asyncHandler(verifyPayment));

export default router;
