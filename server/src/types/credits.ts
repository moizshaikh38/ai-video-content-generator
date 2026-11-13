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
  | 'consumption_partial'
  | 'reservation_release'
  | 'refund'
  | 'manual_adjustment'
  | 'manual_adjustment_positive'
  | 'manual_adjustment_negative'
  | 'credit_purchase'
  | 'expiration'
  | 'credit_expiry';

export interface CreditTransactionRecord {
  id: string; // UUID
  wallet_id: string; // UUID
  user_id: string; // UUID
  workspace_id?: string | null;
  type: CreditTransactionType;
  amount: number; // Net total equity change (available_delta + reserved_delta)
  balance_before: number; // Available credits before
  balance_after: number; // Available credits after
  reserved_before: number; // Reserved credits before
  reserved_after: number; // Reserved credits after
  // Phase 4B.3 Signed 5-Delta Accounting Model
  available_delta?: number;
  reserved_delta?: number;
  lifetime_granted_delta?: number;
  lifetime_consumed_delta?: number;
  net_adjustments_delta?: number;
  operation_id?: string;
  reference_id?: string;
  reservation_id?: string;
  attempt_id?: string;
  idempotency_key: string;
  description: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

export type CreditReservationStatus =
  | 'active'
  | 'reserved'
  | 'recovering'
  | 'settled'
  | 'released'
  | 'refunded'
  | 'expired'
  | 'reconciliation_required';

export interface CreditReservationRecord {
  _id?: string; // Canonical: "${user_id}:${attempt_id}"
  id: string; // UUID
  wallet_id: string; // UUID
  user_id: string; // UUID
  workspace_id?: string | null;
  attempt_id: string;
  operation_id: string;
  amount: number; // Amount reserved
  settled_amount?: number | null; // Final amount settled (can be <= amount)
  refunded_amount?: number | null; // Returned unused portion or full refund
  status: CreditReservationStatus;
  expires_at: Date; // Worker lease / heartbeat expiry
  // Phase 4B.3 Fencing & Ownership Separation
  worker_id?: string | null;
  worker_fencing_token?: number;
  worker_leased_until?: Date;
  heartbeat_at?: Date;
  hard_deadline_at?: Date;
  recovery_worker_id?: string | null;
  recovery_fencing_token?: number;
  recovery_claimed_at?: Date | null;
  reconciliation_reason?: string;
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

// ── Phase 4B.3 Transactional Outbox Types ─────────────────────────────

export type OutboxEventStatus =
  | 'pending'
  | 'claimed_for_dispatch'
  | 'claimed_by_worker'
  | 'completed'
  | 'dead_letter';

export interface OutboxEventRecord {
  _id: string; // "${user_id}:${operation_id}:outbox"
  event_type: string;
  aggregate_type: string;
  aggregate_id: string; // attempt_id or reservation_id
  user_id: string;
  payload: Record<string, unknown>;
  status: OutboxEventStatus;
  // Dispatcher Ownership
  dispatcher_id?: string | null;
  dispatcher_claim_token?: string | null;
  dispatcher_claimed_at?: Date | null;
  dispatcher_leased_until?: Date | null;
  // Execution-Worker Ownership
  worker_id?: string | null;
  worker_claim_token?: string | null;
  worker_claimed_at?: Date | null;
  worker_leased_until?: Date | null;
  // Recovery-Sweeper Ownership
  recovery_sweeper_id?: string | null;
  recovery_token?: string | null;
  recovery_claimed_at?: Date | null;
  attempts: number;
  max_attempts: number;
  next_attempt_at: Date;
  last_error?: string | null;
  created_at: Date;
  updated_at: Date;
}

// ── Phase 4B.3 Distributed Concurrency Slot Types ─────────────────────

export type ConcurrencySlotStatus = 'available' | 'reserved_pending_tx' | 'active';

export interface UserConcurrencySlotRecord {
  _id: string; // "${user_id}:slot_${slot_number}"
  user_id: string;
  slot_number: number; // 1 to 20
  status: ConcurrencySlotStatus;
  acquired_by_instance?: string | null;
  attempt_id?: string | null;
  reservation_id?: string | null;
  slot_token?: string | null;
  leased_until?: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ── Phase 4B.3 Tenant-Scoped Idempotency Types ─────────────────────────

export type IdempotencyRecordStatus =
  | 'in_progress'
  | 'committed'
  | 'refunded'
  | 'reconciliation_required';

export interface IdempotencyKeyRecord {
  _id: string; // Canonical: "${user_id}:${operation_type}:${client_key}"
  user_id: string;
  operation_type: string;
  operation_id: string; // Canonical alias for operation_type
  client_key: string;
  attempt_id: string; // Canonical alias for client_key
  request_payload_sha256: string;
  status: IdempotencyRecordStatus;
  transaction_id?: string | null;
  reconciliation_worker_id?: string | null;
  reconciliation_lease_token?: string | null;
  reconciliation_leased_until?: Date | null;
  response_payload?: Record<string, unknown> | null;
  response_cached_until?: Date | null;
  created_at: Date;
  updated_at: Date;
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
