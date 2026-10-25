import { supabase } from '../lib/supabase';

export interface CreateOrderParams {
  amount: number; // in paise (e.g. 100 for 1 INR, 49900 for 499 INR)
  currency?: string; // defaults to 'INR'
  receipt?: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResponse {
  success: boolean;
  order_id: string;
  amount: number;
  currency: string;
  receipt?: string;
  key_id?: string;
}

export interface VerifyPaymentParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  status?: string;
  message: string;
  order_id: string;
  payment_id: string;
}

export interface RazorpayModalOptions {
  amount: number; // in paise
  currency?: string;
  name?: string;
  description?: string;
  receipt?: string;
  notes?: Record<string, string>;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  onSuccess?: (verifyRes: VerifyPaymentResponse, raw: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

// Fallback to localhost if VITE_API_URL is not set
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const DEFAULT_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_Tq8KrPMJAAHySy';

/**
 * Ensures Razorpay Checkout script (https://checkout.razorpay.com/v1/checkout.js) is loaded.
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) {
      resolve(true);
      return;
    }

    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/**
 * Retrieves optional Supabase auth bearer token if available.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch {
    // Session retrieval failed; proceed unauthenticated
  }
  return {};
}

/**
 * Step 1: Call backend to create Razorpay Order
 * POST /api/create-order
 */
export async function createRazorpayOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
  if (!params.amount || params.amount < 100) {
    throw new Error('Minimum order amount must be at least 100 paise (1 INR).');
  }

  const authHeaders = await getAuthHeader();

  const response = await fetch(`${API_BASE}/create-order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      amount: Math.round(params.amount),
      currency: params.currency || 'INR',
      receipt: params.receipt,
      notes: params.notes,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Failed to create Razorpay order (${response.status})`);
  }

  return {
    success: true,
    order_id: data.order_id || data.id,
    amount: data.amount,
    currency: data.currency || 'INR',
    receipt: data.receipt,
    key_id: data.key_id || DEFAULT_KEY_ID,
  };
}

/**
 * Step 3: Call backend to verify HMAC-SHA256 signature
 * POST /api/verify-payment
 */
export async function verifyRazorpayPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResponse> {
  const authHeaders = await getAuthHeader();

  const response = await fetch(`${API_BASE}/verify-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({
      razorpay_order_id: params.razorpay_order_id,
      razorpay_payment_id: params.razorpay_payment_id,
      razorpay_signature: params.razorpay_signature,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Payment verification failed (${response.status})`);
  }

  return {
    success: true,
    status: data.status || 'ok',
    message: data.message || 'Payment signature verified successfully.',
    order_id: data.order_id || params.razorpay_order_id,
    payment_id: data.payment_id || params.razorpay_payment_id,
  };
}

/**
 * Step 2: High-level helper to trigger Razorpay checkout modal
 * Loads checkout script -> calls create-order -> opens modal -> on success calls verify-payment
 */
export async function openRazorpayCheckout(options: RazorpayModalOptions): Promise<void> {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !(window as any).Razorpay) {
    const err = new Error('Razorpay SDK failed to load. Please check your internet connection.');
    options.onError?.(err);
    throw err;
  }

  // 1. Create order on backend
  const order = await createRazorpayOrder({
    amount: options.amount,
    currency: options.currency || 'INR',
    receipt: options.receipt,
    notes: options.notes,
  });

  const keyId = order.key_id || DEFAULT_KEY_ID;

  // 2. Open Razorpay modal with order_id
  const rzpOptions = {
    key: keyId,
    amount: order.amount,
    currency: order.currency,
    name: options.name || 'VireoClip',
    description: options.description || 'VireoClip Video Credits & Subscription',
    order_id: order.order_id,
    prefill: options.prefill || {},
    notes: options.notes || {},
    theme: {
      color: options.theme?.color || '#0070F3',
    },
    modal: {
      ondismiss: () => {
        options.onDismiss?.();
      },
    },
    handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
      try {
        // 3. Verify payment signature on backend
        const verifyResult = await verifyRazorpayPayment({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });

        options.onSuccess?.(verifyResult, response);
      } catch (err: any) {
        options.onError?.(err);
      }
    },
  };

  const rzpInstance = new (window as any).Razorpay(rzpOptions);

  rzpInstance.on('payment.failed', (resp: any) => {
    const errorDesc = resp?.error?.description || resp?.error?.reason || 'Payment failed or was declined.';
    const error = new Error(errorDesc);
    options.onError?.(error);
  });

  rzpInstance.open();
}

export interface RazorpaySubscriptionModalOptions {
  /** Server-created Razorpay subscription id (from POST /billing/checkout). */
  subscriptionId: string;
  /** Public key id returned by the server — never the secret. */
  keyId: string;
  name?: string;
  description?: string;
  notes?: Record<string, string>;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  onPaymentSuccess?: (paymentId: string) => void;
  onError?: (error: Error) => void;
  onDismiss?: () => void;
}

/**
 * Opens Razorpay Checkout for a SERVER-created subscription. The plan, price,
 * and currency live entirely in the server-created subscription record — the
 * browser never supplies an amount (billing spec §10: no client-supplied prices).
 * Entitlement activation happens via the verified Razorpay webhook.
 */
export async function openRazorpaySubscriptionCheckout(options: RazorpaySubscriptionModalOptions): Promise<void> {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !(window as any).Razorpay) {
    const err = new Error('Razorpay SDK failed to load. Please check your internet connection.');
    options.onError?.(err);
    throw err;
  }

  const rzp = new (window as any).Razorpay({
    key: options.keyId,
    subscription_id: options.subscriptionId,
    name: options.name || 'VireoClip',
    description: options.description || 'VireoClip Subscription',
    prefill: options.prefill || {},
    notes: options.notes || {},
    theme: { color: options.theme?.color || '#0070F3' },
    modal: { ondismiss: () => options.onDismiss?.() },
    handler: (response: { razorpay_payment_id: string }) => {
      // Subscription entitlements are granted by the signed webhook; the modal
      // response is only a UX signal.
      options.onPaymentSuccess?.(response?.razorpay_payment_id || '');
    },
  });
  rzp.on('payment.failed', (resp: any) => {
    options.onError?.(new Error(resp?.error?.description || 'Razorpay subscription payment failed.'));
  });
  rzp.open();
}
