import { Request, Response } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { supabaseAuthClient, isServerSupabaseConfigured } from '../utils/supabase.js';

let razorpayClientInstance: Razorpay | null = null;

/**
 * Returns a configured Razorpay client instance using environment variables.
 */
function getRazorpayClient(): Razorpay {
  const key_id = process.env.RAZORPAY_KEY_ID || config.razorpayKeyId;
  const key_secret = process.env.RAZORPAY_KEY_SECRET || config.razorpayKeySecret;

  if (!key_id || !key_secret) {
    const error: any = new Error('RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is not configured in environment variables.');
    error.statusCode = 401;
    throw error;
  }

  if (!razorpayClientInstance) {
    razorpayClientInstance = new Razorpay({
      key_id,
      key_secret,
    });
  }

  return razorpayClientInstance;
}

/**
 * Optionally extracts authenticated user from Bearer JWT token if provided.
 */
async function extractUserOptional(req: Request): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ') || !isServerSupabaseConfigured) {
    return null;
  }
  const token = authHeader.split(' ')[1]?.trim();
  if (!token) return null;

  try {
    const { data: { user } } = await supabaseAuthClient.auth.getUser(token);
    if (user) {
      return { id: user.id, email: user.email };
    }
  } catch {
    // Ignore optional auth parsing failure
  }
  return null;
}

/**
 * POST /api/create-order
 * 
 * Creates a Razorpay order.
 * Expected body: { amount (paise), currency (optional, default 'INR'), receipt (optional), notes (optional) }
 * Minimum amount: 100 paise.
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  const { amount, currency = 'INR', receipt, notes = {} } = req.body || {};

  // Validate amount
  const parsedAmount = Number(amount);
  if (!amount || isNaN(parsedAmount) || parsedAmount < 100) {
    res.status(400).json({
      status: 'error',
      code: 'INVALID_AMOUNT',
      message: 'Invalid amount: minimum order amount must be at least 100 paise (1 INR).',
    });
    return;
  }

  const keyId = process.env.RAZORPAY_KEY_ID || config.razorpayKeyId;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || config.razorpayKeySecret;

  if (!keyId || !keySecret) {
    logger.error('Razorpay credentials missing in environment.');
    res.status(401).json({
      status: 'error',
      code: 'AUTH_FAILED',
      message: 'Payment authentication failed: Razorpay credentials are not configured.',
    });
    return;
  }

  try {
    const client = getRazorpayClient();
    const user = await extractUserOptional(req);

    const orderReceipt = receipt || `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderNotes = {
      ...notes,
      ...(user ? { userId: user.id, userEmail: user.email } : {}),
      source: 'vireoclip_standard_checkout',
    };

    const order = await client.orders.create({
      amount: Math.round(parsedAmount),
      currency: String(currency).toUpperCase(),
      receipt: orderReceipt,
      notes: orderNotes,
    });

    logger.info('Razorpay order created successfully', {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });

    res.status(200).json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: keyId,
    });
  } catch (err: any) {
    logger.error('Failed to create Razorpay order', {
      error: err?.message || String(err),
      statusCode: err?.statusCode || err?.status,
    });

    // Handle authentication / permission failure (401)
    if (err.statusCode === 401 || err.status === 401 || (err.message && err.message.toLowerCase().includes('auth'))) {
      res.status(401).json({
        status: 'error',
        code: 'AUTH_FAILED',
        message: err.message || 'Razorpay authentication failed: Invalid API credentials.',
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      code: 'ORDER_CREATION_FAILED',
      message: err?.message || 'Failed to create payment order with Razorpay.',
    });
  }
}

/**
 * POST /api/verify-payment
 * 
 * Verifies Razorpay payment signature using HMAC-SHA256.
 * Expected body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * (also accepts { order_id, payment_id, signature })
 */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const order_id = req.body.razorpay_order_id || req.body.order_id;
  const payment_id = req.body.razorpay_payment_id || req.body.payment_id;
  const signature = req.body.razorpay_signature || req.body.signature;

  // Validate missing fields
  if (!order_id || !payment_id || !signature) {
    res.status(400).json({
      status: 'error',
      code: 'MISSING_FIELDS',
      message: 'Missing required payment verification fields. Both order_id, payment_id, and signature are required.',
    });
    return;
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET || config.razorpayKeySecret;
  if (!keySecret) {
    logger.error('RAZORPAY_KEY_SECRET is not configured on the server.');
    res.status(500).json({
      status: 'error',
      code: 'CONFIGURATION_ERROR',
      message: 'Server configuration error: payment secret is missing.',
    });
    return;
  }

  try {
    const payload = `${order_id}|${payment_id}`;
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(payload)
      .digest('hex');

    // Constant-time buffer comparison to prevent timing attacks
    let isMatch = false;
    const expectedBuf = Buffer.from(generatedSignature, 'utf-8');
    const actualBuf = Buffer.from(String(signature), 'utf-8');

    if (expectedBuf.length === actualBuf.length) {
      isMatch = crypto.timingSafeEqual(expectedBuf, actualBuf);
    }

    if (!isMatch) {
      logger.warn('Razorpay signature mismatch detected. Payment NOT marked as paid.', {
        order_id,
        payment_id,
      });

      res.status(400).json({
        status: 'error',
        success: false,
        code: 'SIGNATURE_MISMATCH',
        message: 'Payment verification failed: Signature mismatch. Payment has not been marked as paid.',
      });
      return;
    }

    logger.info('Razorpay payment verified successfully', {
      order_id,
      payment_id,
    });

    res.status(200).json({
      status: 'ok',
      success: true,
      message: 'Payment signature verified successfully.',
      order_id,
      payment_id,
    });
  } catch (err: any) {
    logger.error('Unexpected error during payment signature verification', {
      error: err?.message || String(err),
    });

    res.status(500).json({
      status: 'error',
      code: 'VERIFICATION_ERROR',
      message: 'An unexpected error occurred during payment verification.',
    });
  }
}
