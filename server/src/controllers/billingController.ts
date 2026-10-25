import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AuthenticatedRequest, AppError, BillingProviderName, PlanId, BillingInterval } from '../types/index.js';
import { config, isBillingProviderEnabled } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getPlanDefinition, getAllPlans } from '../services/billing/planConfig.js';
import { BillingRegistry } from '../services/billing/billingRegistry.js';
import { planOffersFor } from '../services/billing/billingCountryService.js';
import { SubscriptionService, BillingOwnershipError } from '../services/subscriptionService.js';
import { UsageService } from '../services/usageService.js';
import { getMongoDb } from '../db/mongoClient.js';
import {
  resolveBillingContext,
  confirmBillingCountry,
} from '../services/billing/billingCountryResolver.js';

/**
 * GET /api/billing/plans
 * Returns available plans and their limits
 */
export async function getPlans(req: Request, res: Response): Promise<void> {
  const plans = getAllPlans();
  const availableProviders = BillingRegistry.getAvailableProviders();

  res.status(200).json({
    status: 'ok',
    data: {
      plans,
      providers: availableProviders,
      defaultProvider: config.billingProviderDefault || 'paddle',
    },
  });
}

/**
 * GET /api/billing/usage
 * Retrieves user's monthly processing usage, limits, and UTC reset date
 */
export async function getBillingUsage(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const usage = await UsageService.getCurrentUsage(userId, req.user?.email);
  res.status(200).json({
    status: 'ok',
    data: usage,
  });
}

/**
 * GET /api/billing/subscription
 * Retrieves active entitlement, plan details, and subscription state
 */
export async function getSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const entitlement = await SubscriptionService.resolveUserEntitlement(userId, req.user?.email);
  const currentPlan = getPlanDefinition(entitlement.plan_id === 'developer' ? 'business' : entitlement.plan_id);

  res.status(200).json({
    status: 'ok',
    data: {
      entitlement,
      plan: currentPlan,
      isUnlimited: entitlement.is_unlimited,
      providers: BillingRegistry.getAvailableProviders(),
    },
  });
}

/**
 * GET /api/billing/context
 * Server-resolved billing context: gateway decision, country source, advisory
 * IP country, conflicts, provider readiness, and gateway-priced plans. The
 * client renders whatever this returns — it never decides the gateway.
 */
export async function getBillingContext(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }
  // req.ip is Express-derived and honors TRUST_PROXY; raw X-Forwarded-For from
  // direct clients never reaches geolocation.
  const resolved = await resolveBillingContext(userId, req.ip);
  res.status(200).json({ status: 'ok', data: resolved.context });
}

/**
 * POST /api/billing/country
 * Stores the customer's selected billing country. A gateway-changing selection
 * against an existing confirmed country or the observed IP returns 409 with the
 * conflict until `confirm_conflict: true` is sent. Active subscriptions lock
 * the provider and reject re-routing outright.
 */
export async function confirmCountry(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  try {
    const result = await confirmBillingCountry(
      userId,
      req.body?.billing_country,
      req.body?.confirm_conflict === true,
      req.ip
    );
    if (!result.ok) {
      res.status(409).json({
        status: 'error',
        code: result.code,
        message: result.message,
        data: { conflict: result.conflict },
      });
      return;
    }
    res.status(200).json({ status: 'ok', data: { country: result.country, context: result.context } });
  } catch (err: any) {
    res.status(err.statusCode || 400).json({
      status: 'error',
      code: err.code || 'COUNTRY_CONFIRM_FAILED',
      message: err.message || 'Could not confirm billing country.',
    });
  }
}

/**
 * POST /api/billing/checkout
 * Creates a real checkout session/subscription with the requested provider
 */
export async function createCheckout(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  const userEmail = req.user?.email;

  if (!userId || !userEmail) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const { planId, interval = 'month', provider: requestedProvider } = req.body;
  if (!planId || !['creator', 'pro', 'studio'].includes(planId)) {
    throw new AppError('Invalid planId. Must be "creator", "pro", or "studio".', 400, 'INVALID_PLAN');
  }

  const selectedInterval: BillingInterval = interval === 'year' ? 'year' : 'month';
  const plan = getPlanDefinition(planId as PlanId);
  if (!plan) {
    throw new AppError(`Plan "${planId}" not found.`, 404, 'PLAN_NOT_FOUND');
  }

  // Provider resolution is SERVER-AUTHORITATIVE (billing spec §3/§4): the
  // customer's billing country (confirmed → subscription-locked → advisory IP
  // geolocation) decides the gateway. The body's `provider` is only accepted
  // when it MATCHES the decision — a client forcing the wrong provider is
  // rejected, never silently honored.
  const resolvedBilling = await resolveBillingContext(userId, req.ip);
  const context = resolvedBilling.context;

  if (context.requiresCountry) {
    throw new AppError(
      'Please select your billing country before starting checkout.',
      412,
      'COUNTRY_REQUIRED'
    );
  }
  if (context.conflict) {
    throw new AppError(
      `Billing country conflict: your confirmed country (${context.country}) routes to ${context.conflict.confirmedProvider}, but your current IP suggests ${context.conflict.ipCountry} (${context.conflict.ipProvider}). Please confirm your billing country in Billing → Country.`,
      409,
      'COUNTRY_CONFLICT'
    );
  }
  if (!context.provider) {
    throw new AppError(context.unsupportedReason || 'Billing is not available for your country.', 403, 'COUNTRY_NOT_SUPPORTED');
  }

  const providerName: BillingProviderName = context.provider;
  if (context.countryLocked) {
    // Existing subscriber: the subscription's provider pins checkout; a
    // mismatched request (e.g. after travel) is rejected, not re-routed.
    if (requestedProvider && requestedProvider !== providerName) {
      throw new AppError(
        `Your active subscription is billed through ${providerName}; checkout cannot be created with ${requestedProvider}.`,
        409,
        'PROVIDER_LOCKED'
      );
    }
  } else if (requestedProvider && requestedProvider !== providerName) {
    throw new AppError(
      `Provider "${requestedProvider}" is not eligible for billing country ${context.country}. Your checkout will be created through ${providerName}.`,
      403,
      'PROVIDER_NOT_ELIGIBLE'
    );
  }
  if (!['paddle', 'razorpay', 'stripe'].includes(providerName)) {
    throw new AppError(`Unsupported billing provider "${providerName}".`, 400, 'INVALID_PROVIDER');
  }

  const provider = BillingRegistry.getProvider(providerName);
  if (!isBillingProviderEnabled(providerName)) {
    throw new AppError(
      `Payment provider "${providerName}" is disabled on the server.`,
      503,
      'PROVIDER_DISABLED'
    );
  }
  if (!provider.isConfigured()) {
    throw new AppError(
      `Payment provider "${providerName}" is not configured on the server. Please check environment variables.`,
      503,
      'PROVIDER_NOT_CONFIGURED'
    );
  }

  // Only prices that exist in the provider's configuration can be bought.
  const offer = planOffersFor(providerName).find((o) => o.id === planId);
  if (!offer || !offer.prices[selectedInterval].available) {
    throw new AppError(
      `The ${plan.display_name} plan isn't available for ${selectedInterval === 'year' ? 'yearly' : 'monthly'} billing in your country yet.`,
      409,
      'PRICE_NOT_AVAILABLE'
    );
  }

  // One paid subscription per customer: plan changes go through manage/cancel, never a second checkout.
  const blocking = await SubscriptionService.findBlockingSubscription(userId);
  if (blocking) {
    throw new AppError(
      `You already have an active ${getPlanDefinition(blocking.plan_id)?.display_name || blocking.plan_id} subscription. Manage or cancel it before starting a new one.`,
      409,
      'ALREADY_SUBSCRIBED'
    );
  }

  const successUrl = `${config.appUrl}/billing?success=true&provider=${providerName}`;
  const cancelUrl = `${config.appUrl}/billing?canceled=true&provider=${providerName}`;

  const checkoutResult = await provider.createCheckout({
    userId,
    userEmail,
    planId: planId as PlanId,
    interval: selectedInterval,
    successUrl,
    cancelUrl,
  });

  // Bind the provider reference to this user so webhooks can't be attributed to anyone else.
  const providerRef = checkoutResult.subscriptionId || checkoutResult.transactionId;
  if (providerRef) {
    await SubscriptionService.recordPendingCheckout({
      user_id: userId,
      provider: providerName,
      provider_ref: providerRef,
      plan_id: planId as PlanId,
      billing_interval: selectedInterval,
      billing_country: context.country as string,
    });
  }

  logger.info(`[Billing] Created checkout for user ${userId} on plan ${planId} (${selectedInterval}) via ${providerName}`);

  res.status(200).json({
    status: 'ok',
    data: checkoutResult,
  });
}

/**
 * POST /api/billing/cancel
 * Cancels user's active paid subscription with the provider
 */
export async function cancelSubscription(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const db = await getMongoDb();
  const subCol = db.collection<any>('subscriptions');
  const activeSub = await subCol.findOne({
    user_id: userId,
    status: { $in: ['active', 'trialing', 'past_due'] },
  });

  if (!activeSub || !activeSub.provider_subscription_id) {
    throw new AppError('No active subscription found to cancel.', 404, 'SUBSCRIPTION_NOT_FOUND');
  }
  if (activeSub.provider !== 'paddle' && activeSub.provider !== 'razorpay') {
    throw new AppError(
      'This subscription was created with a payment provider we no longer use. Please contact support to change or cancel it.',
      409,
      'LEGACY_PROVIDER'
    );
  }

  const provider = BillingRegistry.getProvider(activeSub.provider);
  const cancelResult = await provider.cancelSubscription(activeSub.provider_subscription_id);

  // Update local subscription record
  await subCol.updateOne(
    { id: activeSub.id },
    {
      $set: {
        cancel_at_period_end: cancelResult.cancelAtPeriodEnd,
        status: cancelResult.status,
        canceled_at: cancelResult.canceledAt || new Date(),
        updated_at: new Date(),
      },
    }
  );

  logger.info(`[Billing] User ${userId} canceled subscription ${activeSub.provider_subscription_id} on ${activeSub.provider}`);

  res.status(200).json({
    status: 'ok',
    data: cancelResult,
  });
}

/**
 * POST /api/billing/portal
 * Generates customer portal or management session URL
 */
export async function createBillingPortalSession(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const db = await getMongoDb();
  const sub = await db.collection<any>('subscriptions').findOne({ user_id: userId }, { sort: { updated_at: -1 } });

  // Razorpay has no hosted customer portal: the Billing page offers cancel instead.
  if (!sub || sub.provider !== 'paddle') {
    throw new AppError(
      'A hosted billing portal is only available for subscriptions billed through Paddle.',
      409,
      'PORTAL_UNAVAILABLE'
    );
  }

  const provider = BillingRegistry.getProvider('paddle');
  if (!provider.createCustomerPortal || !provider.isConfigured()) {
    throw new AppError('The Paddle billing portal is not configured on the server.', 503, 'PROVIDER_NOT_CONFIGURED');
  }
  const customerId = sub.provider_customer_id
    || (await db.collection<any>('billing_customers').findOne({ user_id: userId, provider: 'paddle' }))?.provider_customer_id;

  try {
    const portal = await provider.createCustomerPortal(customerId || '', `${config.appUrl}/billing`, [sub.provider_subscription_id].filter(Boolean));
    res.status(200).json({ status: 'ok', data: portal });
  } catch (err: any) {
    logger.warn(`[Billing] Paddle portal session failed for user ${userId}: ${err?.message}`);
    throw new AppError('Could not open the Paddle billing portal. Please try again shortly.', 502, 'PORTAL_FAILED');
  }
}

/**
 * GET /api/billing/invoices
 * Lists user's billing invoices
 */
export async function getInvoices(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    throw new AppError('Authentication required.', 401, 'AUTH_REQUIRED');
  }

  const invoices = await SubscriptionService.getUserInvoices(userId);
  res.status(200).json({
    status: 'ok',
    data: {
      invoices,
    },
  });
}

/**
 * Generic webhook event processor with signature verification, idempotency, and normalization
 */
async function processWebhook(
  providerName: BillingProviderName,
  req: Request,
  res: Response
): Promise<void> {
  if (!isBillingProviderEnabled(providerName)) {
    logger.warn(`[${providerName} Webhook] Received webhook for disabled provider.`);
    res.status(403).send(`Provider "${providerName}" is disabled.`);
    return;
  }

  const provider = BillingRegistry.getProvider(providerName);
  const rawBody = req.body; // Captured Buffer or string from express.raw()

  if (!rawBody || (typeof rawBody !== 'string' && !Buffer.isBuffer(rawBody))) {
    logger.warn(`[${providerName} Webhook] Missing or invalid raw body.`);
    res.status(400).send('Invalid request payload.');
    return;
  }

  // 1. Signature Verification
  const isValid = await provider.verifyWebhook(rawBody, req.headers as any);
  if (!isValid) {
    logger.warn(`[${providerName} Webhook] Signature verification failed.`);
    res.status(400).send('Invalid webhook signature.');
    return;
  }

  // 2. Event Normalization
  const event = await provider.normalizeWebhook(rawBody, req.headers as any);
  if (!event) {
    logger.info(`[${providerName} Webhook] Unhandled or unmapped event payload.`);
    res.status(200).json({ received: true, ignored: true });
    return;
  }

  // 3. Idempotency: atomically claim the event (unique provider+event id). Retries and
  //    concurrent duplicate deliveries of an already-claimed event are acknowledged as no-ops.
  //    (isEventAlreadyProcessed remains the read-only check used elsewhere.)
  const claimed = await SubscriptionService.claimEvent(providerName, event.eventId);
  if (!claimed) {
    logger.info(`[${providerName} Webhook] Duplicate event ${event.eventId} already processed.`);
    res.status(200).json({ received: true, idempotent: true });
    return;
  }

  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event.rawPayload)).digest('hex');

  // 4. Authoritative Mutation & Persistence
  try {
    await SubscriptionService.processNormalizedEvent(event);
    await SubscriptionService.recordEvent(providerName, event.eventId, event.rawEventType, 'processed', payloadHash);
    logger.info(`[${providerName} Webhook] Successfully processed event ${event.eventId} (${event.eventType})`);
    res.status(200).json({ received: true });
  } catch (err: any) {
    if (err instanceof BillingOwnershipError) {
      // Signed by the provider but bound to another account: record it, change nothing, don't retry.
      logger.error(`[${providerName} Webhook] ${err.message}`);
      await SubscriptionService.recordEvent(providerName, event.eventId, event.rawEventType, 'ignored', payloadHash, err.code, err.message);
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    logger.error(`[${providerName} Webhook] Failed to process event ${event.eventId}:`, err);
    await SubscriptionService.recordEvent(
      providerName,
      event.eventId,
      event.rawEventType,
      'failed',
      payloadHash,
      err.code || 'PROCESS_FAILED',
      err.message
    );
    res.status(500).json({ error: 'Failed to process webhook event.' });
  }
}

/**
 * POST /api/billing/webhooks/paddle
 */
export async function handlePaddleWebhook(req: Request, res: Response): Promise<void> {
  await processWebhook('paddle', req, res);
}

/**
 * POST /api/billing/webhooks/razorpay
 */
export async function handleRazorpayWebhook(req: Request, res: Response): Promise<void> {
  await processWebhook('razorpay', req, res);
}

