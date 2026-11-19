import { Response } from 'express';
import { AuthenticatedRequest, PlanId } from '../types/index.js';
import { CreditWalletService } from '../services/creditWalletService.js';
import { EntitlementService } from '../services/entitlementService.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/credits/balance
 * Returns the authenticated user's wallet balance summary
 */
export const getWalletBalance = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  try {
    const summary = await CreditWalletService.getWalletSummary(userId, req.user?.email);
    res.status(200).json({
      status: 'ok',
      data: summary,
    });
  } catch (err: any) {
    logger.error('Failed to get credit balance', { userId, error: err.message });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/credits/estimate
 * Returns server-authoritative cost estimate for an operation
 */
export const estimateOperationCost = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  const operationId = String(req.query.operation || req.query.operation_id || 'core_video_processing');
  const durationSeconds = Number(req.query.duration_seconds || req.query.duration || 0);
  const isReusedTranscript = req.query.is_reused_transcript === 'true';

  try {
    const estimate = await CreditWalletService.estimateCost(
      userId,
      operationId,
      { durationSeconds, isReusedTranscript },
      req.user?.email
    );

    res.status(200).json({
      status: 'ok',
      data: estimate,
    });
  } catch (err: any) {
    logger.error('Failed to estimate credit cost', { userId, operationId, error: err.message });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/credits/transactions
 * Returns the authenticated user's credit transaction history
 */
export const getTransactionHistory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));

  try {
    const history = await CreditWalletService.getTransactionHistory(userId, limit);
    res.status(200).json({
      status: 'ok',
      data: history,
    });
  } catch (err: any) {
    logger.error('Failed to get credit transactions', { userId, error: err.message });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/credits/entitlements
 * Returns the authenticated user's canonical PlanEntitlements
 */
export const getUserEntitlements = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ status: 'error', code: 'AUTH_REQUIRED', message: 'User not authenticated.' });
    return;
  }

  try {
    const entitlements = await EntitlementService.resolveUserEntitlements(userId, req.user?.email);
    res.status(200).json({
      status: 'ok',
      data: entitlements,
    });
  } catch (err: any) {
    logger.error('Failed to get plan entitlements', { userId, error: err.message });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};

/**
 * GET /api/credits/plans
 * Returns canonical PlanEntitlements definitions for all supported tiers
 */
export const getAllPlanEntitlements = async (
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const tiers: PlanId[] = ['free', 'creator', 'pro', 'studio'];
    const plans = tiers.map((tier) => EntitlementService.getPlanEntitlements(tier));
    res.status(200).json({
      status: 'ok',
      data: plans,
    });
  } catch (err: any) {
    logger.error('Failed to get plan definitions', { error: err.message });
    res.status(500).json({
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  }
};



