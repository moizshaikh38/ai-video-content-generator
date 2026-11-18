import { isSupabaseConfigured } from '../lib/supabase';
import { backendRequest } from './backendClient';

export type PlanId = 'free' | 'creator' | 'pro' | 'studio';
/** Razorpay bills India; Paddle bills every other supported country. */
export type BillingProviderName = 'paddle' | 'razorpay';
export type BillingInterval = 'month' | 'year';

export interface PlanDefinition {
  id: PlanId;
  display_name: string;
  monthly_price: number;
  yearly_price: number;
  inr_monthly_price: number;
  currency: string;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  features: string[];
  is_recommended?: boolean;
}

export interface UserEntitlement {
  plan_id: PlanId | 'developer';
  display_name: string;
  is_unlimited: boolean;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  subscription?: {
    id: string;
    provider?: BillingProviderName;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string;
    billing_interval: BillingInterval;
  } | null;
}

export interface BillingUsage {
  billing_period: string;
  reset_date: string;
  plan_tier: string;
  limit_minutes: number;
  settled_minutes: number;
  reserved_minutes: number;
  total_used_minutes: number;
  remaining_minutes: number;
  is_quota_exceeded: boolean;
  is_unlimited?: boolean;
}

export interface BillingInvoice {
  id: string;
  provider: BillingProviderName;
  provider_invoice_id: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  status: string;
  hosted_invoice_url?: string | null;
  invoice_pdf_url?: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

export interface ProviderOption {
  name: BillingProviderName;
  displayName: string;
  isConfigured: boolean;
}

export interface PlanPrice {
  amount: number;
  currency: 'INR' | 'USD';
  available: boolean;
}

/** A plan as the customer can buy it through their gateway (from GET /billing/context). */
export interface PlanOffer {
  id: PlanId;
  display_name: string;
  monthly_minutes: number;
  max_projects: number;
  max_clip_renders: number;
  max_social_connections: number;
  max_scheduled_posts: number;
  features: string[];
  is_recommended: boolean;
  prices: Record<BillingInterval, PlanPrice>;
}

export interface GatewayConflict {
  confirmedCountry: string;
  ipCountry: string;
  confirmedProvider: BillingProviderName;
  ipProvider: BillingProviderName;
}

/** Server-decided billing context. The browser renders it; it never picks the gateway. */
export interface BillingContext {
  country: string | null;
  countryName: string | null;
  countrySource: 'confirmed' | 'subscription' | 'ip' | 'edge_header' | null;
  ipCountry: string | null;
  ipCountryName: string | null;
  conflict: GatewayConflict | null;
  requiresCountry: boolean;
  countryLocked: boolean;
  provider: BillingProviderName | null;
  providerReady: boolean;
  currency: 'INR' | 'USD' | null;
  unsupportedReason: string | null;
  plans: PlanOffer[];
}

export interface CheckoutResponse {
  provider: BillingProviderName;
  url?: string;
  sessionId?: string;
  transactionId?: string;
  subscriptionId?: string;
  keyId?: string;
  clientToken?: string;
  customData?: Record<string, any>;
}

export class BillingService {
  /**
   * Fetches monthly billing and usage metrics for the authenticated user.
   * Calls GET /api/billing/usage.
   */
  static async getUsage(): Promise<BillingUsage | null> {
    if (!isSupabaseConfigured) {
      if (import.meta.env.DEV) {
        const now = new Date();
        const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        return {
          billing_period: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
          reset_date: nextMonth.toISOString(),
          plan_tier: 'free',
          limit_minutes: 15,
          settled_minutes: 0,
          reserved_minutes: 0,
          total_used_minutes: 0,
          remaining_minutes: 15,
          is_quota_exceeded: false,
          is_unlimited: false,
        };
      }
      return null;
    }

    const json = await backendRequest<{ status: string; data: BillingUsage }>('/billing/usage');
    return json.data;
  }

  /**
   * Fetches all available plans from server.
   * Calls GET /api/billing/plans.
   */
  static async getPlans(): Promise<{
    plans: PlanDefinition[];
    providers: ProviderOption[];
    defaultProvider: BillingProviderName;
  }> {
    const json = await backendRequest<{
      status: string;
      data: {
        plans: PlanDefinition[];
        providers: ProviderOption[];
        defaultProvider: BillingProviderName;
      };
    }>('/billing/plans');
    return json.data;
  }

  /**
   * Fetches user subscription details and active entitlement.
   * Calls GET /api/billing/subscription.
   */
  static async getSubscription(): Promise<{
    entitlement: UserEntitlement;
    plan: PlanDefinition;
    isUnlimited: boolean;
    providers: ProviderOption[];
  }> {
    const json = await backendRequest<{
      status: string;
      data: {
        entitlement: UserEntitlement;
        plan: PlanDefinition;
        isUnlimited: boolean;
        providers: ProviderOption[];
      };
    }>('/billing/subscription');
    return json.data;
  }

  /**
   * Creates a checkout session with the SERVER-DECIDED provider. The billing
   * country (confirmed → subscription-locked → server IP geolocation) routes
   * the gateway; no provider is sent from the browser.
   * Calls POST /api/billing/checkout.
   */
  static async createCheckout(
    planId: 'creator' | 'pro' | 'studio',
    interval: BillingInterval = 'month'
  ): Promise<CheckoutResponse> {
    const json = await backendRequest<{ status: string; data: CheckoutResponse }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId, interval }),
    });
    return json.data;
  }

  /**
   * Server-resolved billing context: gateway decision, country source,
   * advisory IP country, conflicts, and gateway-priced plans.
   * Calls GET /api/billing/context.
   */
  static async getBillingContext(): Promise<BillingContext> {
    const json = await backendRequest<{ status: string; data: BillingContext }>('/billing/context');
    return json.data;
  }

  /**
   * Stores the customer's selected billing country. Returns 409 with a
   * conflict payload when the switch changes gateways until confirmConflict=true.
   * Calls POST /api/billing/country.
   */
  static async confirmBillingCountry(
    billingCountry: string,
    confirmConflict = false
  ): Promise<{ ok: true; data: { country: string; context: BillingContext } } | { ok: false; conflict: GatewayConflict | null; message: string }> {
    try {
      const json = await backendRequest<{ status: string; data: { country: string; context: BillingContext } }>('/billing/country', {
        method: 'POST',
        body: JSON.stringify({ billing_country: billingCountry, confirm_conflict: confirmConflict }),
      });
      return { ok: true, data: json.data };
    } catch (err: any) {
      if (err.status === 409) {
        // backendRequest copies the response body onto the error, so `data` here is the payload's data.
        return { ok: false, conflict: err.data?.conflict ?? null, message: err.message };
      }
      throw err;
    }
  }

  /**
   * Cancels active paid subscription.
   * Calls POST /api/billing/cancel.
   */
  static async cancelSubscription(): Promise<{ status: string; data: any }> {
    return backendRequest<{ status: string; data: any }>('/billing/cancel', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  /**
   * Generates a Customer Portal URL or management link.
   * Calls POST /api/billing/portal.
   */
  static async createPortal(): Promise<{ url: string }> {
    const json = await backendRequest<{ status: string; data: { url: string } }>('/billing/portal', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    return json.data;
  }

  /**
   * Retrieves past invoices.
   * Calls GET /api/billing/invoices.
   */
  static async getInvoices(): Promise<BillingInvoice[]> {
    const json = await backendRequest<{ status: string; data: { invoices: BillingInvoice[] } }>('/billing/invoices');
    return json.data.invoices;
  }
}
