import { Router } from 'express';
import { createOrder, verifyPayment } from '../controllers/paymentController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

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
router.post('/create-order', asyncHandler(createOrder));
router.post('/verify-payment', asyncHandler(verifyPayment));

export default router;
