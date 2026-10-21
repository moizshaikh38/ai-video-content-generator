import React, { useState } from 'react';
import { CreditCard, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, ButtonProps } from './Button';
import {
  openRazorpayCheckout,
  VerifyPaymentResponse,
} from '../services/razorpayService';

export interface RazorpayCheckoutButtonProps {
  /**
   * Amount in paise (100 paise = ₹1). Must be >= 100 paise.
   */
  amountInPaise: number;
  /**
   * Currency code (defaults to 'INR')
   */
  currency?: string;
  /**
   * Title or product name displayed in the Razorpay modal
   */
  name?: string;
  /**
   * Short description displayed in the Razorpay modal
   */
  description?: string;
  /**
   * Custom receipt identifier (optional)
   */
  receipt?: string;
  /**
   * Customer prefill information
   */
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  /**
   * Custom notes attached to the order
   */
  notes?: Record<string, string>;
  /**
   * Custom theme color for Razorpay modal
   */
  themeColor?: string;
  /**
   * Button variant from design system
   */
  variant?: ButtonProps['variant'];
  /**
   * Button size
   */
  size?: ButtonProps['size'];
  /**
   * Custom className for styling
   */
  className?: string;
  /**
   * Custom button label/children. Defaults to "Pay with Razorpay"
   */
  children?: React.ReactNode;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Called when payment is successfully authorized and signature is verified by backend
   */
  onSuccess?: (verifyRes: VerifyPaymentResponse, raw: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => void;
  /**
   * Called if payment fails or signature verification fails
   */
  onError?: (error: Error) => void;
  /**
   * Called when user dismisses or closes the modal
   */
  onDismiss?: () => void;
}

export const RazorpayCheckoutButton: React.FC<RazorpayCheckoutButtonProps> = ({
  amountInPaise,
  currency = 'INR',
  name = 'VireoClip',
  description = 'VireoClip Video Credits & Subscription',
  receipt,
  prefill,
  notes,
  themeColor = '#7C3AED',
  variant = 'primary',
  size = 'default',
  className,
  children,
  disabled = false,
  onSuccess,
  onError,
  onDismiss,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCheckout = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isLoading || disabled) return;

    setStatusMessage(null);
    setIsLoading(true);

    try {
      await openRazorpayCheckout({
        amount: amountInPaise,
        currency,
        name,
        description,
        receipt,
        prefill,
        notes,
        theme: {
          color: themeColor,
        },
        onSuccess: (verifyRes, raw) => {
          setIsLoading(false);
          setStatusMessage({
            type: 'success',
            text: `Payment verified! ID: ${verifyRes.payment_id.slice(0, 14)}...`,
          });
          onSuccess?.(verifyRes, raw);
        },
        onError: (err) => {
          setIsLoading(false);
          setStatusMessage({
            type: 'error',
            text: err.message || 'Payment failed.',
          });
          onError?.(err);
        },
        onDismiss: () => {
          setIsLoading(false);
          onDismiss?.();
        },
      });
    } catch (err: any) {
      setIsLoading(false);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Could not launch Razorpay checkout.',
      });
      onError?.(err);
    }
  };

  const formattedAmount = currency === 'INR' ? `₹${(amountInPaise / 100).toLocaleString('en-IN')}` : `${amountInPaise / 100} ${currency}`;

  return (
    <div className="inline-flex flex-col items-stretch gap-1.5">
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || isLoading}
        onClick={handleCheckout}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <span>Processing Order...</span>
          </span>
        ) : (
          children || (
            <span className="flex items-center gap-2">
              <CreditCard className="size-4" />
              <span>Pay {formattedAmount} via Razorpay</span>
            </span>
          )
        )}
      </Button>

      {statusMessage && (
        <div
          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};

export default RazorpayCheckoutButton;
