type ClassValue = string | number | boolean | undefined | null;

/**
 * Utility function to combine class names cleanly
 */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(' ');
}
