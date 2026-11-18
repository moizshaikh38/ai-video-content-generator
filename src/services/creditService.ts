import { backendRequest } from './backendClient';

export interface CreditBalanceSummary {
  wallet_id: string;
  user_id: string;
  workspace_id?: string | null;
  available_credits: number;
  reserved_credits: number;
  consumed_credits: number;
  total_credits: number;
  is_unlimited?: boolean;
}

export interface CreditEstimate {
  operation_id: string;
  estimated_units: number;
  estimated_credits: number;
  available_credits: number;
  has_sufficient_credits: boolean;
  rate_description: string;
  min_charge: number;
  details?: {
    duration_seconds?: number;
    is_reused_transcript?: boolean;
  };
}

export interface PlanEntitlements {
  planId: string;
  displayName: string;
  monthlyCredits: number;
  watermarkRequired: boolean;
  allowedSubtitlePresets: string[];
  features: {
    smartReframe: boolean;
    animatedCaptions: boolean;
    customFonts: boolean;
    priorityQueue: boolean;
    exportSrtVtt: boolean;
    brandTemplates: boolean;
    advancedEditor: boolean;
    multiBrandKits: boolean;
  };
  limits: {
    maxProjects: number;
    maxClipRenders: number;
    maxSocialConnections: number;
    maxScheduledPosts: number;
    maxUploadDurationSeconds: number;
    maxFileSizeBytes: number;
    storageLimitBytes: number;
  };
  isUnlimited: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
}

export interface CreditTransactionRecord {
  id: string;
  wallet_id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  reserved_before: number;
  reserved_after: number;
  operation_id?: string;
  description: string;
  created_at: string;
}

export class CreditService {
  /**
   * Fetches the user's unified credit balance summary.
   */
  public static async getWalletBalance(): Promise<CreditBalanceSummary> {
    const res = await backendRequest<{ status: string; data: CreditBalanceSummary }>('/credits/balance');
    return res.data;
  }

  /**
   * Generates a pre-flight credit estimate for an operation.
   */
  public static async estimateOperation(
    operation: string,
    durationSeconds = 0,
    isReusedTranscript = false
  ): Promise<CreditEstimate> {
    const params = new URLSearchParams();
    params.set('operation', operation);
    if (durationSeconds > 0) {
      params.set('duration_seconds', String(durationSeconds));
    }
    if (isReusedTranscript) {
      params.set('is_reused_transcript', 'true');
    }

    const res = await backendRequest<{ status: string; data: CreditEstimate }>(
      `/credits/estimate?${params.toString()}`
    );
    return res.data;
  }

  /**
   * Resolves canonical PlanEntitlements for the authenticated user.
   */
  public static async getUserEntitlements(): Promise<PlanEntitlements> {
    const res = await backendRequest<{ status: string; data: PlanEntitlements }>('/credits/entitlements');
    return res.data;
  }

  /**
   * Fetches the user's credit ledger transaction history.
   */
  public static async getTransactionHistory(limit = 50): Promise<CreditTransactionRecord[]> {
    const res = await backendRequest<{ status: string; data: CreditTransactionRecord[] }>(
      `/credits/transactions?limit=${limit}`
    );
    return res.data;
  }

  /**
   * Fetches all canonical PlanEntitlements tiers (Free, Creator, Pro, Studio).
   */
  public static async getAllPlans(): Promise<PlanEntitlements[]> {
    const res = await backendRequest<{ status: string; data: PlanEntitlements[] }>('/credits/plans');
    return res.data;
  }
}

