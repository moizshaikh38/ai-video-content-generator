// ── Unified Credit System Types ─────────────────────────────────────

export type CreditWalletStatus = 'active' | 'suspended' | 'frozen';

export interface CreditWalletRecord {
  id: string; // UUID
  user_id: string; // UUID
  workspace_id?: string | null;
  available_credits: number;
  reserved_credits: number;
  lifetime_granted: number;
  lifetime_consumed: number;
  period_granted: number;
  period_consumed: number;
  billing_period: string; // e.g. '2026-11'
  reset_date: string; // ISO string
  status: CreditWalletStatus;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export type CreditTransactionType =
  | 'monthly_grant'
  | 'reservation'
  | 'consumption'
  | 'reservation_release'
  | 'refund'
  | 'manual_adjustment'
  | 'credit_purchase'
  | 'expiration';

export interface CreditTransactionRecord {
  id: string; // UUID
  wallet_id: string; // UUID
  user_id: string; // UUID
  workspace_id?: string | null;
  type: CreditTransactionType;
  amount: number; // Delta (positive for grants/refunds, negative for consumption)
  balance_before: number; // Available credits before
  balance_after: number; // Available credits after
  reserved_before: number; // Reserved credits before
  reserved_after: number; // Reserved credits after
  operation_id?: string;
  reference_id?: string;
  reservation_id?: string;
  idempotency_key: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export type CreditReservationStatus = 'reserved' | 'settled' | 'released' | 'expired';

export interface CreditReservationRecord {
  id: string; // UUID
  wallet_id: string; // UUID
  user_id: string; // UUID
  workspace_id?: string | null;
  attempt_id: string;
  operation_id: string;
  amount: number; // Amount reserved
  settled_amount?: number; // Final amount settled (can be <= amount)
  status: CreditReservationStatus;
  expires_at: Date;
  metadata?: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CreditEstimate {
  operation_id: string;
  estimated_units: number;
  estimated_credits: number;
  available_credits: number;
  has_sufficient_credits: boolean;
  min_charge?: number;
  rate_description?: string;
  details?: Record<string, unknown>;
}

export interface CreditBalanceSummary {
  wallet_id: string;
  user_id: string;
  workspace_id?: string | null;
  available_credits: number;
  reserved_credits: number;
  total_balance: number; // available + reserved
  period_granted: number;
  period_consumed: number;
  billing_period: string;
  reset_date: string;
  status: CreditWalletStatus;
  is_unlimited?: boolean;
}

// ── Central Plan Entitlements Types ──────────────────────────────────

export interface PlanFeatures {
  smartReframe: boolean;
  animatedCaptions: boolean;
  customFonts: boolean;
  priorityQueue: boolean;
  exportSrtVtt: boolean;
  brandTemplates: boolean;
  advancedEditor: boolean;
  multiBrandKits: boolean;
}

export interface PlanLimits {
  maxProjects: number;
  maxClipRenders: number;
  maxSocialConnections: number;
  maxScheduledPosts: number;
  maxUploadDurationSeconds: number;
  maxFileSizeBytes: number;
  storageLimitBytes: number;
}

export interface PlanEntitlements {
  planId: 'free' | 'creator' | 'pro' | 'studio' | 'developer';
  displayName: string;
  monthlyCredits: number;
  watermarkRequired: boolean;
  allowedSubtitlePresets: string[];
  features: PlanFeatures;
  limits: PlanLimits;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  isGracePeriod?: boolean;
  isCanceledActive?: boolean;
  isUnlimited?: boolean;
  subscription?: {
    id: string;
    provider: string;
    status: string;
    cancel_at_period_end: boolean;
    current_period_end: string;
    billing_interval: string;
  } | null;
}


